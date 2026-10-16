
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight,
  FileText, FileUp, Fingerprint, LoaderCircle, Menu, Plus,
  ScanLine, Search, ShieldCheck, Sparkles, Trash2, X
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "./index.css";

gsap.registerPlugin(ScrollTrigger);

const API = "/api";

const pipeline = [
  { n: "01", title: "Ingest", detail: "Original document enters the archive.", tech: "PYMUPDF", mark: "01 / SOURCE" },
  { n: "02", title: "Fragment", detail: "Pages become traceable text passages.", tech: "CHUNKING", mark: "02 / CONTEXT" },
  { n: "03", title: "Retrieve", detail: "Vector search finds relevant evidence.", tech: "QDRANT · 384D", mark: "03 / RETRIEVAL" },
  { n: "04", title: "Verify", detail: "Relevant passages ground the answer.", tech: "SIMILARITY ≥ 0.50", mark: "04 / THRESHOLD" },
  { n: "05", title: "Respond", detail: "Gemini formulates an evidence-led answer.", tech: "GEMINI API", mark: "05 / TRACE" },
];

function Magnetic({ children, className = "", onClick, disabled, type = "button", title }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;

    const move = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      gsap.to(el, { x: x * 0.13, y: y * 0.17, duration: 0.35, ease: "power3.out" });
    };
    const reset = () => gsap.to(el, { x: 0, y: 0, duration: 0.65, ease: "elastic.out(1, 0.4)" });

    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", reset);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", reset);
      gsap.killTweensOf(el);
    };
  }, []);

  return (
    <button ref={ref} type={type} className={className} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

function DustField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let particles = [];
    const pointer = { x: -1000, y: -1000 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(95, Math.floor((width * height) / 14500));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.25 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.16,
        a: Math.random() * 0.36 + 0.08,
      }));
    };

    const move = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 12500 && d2 > 0) {
          const force = (1 - Math.sqrt(d2) / 112) * 0.035;
          p.vx += (dx / Math.sqrt(d2)) * force;
          p.vy += (dy / Math.sqrt(d2)) * force;
        }

        p.vx += (Math.random() - 0.5) * 0.004;
        p.vy += (Math.random() - 0.5) * 0.004;
        p.vx *= 0.988;
        p.vy *= 0.988;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(198,255,61,${p.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return <canvas className="dust-field" ref={canvasRef} aria-hidden="true" />;
}

function Reticle() {
  const ref = useRef(null);
  const pos = useRef({ x: -100, y: -100 });
  const target = useRef({ x: -100, y: -100 });
  const frame = useRef(0);
  const [mode, setMode] = useState("");

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const onMove = (e) => {
      target.current = { x: e.clientX, y: e.clientY };
      document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
      document.documentElement.style.setProperty("--my", `${e.clientY}px`);
    };

    const onOver = (e) => {
      const targetEl = e.target.closest("[data-cursor]");
      setMode(targetEl?.dataset.cursor || "");
    };

    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.17;
      pos.current.y += (target.current.y - pos.current.y) * 0.17;
      if (ref.current) {
        ref.current.style.transform = `translate3d(${pos.current.x}px,${pos.current.y}px,0) translate(-50%,-50%)`;
      }
      frame.current = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver);
    frame.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div ref={ref} className={`reticle ${mode ? "reticle-active" : ""}`} aria-hidden="true">
      <span className="reticle-cross">+</span>
      {mode && <span className="reticle-label">{mode}</span>}
    </div>
  );
}

function PaperSpecimen({ variant = "hero" }) {
  return (
    <div className={`paper-specimen paper-${variant}`} data-cursor="INSPECT">
      <div className="paper-topline">
        <span>DT / FIELD NOTES</span><span>NO. 0001</span>
      </div>
      <div className="paper-emblem"><Fingerprint size={24} strokeWidth={1.25} /></div>
      <div className="paper-kicker">EVIDENCE RECORD</div>
      <div className="paper-heading">The case<br /><i>for truth.</i></div>
      <div className="paper-rule" />
      <div className="paper-lines">
        <span /><span /><span /><span className="short" />
      </div>
      <div className="paper-stamp">SOURCE<br />VERIFIED</div>
      <div className="paper-footer"><span>TRACE EVERY CLAIM</span><span>001 — 005</span></div>
    </div>
  );
}

