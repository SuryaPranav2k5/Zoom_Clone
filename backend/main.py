import os
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import Meeting
from schemas import (
    InstantMeetingCreate,
    ScheduledMeetingCreate,
    ValidateMeetingRequest,
    ValidatePasscodeRequest,
    MeetingResponse,
    MeetingValidationResponse
)
import crud
from seed import seed_db
from websocket_manager import manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database tables exist
    Base.metadata.create_all(bind=engine)
    # Run idempotent seed on boot (checks if DB is empty before populating)
    seed_db()
    yield

app = FastAPI(
    title="Zoom Clone API",
    description="FastAPI backend for Zoom Clone web app with SQLite & WebSockets",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Zoom Clone API",
        "docs_url": "/docs"
    }

# --------------------------
# REST APIs for Meetings
# --------------------------

@app.post("/api/meetings/instant", response_model=MeetingResponse)
def create_instant(data: InstantMeetingCreate, db: Session = Depends(get_db)):
    meeting = crud.create_instant_meeting(db, data)
    res = MeetingResponse.model_validate(meeting)
    res.passcode_required = bool(meeting.passcode)
    res.invite_link = f"/meeting/{meeting.id}"
    return res

@app.post("/api/meetings/schedule", response_model=MeetingResponse)
def create_scheduled(data: ScheduledMeetingCreate, db: Session = Depends(get_db)):
    meeting = crud.create_scheduled_meeting(db, data)
    res = MeetingResponse.model_validate(meeting)
    res.passcode_required = bool(meeting.passcode)
    res.invite_link = f"/meeting/{meeting.id}"
    return res

@app.post("/api/meetings/validate", response_model=MeetingValidationResponse)
def validate_meeting(req: ValidateMeetingRequest, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, req.meeting_id)
    if not meeting:
        return MeetingValidationResponse(
            valid=False,
            meeting_id=req.meeting_id,
            title="",
            host_name="",
            passcode_required=False,
            status="",
            message="Meeting not found. Please check the Meeting ID."
        )

    if meeting.status == "ENDED":
        return MeetingValidationResponse(
            valid=False,
            meeting_id=meeting.id,
            title=meeting.title,
            host_name=meeting.host_name,
            passcode_required=False,
            status=meeting.status,
            message="This meeting has already ended."
        )

    return MeetingValidationResponse(
        valid=True,
        meeting_id=meeting.id,
        title=meeting.title,
        host_name=meeting.host_name,
        passcode_required=bool(meeting.passcode),
        status=meeting.status,
        scheduled_start_time=meeting.scheduled_start_time,
        message="Meeting found."
    )

@app.post("/api/meetings/validate-passcode")
def validate_passcode(req: ValidatePasscodeRequest, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, req.meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    
    if not meeting.passcode:
        return {"valid": True, "message": "No passcode required."}

    if meeting.passcode == req.passcode.strip():
        return {"valid": True, "message": "Passcode correct."}
    
    raise HTTPException(status_code=400, detail="Incorrect meeting passcode.")

@app.get("/api/meetings/upcoming", response_model=List[MeetingResponse])
def list_upcoming(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    meetings = crud.get_upcoming_meetings(db, limit=limit)
    result = []
    for m in meetings:
        item = MeetingResponse.model_validate(m)
        item.passcode_required = bool(m.passcode)
        item.invite_link = f"/meeting/{m.id}"
        result.append(item)
    return result

@app.get("/api/meetings/recent", response_model=List[MeetingResponse])
def list_recent(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    meetings = crud.get_recent_meetings(db, limit=limit)
    result = []
    for m in meetings:
        item = MeetingResponse.model_validate(m)
        item.passcode_required = bool(m.passcode)
        item.invite_link = f"/meeting/{m.id}"
        result.append(item)
    return result

@app.get("/api/meetings/{meeting_id}", response_model=MeetingResponse)
def get_meeting_details(meeting_id: str, db: Session = Depends(get_db)):
    meeting = crud.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    res = MeetingResponse.model_validate(meeting)
    res.passcode_required = bool(meeting.passcode)
    res.invite_link = f"/meeting/{meeting.id}"
    return res

# --------------------------
# WebSocket Endpoint for Rooms
# --------------------------

@app.websocket("/ws/meeting/{meeting_id}")
async def websocket_meeting_endpoint(
    websocket: WebSocket,
    meeting_id: str,
    client_token: str = Query(...),
    display_name: str = Query("Participant"),
    is_host: bool = Query(False)
):
    await manager.handle_connect(
        websocket=websocket,
        meeting_id=meeting_id,
        client_token=client_token,
        display_name=display_name,
        requested_is_host=is_host
    )

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "CHAT_MESSAGE":
                await manager.broadcast(meeting_id, {
                    "type": "CHAT_MESSAGE",
                    "sender_token": client_token,
                    "sender_name": display_name,
                    "text": data.get("text", ""),
                    "timestamp": data.get("timestamp")
                })

            elif event_type in ["WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE_CANDIDATE"]:
                target_token = data.get("target_token")
                if target_token:
                    await manager.send_to_client(meeting_id, target_token, {
                        "type": event_type,
                        "sender_token": client_token,
                        "payload": data.get("payload")
                    })

            elif event_type == "TOGGLE_AUDIO":
                if meeting_id in manager.rooms and client_token in manager.rooms[meeting_id].participants:
                    manager.rooms[meeting_id].participants[client_token]["is_muted"] = data.get("is_muted", False)
                    await manager.broadcast(meeting_id, {
                        "type": "PARTICIPANT_STATE_CHANGED",
                        "client_token": client_token,
                        "is_muted": data.get("is_muted", False),
                        "is_video_off": manager.rooms[meeting_id].participants[client_token]["is_video_off"]
                    })

            elif event_type == "TOGGLE_VIDEO":
                if meeting_id in manager.rooms and client_token in manager.rooms[meeting_id].participants:
                    manager.rooms[meeting_id].participants[client_token]["is_video_off"] = data.get("is_video_off", False)
                    await manager.broadcast(meeting_id, {
                        "type": "PARTICIPANT_STATE_CHANGED",
                        "client_token": client_token,
                        "is_muted": manager.rooms[meeting_id].participants[client_token]["is_muted"],
                        "is_video_off": data.get("is_video_off", False)
                    })

            elif event_type == "HOST_MUTE_PARTICIPANT":
                target_token = data.get("target_token")
                if target_token and meeting_id in manager.rooms:
                    room = manager.rooms[meeting_id]
                    if room.participants.get(client_token, {}).get("is_host"):
                        if target_token in room.participants:
                            room.participants[target_token]["is_muted"] = True
                            await manager.broadcast(meeting_id, {
                                "type": "PARTICIPANT_STATE_CHANGED",
                                "client_token": target_token,
                                "is_muted": True,
                                "is_video_off": room.participants[target_token]["is_video_off"]
                            })

            elif event_type == "HOST_MUTE_ALL":
                await manager.handle_host_mute_all(meeting_id, client_token)

            elif event_type == "HOST_KICK_PARTICIPANT":
                target_token = data.get("target_token")
                if target_token:
                    await manager.handle_host_kick(meeting_id, client_token, target_token)

            elif event_type == "END_MEETING":
                if meeting_id in manager.rooms:
                    if manager.rooms[meeting_id].participants.get(client_token, {}).get("is_host"):
                        await manager.end_meeting(meeting_id, reason="host_ended")
                        break

    except WebSocketDisconnect:
        await manager.disconnect(meeting_id, client_token)
    except Exception as e:
        await manager.disconnect(meeting_id, client_token)
