import random
import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from models import Meeting, Participant, User, ActionItem, MeetingEvent
from schemas import InstantMeetingCreate, ScheduledMeetingCreate, UserSignupRequest
import auth

def generate_meeting_id() -> str:
    """Generates a strictly 10-digit numeric Zoom meeting ID formatted as XXX-XXX-XXXX (e.g. 845-912-3401)"""
    part1 = random.randint(100, 999)
    part2 = random.randint(100, 999)
    part3 = random.randint(1000, 9999)
    return f"{part1}-{part2}-{part3}"

def format_meeting_id_input(meeting_id_str: str) -> str:
    """Formats raw digits or hyphenated meeting IDs into clean XXX-XXX-XXXX format"""
    cleaned = "".join(c for c in meeting_id_str if c.isdigit())
    if len(cleaned) == 10:
        return f"{cleaned[:3]}-{cleaned[3:6]}-{cleaned[6:]}"
    return meeting_id_str.strip()

def create_instant_meeting(db: Session, data: InstantMeetingCreate) -> Meeting:
    # Ensure unique ID
    meeting_id = generate_meeting_id()
    while db.query(Meeting).filter(Meeting.id == meeting_id).first():
        meeting_id = generate_meeting_id()

    now = datetime.datetime.utcnow()
    meeting = Meeting(
        id=meeting_id,
        title=data.title or f"{data.host_name}'s Zoom Meeting",
        description="Instant Meeting",
        passcode=data.passcode if data.passcode else None,
        meeting_type="INSTANT",
        status="LIVE",
        created_at=now,
        started_at=now,
        duration_minutes=40,
        host_name=data.host_name,
        host_email=data.host_email
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting

def create_scheduled_meeting(db: Session, data: ScheduledMeetingCreate) -> Meeting:
    meeting_id = generate_meeting_id()
    while db.query(Meeting).filter(Meeting.id == meeting_id).first():
        meeting_id = generate_meeting_id()

    now = datetime.datetime.utcnow()
    meeting = Meeting(
        id=meeting_id,
        title=data.title,
        description=data.description,
        passcode=data.passcode if data.passcode else None,
        meeting_type="SCHEDULED",
        status="UPCOMING",
        scheduled_start_time=data.scheduled_start_time,
        duration_minutes=data.duration_minutes,
        created_at=now,
        host_name=data.host_name,
        host_email=data.host_email,
        invitees=data.invitees
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting

def get_meeting(db: Session, meeting_id: str) -> Optional[Meeting]:
    formatted_id = format_meeting_id_input(meeting_id)
    return db.query(Meeting).filter(Meeting.id == formatted_id).first()

def get_upcoming_meetings(db: Session, limit: int = 10) -> List[Meeting]:
    """Fetch meetings with status UPCOMING ordered by scheduled_start_time ascending (earliest scheduled meeting first)"""
    return db.query(Meeting).filter(
        Meeting.status == "UPCOMING"
    ).order_by(Meeting.scheduled_start_time.asc()).limit(limit).all()

def get_recent_meetings(db: Session, limit: int = 10) -> List[Meeting]:
    """Fetch past/ended and active meetings that have at least 1 participant, ordered by creation time descending"""
    return db.query(Meeting).join(Participant, Participant.meeting_id == Meeting.id).filter(
        Meeting.status.in_(["ENDED", "LIVE"])
    ).group_by(Meeting.id).order_by(Meeting.created_at.desc()).limit(limit).all()

def update_meeting_status(db: Session, meeting_id: str, new_status: str) -> Optional[Meeting]:
    meeting = get_meeting(db, meeting_id)
    if meeting:
        meeting.status = new_status
        now = datetime.datetime.utcnow()
        if new_status == "LIVE" and not meeting.started_at:
            meeting.started_at = now
        elif new_status == "ENDED":
            meeting.ended_at = now
        db.commit()
        db.refresh(meeting)
    return meeting

def delete_meeting(db: Session, meeting_id: str) -> Optional[Meeting]:
    meeting = get_meeting(db, meeting_id)
    if meeting:
        db.query(Participant).filter(Participant.meeting_id == meeting.id).delete(synchronize_session=False)
        db.delete(meeting)
        db.commit()
        return meeting
    return None

def get_or_create_participant(
    db: Session,
    meeting_id: str,
    client_token: str,
    display_name: str,
    is_host: bool = False
) -> Participant:
    formatted_id = format_meeting_id_input(meeting_id)
    participant = db.query(Participant).filter(
        Participant.meeting_id == formatted_id,
        Participant.client_token == client_token
    ).first()

    now = datetime.datetime.utcnow()
    if participant:
        # Re-connecting existing participant
        participant.left_at = None
        if display_name and participant.display_name != display_name:
            participant.display_name = display_name
        db.commit()
        db.refresh(participant)
        return participant
    else:
        # Check if room already has a host
        existing_host = db.query(Participant).filter(
            Participant.meeting_id == formatted_id,
            Participant.is_host == True
        ).first()

        # If no host exists yet for this meeting, promote first participant to host
        effective_host = is_host or (existing_host is None)

        participant = Participant(
            meeting_id=formatted_id,
            client_token=client_token,
            display_name=display_name,
            is_host=effective_host,
            is_muted=False,
            is_video_off=False,
            is_kicked=False,
            joined_at=now
        )
        db.add(participant)
        db.commit()
        db.refresh(participant)
        return participant

def create_user(db: Session, data: UserSignupRequest) -> User:
    hashed_pwd, salt = auth.hash_password(data.password)
    user = User(
        email=data.email.strip().lower(),
        full_name=data.full_name.strip(),
        hashed_password=hashed_pwd,
        salt=salt,
        provider="EMAIL",
        created_at=datetime.datetime.utcnow()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.strip().lower()).first()

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()

def verify_user_credentials(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if user and user.hashed_password and user.salt:
        if auth.verify_password(password, user.hashed_password, user.salt):
            return user
    return None

def create_or_get_google_user(db: Session, email: str, full_name: str, avatar_url: Optional[str]) -> User:
    user = get_user_by_email(db, email)
    if not user:
        user = User(
            email=email.strip().lower(),
            full_name=full_name.strip(),
            hashed_password=None,
            salt=None,
            avatar_url=avatar_url,
            provider="GOOGLE",
            created_at=datetime.datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
            db.commit()
            db.refresh(user)
    return user

def create_meeting_event(db: Session, meeting_id: str, event_type: str, actor_name: str, description: Optional[str] = None) -> MeetingEvent:
    event = MeetingEvent(
        meeting_id=meeting_id,
        event_type=event_type,
        actor_name=actor_name,
        description=description,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event

def get_meeting_events(db: Session, meeting_id: str) -> List[MeetingEvent]:
    return db.query(MeetingEvent).filter(MeetingEvent.meeting_id == meeting_id).order_by(MeetingEvent.timestamp.asc()).all()

def create_action_item(
    db: Session,
    meeting_id: str,
    task: str,
    assigned_to_user_id: Optional[int] = None,
    assigned_to_name: Optional[str] = None,
    due_date: Optional[datetime.datetime] = None
) -> ActionItem:
    item = ActionItem(
        meeting_id=meeting_id,
        task=task.strip(),
        assigned_to_user_id=assigned_to_user_id,
        assigned_to_name=assigned_to_name.strip() if (assigned_to_name and not assigned_to_user_id) else None,
        due_date=due_date,
        completed=False,
        created_at=datetime.datetime.utcnow()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

def get_action_items(db: Session, meeting_id: str) -> List[ActionItem]:
    return db.query(ActionItem).filter(ActionItem.meeting_id == meeting_id).order_by(ActionItem.created_at.asc()).all()

def toggle_action_item(db: Session, action_item_id: int) -> Optional[ActionItem]:
    item = db.query(ActionItem).filter(ActionItem.id == action_item_id).first()
    if item:
        item.completed = not item.completed
        db.commit()
        db.refresh(item)
    return item

def get_meeting_insights(db: Session, meeting_id: str) -> Optional[dict]:
    meeting = get_meeting(db, meeting_id)
    if not meeting:
        return None

    now = datetime.datetime.utcnow()
    start_time = meeting.started_at or meeting.created_at
    end_time = meeting.ended_at or now

    total_duration_minutes = max(1, int((end_time - start_time).total_seconds() / 60))

    participants = db.query(Participant).filter(Participant.meeting_id == meeting_id).all()
    total_participants = len(participants)

    # 3-tier attendance calculation rule:
    # 1) If left_at is set (normal leave or KICK): duration = left_at - joined_at
    # 2) If left_at is null & meeting ended (browser crash): duration = meeting.ended_at - joined_at
    # 3) If left_at is null & meeting active: duration = now - joined_at
    attendance = []
    for p in participants:
        if p.left_at:
            eff_end = p.left_at
        elif meeting.ended_at:
            eff_end = meeting.ended_at
        else:
            eff_end = now

        p_mins = max(1, int((eff_end - p.joined_at).total_seconds() / 60))
        pct = min(100.0, round((p_mins / total_duration_minutes) * 100, 1))

        attendance.append({
            "display_name": p.display_name,
            "is_host": p.is_host,
            "joined_at": p.joined_at,
            "left_at": p.left_at,
            "is_kicked": p.is_kicked,
            "duration_minutes": p_mins,
            "percentage": pct
        })

    events = get_meeting_events(db, meeting_id)
    chat_count = sum(1 for e in events if e.event_type == "CHAT")
    screen_share_count = sum(1 for e in events if e.event_type == "SCREEN_SHARE_START")

    raw_action_items = get_action_items(db, meeting_id)
    formatted_action_items = []
    for item in raw_action_items:
        assignee_name = item.assigned_to_name
        if item.assigned_user:
            assignee_name = item.assigned_user.full_name

        formatted_action_items.append({
            "id": item.id,
            "meeting_id": item.meeting_id,
            "task": item.task,
            "assigned_to_user_id": item.assigned_to_user_id,
            "assigned_to_name": assignee_name,
            "due_date": item.due_date,
            "completed": item.completed,
            "created_at": item.created_at
        })

    return {
        "meeting_id": meeting.id,
        "title": meeting.title,
        "host_name": meeting.host_name,
        "status": meeting.status,
        "started_at": meeting.started_at or meeting.created_at,
        "ended_at": meeting.ended_at,
        "total_duration_minutes": total_duration_minutes,
        "total_participants": total_participants,
        "total_chat_messages": chat_count,
        "total_screen_shares": screen_share_count,
        "attendance": attendance,
        "timeline": events,
        "action_items": formatted_action_items
    }