export default function App() {
  const rootRef = useRef(null);
  const fileRef = useRef(null);
  const answerRef = useRef(null);
  const sourceRefs = useRef({});
  const [documents, setDocuments] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [activeSource, setActiveSource] = useState(null);
  const [threadPath, setThreadPath] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeDocument = documents.find((d) => d.document_id === activeId);

  const uploadPdf = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files can enter the archive.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API}/upload`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Document ingestion failed.");

      setDocuments((old) => [data, ...old]);
      setActiveId(data.document_id);
      setMessages([]);
      setMobileOpen(false);
    } catch (err) {
      setError(err.message || "Could not reach the DocuTrace API.");
    } finally {
      setUploading(false);
    }
  }, []);

  const askQuestion = useCallback(async (event) => {
    event?.preventDefault();
    const text = question.trim();
    if (!text || !activeId || asking) return;

    setQuestion("");
    setError("");
    setMessages((old) => [...old, { role: "user", content: text }]);
    setAsking(true);

    try {
      const response = await fetch(`${API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: activeId, question: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Answer generation failed.");

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          content: data.answer || data.message || "No answer was returned.",
          sources: data.sources || [],
        },
      ]);
    } catch (err) {
      setError(err.message || "Could not reach the DocuTrace API.");
    } finally {
      setAsking(false);
    }
  }, [question, activeId, asking]);

  function chooseDocument(id) {
    setActiveId(id);
    setMessages([]);
    setError("");
    setMobileOpen(false);
    setActiveSource(null);
    setThreadPath("");
  }

  function removeDocument(id) {
    setDocuments((old) => old.filter((doc) => doc.document_id !== id));
    if (id === activeId) {
      setActiveId("");
      setMessages([]);
    }
    setError("");
  }

  function traceSource(messageIndex, sourceIndex) {
    const key = `${messageIndex}-${sourceIndex}`;
    const target = sourceRefs.current[key];
    const origin = answerRef.current;
    if (!target || !origin) return;

    const a = origin.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const startX = Math.min(a.right - 15, window.innerWidth - 30);
    const startY = Math.max(25, a.top + 20);
    const endX = b.left + Math.min(b.width * 0.5, 110);
    const endY = b.top + b.height * 0.25;
    const bend = Math.max(55, Math.abs(endX - startX) * 0.28);

    setThreadPath(
      `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
    );
    setActiveSource(key);
  }

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".hero-overline, .hero-line, .hero-copy, .hero-actions", {
        y: 26, opacity: 0, clipPath: "inset(0 0 100% 0)"
      }, {
        y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)",
        duration: 1.05, stagger: 0.13, ease: "power4.out", delay: 0.12
      });

      gsap.fromTo(".hero-char", { yPercent: 115, rotate: 4 }, {
        yPercent: 0, rotate: 0, duration: 1.1, stagger: 0.027,
        ease: "power4.out", delay: 0.24
      });

      gsap.fromTo(".hero-art", { y: 36, rotate: 3, opacity: 0 }, {
        y: 0, rotate: 0, opacity: 1, duration: 1.3, ease: "power3.out", delay: 0.45
      });

      gsap.utils.toArray(".reveal").forEach((el) => {
        gsap.fromTo(el, { y: 32, opacity: 0, clipPath: "inset(0 0 14% 0)" }, {
          y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)", duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%", once: true }
        });
      });

      gsap.to(".orbit-page-one", {
        y: -18, rotate: -3, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 }
      });
      gsap.to(".orbit-page-two", {
        y: 24, rotate: 3, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 }
      });

      if (window.innerWidth > 800) {
        const cards = gsap.utils.toArray(".pipeline-card");
        if (cards.length) {
          gsap.to(".pipeline-track", {
            x: () => -(document.querySelector(".pipeline-track").scrollWidth - window.innerWidth + 80),
            ease: "none",
            scrollTrigger: {
              trigger: ".pipeline-section",
              start: "top top",
              end: () => `+=${document.querySelector(".pipeline-track").scrollWidth}`,
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
            },
          });
        }
      }

      gsap.fromTo(".trace-rule", { scaleX: 0 }, {
        scaleX: 1, transformOrigin: "left center", duration: 1.1, ease: "power3.inOut",
        scrollTrigger: { trigger: ".trace-rule", start: "top 88%", once: true }
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!activeSource) return;
    const onResize = () => setThreadPath("");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeSource]);

  const titleLineOne = "Every answer.";
  const titleLineTwo = "Traced.";

  return (
    <div className="site-shell" ref={rootRef}>
      <DustField />
      <div className="spotlight" aria-hidden="true" />
      <Reticle />

      <svg className="thread-overlay" aria-hidden="true">
        {threadPath && (
          <path key={threadPath} className="thread-path" d={threadPath} />
        )}
      </svg>

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="DocuTrace home">
          <span className="wordmark-symbol"><ScanLine size={19} /></span>
          <span>DOCU<span className="wordmark-accent">TRACE</span></span>
          <span className="wordmark-edition">/ FIELD EDITION 001</span>
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#method">Method <span>01</span></a>
          <a href="#archive">Archive <span>02</span></a>
          <a href="#principle">Principle <span>03</span></a>
        </nav>

        <div className="header-right">
          <span className="system-status"><i /> SYSTEM READY</span>
          <Magnetic className="header-upload" onClick={() => fileRef.current?.click()}>
            <Plus size={15} /> Add evidence
          </Magnetic>
          <button className="mobile-menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <nav className="mobile-nav">
          <a href="#method" onClick={() => setMobileOpen(false)}>Method / 01</a>
          <a href="#archive" onClick={() => setMobileOpen(false)}>Archive / 02</a>
          <a href="#principle" onClick={() => setMobileOpen(false)}>Principle / 03</a>
          <button onClick={() => fileRef.current?.click()}>+ Add evidence</button>
        </nav>
      )}

      <input ref={fileRef} type="file" accept=".pdf,application/pdf" hidden onChange={uploadPdf} />

      <main id="top">
        <section className="hero">
          <div className="hero-left">
            <div className="hero-overline">
              <span className="live-mark" /> DOCUMENT INTELLIGENCE, WITH RECEIPTS
            </div>

            <h1 className="hero-title">
              <span className="hero-line">
                {titleLineOne.split("").map((char, i) => (
                  <span className="hero-char-wrap" key={`a${i}`}>
                    <span className="hero-char">{char === " " ? "\u00a0" : char}</span>
                  </span>
                ))}
              </span>
              <span className="hero-line hero-line-second">
                {titleLineTwo.split("").map((char, i) => (
                  <span className="hero-char-wrap" key={`b${i}`}>
                    <span className={`hero-char ${char === "." ? "hero-period" : "hero-italic"}`}>
                      {char}
                    </span>
                  </span>
                ))}
              </span>
            </h1>

            <p className="hero-copy">
              An answer is only as good as its evidence.
              <br />
              Ask your documents. <span>Trace every claim.</span>
            </p>

            <div className="hero-actions">
              <Magnetic className="button-acid" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <LoaderCircle className="spin" size={17} /> : <FileUp size={17} />}
                {uploading ? "INGESTING DOCUMENT" : "UPLOAD A DOCUMENT"}
                <ArrowUpRight size={17} />
              </Magnetic>
              <a className="text-link" href="#method">Explore the method <ArrowDown size={14} /></a>
            </div>

            <div className="hero-footnote">
              <span>01 / INPUT</span><span className="footnote-rule" /><span>PDF · MAX 10 MB</span>
            </div>
          </div>

          <div className="hero-art" aria-label="Illustration of an archival evidence document">
            <div className="art-coordinate coord-a">19°59' N / 73°47' E</div>
            <div className="art-coordinate coord-b">ARCHIVE / LIVE</div>
            <div className="orbit-page orbit-page-one">
              <div className="orbit-page-label">EXHIBIT A</div>
              <div className="orbit-page-lines"><i /><i /><i /><i /></div>
              <span className="orbit-redline" />
            </div>
            <div className="orbit-page orbit-page-two">
              <div className="orbit-page-label">SOURCE INDEX</div>
              <div className="orbit-page-lines"><i /><i /><i /></div>
              <span className="orbit-page-number">P. 014</span>
            </div>
            <PaperSpecimen />
            <div className="art-crosshair crosshair-a">+</div>
            <div className="art-crosshair crosshair-b">+</div>
            <div className="art-caption"><span>FIG. 001</span><span>NOTHING WITHOUT A SOURCE</span></div>
            <div className="art-stamp">SOURCE<br />OR SILENCE</div>
          </div>

          <div className="hero-index"><span>DT—001</span><span>SCROLL TO INVESTIGATE ↓</span></div>
        </section>

        <section className="manifesto reveal" id="principle">
          <div className="section-index"><span>THE PRINCIPLE</span><span>01 — 03</span></div>
          <div className="manifesto-body">
            <p className="manifesto-kicker">NOT ANOTHER BLACK BOX.</p>
            <h2>Less <i>guesswork.</i><br />More <span className="underlined-word">proof.</span></h2>
            <p className="manifesto-description">
              DocuTrace retrieves passages from your actual documents before generating an answer.
              Every response comes with the evidence used to build it — so you can inspect the source,
              not just trust the output.
            </p>
          </div>
          <div className="manifesto-stamp"><ShieldCheck size={20} /><span>EVIDENCE<br />OVER ELOQUENCE</span></div>
        </section>

        <section className="pipeline-section" id="method">
          <div className="pipeline-top">
            <div className="section-index"><span>THE METHOD</span><span>02 — 03</span></div>
            <div className="pipeline-heading">
              <p className="manifesto-kicker">FIVE STEPS. NO MAGIC TRICKS.</p>
              <h2>Follow the<br /><i>evidence trail.</i></h2>
            </div>
            <div className="pipeline-counter"><span>PIPELINE / 05</span><span>SCROLL TO TRACE <ArrowRight size={14} /></span></div>
          </div>

          <div className="pipeline-track">
            {pipeline.map((step, index) => (
              <article className={`pipeline-card pipeline-card-${index + 1}`} key={step.n}>
                <div className="pipeline-card-top"><span>{step.mark}</span><span>{step.n} / 05</span></div>
                <div className="pipeline-illustration">
                  {index === 0 && <div className="mini-file"><FileText size={35} /><span>PDF</span></div>}
                  {index === 1 && <div className="mini-chunks"><i /><i /><i /><i /><i /></div>}
                  {index === 2 && <div className="mini-search"><Search size={37} /><span className="search-dot" /></div>}
                  {index === 3 && <div className="mini-verify"><ShieldCheck size={43} /><Check size={17} /></div>}
                  {index === 4 && <div className="mini-answer"><span /><span /><span /><i>01</i></div>}
                  <span className="illustration-cross">+</span>
                </div>
                <div className="pipeline-number">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
                <div className="pipeline-tech">{step.tech}</div>
              </article>
            ))}
          </div>
          <div className="pipeline-bottom"><span>INPUT → RETRIEVAL → EVIDENCE → ANSWER</span><span>BUILT TO BE INSPECTED.</span></div>
        </section>

        <section className="archive-section" id="archive">
          <div className="section-index"><span>THE ARCHIVE</span><span>03 — 03</span></div>
          <div className="archive-heading">
            <div>
              <p className="manifesto-kicker">YOUR MATERIAL. YOUR QUESTIONS.</p>
              <h2>Open the <i>record.</i></h2>
            </div>
            <p className="archive-intro">Bring a PDF into the archive. Ask a question. Inspect the passages behind the answer.</p>
          </div>

          <div className="archive-grid">
            <aside className="archive-rail">
              <div className="rail-top"><span>DOCUMENT INDEX</span><span>{String(documents.length).padStart(2, "0")}</span></div>
              <Magnetic className="archive-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                {uploading ? "PROCESSING FILE..." : "INGEST NEW PDF"}
              </Magnetic>
              {documents.length === 0 ? (
                <div className="archive-empty">
                  <FileText size={26} />
                  <span>THE SHELF IS EMPTY.</span>
                  <p>Your first document will appear here after indexing.</p>
                </div>
              ) : (
                <div className="archive-doc-list">
                  {documents.map((doc, i) => (
                    <div key={doc.document_id} className={`archive-doc ${activeId === doc.document_id ? "archive-doc-active" : ""}`} data-cursor="INSPECT">
                      <button className="archive-doc-main" onClick={() => chooseDocument(doc.document_id)}>
                        <span className="archive-doc-number">{String(documents.length - i).padStart(2, "0")}</span>
                        <span className="archive-doc-info">
                          <strong>{doc.filename}</strong>
                          <small>{doc.chunks_indexed} PASSAGES INDEXED</small>
                        </span>
                        {activeId === doc.document_id ? <span className="active-dot" /> : <ChevronRight size={14} />}
                      </button>
                      <button className="archive-delete" title="Remove from this workspace" onClick={() => removeDocument(doc.document_id)} aria-label={`Remove ${doc.filename}`}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="rail-foot"><ShieldCheck size={15} /><span>LOCAL VECTOR INDEX · QDRANT</span></div>
            </aside>

            <div className="archive-main">
              {!activeDocument ? (
                <div className="archive-drop" data-cursor="DROP FILE">
                  <div className="drop-index">INGESTION TERMINAL / 001</div>
                  <div className="drop-symbol"><FileUp size={28} /></div>
                  <h3>Bring the evidence.</h3>
                  <p>Upload a text-based PDF to open an evidence-led conversation.</p>
                  <Magnetic className="button-acid" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Plus size={16} /> SELECT PDF <ArrowUpRight size={16} />
                  </Magnetic>
                  <div className="drop-meta"><span>PDF ONLY</span><span>MAX 10 MB</span><span>OCR NOT INCLUDED</span></div>
                </div>
              ) : (
                <div className="active-document-workspace">
                  <div className="active-document-top">
                    <div className="active-file-icon"><FileText size={22} /></div>
                    <div className="active-file-info">
                      <span className="manifesto-kicker">CURRENT EXHIBIT</span>
                      <h3>{activeDocument.filename}</h3>
                      <p><i /> INDEXED &amp; READY <span>·</span> {activeDocument.chunks_indexed} PASSAGES</p>
                    </div>
                    <span className="verified-stamp"><Check size={13} /> INDEXED</span>
                  </div>

                  <div className="conversation">
                    {messages.length === 0 ? (
                      <div className="conversation-empty">
                        <div className="conversation-symbol"><Search size={22} /></div>
                        <h4>Question the record.</h4>
                        <p>Try a prompt to begin tracing evidence.</p>
                        <div className="prompt-chips">
                          {["Summarize the main points", "What are the key findings?", "Find important dates"].map((prompt) => (
                            <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<ArrowUpRight size={13} /></button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((message, mi) => (
                        <article className={`chat-message chat-${message.role}`} key={`${mi}-${message.role}`}>
                          <div className="chat-message-label">
                            <span className={message.role === "assistant" ? "assistant-mark" : "user-mark"}>
                              {message.role === "assistant" ? <ScanLine size={14} /> : "YOU"}
                            </span>
                            <span>{message.role === "assistant" ? "DOCUTRACE / ANALYSIS" : "QUERY / INPUT"}</span>
                            <span className="chat-time">{String(mi + 1).padStart(2, "0")}</span>
                          </div>
                          <div className="chat-message-copy" ref={message.role === "assistant" ? answerRef : null}>
                            {message.content}
                          </div>

                          {message.role === "assistant" && message.sources?.length > 0 && (
                            <div className="evidence-block">
                              <div className="evidence-header">
                                <span><Fingerprint size={15} /> SUPPORTING EVIDENCE</span>
                                <span>{String(message.sources.length).padStart(2, "0")} RECORDS</span>
                              </div>
                              <div className="citation-threads">
                                {message.sources.map((source, si) => {
                                  const key = `${mi}-${si}`;
                                  return (
                                    <button
                                      className={`citation-chip ${activeSource === key ? "citation-active" : ""}`}
                                      key={key}
                                      onMouseEnter={() => traceSource(mi, si)}
                                      onMouseLeave={() => { setActiveSource(null); setThreadPath(""); }}
                                      onFocus={() => traceSource(mi, si)}
                                      onBlur={() => { setActiveSource(null); setThreadPath(""); }}
                                      onClick={() => traceSource(mi, si)}
                                    >
                                      <span>{String(si + 1).padStart(2, "0")}</span>
                                      PAGE {source.page}
                                      <ArrowUpRight size={12} />
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="source-stack">
                                {message.sources.map((source, si) => {
                                  const key = `${mi}-${si}`;
                                  return (
                                    <article
                                      ref={(el) => { sourceRefs.current[key] = el; }}
                                      key={key}
                                      className={`source-paper ${activeSource === key ? "source-paper-active" : ""}`}
                                      data-cursor="TRACE"
                                      onMouseEnter={() => traceSource(mi, si)}
                                      onMouseLeave={() => { setActiveSource(null); setThreadPath(""); }}
                                    >
                                      <div className="source-paper-head">
                                        <span>EXHIBIT {String.fromCharCode(65 + si)}</span>
                                        <span>PAGE {String(source.page).padStart(3, "0")}</span>
                                      </div>
                                      <p>{source.text}</p>
                                      <div className="source-paper-foot">
                                        <span>CHUNK {String(source.chunk).padStart(3, "0")}</span>
                                        <span>MATCH {Math.round(source.score * 100)}%</span>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </article>
                      ))
                    )}

                    {asking && (
                      <div className="scan-loader" aria-live="polite">
                        <div className="scan-stack"><i /><i /><i /><span /></div>
                        <div>
                          <span className="scan-loader-title">TRACING EVIDENCE</span>
                          <p>Searching passages · preparing answer</p>
                        </div>
                        <LoaderCircle size={17} className="spin" />
                      </div>
                    )}
                  </div>

                  <form className="question-composer" onSubmit={askQuestion}>
                    <div className="composer-topline"><span>QUERY TERMINAL</span><span>SHIFT + ENTER FOR NEW LINE</span></div>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Ask a question. Demand a source."
                      rows={2}
                      disabled={asking}
                    />
                    <div className="composer-bottom">
                      <span><ShieldCheck size={14} /> ANSWER WITH EVIDENCE</span>
                      <button type="submit" className="send-query" disabled={!question.trim() || asking}>
                        {asking ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />}
                        SUBMIT QUERY
                      </button>
                    </div>
                  </form>
                  <p className="archive-disclaimer">AI OUTPUT IS NOT PROOF. THE SOURCE IS THE PROOF.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="closing reveal">
          <div className="closing-index"><span>THE DOCUTRACE STANDARD</span><span>DT / ENDNOTE</span></div>
          <div className="closing-content">
            <div className="closing-mark"><Fingerprint size={31} strokeWidth={1.2} /></div>
            <p className="manifesto-kicker">A SMALL RULE WITH A BIG CONSEQUENCE.</p>
            <h2>If it can't be <i>traced,</i><br />it can't be <span>trusted.</span></h2>
            <p className="closing-copy">Every answer should leave a trail. Every trail should lead back to evidence.</p>
            <a className="closing-link" href="#top">RETURN TO THE RECORD <ArrowUpRight size={16} /></a>
          </div>
          <div className="closing-bottom"><span>DOCUTRACE © FIELD EDITION 001</span><span>MADE TO BE QUESTIONED.</span><span>11 / 16 / 2026</span></div>
        </section>
      </main>

      {error && (
        <div className="error-note" role="alert">
          <span className="error-symbol">!</span>
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button>
        </div>
      )}

      <footer className="mobile-footer">
        <span>DOCUTRACE / 001</span><span>EVERY CLAIM, TRACED.</span>
      </footer>
    </div>
  );
}
