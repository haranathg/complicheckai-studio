from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from routers import parse, extract, chat, compliance, projects, documents, annotations, batch
import os

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - startup and shutdown events."""
    # Startup: Initialize database if DATABASE_URL is configured
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        from database import init_database, close_database
        print("Initializing database connection...")
        init_database(database_url)
        print("Database initialized successfully")
    else:
        print("Warning: DATABASE_URL not set - project/document storage disabled")

    yield

    # Shutdown: Close database connection
    if database_url:
        from database import close_database
        close_database()
        print("Database connection closed")


app = FastAPI(title="CompliCheckAI - Document Compliance Studio", lifespan=lifespan)

# CORS configuration - allow frontend origins
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,https://main.d3rrtadjufwebu.amplifyapp.com,https://ccai.cognaify.com.au,https://complicheckai.cognaify.com.au").split(",")
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
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(documents.router, prefix="/api/projects", tags=["documents"])
app.include_router(annotations.router, prefix="/api/projects", tags=["annotations"])
app.include_router(batch.router, prefix="/api/projects", tags=["batch"])


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
