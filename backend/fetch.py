from youtube_transcript_api import YouTubeTranscriptApi
from sentence_transformers import SentenceTransformer
import numpy as np 
import json, os
from groq import Groq
import chromadb


os.environ["TOKENIZERS_PARALLELISM"] = "false"


video_id = "EvGkSEuWtaI"


model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


CACHE = "transcript.json"

if os.path.exists(CACHE):
    with open(CACHE, encoding="utf-8") as f:
        transcript = json.load(f)
else:
    ytt = YouTubeTranscriptApi()
    transcript = ytt.fetch(video_id, languages=["en", "hi"]).to_raw_data()
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False)


def make_chunks(transcript, chunk_seconds=60):
    chunks = []
    current_text = ""
    current_start = transcript[0]['start']

    for seg in transcript:
        if seg['start'] - current_start >= chunk_seconds:                     
            chunks.append({"text": current_text, "start": current_start})
            current_text = seg['text']                        
            current_start = seg['start']                     
        else:
            current_text += " " + seg['text']

    if current_text:
        chunks.append({"text": current_text, "start": current_start})
    return chunks


chunks = make_chunks(transcript, chunk_seconds=20)
print(f"total chunks: {len(chunks)}")
# print(chunks[0])
# print(chunks[1])

texts = [c["text"] for c in chunks]
# chunk_vectors = model.encode(texts, normalize_embeddings=True)
# print("vector shape:", chunk_vectors.shape)
db = chromadb.PersistentClient(path="chroma_db")
collection = db.get_or_create_collection(
    name=f"video_{video_id}",
    metadata={"hnsw:space": "cosine"},
)

if collection.count() == 0:   # sirf pehli baar embed + save
    chunk_vectors = model.encode(texts, normalize_embeddings=True)
    collection.add(
        ids=[f"{video_id}_{i}" for i in range(len(chunks))],
        documents=texts,
        embeddings=chunk_vectors.tolist(),
        metadatas=[{"start": c["start"]} for c in chunks],
    )
print("chunks in db:", collection.count())

client = Groq(api_key=os.environ["GROQ_API_KEY"])

def fmt_time(seconds):
    mins, secs = divmod(int(seconds), 60)
    return f"{mins}:{secs:02d}"

def ask(question, k=5):
    # R: retrieval (tumhara purana code)
    q_vector = model.encode([question], normalize_embeddings=True)[0]
    res = collection.query(query_embeddings=[q_vector.tolist()], n_results=k)
    hits = list(zip(res["metadatas"][0], res["documents"][0]))
    hits.sort(key=lambda h: h[0]["start"])   # video ke order mein

    context = "\n\n".join(
        f"[{fmt_time(m['start'])}] {doc}" for m, doc in hits
    )

    # G: generation (naya)
    resp = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": (
                "Answer the question using ONLY the transcript excerpts given. "
                "Cite timestamps like [7:03] after each claim. "
                "If the excerpts don't contain the answer, say so."
            )},
            {"role": "user", "content": f"Excerpts:\n{context}\n\nQuestion: {question}"},
        ],
    )
    return resp.choices[0].message.content
print(ask("what is the capital of France"))

questions = [
    "how long does the habit take",
    "what is the secret to forming a new habit",
    "why do people fail at new habits",
]
for q in questions:
    print("\nQ:", q)
    print(ask(q))