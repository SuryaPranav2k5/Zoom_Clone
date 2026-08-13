import json
import asyncio
import datetime
from typing import Dict, Set, Optional, List
from fastapi import WebSocket
from sqlalchemy.orm import Session
from database import SessionLocal
import crud
from models import Meeting, Participant

class MeetingRoom:
    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        # Map client_token -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        # Map client_token -> participant dict
        self.participants: Dict[str, dict] = {}
        # Host tracking
        self.host_token: Optional[str] = None
        self.host_grace_timer: Optional[asyncio.Task] = None
        self.duration_timer: Optional[asyncio.Task] = None
        self.is_ended: bool = False

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, MeetingRoom] = {}

    def get_or_create_room(self, meeting_id: str) -> MeetingRoom:
        if meeting_id not in self.rooms:
            self.rooms[meeting_id] = MeetingRoom(meeting_id)
        return self.rooms[meeting_id]

    async def handle_connect(
        self,
        websocket: WebSocket,
        meeting_id: str,
        client_token: str,
        display_name: str,
        requested_is_host: bool = False
    ):
        await websocket.accept()
        room = self.get_or_create_room(meeting_id)

        if room.is_ended:
            await websocket.send_json({
                "type": "JOIN_REJECTED",
                "reason": "This meeting has already ended."
            })
            await websocket.close()
            return

        db: Session = SessionLocal()
        try:
            # 1. Database & Kicked Check
            meeting = crud.get_meeting(db, meeting_id)
            if not meeting:
                await websocket.send_json({
                    "type": "JOIN_REJECTED",
                    "reason": "Meeting not found."
                })
                await websocket.close()
                return

            now = datetime.datetime.utcnow()
            is_actual_host = requested_is_host or (
                (meeting.host_email and display_name.lower().strip() == meeting.host_email.lower().strip()) or
                (meeting.host_name and display_name.lower().strip() == meeting.host_name.lower().strip())
            )

            # Restrict early attendee entry before scheduled meeting start time
            if meeting.status == "UPCOMING" and meeting.scheduled_start_time and now < meeting.scheduled_start_time:
                if not is_actual_host:
                    formatted_time = meeting.scheduled_start_time.strftime("%I:%M %p UTC")
                    await websocket.send_json({
                        "type": "JOIN_REJECTED",
                        "reason": f"This meeting is scheduled for {formatted_time}. Please wait for the host to start the meeting."
                    })
                    await websocket.close()
                    return

            # When host joins, transition meeting from UPCOMING to LIVE
            if is_actual_host and meeting.status == "UPCOMING":
                crud.update_meeting_status(db, meeting.id, "LIVE")

            db_part = db.query(Participant).filter(
                Participant.meeting_id == meeting.id,
                Participant.client_token == client_token
            ).first()

            if db_part and db_part.is_kicked:
                await websocket.send_json({
                    "type": "JOIN_REJECTED",
                    "reason": "You were kicked from this meeting by the host."
                })
                await websocket.close()
                return

            # 2. Check 4-participant mesh cap for NEW tokens
            is_existing_token = client_token in room.participants or db_part is not None
            if not is_existing_token and len(room.participants) >= 4:
                await websocket.send_json({
                    "type": "JOIN_REJECTED",
                    "reason": "Meeting room is full (maximum 4 participants)."
                })
                await websocket.close()
                return

            # 3. Create or fetch Participant record
            participant = crud.get_or_create_participant(
                db=db,
                meeting_id=meeting.id,
                client_token=client_token,
                display_name=display_name,
                is_host=requested_is_host
            )

            # 4. If status was UPCOMING, transition meeting to LIVE when host joins
            if meeting.status == "UPCOMING":
                crud.update_meeting_status(db, meeting.id, "LIVE")
                # Spawn duration timer task
                if not room.duration_timer:
                    room.duration_timer = asyncio.create_task(
                        self._schedule_duration_expiry(meeting.id, meeting.duration_minutes)
                    )

            # Cancel host grace timer if host reconnected
            is_host_participant = participant.is_host if participant else requested_is_host
            display_name_val = participant.display_name if participant else display_name
            is_muted_val = participant.is_muted if participant else False
            is_video_off_val = participant.is_video_off if participant else False

            if is_host_participant:
                room.host_token = client_token
                if room.host_grace_timer and not room.host_grace_timer.done():
                    room.host_grace_timer.cancel()
                    room.host_grace_timer = None
                    await self.broadcast(meeting_id, {
                        "type": "HOST_RECONNECTED",
                        "message": "Host has reconnected."
                    })

            # Store active connection
            room.active_connections[client_token] = websocket
            room.participants[client_token] = {
                "client_token": client_token,
                "display_name": display_name_val,
                "is_host": is_host_participant,
                "is_muted": is_muted_val,
                "is_video_off": is_video_off_val
            }

            # Record JOIN event in SQLite for Meeting Insights
            crud.create_meeting_event(
                db=db,
                meeting_id=meeting.id,
                event_type="JOIN",
                actor_name=display_name_val,
                description=f"{display_name_val} joined the meeting."
            )

            # Send JOIN_SUCCESS to connecting client
            await websocket.send_json({
                "type": "JOIN_SUCCESS",
                "meeting": {
                    "id": meeting.id,
                    "title": meeting.title,
                    "host_name": meeting.host_name,
                    "duration_minutes": meeting.duration_minutes
                },
                "self": room.participants[client_token],
                "participants": list(room.participants.values())
            })

            # Broadcast PARTICIPANT_JOINED to room
            await self.broadcast(meeting_id, {
                "type": "PARTICIPANT_JOINED",
                "participant": room.participants[client_token],
                "all_participants": list(room.participants.values())
            }, exclude_token=client_token)

        finally:
            db.close()

    async def disconnect(self, meeting_id: str, client_token: str):
        if meeting_id not in self.rooms:
            return

        room = self.rooms[meeting_id]
        if client_token in room.active_connections:
            del room.active_connections[client_token]

        if client_token in room.participants:
            part_info = room.participants[client_token]
            display_name = part_info.get("display_name", "Participant")
            is_host = part_info.get("is_host", False)

            # Update DB left_at and record LEFT event
            db = SessionLocal()
            try:
                db_part = db.query(Participant).filter(
                    Participant.meeting_id == meeting_id,
                    Participant.client_token == client_token
                ).first()
                if db_part:
                    db_part.left_at = datetime.datetime.utcnow()
                    db.commit()
                crud.create_meeting_event(
                    db=db,
                    meeting_id=meeting_id,
                    event_type="LEFT",
                    actor_name=display_name,
                    description=f"{display_name} left the meeting."
                )
            finally:
                db.close()

            # Broadcast disconnect
            await self.broadcast(meeting_id, {
                "type": "PARTICIPANT_LEFT",
                "client_token": client_token,
                "display_name": display_name,
                "all_participants": [p for t, p in room.participants.items() if t != client_token]
            })

            # If host disconnected, start 30s grace timer
            if is_host and not room.is_ended:
                await self.broadcast(meeting_id, {
                    "type": "HOST_DISCONNECTED",
                    "grace_period_seconds": 30,
                    "message": "Host disconnected. Meeting will end in 30 seconds if host does not reconnect."
                })
                room.host_grace_timer = asyncio.create_task(
                    self._start_host_grace_timer(meeting_id, 30)
                )

            del room.participants[client_token]

    async def broadcast(self, meeting_id: str, message: dict, exclude_token: Optional[str] = None):
        if meeting_id not in self.rooms:
            return
        room = self.rooms[meeting_id]
        for token, ws in list(room.active_connections.items()):
            if token != exclude_token:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def send_to_client(self, meeting_id: str, target_token: str, message: dict):
        if meeting_id in self.rooms:
            room = self.rooms[meeting_id]
            if target_token in room.active_connections:
                try:
                    await room.active_connections[target_token].send_json(message)
                except Exception:
                    pass

    async def end_meeting(self, meeting_id: str, reason: str = "host_ended"):
        if meeting_id not in self.rooms:
            return
        room = self.rooms[meeting_id]
        room.is_ended = True

        # Update DB status
        db = SessionLocal()
        try:
            crud.update_meeting_status(db, meeting_id, "ENDED")
        finally:
            db.close()

        # Broadcast MEETING_ENDED
        await self.broadcast(meeting_id, {
            "type": "MEETING_ENDED",
            "reason": reason,
            "message": "The meeting has ended."
        })

        # Close all active sockets
        for token, ws in list(room.active_connections.items()):
            try:
                await ws.close()
            except Exception:
                pass
        
        # Cleanup room tasks
        if room.host_grace_timer and not room.host_grace_timer.done():
            room.host_grace_timer.cancel()
        if room.duration_timer and not room.duration_timer.done():
            room.duration_timer.cancel()

        del self.rooms[meeting_id]

    async def _start_host_grace_timer(self, meeting_id: str, seconds: int):
        try:
            await asyncio.sleep(seconds)
            await self.end_meeting(meeting_id, reason="host_left")
        except asyncio.CancelledError:
            pass

    async def _schedule_duration_expiry(self, meeting_id: str, duration_minutes: int):
        try:
            await asyncio.sleep(duration_minutes * 60)
            await self.end_meeting(meeting_id, reason="duration_expired")
        except asyncio.CancelledError:
            pass

    async def handle_host_kick(self, meeting_id: str, host_token: str, target_token: str):
        if meeting_id not in self.rooms:
            return
        room = self.rooms[meeting_id]
        
        # Verify host_token is host
        if room.participants.get(host_token, {}).get("is_host"):
            db = SessionLocal()
            try:
                db_part = db.query(Participant).filter(
                    Participant.meeting_id == meeting_id,
                    Participant.client_token == target_token
                ).first()
                target_name = db_part.display_name if db_part else "Participant"
                if db_part:
                    db_part.is_kicked = True
                    db_part.left_at = datetime.datetime.utcnow()
                    db.commit()
                crud.create_meeting_event(
                    db=db,
                    meeting_id=meeting_id,
                    event_type="KICK",
                    actor_name=target_name,
                    description=f"{target_name} was removed from the meeting by the host."
                )
            finally:
                db.close()

            # Send KICKED to target client
            await self.send_to_client(meeting_id, target_token, {
                "type": "KICKED",
                "reason": "You were removed from the meeting by the host."
            })

            # Close target WebSocket
            if target_token in room.active_connections:
                try:
                    await room.active_connections[target_token].close()
                except Exception:
                    pass

    async def handle_host_mute_all(self, meeting_id: str, host_token: str):
        if meeting_id not in self.rooms:
            return
        room = self.rooms[meeting_id]
        if room.participants.get(host_token, {}).get("is_host"):
            for token, p in room.participants.items():
                if not p["is_host"]:
                    p["is_muted"] = True
            await self.broadcast(meeting_id, {
                "type": "MUTE_ALL_TRIGGERED",
                "all_participants": list(room.participants.values())
            })

manager = ConnectionManager()
