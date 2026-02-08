"""Database connection and session management."""
import os
from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from models.database_models import Base

# Database URL from environment variable
# Format: postgresql://user:password@host:port/database
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Create engine with connection pooling
engine = None
SessionLocal = None


def init_database(database_url: Optional[str] = None) -> None:
    """Initialize database connection and create tables if needed."""
    global engine, SessionLocal

    url = database_url or DATABASE_URL
    if not url:
        raise ValueError("DATABASE_URL environment variable is not set")

    engine = create_engine(
        url,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,  # Recycle connections after 30 minutes
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    )

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)

    # Add missing columns to existing tables (safe to re-run)
    with engine.connect() as conn:
        migrations = [
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS document_sources JSON",
            "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS model VARCHAR(100)",
        ]
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # Column may already exist on non-PostgreSQL
        conn.commit()


def get_db() -> Generator[Session, None, None]:
    """Dependency for FastAPI to get database session."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Context manager for database session (for use outside of FastAPI)."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def close_database() -> None:
    """Close database connection pool."""
    global engine
    if engine:
        engine.dispose()
        engine = None
