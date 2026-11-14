# YtAsk

Ask questions about any YouTube video. Get answers with clickable timestamp citations, auto chapters, and a **Smart Skim** watch plan that plays only the parts you care about.

Built from scratch in Python and React. **No LangChain, no LlamaIndex.** Every step of the RAG pipeline is plain code you can read.

**Live demo:** https://yt-ask.vercel.app
(Hosted on free tiers. The first load can take about a minute while the backend wakes up. Click **Try a demo** on the landing page.)

https://github.com/user-attachments/assets/07be82ad-c28f-46a9-b41f-03929eb85be4

## What it does

- **Smart Skim.** Type what you care about ("practical tips", "the conclusion"). YtAsk finds the relevant moments, shows them on a timeline with how much time you save, and auto-plays them back to back.
- **Ask the video.** Answers stream in and cite the transcript. Each `[m:ss]` is a button that jumps the player to that moment. Sources are shown as separate cards.
- **Chapters and takeaways.** Map-reduce summarization turns a long transcript into chapters and five key takeaways.

## How it works

```
YouTube URL
   │
   ▼
transcript (youtube-transcript-api, cached as JSON)
   │
   ▼
~20 second chunks, each keeps its start time
   │
   ▼
embeddings (all-MiniLM-L6-v2 via fastembed)  ──►  Chroma (cosine, one collection per video)
                                                       │
        question / skim query ──► embed ──► top-k chunks ◄┘
                                      │
                                      ▼
              Groq (gpt-oss-20b): "answer ONLY from these excerpts, cite [m:ss]"
                                      │
                                      ▼
              streamed to the browser, timestamps become clickable
```

Design choices worth knowing:

- **Chunking by time, not by tokens.** Each chunk carries a start time, so every retrieved piece can be cited and played.
- **Grounded prompt.** The model is told to answer only from the retrieved excerpts and to say so when they don't contain the answer.
- **Streaming protocol.** `/ask_stream` sends one JSON line with the sources first, then raw text. The React client reads it with `fetch` + `ReadableStream`.
- **Smart Skim.** Query → top 8 chunks → merge segments that are within 10 seconds of each other → the frontend plays them with the YouTube IFrame API (`seekTo` + a 250 ms poll of `getCurrentTime`).
- **Summaries.** Map-reduce: about 3 minutes of transcript per chapter summary, then a reduce step to five takeaways in JSON mode. Results are cached.
- **Small embedding model on purpose.** The free hosting tier has 512 MB of RAM. sentence-transformers with torch didn't fit, so embeddings run through fastembed (ONNX, no torch) with a small 384-dimension model. The app only handles English transcripts, so a multilingual model wasn't needed.

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, Pydantic |
| Retrieval | fastembed (all-MiniLM-L6-v2), ChromaDB |
| LLM | Groq API (`openai/gpt-oss-20b`) |
| Frontend | React + Vite (plain JS, no UI library) |
| Player | YouTube IFrame API |
| Hosting | Render (API), Vercel (frontend) |

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/ingest` | `{video_id}` | `{video_id, chunks}` |
| GET | `/summary/{video_id}` | | `{chapters, takeaways}` |
| POST | `/ask_stream` | `{video_id, question}` | JSON line of sources, then streamed text |
| POST | `/skim` | `{video_id, query}` | `{segments, total_seconds}` |

## Run it locally

You need Python 3.12, Node 18+, and a free [Groq API key](https://console.groq.com).

**Backend**

```bash
cd backend
python3.12 -m venv ../venv && source ../venv/bin/activate
pip install -r requirements.txt
export GROQ_API_KEY=your_key_here      # never commit this
uvicorn api:app --reload               # http://localhost:8000
```

**Frontend** (second terminal)

```bash
cd frontend
npm install
npm run dev                            # http://localhost:5173
```

To point the frontend at a deployed backend, set `VITE_API_URL` (for example in a `.env` file in `frontend/`).

## Deployment

- **Frontend:** Vercel, root directory `frontend`, env var `VITE_API_URL` set to the API URL.
- **Backend:** Render free web service, root directory `backend`, start command `uvicorn api:app --host 0.0.0.0 --port $PORT`, env vars `GROQ_API_KEY` and `ALLOWED_ORIGINS` (the frontend URL, for CORS).
- The transcript and summary for the demo video are committed in `backend/`, so it works without calling YouTube from the server.

## Project structure

```
backend/
  api.py        FastAPI routes and CORS
  rag.py        transcript, chunking, embeddings, retrieval, summaries, skim
frontend/
  src/App.jsx   the whole UI and the player/skim logic
  src/index.css design tokens and styles
```

## Known limitations

- **YouTube blocks cloud IPs.** On the hosted demo, fetching a *new* video's transcript will often fail. Videos whose transcripts are already cached (the demo video) work fine. Running locally is usually fine.
- **Needs a network that can reach youtube.com.** If it can't, ingest fails after a short timeout with a clear error instead of hanging.
- **English transcripts only** for now.
- **Skim segment end times are approximated** as start + 20 s, because chunks store only a start time.
- **Very long videos** can hit Groq's free-tier rate limits while building chapters.
- **Free hosting sleeps** after about 15 minutes idle, so the first request after a pause is slow.

## Roadmap

- Real chunk end times and sentence-aware chunking
- Retrieval evaluation (hit-rate on a labelled question set)
- Relevance cutoff for Smart Skim so weak matches are dropped
- Follow-up questions with conversation memory
- Library of multiple videos
- Whisper fallback for videos without captions, Hinglish support
- Chrome extension

## License

MIT
