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
    """Full health check endpoint - checks backend, database, S3, and LLM API keys."""
    from sqlalchemy import text
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    from datetime import datetime

    # Environment variables
    database_url = os.getenv("DATABASE_URL")
    s3_bucket = os.getenv("S3_BUCKET")
    aws_region = os.getenv("AWS_REGION", "ap-southeast-2")

    # API keys configured
    openai_key = os.getenv("OPENAI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    google_key = os.getenv("GOOGLE_API_KEY")
    landing_ai_key = os.getenv("VISION_AGENT_API_KEY")

    # Initialize status
    db_healthy = False
    db_error = None
    s3_healthy = False
    s3_error = None

    # Check database connectivity
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

    # Check S3 connectivity
    if s3_bucket:
        try:
            s3_client = boto3.client('s3', region_name=aws_region)
            # Just check if we can access the bucket (head_bucket is lightweight)
            s3_client.head_bucket(Bucket=s3_bucket)
            s3_healthy = True
        except NoCredentialsError:
            s3_error = "AWS credentials not configured"
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            if error_code == '403':
                s3_error = "Access denied to S3 bucket"
            elif error_code == '404':
                s3_error = "S3 bucket not found"
            else:
                s3_error = f"S3 error: {error_code}"
        except Exception as e:
            s3_error = str(e)

    # Determine overall status
    all_healthy = True
    degraded = False

    if database_url and not db_healthy:
        all_healthy = False
    if s3_bucket and not s3_healthy:
        degraded = True  # S3 issues are degraded, not unhealthy

    if not all_healthy:
        overall_status = "unhealthy"
    elif degraded:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return {
        "status": overall_status,
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "backend": {
            "status": "healthy",
            "version": "1.0.0"
        },
        "database": {
            "configured": bool(database_url),
            "healthy": db_healthy,
            "error": db_error
        },
        "s3": {
            "configured": bool(s3_bucket),
            "healthy": s3_healthy,
            "bucket": s3_bucket if s3_bucket else None,
            "error": s3_error
        },
        "llm_providers": {
            "openai": bool(openai_key),
            "anthropic": bool(anthropic_key),
            "google": bool(google_key),
            "landing_ai": bool(landing_ai_key),
            "bedrock": True  # Bedrock uses IAM, always available if AWS creds work
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
