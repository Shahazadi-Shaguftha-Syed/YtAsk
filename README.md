# ytsum

Ask questions about any YouTube video and get answers with clickable timestamp citations.
Built from scratch, no LangChain.

## Pipeline
1. Fetch transcript (youtube-transcript-api), cached locally
2. Merge captions into ~20s chunks, keeping each chunk's start time
3. Embed chunks (sentence-transformers) and store in Chroma
4. Retrieve top-k chunks, send to LLM (Groq) with "answer only from excerpts, cite timestamps"

## Run
Backend:

    cd backend
    pip install -r requirements.txt
    export GROQ_API_KEY="your_key"
    uvicorn api:app

Frontend (new terminal):

    cd frontend
    npm install
    npm run dev

## Limitations
- Needs English captions on the video
- Fetching many new videos quickly can get your IP blocked by YouTube
