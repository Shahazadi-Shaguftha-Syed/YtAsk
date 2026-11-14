import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ───────── helpers ───────── */
function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

function toSeconds(ts) {
  const parts = ts.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDur(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return sec ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

// strips transcript noise like [music], >> etc.
function clean(t = "") {
  return t
    .replace(/\[(music|applause|laughter)\]/gi, "")
    .replace(/>>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

/* ───────── icons ───────── */
const paths = {
  play: "M8 5v14l11-7z",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  chev: "M6 9l6 6 6-6",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  chat: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z",
  stop: "M6 6h12v12H6z",
};
function Icon({ name, fill }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0B0B0D" />
      <rect x=".5" y=".5" width="31" height="31" rx="6.5" stroke="#3A3A40" />
      <rect x="5" y="12" width="22" height="8" rx="2" fill="#3A3A40" />
      <rect x="7" y="12" width="5" height="8" rx="1" fill="#E53935" />
      <rect x="17" y="12" width="7" height="8" rx="1" fill="#E53935" />
      <rect x="14" y="8" width="2" height="16" rx="1" fill="#F2F0EE" />
    </svg>
  );
}

/* ───────── landing visuals (illustrative examples, labelled as such) ───────── */
const CHUNKS = 192;
const HIT = new Set([14, 15, 16, 17, 70, 71, 72, 101, 102, 133, 134, 135, 136, 171, 172]);

function ChunkMap() {
  const secs = HIT.size * 20;
  const total = CHUNKS * 20;
  return (
    <figure className="chunkmap" aria-label="Example: the relevant chunks of a video's transcript, highlighted">
      <div className="cm-head">
        <span>Transcript index</span>
        <span>Example</span>
      </div>
      <div className="cm-grid" aria-hidden="true">
        {Array.from({ length: CHUNKS }, (_, i) => (
          <i key={i} className={HIT.has(i) ? "hit" : ""} />
        ))}
      </div>
      <div className="cm-query">
        <span>Query</span>
        “practical tips I can apply”
      </div>
      <div className="cm-foot">
        <span><b>{HIT.size}</b> of {CHUNKS} chunks selected</span>
        <span>{fmtDur(secs)} of {fmtDur(total)}</span>
      </div>
    </figure>
  );
}

const DEMO_TOTAL = 64 * 60;
const DEMO_SEGS = [[8, 10], [23, 25.5], [41, 44], [57, 58.5]].map(([a, b]) => [a * 60, b * 60]);

function Features() {
  const plan = DEMO_SEGS.reduce((n, [a, b]) => n + (b - a), 0);
  const savedPct = Math.round(((DEMO_TOTAL - plan) / DEMO_TOTAL) * 100);
  return (
    <div className="features">
      <article className="feat feat-skim" id="f-skim">
        <div className="feat-top">
          <span className="badge">Signature feature</span>
          <span className="mono-tag">Example</span>
        </div>
        <h3>Smart Skim</h3>
        <p>Describe what you care about. YtAsk picks the moments that answer it and plays them back to back.</p>
        <div className="mini-q"><span>›</span> practical tips I can apply</div>
        <div className="mini-tl" aria-hidden="true">
          {DEMO_SEGS.map(([a, b], i) => (
            <div key={i} className="mini-seg" style={{ left: `${(a / DEMO_TOTAL) * 100}%`, width: `${((b - a) / DEMO_TOTAL) * 100}%` }}>
              <em>{i + 1}</em>
            </div>
          ))}
        </div>
        <div className="mini-axis" aria-hidden="true">
          <span>0:00</span>
          <span>{fmtTime(DEMO_TOTAL)}</span>
        </div>
        <dl className="mini-stats">
          <div><dt>Watch plan</dt><dd>{fmtDur(plan)}</dd></div>
          <div><dt>Original</dt><dd>{fmtDur(DEMO_TOTAL)}</dd></div>
          <div className="save"><dt>Saved</dt><dd>{savedPct}%</dd></div>
        </dl>
      </article>

      <article className="feat" id="f-chapters">
        <div className="feat-top"><h3>Chapters</h3><span className="mono-tag">Example</span></div>
        <p>Long videos broken into clear sections you can jump between.</p>
        <ul className="mini-ch" aria-hidden="true">
          <li><span className="ts">0:00</span>Why we sleep</li>
          <li className="on"><span className="ts">3:00</span>Memory and learning</li>
          <li><span className="ts">10:00</span>Caffeine and adenosine</li>
        </ul>
      </article>

      <article className="feat" id="f-ask">
        <div className="feat-top"><h3>Ask</h3><span className="mono-tag">Example</span></div>
        <p>Answers from the transcript, each claim linked to its timestamp.</p>
        <div className="mini-ask" aria-hidden="true">
          <div className="q">Does caffeine affect sleep?</div>
          <div className="a">It blocks adenosine, which delays sleepiness <span className="ts">10:42</span></div>
        </div>
      </article>
    </div>
  );
}

/* ───────── component ───────── */
// Videos whose transcripts ship with the backend, so they work even where YouTube blocks live fetching.
const DEMO_VIDEOS = [{ id: "_l4xZLssfUY", label: "How to Be Consistent" }];

const SKIM_CHIPS = ["The main ideas", "Practical tips I can apply", "The key conclusion", "Any examples or stories"];
const ASK_CHIPS = ["What is this video about?", "What are the key takeaways?", "What examples does the speaker give?"];

export default function App() {
  const [link, setLink] = useState("");
  const [videoId, setVideoId] = useState(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryErr, setSummaryErr] = useState(false);
  const [skimQuery, setSkimQuery] = useState("");
  const [skimPlan, setSkimPlan] = useState(null);
  const [skimIdx, setSkimIdx] = useState(-1);
  const [skimLoading, setSkimLoading] = useState(false);
  const [skimErr, setSkimErr] = useState("");
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState("");
  const [askedQ, setAskedQ] = useState("");
  const [openCh, setOpenCh] = useState(-1);
  const [curTime, setCurTime] = useState(0);
  const [meta, setMeta] = useState({ title: "", duration: 0 });
  const [activeNav, setActiveNav] = useState("");

  const playerRef = useRef(null);
  const skimRef = useRef({ active: false, idx: 0, segs: [], since: 0 });

  /* YouTube IFrame player */
  useEffect(() => {
    if (!videoId) return;
    const create = () => {
      if (playerRef.current && playerRef.current.cueVideoById) {
        playerRef.current.cueVideoById(videoId);
        return;
      }
      playerRef.current = new window.YT.Player("yt-player", {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
      });
    };
    if (window.YT && window.YT.Player) {
      create();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        create();
      };
      if (!document.getElementById("yt-iframe-api")) {
        const s = document.createElement("script");
        s.id = "yt-iframe-api";
        s.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(s);
      }
    }
  }, [videoId]);

  /* time tracking + Smart Skim playback */
  useEffect(() => {
    if (!videoId) return;
    const timer = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      const t = p.getCurrentTime();
      setCurTime((prev) => (Math.abs(prev - t) >= 0.25 ? t : prev));

      if (p.getVideoData && p.getDuration) {
        const title = p.getVideoData()?.title || "";
        const duration = p.getDuration() || 0;
        setMeta((m) => (m.title === title && m.duration === duration ? m : { title, duration }));
      }

      const s = skimRef.current;
      if (s.active) {
        const seg = s.segs[s.idx];
        if (seg && Date.now() - s.since > 800 && t >= seg.end) {
          const next = s.idx + 1;
          if (next < s.segs.length) {
            s.idx = next;
            s.since = Date.now();
            setSkimIdx(next);
            p.seekTo(s.segs[next].start, true);
          } else {
            s.active = false;
            setSkimIdx(-1);
            p.pauseVideo();
          }
        }
      }
    }, 250);
    return () => clearInterval(timer);
  }, [videoId]);

  /* highlight the nav link of the section in view */
  useEffect(() => {
    if (!videoId) {
      setActiveNav("");
      return;
    }
    const els = ["skim", "chapters", "ask"].map((i) => document.getElementById(i)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActiveNav(e.target.id)),
      { rootMargin: "-35% 0px -60% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [videoId]);

  /* actions */
  async function loadSummary(id) {
    setSummary(null);
    setSummaryErr(false);
    try {
      const res = await fetch(`${API}/summary/${id}`);
      if (!res.ok) throw new Error("summary failed");
      setSummary(await res.json());
    } catch {
      setSummaryErr(true);
    }
  }

  async function handleIngest(e, override) {
    if (e && e.preventDefault) e.preventDefault();
    const id = extractVideoId(override || link);
    if (!id) {
      setStatus("error: that doesn't look like a YouTube link");
      return;
    }
    setLoading(true);
    setStatus("Fetching transcript and indexing…");
    stopSkim();
    setResult(null);
    setSkimPlan(null);
    setOpenCh(-1);
    setMeta({ title: "", duration: 0 });
    try {
      await post("/ingest", { video_id: id });
      setVideoId(id);
      setStatus("");
      setLoading(false);
      loadSummary(id);
    } catch (err) {
      setStatus("error: " + err.message + ". Live fetching can fail on the hosted demo. Try a demo video.");
      setLoading(false);
    }
  }

  async function handleAsk(q) {
    const text = (typeof q === "string" ? q : question).trim();
    if (!text || !videoId) return;
    setQuestion(text);
    setAskedQ(text);
    setAsking(true);
    setAskErr("");
    setResult({ answer: "", sources: [] });
    try {
      const res = await fetch(`${API}/ask_stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question: text }),
      });
      if (!res.ok || !res.body) throw new Error("ask failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answer = "";
      let sources = [];
      let gotSources = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!gotSources) {
          buf += chunk;
          const nl = buf.indexOf("\n");
          if (nl === -1) continue;
          sources = JSON.parse(buf.slice(0, nl)).sources || [];
          answer = buf.slice(nl + 1);
          gotSources = true;
        } else {
          answer += chunk;
        }
        setResult({ answer, sources });
      }
    } catch (err) {
      setAskErr("Couldn't get an answer. Is the backend running?");
    }
    setAsking(false);
  }

  async function handleSkim(q) {
    const text = (typeof q === "string" ? q : skimQuery).trim();
    if (!text || !videoId) return;
    setSkimQuery(text);
    stopSkim();
    setSkimLoading(true);
    setSkimErr("");
    try {
      setSkimPlan(await post("/skim", { video_id: videoId, query: text }));
    } catch {
      setSkimErr("Couldn't build a watch plan. Is the backend running?");
    }
    setSkimLoading(false);
  }

  function seek(seconds) {
    const p = playerRef.current;
    if (!p || !p.seekTo) return;
    p.seekTo(Math.floor(seconds), true);
    p.playVideo();
    document.getElementById("player")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function playSkim(idx = 0) {
    if (!skimPlan || !skimPlan.segments.length) return;
    const p = playerRef.current;
    if (!p || !p.seekTo) return;
    const segs = skimPlan.segments;
    skimRef.current = { active: true, idx, segs, since: Date.now() };
    setSkimIdx(idx);
    p.seekTo(segs[idx].start, true);
    p.playVideo();
    document.getElementById("player")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function stopSkim() {
    const wasActive = skimRef.current.active;
    skimRef.current.active = false;
    setSkimIdx(-1);
    if (wasActive && playerRef.current?.pauseVideo) playerRef.current.pauseVideo();
  }

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* markdown-ish rendering with clickable [m:ss] */
  function renderInline(text, key) {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+:\d{2}(?::\d{2})?\])/g);
    return parts.map((part, i) => {
      if (!part) return null;
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(part)) return <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>;
      const ts = part.match(/^\[(\d+:\d{2}(?::\d{2})?)\]$/);
      if (ts) {
        return (
          <button key={`${key}-${i}`} className="ts" onClick={() => seek(toSeconds(ts[1]))} data-tip="Jump to this moment">
            {ts[1]}
          </button>
        );
      }
      return part;
    });
  }

  function renderAnswer(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const out = [];
    let list = null;
    const flush = () => {
      if (!list) return;
      const Tag = list.type;
      out.push(
        <Tag key={`l${out.length}`}>
          {list.items.map((it, i) => (
            <li key={i}>{renderInline(it, `li${out.length}-${i}`)}</li>
          ))}
        </Tag>
      );
      list = null;
    };
    let para = [];
    const flushPara = () => {
      if (para.length) {
        out.push(<p key={`p${out.length}`}>{renderInline(para.join(" "), `p${out.length}`)}</p>);
        para = [];
      }
    };
    lines.forEach((raw) => {
      const line = raw.trim();
      const ul = line.match(/^[-*•]\s+(.*)/);
      const ol = line.match(/^\d+[.)]\s+(.*)/);
      const h = line.match(/^#{1,4}\s+(.*)/);
      if (!line) {
        flushPara();
        flush();
      } else if (ul || ol) {
        flushPara();
        const type = ul ? "ul" : "ol";
        if (!list || list.type !== type) {
          flush();
          list = { type, items: [] };
        }
        list.items.push((ul || ol)[1]);
      } else if (h) {
        flushPara();
        flush();
        out.push(<h4 key={`h${out.length}`}>{renderInline(h[1], `h${out.length}`)}</h4>);
      } else {
        flush();
        para.push(line);
      }
    });
    flushPara();
    flush();
    return out;
  }

  /* derived */
  const loaded = !!videoId;
  const chapters = summary?.chapters || [];
  let activeCh = -1;
  chapters.forEach((c, i) => {
    if (c.start <= curTime) activeCh = i;
  });
  const segs = skimPlan?.segments || [];
  const dur = meta.duration || (segs.length ? Math.max(...segs.map((s) => s.end)) : 0);
  const skimTotal = skimPlan?.total_seconds ?? 0;
  const saved = Math.max(0, dur - skimTotal);
  const savedPct = dur ? Math.round((saved / dur) * 100) : 0;
  const isError = status.startsWith("error");

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a className="brand" href="/" aria-label="YtAsk home">
            <Logo />
            <span>
              Yt<b>Ask</b>
            </span>
          </a>
          <nav className="nav-links" aria-label="Sections">
            {[["skim", "Smart Skim"], ["chapters", "Chapters"], ["ask", "Ask"]].map(([id, label]) => (
              <button
                key={id}
                className={`nav-link ${activeNav === id ? "active" : ""}`}
                aria-current={activeNav === id ? "true" : undefined}
                onClick={() => scrollTo(loaded ? id : `f-${id}`)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="page">
        {/* Hero */}
        <section className={`hero ${loaded ? "is-loaded" : ""}`}>
          <div className="hero-grid">
            <div className="hero-main">
              <div className="hero-copy">
                <div>
                  <span className="eyebrow">Video intelligence</span>
                  <h1>
                    <span className="l1">Understand any video.</span>
                    <span className="l2">
                      Skip <s>what doesn't matter.</s>
                    </span>
                  </h1>
                  <p className="lead">Turn long videos into focused insights, meaningful answers, and personalized watch plans.</p>
                </div>
              </div>

              <form className="link-form" onSubmit={handleIngest}>
                <label className="field">
                  <Icon name="link" />
                  <span className="sr-only">YouTube link</span>
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Paste a YouTube link…"
                    inputMode="url"
                    autoComplete="off"
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? <span className="spinner" /> : <Icon name="spark" />}
                  {loading ? "Working…" : loaded ? "Load another" : "Analyze video"}
                </button>
              </form>
              <div className={`status-line ${isError ? "err" : ""}`} role="status">
                {loading && <span className="spinner" />}
                {status}
              </div>
              {!loaded && (
                <div className="demo-row">
                  <span>Try a demo:</span>
                  {DEMO_VIDEOS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="chip"
                      disabled={loading}
                      onClick={() => {
                        setLink(`https://youtu.be/${v.id}`);
                        handleIngest(null, v.id);
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!loaded && <ChunkMap />}
          </div>

          {!loaded && <Features />}
        </section>

        {loaded && (
          <>
            {/* Workspace */}
            <div className="workspace" id="player">
              <div className="card player-card">
                <div className="player-frame">
                  <div id="yt-player" />
                </div>
                <div className="player-meta">
                  <h2>{meta.title || "Loading video…"}</h2>
                  <div className="meta-row">
                    {meta.duration > 0 && (
                      <span className="badge neutral"><Icon name="clock" /> {fmtTime(meta.duration)}</span>
                    )}
                    <span className="badge good">Indexed</span>
                    {chapters.length > 0 && <span className="badge neutral">{chapters.length} chapters</span>}
                  </div>
                </div>
              </div>

              <div className="card takeaways">
                <div className="card-head">
                  <h2 className="h-section"><Icon name="bulb" /> Key takeaways</h2>
                </div>
                {summary?.takeaways?.length ? (
                  <ul className="take-list">
                    {summary.takeaways.map((t, i) => (
                      <li key={i}><span>{renderInline(t, `t${i}`)}</span></li>
                    ))}
                  </ul>
                ) : summaryErr ? (
                  <div className="state-box err">
                    Couldn't build the summary. Long videos can hit rate limits.
                    <button className="btn btn-secondary btn-sm" onClick={() => loadSummary(videoId)}>Retry</button>
                  </div>
                ) : (
                  <div className="skel-stack" aria-label="Building summary">
                    <div className="skeleton" style={{ width: "92%" }} />
                    <div className="skeleton" style={{ width: "80%" }} />
                    <div className="skeleton" style={{ width: "88%" }} />
                    <div className="skeleton" style={{ width: "70%" }} />
                    <p className="sub">Building chapters and takeaways…</p>
                  </div>
                )}
              </div>
            </div>

            {/* Smart Skim */}
            <section className="block" id="skim">
              <div className="card skim">
                <div className="card-head">
                  <div>
                    <h2 className="h-section"><Icon name="spark" /> Smart Skim</h2>
                    <p className="sub">Tell me what you care about. I'll build a watch plan of only the moments that matter.</p>
                  </div>
                  <span className="badge">Signature feature</span>
                </div>
                <form
                  className="skim-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSkim();
                  }}
                >
                  <input
                    className="input"
                    value={skimQuery}
                    onChange={(e) => setSkimQuery(e.target.value)}
                    placeholder="e.g. how to start investing, the part about sleep…"
                  />
                  <button className="btn btn-primary btn-lg" type="submit" disabled={skimLoading || !skimQuery.trim()}>
                    {skimLoading ? <span className="spinner" /> : <Icon name="spark" />}
                    {skimLoading ? "Planning…" : "Build watch plan"}
                  </button>
                </form>
                <div className="chips">
                  {SKIM_CHIPS.map((c) => (
                    <button key={c} className="chip" disabled={skimLoading} onClick={() => handleSkim(c)}>{c}</button>
                  ))}
                </div>

                {skimErr && <div className="state-box err" style={{ marginTop: 18 }}>{skimErr}</div>}

                {skimPlan && segs.length === 0 && (
                  <div className="state-box" style={{ marginTop: 18 }}>No relevant segments found. Try rephrasing what you're looking for.</div>
                )}

                {skimPlan && segs.length > 0 && (
                  <div className="skim-result">
                    <div className="stats">
                      <div className="stat"><span>Watch plan</span><b>{fmtDur(skimTotal)}</b></div>
                      <div className="stat"><span>Original</span><b>{dur ? fmtDur(dur) : "—"}</b></div>
                      <div className="stat save"><span>Time saved</span><b>{dur ? `${fmtDur(saved)} · ${savedPct}%` : "—"}</b></div>
                    </div>

                    {dur > 0 && (
                      <div className="timeline" aria-label="Where the selected segments sit in the video">
                        {segs.map((s, i) => (
                          <button
                            key={i}
                            className={`tl-seg ${skimIdx === i ? "on" : ""}`}
                            style={{ left: `${(s.start / dur) * 100}%`, width: `${Math.max(((s.end - s.start) / dur) * 100, 0.6)}%` }}
                            onClick={() => playSkim(i)}
                            data-tip={`${s.time} – ${s.end_time}`}
                            aria-label={`Play segment ${i + 1}`}
                          />
                        ))}
                        <div className="tl-head" style={{ left: `${Math.min(100, (curTime / dur) * 100)}%` }} />
                      </div>
                    )}

                    <div className="seg-list">
                      {segs.map((s, i) => (
                        <div key={i} className={`seg ${skimIdx === i ? "on" : ""}`}>
                          <div className="seg-n">{i + 1}</div>
                          <div>
                            <div className="seg-time">{s.time} – {s.end_time}</div>
                            <div className="seg-text">{clean(s.text)}</div>
                          </div>
                          <button className="btn btn-secondary btn-sm" onClick={() => playSkim(i)}>
                            <Icon name="play" fill /> Play
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="skim-actions">
                      {skimIdx >= 0 ? (
                        <button className="btn btn-secondary btn-lg" onClick={stopSkim}>
                          <Icon name="stop" fill /> Stop Smart Skim
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-lg" onClick={() => playSkim(0)}>
                          <Icon name="play" fill /> Play Smart Skim
                        </button>
                      )}
                      {skimIdx >= 0 && <span className="badge good" style={{ alignSelf: "center" }}>Segment {skimIdx + 1} of {segs.length}</span>}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Chapters */}
            <section className="block" id="chapters">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2 className="h-section"><Icon name="list" /> Chapters</h2>
                    <p className="sub">Jump to any part, or expand for a short summary.</p>
                  </div>
                </div>
                {chapters.length > 0 ? (
                  <div className="chapters">
                    {chapters.map((c, i) => (
                      <div key={i} className={`chapter ${activeCh === i ? "active" : ""} ${openCh === i ? "open" : ""}`}>
                        <div className="chapter-row">
                          <button className="ts" onClick={() => seek(c.start)} data-tip="Jump to chapter">{c.time}</button>
                          <button className="chapter-title" onClick={() => setOpenCh(openCh === i ? -1 : i)} aria-expanded={openCh === i}>
                            <span>{c.title}</span>
                            <Icon name="chev" />
                          </button>
                        </div>
                        <div className="chapter-body">
                          <div><p>{clean(c.summary)}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : summaryErr ? (
                  <div className="state-box err">
                    Chapters couldn't be built.
                    <button className="btn btn-secondary btn-sm" onClick={() => loadSummary(videoId)}>Retry</button>
                  </div>
                ) : (
                  <div className="skel-stack">
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 46, borderRadius: 12 }} />)}
                  </div>
                )}
              </div>
            </section>

            {/* Ask */}
            <section className="block" id="ask">
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2 className="h-section"><Icon name="chat" /> Ask the video</h2>
                    <p className="sub">Answers come only from the transcript, with timestamps you can click.</p>
                  </div>
                </div>
                <form
                  className="ask-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAsk();
                  }}
                >
                  <input
                    className="input"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask anything about this video…"
                  />
                  <button className="btn btn-primary" type="submit" disabled={asking || !question.trim()}>
                    {asking ? <span className="spinner" /> : <Icon name="send" />}
                    {asking ? "Thinking…" : "Ask"}
                  </button>
                </form>
                <div className="chips">
                  {ASK_CHIPS.map((c) => (
                    <button key={c} className="chip" disabled={asking} onClick={() => handleAsk(c)}>{c}</button>
                  ))}
                </div>

                {askErr && <div className="state-box err" style={{ marginTop: 18 }}>{askErr}</div>}

                {result && !askErr && (
                  <>
                    <div className="answer">
                      <div className="q">{askedQ}</div>
                      <div className="md">
                        {result.answer ? renderAnswer(result.answer) : <div className="skel-stack"><div className="skeleton" style={{ width: "90%" }} /><div className="skeleton" style={{ width: "70%" }} /></div>}
                        {asking && result.answer && <span className="caret" />}
                      </div>
                    </div>
                    {result.sources?.length > 0 && (
                      <div className="sources">
                        <h3>Sources</h3>
                        <div className="src-grid">
                          {result.sources.map((s, i) => (
                            <button key={i} className="src" onClick={() => seek(s.start)}>
                              <span className="ts" style={{ alignSelf: "flex-start" }}>{s.time || fmtTime(s.start)}</span>
                              <span className="t">{clean(s.text)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}

        <footer className="footer">YtAsk · answers grounded in the transcript</footer>
      </main>
    </>
  );
}