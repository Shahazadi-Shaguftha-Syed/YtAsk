from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from rag import ingest, ask, summarize, prepare, stream_answer
import json


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

@app.get("/summary/{video_id}")
def summary(video_id: str):
    try:
        return summarize(video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/ask_stream")
def ask_stream(req: AskRequest):
    try:
        sources, messages = prepare(req.video_id, req.question)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    def gen():
        yield json.dumps({"sources": sources}, ensure_ascii=False) + "\n"
        yield from stream_answer(messages)

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")