from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from routers import parse, extract, chat
import os

load_dotenv()

app = FastAPI(title="Landing.AI ADE Application")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse.router, prefix="/api/parse", tags=["parse"])
app.include_router(extract.router, prefix="/api/extract", tags=["extract"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
