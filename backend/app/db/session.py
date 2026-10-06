from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

db_uri = settings.SQLALCHEMY_DATABASE_URI

if db_uri.startswith("sqlite"):
    engine = create_engine(
        db_uri,
        connect_args={"check_same_thread": False},
    )
else:
    try:
        temp_engine = create_engine(
            db_uri,
            pool_pre_ping=True, 
            pool_size=10,
            max_overflow=20
        )
        # Test connection quickly
        with temp_engine.connect():
            pass
        engine = temp_engine
    except Exception as e:
        print(f"[Database] PostgreSQL at {db_uri} unreachable ({e}). Using local SQLite database (sqlite:///./medisage.db).")
        engine = create_engine(
            "sqlite:///./medisage.db",
            connect_args={"check_same_thread": False},
        )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
