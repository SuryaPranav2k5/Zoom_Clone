import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, UniqueConstraint, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Meeting(Base):
    __tablename__ = "meetings"

    # Strictly 10-digit string formatted as XXX-XXX-XXXX (e.g. 845-912-3401)
    id = Column(String(12), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    passcode = Column(String(64), nullable=True)
    meeting_type = Column(String(20), nullable=False, default="INSTANT") # INSTANT, SCHEDULED
    status = Column(String(20), nullable=False, default="UPCOMING", index=True) # UPCOMING, LIVE, ENDED
    scheduled_start_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=40)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    host_name = Column(String(255), nullable=False, default="Host") # Intentional denormalization for fast O(1) dashboard listing
    host_email = Column(String(255), nullable=True)
    invitees = Column(Text, nullable=True) # Comma-separated list of invited attendee emails/names

    @property
    def passcode_required(self) -> bool:
        return bool(self.passcode)

class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(12), nullable=False, index=True)
    client_token = Column(String(64), nullable=False, index=True) # UUID stored in client sessionStorage
    display_name = Column(String(255), nullable=False)
    is_host = Column(Boolean, nullable=False, default=False) # Authoritative source of truth for host permissions
    is_muted = Column(Boolean, nullable=False, default=False)
    is_video_off = Column(Boolean, nullable=False, default=False)
    is_kicked = Column(Boolean, nullable=False, default=False) # True if host kicked participant; prevents re-entry
    joined_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    left_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("meeting_id", "client_token", name="uix_meeting_client"),
    )

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=True) # Nullable for Google OAuth users
    salt = Column(String(255), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    provider = Column(String(20), nullable=False, default="EMAIL") # EMAIL, GOOGLE
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

class ActionItem(Base):
    __tablename__ = "action_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(12), ForeignKey("meetings.id"), nullable=False, index=True)
    task = Column(String(255), nullable=False)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_to_name = Column(String(255), nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    assigned_user = relationship("User", foreign_keys=[assigned_to_user_id])

class MeetingEvent(Base):
    __tablename__ = "meeting_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(12), ForeignKey("meetings.id"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False) # JOIN, LEFT, KICK, CHAT, SCREEN_SHARE_START, SCREEN_SHARE_STOP
    actor_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

