import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

# Meeting Creation Requests
class InstantMeetingCreate(BaseModel):
    host_name: str = Field(default="Host", min_length=1, max_length=100)
    host_email: Optional[str] = None
    title: Optional[str] = Field(default="Instant Meeting")
    passcode: Optional[str] = Field(default=None)

class ScheduledMeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    host_name: str = Field(default="Host", min_length=1, max_length=100)
    host_email: Optional[str] = None
    scheduled_start_time: datetime.datetime
    duration_minutes: int = Field(default=40, ge=5, le=1440)
    passcode: Optional[str] = None
    invitees: Optional[str] = None

# Validation Requests
class ValidateMeetingRequest(BaseModel):
    meeting_id: str

class ValidatePasscodeRequest(BaseModel):
    meeting_id: str
    passcode: str

# Response Schemas
class MeetingResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    passcode_required: bool = False
    meeting_type: str
    status: str
    scheduled_start_time: Optional[datetime.datetime] = None
    duration_minutes: int
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    ended_at: Optional[datetime.datetime] = None
    host_name: str
    host_email: Optional[str] = None
    invitees: Optional[str] = None
    invite_link: Optional[str] = None

    class Config:
        from_attributes = True

class MeetingValidationResponse(BaseModel):
    valid: bool
    meeting_id: str
    title: str
    host_name: str
    passcode_required: bool
    status: str
    scheduled_start_time: Optional[datetime.datetime] = None
    message: str

class ParticipantResponse(BaseModel):
    id: int
    meeting_id: str
    client_token: str
    display_name: str
    is_host: bool
    is_muted: bool
    is_video_off: bool
    is_kicked: bool
    joined_at: datetime.datetime
    left_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True

# User Authentication Schemas
class UserSignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)

class UserLoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    avatar_url: Optional[str] = None
    provider: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

