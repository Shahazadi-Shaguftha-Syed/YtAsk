import { useState, useEffect, useRef } from "react";

const API = "http://127.0.0.1:8000";


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

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const [link, setLink] = useState("");
  const [videoId, setVideoId] = useState(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  const [skimQuery, setSkimQuery] = useState("");
  const [skimPlan, setSkimPlan] = useState(null);
  const [skimIdx, setSkimIdx] = useState(-1);

  const playerRef = useRef(null);
  const skimRef = useRef({ active: false, idx: 0, segs: [], since: 0 });


  useEffect(() => {
    if (!videoId) return;

    const create = () => {
      if (playerRef.current) {
        playerRef.current.cueVideoById(videoId);
        return;
      }
      playerRef.current = new window.YT.Player("yt-player", {
        videoId,
        width: "100%",
        height: "400",
        playerVars: { rel: 0 },
      });
    };

    if (window.YT && window.YT.Player) {
      create();
    } else {
      window.onYouTubeIframeAPIReady = create;
      if (!document.getElementById("yt-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
      }
    }
  }, [videoId]);


  useEffect(() => {
    const id = setInterval(() => {
      const s = skimRef.current;
      const p = playerRef.current;
      if (!s.active || !p || !p.getCurrentTime) return;
      if (Date.now() - s.since < 800) return; // seek settle hone do

      const seg = s.segs[s.idx];
      if (p.getCurrentTime() >= seg.end) {
        if (s.idx + 1 < s.segs.length) {
          s.idx += 1;
          s.since = Date.now();
          setSkimIdx(s.idx);
          p.seekTo(s.segs[s.idx].start, true);
        } else {
          s.active = false;
          setSkimIdx(-1);
          p.pauseVideo();
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

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
      skimRef.current.active = false;
      setVideoId(id);
      setResult(null);
      setSkimPlan(null);
      setSkimIdx(-1);
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

  async function handleSkim() {
    if (!skimQuery.trim()) return;
    setLoading(true);
    setStatus("finding segments...");
    try {
      const data = await post("/skim", { video_id: videoId, query: skimQuery });
      skimRef.current.active = false;
      setSkimPlan(data);
      setSkimIdx(-1);
      setStatus("");
    } catch (e) {
      setStatus(`error: ${e.message}`);
    }
    setLoading(false);
  }


  function seek(seconds) {
    skimRef.current.active = false;
    setSkimIdx(-1);
    const p = playerRef.current;
    if (p && p.seekTo) {
      p.seekTo(Math.floor(seconds), true);
      p.playVideo();
    }
  }

  function playSkim(idx = 0) {
    const p = playerRef.current;
    if (!p || !p.seekTo || !skimPlan) return;
    skimRef.current = {
      active: true,
      idx,
      segs: skimPlan.segments,
      since: Date.now(),
    };
    setSkimIdx(idx);
    p.seekTo(skimPlan.segments[idx].start, true);
    p.playVideo();
  }

  function stopSkim() {
    skimRef.current.active = false;
    setSkimIdx(-1);
    const p = playerRef.current;
    if (p && p.pauseVideo) p.pauseVideo();
  }


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


      <div style={{ marginTop: 24, display: videoId ? "block" : "none" }}>
        <div id="yt-player" />
      </div>

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
          <h3>Smart Skim</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ flex: 1, padding: 8 }}
              placeholder="What do you want to watch? e.g. how to start a habit"
              value={skimQuery}
              onChange={(e) => setSkimQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSkim()}
            />
            <button onClick={handleSkim} disabled={loading}>Skim</button>
          </div>

          {skimPlan && (
            <div style={{ marginTop: 12 }}>
              <p>
                {skimPlan.segments.length} segments, {fmtTime(skimPlan.total_seconds)} total{" "}
                <button onClick={() => playSkim(0)}>▶ Play skim</button>{" "}
                {skimIdx >= 0 && <button onClick={stopSkim}>Stop</button>}
              </p>
              {skimPlan.segments.map((s, i) => (
                <p key={i} style={{ fontWeight: i === skimIdx ? "bold" : "normal" }}>
                  <button onClick={() => playSkim(i)}>
                    [{s.time}-{s.end_time}]
                  </button>{" "}
                  {s.text.slice(0, 120)}...
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {videoId && (
        <div style={{ marginTop: 24 }}>
          <h3>Ask</h3>
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