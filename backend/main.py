from contextlib import asynccontextmanager
import traceback
import logging
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from routers import parse, extract, chat, compliance, projects, documents, annotations, batch, checks, reports
import os

load_dotenv()

# Configure logging to stdout for CloudWatch
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events."""
    # Startup: Initialize database if DATABASE_URL is configured
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        from database import init_database, close_database
        logger.info("Initializing database connection...")
        try:
            init_database(database_url)
            logger.info("Database initialized successfully")
        except Exception as e:
            logger.error(f"ERROR initializing database: {e}")
            logger.error(traceback.format_exc())
    else:
        logger.warning("DATABASE_URL not set - project/document storage disabled")

    yield

    # Shutdown: Close database connection
    if database_url:
        from database import close_database
        close_database()
        logger.info("Database connection closed")


app = FastAPI(title="CompliCheckAI - Document Compliance Studio", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler to log and return detailed errors."""
    error_detail = {
        "error": str(exc),
        "type": type(exc).__name__,
        "path": str(request.url.path),
        "traceback": traceback.format_exc()
    }
    logger.error(f"ERROR on {request.url.path}: {exc}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "error_type": type(exc).__name__}
    )


# CORS configuration - allow frontend origins
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,https://main.d3rrtadjufwebu.amplifyapp.com,https://main.d26p3q1kqg30hn.amplifyapp.com,https://ccai.cognaify.com.au,https://complicheckai.cognaify.com.au").split(",")
# Also allow all origins in development/testing
allow_all = os.getenv("CORS_ALLOW_ALL", "false").lower() == "true"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing routers
app.include_router(parse.router, prefix="/api/parse", tags=["parse"])
app.include_router(extract.router, prefix="/api/extract", tags=["extract"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])

# New project/document management routers
# IMPORTANT: Order matters! More specific routes must come before general routes.
# documents/annotations/batch have routes like /{project_id}/documents/...
# projects has routes like /{project_id} which would catch all if registered first
app.include_router(documents.router, prefix="/api/projects", tags=["documents"])
app.include_router(annotations.router, prefix="/api/projects", tags=["annotations"])
app.include_router(batch.router, prefix="/api/projects", tags=["batch"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])

# New checks router for document compliance checks
app.include_router(checks.router, prefix="/api/checks", tags=["checks"])

# Reports router for PDF generation
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])


@app.get("/health")
def health_check():
    """Health check endpoint with database ping to keep connection alive."""
    from sqlalchemy import text

    database_url = os.getenv("DATABASE_URL")
    s3_bucket = os.getenv("S3_BUCKET")
    db_healthy = False
    db_error = None

    # Ping the database to keep it active (prevents Neon from suspending)
    if database_url:
        try:
            from database import SessionLocal
            if SessionLocal:
                db = SessionLocal()
                try:
                    db.execute(text("SELECT 1"))
                    db_healthy = True
                finally:
                    db.close()
        except Exception as e:
            db_error = str(e)

    return {
        "status": "healthy" if (not database_url or db_healthy) else "degraded",
        "database_configured": bool(database_url),
        "database_healthy": db_healthy,
        "database_error": db_error,
        "s3_configured": bool(s3_bucket)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
