import os, json
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import requests
from requests.adapters import HTTPAdapter
import chromadb
from groq import Groq
import numpy as np
from fastembed import TextEmbedding
from youtube_transcript_api import YouTubeTranscriptApi


model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")


def embed(texts):
    vecs = np.array(list(model.embed(texts, batch_size=32)), dtype="float32")
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    return vecs


db = chromadb.PersistentClient(path="chroma_db")
client = Groq(api_key=os.environ["GROQ_API_KEY"])


def fmt_time(seconds):
    mins, secs = divmod(int(seconds), 60)
    return f"{mins}:{secs:02d}"


class _TimeoutAdapter(HTTPAdapter):

    def __init__(self, *args, timeout=(8, 15), **kwargs):
        self._timeout = timeout
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = self._timeout
        return super().send(request, **kwargs)


def _yt_api():
    session = requests.Session()
    adapter = _TimeoutAdapter()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return YouTubeTranscriptApi(http_client=session)


def get_transcript(video_id):
    cache = f"transcript_{video_id}.json"
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    try:
        transcript = _yt_api().fetch(video_id, languages=["en"]).to_raw_data()
    except (requests.exceptions.ConnectTimeout,
            requests.exceptions.ReadTimeout,
            requests.exceptions.ConnectionError) as e:
        raise RuntimeError(
            "Can't reach YouTube from this network. Check your connection or try a hotspot."
        ) from e
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False)
    return transcript


def make_chunks(transcript, chunk_seconds=20):
    chunks = []
    current_text = ""
    current_start = transcript[0]["start"]
    current_end = current_start
    for seg in transcript:
        seg_end = seg["start"] + seg.get("duration", 0)
        if seg["start"] - current_start >= chunk_seconds:
            chunks.append({"text": current_text, "start": current_start, "end": current_end})
            current_text = seg["text"]
            current_start = seg["start"]
            current_end = seg_end
        else:
            current_text += " " + seg["text"]
            current_end = max(current_end, seg_end)
    if current_text:
        chunks.append({"text": current_text, "start": current_start, "end": current_end})
    return chunks


def get_collection(video_id):
    return db.get_or_create_collection(
        name=f"video_{video_id}_c",
        metadata={"hnsw:space": "cosine"},
    )


def ingest(video_id):
    collection = get_collection(video_id)
    if collection.count() > 0:
        return collection.count()
    chunks = make_chunks(get_transcript(video_id))
    texts = [c["text"] for c in chunks]
    vectors = embed(texts)
    collection.add(
        ids=[f"{video_id}_{i}" for i in range(len(chunks))],
        documents=texts,
        embeddings=vectors.tolist(),
        metadatas=[{"start": c["start"], "end": c["end"]} for c in chunks],
    )
    return collection.count()


def ask(video_id, question, k=5):
    collection = get_collection(video_id)
    if collection.count() == 0:
        raise ValueError("video not ingested yet")

    q_vector = embed([question])[0]
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

def get_chunks(video_id):
    collection = get_collection(video_id)
    data = collection.get(include=["documents", "metadatas"])
    items = sorted(zip(data["metadatas"], data["documents"]), key=lambda x: x[0]["start"])
    return [{"start": m["start"], "text": d} for m, d in items]


def llm_json(system, user):
    resp = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return json.loads(resp.choices[0].message.content)


def summarize(video_id, section_chunks=9):
    cache = f"summary_{video_id}.json"
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            return json.load(f)

    chunks = get_chunks(video_id)
    if not chunks:
        raise ValueError("video not ingested yet")


    chapters = []
    for i in range(0, len(chunks), section_chunks):
        group = chunks[i:i + section_chunks]
        text = " ".join(c["text"] for c in group)
        data = llm_json(
            'Summarize this transcript section. Return JSON: '
            '{"title": "3-6 word chapter title", "summary": "one sentence"}. '
            "Ignore subtitle credits like 'Transcriber' or 'Reviewer'.",
            text,
        )
        chapters.append({
            "start": group[0]["start"],
            "time": fmt_time(group[0]["start"]),
            "title": data.get("title", "Untitled"),
            "summary": data.get("summary", ""),
        })


    notes = "\n".join(f"[{c['time']}] {c['title']}: {c['summary']}" for c in chapters)
    data = llm_json(
        'Given these chapter notes of a video, return JSON: '
        '{"takeaways": ["5 short key takeaways"]}',
        notes,
    )

    result = {"chapters": chapters, "takeaways": data.get("takeaways", [])}
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    return result


def prepare(video_id, question, k=5):
    collection = get_collection(video_id)
    if collection.count() == 0:
        raise ValueError("video not ingested yet")

    q_vector = embed([question])[0]
    res = collection.query(query_embeddings=[q_vector.tolist()], n_results=k)
    hits = list(zip(res["metadatas"][0], res["documents"][0]))
    hits.sort(key=lambda h: h[0]["start"])

    context = "\n\n".join(f"[{fmt_time(m['start'])}] {doc}" for m, doc in hits)
    messages = [
        {"role": "system", "content": (
            "Answer the question using ONLY the transcript excerpts given. "
            "Put each timestamp in square brackets like [7:03] right after the claim it supports. "
            "If the excerpts don't contain the answer, say so."
        )},
        {"role": "user", "content": f"Excerpts:\n{context}\n\nQuestion: {question}"},
    ]
    sources = [
        {"start": m["start"], "time": fmt_time(m["start"]), "text": doc}
        for m, doc in hits
    ]
    return sources, messages


import time

def stream_answer(messages):
    stream = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=messages,
        stream=True,
    )
    for part in stream:
        if not part.choices:
            continue
        delta = part.choices[0].delta.content
        if delta:
            yield delta


def select_relevant(hits, margin=0.12, max_distance=0.75):
    if not hits:
        return []
    best = min(h[0] for h in hits)
    if best > max_distance:
        return []
    return [h for h in hits if h[0] <= max_distance and h[0] <= best + margin]


def skim(video_id, query, k=8, merge_gap=10, chunk_len=20, margin=0.12, max_distance=0.75):
    collection = get_collection(video_id)
    if collection.count() == 0:
        raise ValueError("video not ingested yet")

    q_vector = embed([query])[0]
    res = collection.query(query_embeddings=[q_vector.tolist()], n_results=k)
    if os.environ.get("SKIM_DEBUG"):
        print("skim distances:", [round(d, 2) for d in res["distances"][0]], "query:", query)
    hits = select_relevant(
        list(zip(res["distances"][0], res["metadatas"][0], res["documents"][0])),
        margin=margin,
        max_distance=max_distance,
    )
    hits.sort(key=lambda h: h[1]["start"])

    segments = []
    for _, m, doc in hits:
        s = m["start"]
        e = m.get("end", s + chunk_len)
        if segments and s <= segments[-1]["end"] + merge_gap:
            segments[-1]["end"] = max(segments[-1]["end"], e)
            segments[-1]["text"] += " " + doc
        else:
            segments.append({"start": s, "end": e, "text": doc})

    for seg in segments:
        seg["time"] = fmt_time(seg["start"])
        seg["end_time"] = fmt_time(seg["end"])

    total = sum(s["end"] - s["start"] for s in segments)
    return {"segments": segments, "total_seconds": round(total)}