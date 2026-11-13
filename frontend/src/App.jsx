import { useState } from "react";

const API = "http://127.0.0.1:8000";


// link ya seedhi ID dono se video ID nikalta hai
function extractVideoId(input) {
  const s = input.trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
}

function toSeconds(t) {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
}

export default function App() {
  const [link, setLink] = useState("");
  const [videoId, setVideoId] = useState(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [summary, setSummary] = useState(null);


  async function post(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "request failed");
    return data;
  }

  async function handleIngest() {
    const id = extractVideoId(link);
    if (!id) return setStatus("invalid YouTube link or ID");
    setLoading(true);
    setStatus("processing video...");
    try {
      const data = await post("/ingest", { video_id: id });
      setVideoId(id);
      setResult(null);
      setStatus(`ready: ${data.chunks} chunks`);
      setSummary(null);
      fetch(`${API}/summary/${id}`)
        .then((r) => r.json())
        .then((d) => d.chapters && setSummary(d))
        .catch(() => {});
    } catch (e) {
      setStatus(`error: ${e.message}`);
    }
    setLoading(false);
  }

    async function handleAsk() {
    if (!question.trim()) return;
    setLoading(true);
    setStatus("thinking...");
    setResult({ answer: "", sources: [] });
    try {
      const res = await fetch(`${API}/ask_stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotSources = false;
      let answer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!gotSources) {
          const nl = buffer.indexOf("\n");
          if (nl === -1) continue;
          const sources = JSON.parse(buffer.slice(0, nl)).sources;
          buffer = buffer.slice(nl + 1);
          gotSources = true;
          setResult({ answer: "", sources });
        }

        answer += buffer;
        buffer = "";
        if (answer) setStatus("");
        setResult((r) => ({ ...r, answer }));
      }
    } catch (e) {
      setStatus(`error: ${e.message}`);
    }
    setLoading(false);
  }


  function seek(seconds) {
  setStartAt(Math.floor(seconds));
}

  // answer ke andar ke [7:03] jaise timestamps ko clickable button banata hai
  function renderAnswer(text) {
    return text.split(/(\[\d+:\d{2}\])/g).map((part, i) => {
      const m = part.match(/^\[(\d+:\d{2})\]$/);
      if (m) {
        return (
          <button key={i} onClick={() => seek(toSeconds(m[1]))} style={{ margin: "0 2px" }}>
            {part}
          </button>
        );
      }
      return part;
    });
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "sans-serif" }}>
      <h1>YtAsk</h1>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="YouTube link or video ID"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button onClick={handleIngest} disabled={loading}>Load</button>
      </div>

      {status && <p>{status}</p>}

      {videoId && (
        <iframe
          key={`${videoId}-${startAt}`}
          width="100%"
          height="400"
          src={`https://www.youtube.com/embed/${videoId}?start=${startAt}&autoplay=1`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          style={{ border: 0, marginTop: 24 }}
        />
      )}

      {videoId && !summary && <p style={{ opacity: 0.6 }}>building chapters...</p>}

      {summary && (
        <div style={{ marginTop: 24 }}>
          <h3>Key takeaways</h3>
          <ul>
            {summary.takeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>

          <h3>Chapters</h3>
          {summary.chapters.map((c, i) => (
            <p key={i}>
              <button onClick={() => seek(c.start)}>[{c.time}]</button>{" "}
              <b>{c.title}</b>: {c.summary}
            </p>
          ))}
        </div>
      )}

      {videoId && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ flex: 1, padding: 8 }}
              placeholder="Ask something about the video"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            />
            <button onClick={handleAsk} disabled={loading}>Ask</button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{renderAnswer(result.answer)}</p>
          <h3>Sources</h3>
          {result.sources.map((s, i) => (
            <p key={i}>
              <button onClick={() => seek(s.start)}>[{s.time}]</button> {s.text.slice(0, 120)}...
            </p>
          ))}
        </div>
      )}
    </div>
  );
}