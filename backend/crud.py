import random
import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from models import Meeting, Participant, User
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
    """Fetch past meetings with status ENDED ordered by ended_at descending"""
    return db.query(Meeting).filter(
        Meeting.status == "ENDED"
    ).order_by(Meeting.ended_at.desc()).limit(limit).all()

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

