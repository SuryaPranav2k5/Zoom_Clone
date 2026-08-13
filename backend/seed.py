import datetime
from database import SessionLocal, engine, Base
from models import Meeting, Participant

def seed_db():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Idempotent check: only seed if no meetings exist in DB
        if db.query(Meeting).first() is not None:
            print("[SEED] Database already populated. Skipping seed.")
            return

        print("[SEED] Seeding database with initial sample meetings...")
        now = datetime.datetime.utcnow()

        sample_meetings = [
            # Upcoming Meetings
            Meeting(
                id="845-912-3401",
                title="Weekly Engineering Sync & Architecture Review",
                description="Review Zoom Clone specs, WebSockets signaling hub, and 3NF schema implementation.",
                passcode="123456",
                meeting_type="SCHEDULED",
                status="UPCOMING",
                scheduled_start_time=now + datetime.timedelta(hours=2),
                duration_minutes=45,
                created_at=now - datetime.timedelta(days=1),
                host_name="Alex Rivera"
            ),
            Meeting(
                id="912-401-8450",
                title="Product Roadmap & Design System Review",
                description="Discuss modern UI components, dark mode meeting room toolbar, and responsive layouts.",
                passcode=None,
                meeting_type="SCHEDULED",
                status="UPCOMING",
                scheduled_start_time=now + datetime.timedelta(days=1, hours=4),
                duration_minutes=60,
                created_at=now - datetime.timedelta(days=2),
                host_name="Sarah Chen"
            ),
            Meeting(
                id="340-184-5912",
                title="Frontend Integration & WebRTC Stress Test",
                description="Multi-tab WebRTC video stream testing and 4-participant mesh grid layout verification.",
                passcode="654321",
                meeting_type="SCHEDULED",
                status="UPCOMING",
                scheduled_start_time=now + datetime.timedelta(days=2, hours=1),
                duration_minutes=30,
                created_at=now - datetime.timedelta(days=1),
                host_name="David Miller"
            ),

            # Past/Recent Meetings
            Meeting(
                id="501-849-2310",
                title="Sprint Retrospective & Demo Call",
                description="Reviewed core meeting workflows, instant creation, and passcode validation.",
                passcode=None,
                meeting_type="INSTANT",
                status="ENDED",
                scheduled_start_time=now - datetime.timedelta(hours=5),
                started_at=now - datetime.timedelta(hours=5),
                ended_at=now - datetime.timedelta(hours=4, minutes=15),
                duration_minutes=45,
                created_at=now - datetime.timedelta(hours=5),
                host_name="Alex Rivera"
            ),
            Meeting(
                id="720-394-1185",
                title="Scaler SDE Assignment Briefing",
                description="Initial briefing on fullstack Zoom web app requirements and submission guidelines.",
                passcode="112233",
                meeting_type="SCHEDULED",
                status="ENDED",
                scheduled_start_time=now - datetime.timedelta(days=1, hours=3),
                started_at=now - datetime.timedelta(days=1, hours=3),
                ended_at=now - datetime.timedelta(days=1, hours=2),
                duration_minutes=60,
                created_at=now - datetime.timedelta(days=3),
                host_name="Scaler Evaluator"
            ),
        ]

        db.add_all(sample_meetings)
        db.commit()
        print("[SEED] Successfully seeded 5 sample meetings (3 upcoming, 2 past).")
    except Exception as e:
        print(f"[SEED ERROR] Failed to seed database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
