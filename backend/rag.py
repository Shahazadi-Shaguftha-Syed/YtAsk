import os, json
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import chromadb
from groq import Groq
from sentence_transformers import SentenceTransformer
from youtube_transcript_api import YouTubeTranscriptApi

# ek baar load hota hai (server start pe), har request pe nahi
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
db = chromadb.PersistentClient(path="chroma_db")
client = Groq(api_key=os.environ["GROQ_API_KEY"])


def fmt_time(seconds):
    mins, secs = divmod(int(seconds), 60)
    return f"{mins}:{secs:02d}"


def get_transcript(video_id):
    cache = f"transcript_{video_id}.json"
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    transcript = YouTubeTranscriptApi().fetch(video_id, languages=["en"]).to_raw_data()
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False)
    return transcript


def make_chunks(transcript, chunk_seconds=20):
    chunks = []
    current_text = ""
    current_start = transcript[0]["start"]
    for seg in transcript:
        if seg["start"] - current_start >= chunk_seconds:
            chunks.append({"text": current_text, "start": current_start})
            current_text = seg["text"]
            current_start = seg["start"]
        else:
            current_text += " " + seg["text"]
    if current_text:
        chunks.append({"text": current_text, "start": current_start})
    return chunks


def get_collection(video_id):
    return db.get_or_create_collection(
        name=f"video_{video_id}_c",
        metadata={"hnsw:space": "cosine"},
    )


def ingest(video_id):
    """Ek video ko process karke Chroma mein save karta hai. Dobara call karo toh kuch nahi karta."""
    collection = get_collection(video_id)
    if collection.count() > 0:
        return collection.count()
    chunks = make_chunks(get_transcript(video_id))
    texts = [c["text"] for c in chunks]
    vectors = model.encode(texts, normalize_embeddings=True)
    collection.add(
        ids=[f"{video_id}_{i}" for i in range(len(chunks))],
        documents=texts,
        embeddings=vectors.tolist(),
        metadatas=[{"start": c["start"]} for c in chunks],
    )
    return collection.count()


def ask(video_id, question, k=5):
    collection = get_collection(video_id)
    if collection.count() == 0:
        raise ValueError("video not ingested yet")

    q_vector = model.encode([question], normalize_embeddings=True)[0]
    res = collection.query(query_embeddings=[q_vector.tolist()], n_results=k)
    hits = list(zip(res["metadatas"][0], res["documents"][0]))
    hits.sort(key=lambda h: h[0]["start"])

    context = "\n\n".join(f"[{fmt_time(m['start'])}] {doc}" for m, doc in hits)

    resp = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": (
                "Answer the question using ONLY the transcript excerpts given. "
                "Put each timestamp in square brackets like [7:03] right after the claim it supports. "
                "If the excerpts don't contain the answer, say so."
            )},
            {"role": "user", "content": f"Excerpts:\n{context}\n\nQuestion: {question}"},
        ],
    )
    return {
        "answer": resp.choices[0].message.content,
        "sources": [
            {"start": m["start"], "time": fmt_time(m["start"]), "text": doc}
            for m, doc in hits
        ],
    }