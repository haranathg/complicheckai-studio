#!/usr/bin/env python3
"""
Script to clear all V2 check results from the database.
Also clears batch_check_runs since they reference check results.
"""
import sys
import os

# Load .env BEFORE importing database module
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Get database URL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found in environment")

# Create engine and session
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Import models after engine is created
from models.database_models import CheckResult, BatchCheckRun, PageCheckResult

def clear_check_results():
    """Delete all check results and batch runs."""
    db = SessionLocal()

    try:
        # Count before deletion
        check_count = db.query(CheckResult).count()
        batch_count = db.query(BatchCheckRun).count()
        page_check_count = db.query(PageCheckResult).count()

        print(f"Found {check_count} check results")
        print(f"Found {page_check_count} page check results")
        print(f"Found {batch_count} batch check runs")

        if check_count == 0 and batch_count == 0:
            print("Nothing to delete.")
            return

        # Delete page check results first (foreign key to check_results)
        deleted_page_checks = db.query(PageCheckResult).delete()
        print(f"Deleted {deleted_page_checks} page check results")

        # Delete check results (foreign key to batch_check_runs)
        deleted_checks = db.query(CheckResult).delete()
        print(f"Deleted {deleted_checks} check results")

        # Delete batch runs
        deleted_batches = db.query(BatchCheckRun).delete()
        print(f"Deleted {deleted_batches} batch check runs")

        db.commit()
        print("\nAll check results cleared successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    confirm = input("This will DELETE ALL check results from the database. Continue? (yes/no): ")
    if confirm.lower() == "yes":
        clear_check_results()
    else:
        print("Aborted.")
