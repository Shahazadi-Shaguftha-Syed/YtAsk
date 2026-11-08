from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag import ingest, ask

app = FastAPI()

# frontend (alag port pe chalta hai) ko is API se baat karne ki ijazat
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    video_id: str


class AskRequest(BaseModel):
    video_id: str
    question: str


@app.get("/")
def home():
    return {"message": "ytsum is running"}


@app.post("/ingest")
def ingest_video(req: IngestRequest):
    try:
        n = ingest(req.video_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"could not ingest video: {e}")
    return {"video_id": req.video_id, "chunks": n}


@app.post("/ask")
def ask_video(req: AskRequest):
    try:
        return ask(req.video_id, req.question)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))