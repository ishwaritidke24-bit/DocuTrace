import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Fingerprint,
  FileUp,
  Layers3,
  LoaderCircle,
  Menu,
  ScanLine,
  Search,
  ShieldCheck,
  X,
  BookOpen,
} from 'lucide-react';
import './index.css';

gsap.registerPlugin(ScrollTrigger);

function DocuTraceLogoIcon({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeDasharray="3 2" opacity="0.4" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'https://docutrace-api-z7xd.onrender.com'
).replace(/\/+$/, '');

const API = {
  upload: `${API_BASE_URL}/upload`,
  query: `${API_BASE_URL}/query`,
};

const pipeline = [
  {
    n: '01',
    title: 'Drop the PDF',
    body: 'Feed in contracts, reports, or research up to 10 MB. We index every sentence locally.',
    icon: FileUp,
  },
  {
    n: '02',
    title: 'Ask in Plain English',
    body: 'Interrogate tricky clauses, hidden fees, dates, or penalties without reading 80 pages.',
    icon: Search,
  },
  {
    n: '03',
    title: 'Deterministic Retrieval',
    body: 'DocuTrace extracts the exact verbatim text passages that answer your specific inquiry.',
    icon: Layers3,
  },
  {
    n: '04',
    title: 'Inspect the Receipts',
    body: 'Every single claim links straight to the verbatim source paragraph and page number.',
    icon: ShieldCheck,
  },
];

const promptIdeas = [
  'What is the main topic and purpose of this document?',
  'Can you provide a concise summary of the key points?',
  'What are the most important findings or takeaways?',
  'What conclusions or recommendations are mentioned in this document?',
];

function prettyBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceText(source) {
  return (
    source?.text ??
    source?.content ??
    source?.page_content ??
    source?.chunk_text ??
    source?.passage ??
    source?.metadata?.text ??
    source?.metadata?.content ??
    ''
  );
}

function sourcePage(source) {
  const raw =
    source?.page ??
    source?.page_number ??
    source?.metadata?.page ??
    source?.metadata?.page_number;

  return raw === undefined || raw === null || raw === ''
    ? null
    : Number(raw);
}

function sourceScore(source) {
  const raw =
    source?.score ??
    source?.relevance_score ??
    source?.similarity ??
    source?.metadata?.score;

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }

  return raw > 1
    ? `${Math.round(raw)}%`
    : `${Math.round(raw * 100)}%`;
}

/*
 * Extract answer text from common API response formats.
 * Supports top-level and nested response fields.
 */
function extractAnswer(data) {
  const roots = [
    data,
    data?.data,
    data?.result,
    data?.response,
    data?.output,
    data?.answer,
  ];

  const answerKeys = [
    'answer',
    'response',
    'output',
    'text',
    'content',
    'generated_text',
    'completion',
    'message',
  ];

  const nestedAnswerKeys = [
    'answer',
    'text',
    'content',
    'response',
    'output',
    'generated_text',
    'completion',
  ];

  for (const root of roots) {
    if (typeof root === 'string' && root.trim()) {
      return root.trim();
    }

    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      continue;
    }

    for (const key of answerKeys) {
      const value = root[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        for (const nestedKey of nestedAnswerKeys) {
          const nestedValue = value[nestedKey];

          if (
            typeof nestedValue === 'string' &&
            nestedValue.trim()
          ) {
            return nestedValue.trim();
          }
        }
      }
    }
  }

  return '';
}

/*
 * Extract supporting passages from common API response formats.
 */
function extractSources(data) {
  const roots = [
    data,
    data?.data,
    data?.result,
    data?.response,
    data?.answer,
  ];

  const sourceKeys = [
    'sources',
    'results',
    'documents',
    'contexts',
    'retrieved_chunks',
    'retrieved_documents',
    'evidence',
    'source_documents',
  ];

  for (const root of roots) {
    if (!root || typeof root !== 'object') {
      continue;
    }

    for (const key of sourceKeys) {
      const value = root[key];

      if (Array.isArray(value)) {
        return value;
      }

      if (
        value &&
        typeof value === 'object' &&
        sourceText(value)
      ) {
        return [value];
      }
    }
  }

  return [];
}

const evidenceLayerOffsets = [
  { selector: '.evidence-parallax-main', x: -12, y: -8 },
  { selector: '.evidence-parallax-left', x: -22, y: -13 },
  { selector: '.evidence-parallax-right', x: -18, y: -11 },
];

function moveEvidenceScene(event) {
  if (
    event.pointerType === 'touch' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  const scene = event.currentTarget;
  const bounds = scene.getBoundingClientRect();

  if (!bounds.width || !bounds.height) return;

  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;

  for (const {
    selector,
    x: xOffset,
    y: yOffset,
  } of evidenceLayerOffsets) {
    const layer = scene.querySelector(selector);

    if (layer) {
      layer.style.transform =
        `translate3d(${x * xOffset}px, ${y * yOffset}px, 0)`;
    }
  }

  scene.style.setProperty('--inspect-x', `${x * 15}px`);
  scene.style.setProperty('--inspect-y', `${y * 11}px`);
}

function resetEvidenceScene(event) {
  const scene = event.currentTarget;

  for (const { selector } of evidenceLayerOffsets) {
    const layer = scene.querySelector(selector);

    if (layer) {
      layer.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }

  scene.style.setProperty('--inspect-x', '0px');
  scene.style.setProperty('--inspect-y', '0px');
}

function EvidenceScene() {
  return (
    <div
      className="evidence-scene"
      aria-label="Illustration of a document passage being traced directly to a verified answer"
      onPointerMove={moveEvidenceScene}
      onPointerLeave={resetEvidenceScene}
    >
      <div className="scene-topline">
        <span>LIVE AUDIT TRAIL</span>
        <span>VERBATIM CLAUSE → VERIFIED CITATION</span>
      </div>

      <div className="scene-glow" />

      <div
        className="evidence-parallax evidence-parallax-left"
        aria-hidden="true"
      >
        <div className="paper-sheet paper-back paper-back-left">
          <div className="paper-mini-top">
            <span>ANNUAL FILING</span>
            <span>SCHEDULE B</span>
          </div>

          <div className="paper-photo" />

          <div className="paper-line w-92" />
          <div className="paper-line w-84" />
          <div className="paper-line w-88" />
          <div className="paper-line w-70" />
          <div className="paper-line w-90" />

          <div className="paper-subhead">DISCLOSURE CLAUSES</div>

          <div className="paper-line w-85" />
          <div className="paper-line w-78" />
          <div className="paper-line w-68" />

          <div className="paper-number">PG. 04</div>
        </div>
      </div>

      <div
        className="evidence-parallax evidence-parallax-right"
        aria-hidden="true"
      >
        <div className="paper-sheet paper-back paper-back-right">
          <div className="paper-mini-top">
            <span>SCHEDULE NOTES</span>
            <span>EXHIBIT A</span>
          </div>

          <div className="paper-subhead">
            INDEMNITY TERMS
          </div>

          <div className="paper-line w-92" />
          <div className="paper-line w-82" />
          <div className="paper-line w-88" />
          <div className="paper-line w-73" />
          <div className="paper-line w-95" />

          <div className="paper-stamp-muted">CONFIDENTIAL</div>

          <div className="paper-line w-88" />
          <div className="paper-line w-76" />
          <div className="paper-line w-91" />

          <div className="paper-number">PG. 18</div>
        </div>
      </div>

      <div
        className="evidence-parallax evidence-parallax-main"
        aria-hidden="true"
      >
        <div className="paper-sheet paper-main">
          <div className="paper-header">
            <span>ENTERPRISE MASTER AGREEMENT</span>
            <span>PAGE 14</span>
          </div>

          <div className="paper-rule" />

          <div className="paper-section-title">
            SECTION 8.2 <span>LIMITATION OF LIABILITY</span>
          </div>

          <div className="paper-copy">
            <p>
              Except for willful misconduct, neither party shall be held liable
              for consequential or indirect damages.
            </p>

            <p>
              <mark>
                In no event shall aggregate liability exceed the total fees paid
                under this Agreement during the preceding twelve (12) months.
              </mark>
            </p>

            <p>
              All claims must be submitted in writing within thirty (30) days of discovery.
            </p>
          </div>

          <div className="paper-verified">
            <Check size={12} />
            VERIFIED PASSAGE · PAGE 14, PARA 2
          </div>

          <div className="paper-footer">
            <span>AUDIT ID: DT-2026-MSA</span>
            <span>MATCH SCORE 98%</span>
          </div>
        </div>
      </div>

      <svg
        className="evidence-thread"
        viewBox="0 0 680 470"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="thread-guide"
          d="M311 229 C390 214 396 279 461 268 S520 288 581 284"
        />

        <circle
          cx="311"
          cy="229"
          r="4.5"
          className="thread-origin"
        />

        <circle
          cx="581"
          cy="284"
          r="5"
          className="thread-end"
        />

        <circle
          cx="311"
          cy="229"
          r="4"
          className="thread-pulse"
        />
      </svg>

      <div className="scene-scanner" aria-hidden="true" />

      <div className="inspect-ring">
        <span className="inspect-cross">+</span>
        <span className="inspect-label">EXACT CITATION PIN</span>
      </div>

      <div className="evidence-stamp">
        <span className="stamp-top">VERIFIED FACT</span>
        <strong>100% CITED</strong>
        <span className="stamp-bottom">VERBATIM GROUNDING</span>
      </div>

      <div className="trace-card">
        <div>
          <span>PAGE</span>
          <strong>14</strong>
        </div>

        <div>
          <span>PARA</span>
          <strong>02</strong>
        </div>

        <div>
          <span>SCORE</span>
          <strong className="score-lime">98%</strong>
        </div>
      </div>

      <div className="scene-bottomline">
        <span>
          <i /> PASSAGE RETRIEVED &amp; VERIFIED
        </span>
        <span>GROUNDED IN PAGE 14 · PARAGRAPH 2</span>
      </div>
    </div>
  );
}

function SourceCard({ source, index }) {
  const [expanded, setExpanded] = useState(index === 0);

  const text = sourceText(source);
  const page = sourcePage(source);
  const score = sourceScore(source);

  return (
    <article
      className={`source-card ${expanded ? 'is-expanded' : ''}`}
    >
      <button
        className="source-card-head"
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="source-index">
          {String(index + 1).padStart(2, '0')}
        </span>

        <span className="source-title-wrap">
          <span className="source-title">
            Passage {index + 1}
          </span>

          <span className="source-meta">
            {page !== null && Number.isFinite(page)
              ? `Page ${page}`
              : 'Page unavailable'}
          </span>
        </span>

        {score && (
          <span className="source-score">Match {score}</span>
        )}

        <ChevronDown size={14} className="source-chevron" />
      </button>

      {expanded && (
        <div className="source-passage">
          {text ||
            'This passage could not be displayed. Try uploading the PDF again.'}

          {(source?.metadata?.source || source?.source) && (
            <div className="source-file">
              From {source?.metadata?.source ?? source?.source}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function App() {
  const rootRef = useRef(null);
  const fileInputRef = useRef(null);
  const questionInputRef = useRef(null);
  const workspaceRef = useRef(null);
  const messageEndRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState('idle');
  const [queryState, setQueryState] = useState('idle');

  const [documentId, setDocumentId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [documentSize, setDocumentSize] = useState(0);
  const [chunksIndexed, setChunksIndexed] = useState(null);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [notice, setNotice] = useState('');
  const [activeNav, setActiveNav] = useState('top');

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let lenis;
    let tick;

    if (!reduceMotion) {
      try {
        lenis = new Lenis({
          duration: 1.05,
          smoothWheel: true,
          wheelMultiplier: 0.92,
        });

        lenis.on('scroll', ScrollTrigger.update);

        tick = (time) => lenis.raf(time * 1000);

        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
      } catch (error) {
        console.warn(
          'Lenis could not initialise; native scrolling will be used.',
          error
        );
      }
    }

    const ctx = gsap.context(() => {
      if (!reduceMotion) {
        gsap.from('.hero-copy > *', {
          y: 28,
          opacity: 0,
          duration: 0.9,
          stagger: 0.11,
          ease: 'power3.out',
          delay: 0.1,
        });

        gsap.from('.evidence-scene', {
          y: 24,
          opacity: 0,
          scale: 0.98,
          duration: 1.1,
          ease: 'power3.out',
          delay: 0.3,
        });

        gsap.from('.paper-main', {
          y: 28,
          rotate: -3,
          duration: 1.4,
          ease: 'power3.out',
          delay: 0.4,
        });

        gsap.from('.paper-back-left', {
          x: 34,
          rotate: -9,
          duration: 1.3,
          ease: 'power3.out',
          delay: 0.45,
        });

        gsap.from('.paper-back-right', {
          x: -25,
          rotate: 10,
          duration: 1.35,
          ease: 'power3.out',
          delay: 0.5,
        });
      }

      gsap.utils.toArray('[data-reveal]').forEach((element) => {
        gsap.from(element, {
          y: reduceMotion ? 0 : 24,
          opacity: 0,
          duration: reduceMotion ? 0 : 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 86%',
            once: true,
          },
        });
      });

      if (!reduceMotion) {
        gsap.utils.toArray('.pipeline-card').forEach(
          (element, index) => {
            gsap.from(element, {
              y: 24,
              opacity: 0,
              duration: 0.7,
              delay: index * 0.08,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: '.pipeline-grid',
                start: 'top 84%',
                once: true,
              },
            });
          }
        );

        gsap.to('.paper-back-left', {
          y: -10,
          rotate: -8,
          duration: 5.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });

        gsap.to('.paper-back-right', {
          y: 12,
          rotate: 8,
          duration: 6.1,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });

        gsap.to('.paper-main', {
          y: -6,
          duration: 4.6,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });

        gsap.to('.evidence-thread .thread-guide', {
          strokeDashoffset: -90,
          duration: 5,
          ease: 'none',
          repeat: -1,
        });

        const tracePath = rootRef.current?.querySelector(
          '.thread-guide'
        );

        const tracePulse = rootRef.current?.querySelector(
          '.thread-pulse'
        );

        if (
          tracePath instanceof SVGPathElement &&
          tracePulse instanceof SVGCircleElement
        ) {
          const traceLength = tracePath.getTotalLength();
          const traceProgress = { distance: 0 };

          gsap.to(traceProgress, {
            distance: traceLength,
            duration: 3.8,
            ease: 'none',
            repeat: -1,
            onUpdate: () => {
              const point = tracePath.getPointAtLength(
                traceProgress.distance
              );

              tracePulse.setAttribute('cx', String(point.x));
              tracePulse.setAttribute('cy', String(point.y));
            },
          });
        }
      }
    }, rootRef);

    let pointerFrame = 0;

    const handlePointerMove = (event) => {
      if (window.matchMedia('(pointer: coarse)').matches) {
        return;
      }

      if (pointerFrame) {
        cancelAnimationFrame(pointerFrame);
      }

      pointerFrame = requestAnimationFrame(() => {
        rootRef.current?.style.setProperty(
          '--pointer-x',
          `${event.clientX}px`
        );

        rootRef.current?.style.setProperty(
          '--pointer-y',
          `${event.clientY}px`
        );
      });
    };

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });

    const handleScroll = () => {
      const bar = rootRef.current?.querySelector(
        '.scroll-progress span'
      );

      if (!bar) return;

      const max =
        document.documentElement.scrollHeight - window.innerHeight;

      bar.style.transform =
        `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    });

    handleScroll();

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', handleScroll);

      if (pointerFrame) {
        cancelAnimationFrame(pointerFrame);
      }

      if (tick) {
        gsap.ticker.remove(tick);
      }

      lenis?.destroy();
      ctx.revert();
    };
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, queryState]);

  useEffect(() => {
    const sections = ['top', 'approach', 'pipeline', 'workspace'];

    const handleScrollSpy = () => {
      // If at or near bottom of document, highlight workspace
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 80
      ) {
        setActiveNav('workspace');
        return;
      }

      let current = 'top';
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) {
            current = id;
          }
        }
      }
      setActiveNav(current);
    };

    window.addEventListener('scroll', handleScrollSpy, { passive: true });
    handleScrollSpy();

    return () => window.removeEventListener('scroll', handleScrollSpy);
  }, []);

  const handleNavClick = (id) => {
    setActiveNav(id);
    setMenuOpen(false);
  };

  const scrollToWorkspace = useCallback(() => {
    setActiveNav('workspace');
    workspaceRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    window.setTimeout(() => {
      if (documentId) {
        questionInputRef.current?.focus();
      } else {
        fileInputRef.current?.focus();
      }
    }, 500);

    setMenuOpen(false);
  }, [documentId]);

  /*
   * PDF upload and indexing.
   */
  const uploadFile = async (file) => {
    if (!file) return;

    setNotice('');

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadState('error');
      setNotice('Choose a valid .pdf file to continue.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadState('error');
      setNotice(
        'This file is larger than 10 MB. Choose a smaller PDF.'
      );
      return;
    }

    setUploadState('uploading');
    setDocumentId('');
    setDocumentName('');
    setDocumentSize(0);
    setChunksIndexed(null);
    setMessages([]);
    setQuestion('');
    setQueryState('idle');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(API.upload, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      // Correctly log the upload response here.
      console.log(
        '[DocuTrace] UPLOAD response:',
        JSON.stringify(data, null, 2)
      );

      if (!response.ok) {
        throw new Error(
          data.detail ||
          data.message ||
          `Upload failed (${response.status}).`
        );
      }

      const id =
        data.document_id ??
        data.documentId ??
        data.id;

      if (!id) {
        throw new Error(
          'The upload succeeded, but the API did not return a document_id.'
        );
      }

      setDocumentId(String(id));
      setDocumentName(file.name);
      setDocumentSize(file.size);

      setChunksIndexed(
        data.chunks_indexed ??
        data.chunks ??
        null
      );

      setUploadState('success');
      setQueryState('idle');
      setNotice('');

      window.setTimeout(() => {
        questionInputRef.current?.focus();
      }, 180);
    } catch (error) {
      console.error('[DocuTrace] Upload failed:', error);

      setUploadState('error');
      const msg = error?.message || '';
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('504') ||
        msg.includes('502')
      ) {
        setNotice(
          'Backend is currently unreachable or waking up from sleep. Please wait a moment and try again.'
        );
      } else {
        setNotice(
          msg || 'Could not upload this PDF. Please check the backend connection.'
        );
      }
    }
  };

  /*
   * Query the indexed PDF.
   */
  const askQuestion = async (event) => {
    event?.preventDefault();

    const cleanQuestion = question.trim();

    if (
      !cleanQuestion ||
      !documentId ||
      queryState === 'loading'
    ) {
      return;
    }

    const userMessage = {
      role: 'user',
      content: cleanQuestion,
      id: `${Date.now()}-user`,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setQueryState('loading');
    setNotice('');

    try {
      const response = await fetch(API.query, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: cleanQuestion,
          document_id: documentId,
        }),
      });

      const data = await response.json().catch(() => ({}));

      // This is the actual QUESTION response, not the upload response.
      console.log(
        '[DocuTrace] QUERY response:',
        JSON.stringify(data, null, 2)
      );

      if (!response.ok) {
        throw new Error(
          data.detail ||
          data.message ||
          `Query failed (${response.status}).`
        );
      }

      const answer = extractAnswer(data);
      const sources = extractSources(data);

      if (!answer) {
        console.error(
          '[DocuTrace] No answer text found in the QUERY response.',
          data
        );

        setMessages((current) => [
          ...current,
          {
            role: 'error',
            content:
              'The API responded, but no answer text was found. Check the browser console for the QUERY response.',
            id: `${Date.now()}-error`,
          },
        ]);

        setQueryState('error');
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: answer,
          sources,
          id: `${Date.now()}-assistant`,
        },
      ]);

      setQueryState('success');
    } catch (error) {
      console.error('[DocuTrace] Query failed:', error);

      setMessages((current) => [
        ...current,
        {
          role: 'error',
          content:
            error.message ||
            'The request failed. Check the API and try again.',
          id: `${Date.now()}-error`,
        },
      ]);

      setQueryState('error');
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);

      setNotice('Copied to clipboard.');

      window.setTimeout(() => {
        setNotice('');
      }, 1800);
    } catch {
      setNotice(
        'Clipboard access is unavailable in this browser.'
      );
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    uploadFile(event.dataTransfer.files?.[0]);
  };

  return (
    <main className="app-shell" ref={rootRef} id="top">
      <div className="scroll-progress" aria-hidden="true">
        <span />
      </div>

      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-light" aria-hidden="true" />

      <a className="skip-link" href="#approach">
        Skip to content
      </a>

      <header className="site-header">
        <a
          className="wordmark"
          href="#top"
          aria-label="DocuTrace home"
        >
          <span className="wordmark-symbol">
            <DocuTraceLogoIcon size={21} />
          </span>

          <span>
            Docu<span>Trace</span>
            <sup>®</sup>
          </span>
        </a>

        <nav
          className={`main-nav ${menuOpen ? 'nav-open' : ''}`}
          id="primary-navigation"
          aria-label="Main navigation"
        >
          <a
            href="#top"
            onClick={() => handleNavClick('top')}
            className={activeNav === 'top' ? 'nav-active' : ''}
          >
            Home
          </a>

          <a
            href="#approach"
            onClick={() => handleNavClick('approach')}
            className={activeNav === 'approach' ? 'nav-active' : ''}
          >
            The Reality
          </a>

          <a
            href="#pipeline"
            onClick={() => handleNavClick('pipeline')}
            className={activeNav === 'pipeline' ? 'nav-active' : ''}
          >
            How it works
          </a>

          <a
            href="#workspace"
            onClick={() => handleNavClick('workspace')}
            className={activeNav === 'workspace' ? 'nav-active' : ''}
          >
            Workbench
          </a>
        </nav>

        <div className="header-right">
          <button
            className="header-cta"
            onClick={scrollToWorkspace}
          >
            Audit a PDF <ArrowUpRight size={14} />
          </button>

          <button
            className="mobile-menu"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <section
        className="hero section-frame"
        aria-labelledby="hero-title"
      >
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="eyebrow-star">✳</span>
            <span>
              FOR ANYONE WHO CAN'T AFFORD TO BE WRONG
            </span>
          </div>

          <h1 id="hero-title">
            <span className="hero-title-line">Stop speed-reading 90 pages</span>
            <span className="hero-title-line hero-italic">
              like a panicked intern<span className="hero-period">.</span>
            </span>
          </h1>

          <p className="hero-description">
            Ask the brutal questions about liabilities, deadlines, and fine print.
            DocuTrace hands you the verdict and the exact paragraph that backs it up.
          </p>

          <div className="hero-actions">
            <button
              className="button-primary"
              onClick={scrollToWorkspace}
            >
              Cross-Examine Your PDF <ArrowRight size={17} />
            </button>

            <a className="text-link" href="#pipeline">
              <span className="play-icon">↘</span>
              See how it works
            </a>
          </div>

          <div className="hero-proof">
            <span className="proof-mark">
              <Fingerprint size={14} />
            </span>

            <span>
              FORENSIC AUDIT TRAIL · VERBATIM PAGE CITATIONS
            </span>
          </div>
        </div>

        <div className="hero-art-wrap">
          <EvidenceScene />
        </div>

        <div className="hero-scroll">
          <span className="scroll-symbol">↓</span>
          <span>Explore how proof works</span>
        </div>
      </section>

      <div
        className="signal-strip"
        aria-label="DocuTrace core pillars"
      >
        <div>
          <span className="signal-index">01</span>
          <span className="signal-name">Zero Bluffing</span>
          <span className="signal-detail">
            Answers strictly pulled from your text
          </span>
        </div>

        <span className="signal-arrow">↗</span>

        <div>
          <span className="signal-index">02</span>
          <span className="signal-name">Verbatim Receipts</span>
          <span className="signal-detail">
            Every claim cited to the exact page &amp; paragraph
          </span>
        </div>

        <span className="signal-arrow">↗</span>

        <div>
          <span className="signal-index">03</span>
          <span className="signal-name">Session-Private</span>
          <span className="signal-detail">
            Documents remain strictly in your local session
          </span>
        </div>
      </div>

      <section
        className="manifesto section-frame"
        id="approach"
      >
        <div className="section-kicker" data-reveal>
          <span>The Reality Check</span>
          <span>Zero Fiction · Strict Asserts</span>
        </div>

        <div className="manifesto-main" data-reveal>
          <div>
            <h2>
              AI will invent an answer
              <br />
              rather than say <em>"I don't know."</em>
            </h2>

            <div className="manifesto-copy">
              <p>
                Standard AI models hate admitting when they don't have the answer.
                They will confidently make up facts, dates, and terms that sound real
                but don't actually exist in your document.
              </p>

              <p className="muted-copy">
                DocuTrace never guesses. If it's not written directly on the page,
                DocuTrace won't say it. Every single answer is linked to the exact
                page and paragraph so you can verify it yourself.
              </p>

              <a className="arrow-link" href="#workspace">
                Try it with your document <ArrowRight size={16} />
              </a>
            </div>
          </div>

          <div className="manifesto-contrast-grid">
            <div className="contrast-card contrast-card-bad">
              <div className="contrast-badge">OTHER AI: SOUNDS CONFIDENT</div>
              <h4>"Pure Guesswork"</h4>
              <p>
                Gives you a convincing, polished answer that seems right—until you search
                your PDF and realize it was completely made up.
              </p>
            </div>

            <div className="contrast-card contrast-card-good">
              <div className="contrast-badge">DOCUTRACE: 100% PROVEN</div>
              <h4>"Verifiable Receipts"</h4>
              <p>
                Shows the exact word-for-word quote from your document, along with the
                page number and match score so you have instant proof.
              </p>
            </div>
          </div>
        </div>

      </section>

      <section
        className="pipeline-section section-frame"
        id="pipeline"
      >
        <div className="section-kicker" data-reveal>
          <span>The Workflow</span>
          <span>From raw PDF to pinpoint truth</span>
        </div>

        <div className="pipeline-heading" data-reveal>
          <h2>
            From 80-page monster
            <br />
            to <em>instant clarity.</em>
          </h2>

          <p>
            Upload your file. Ask in plain English. Follow every claim directly to the source.
          </p>
        </div>

        <div className="pipeline-grid">
          {pipeline.map((step, index) => {
            const Icon = step.icon;

            return (
              <article className="pipeline-card" key={step.n}>
                <div className="pipeline-top">
                  <span>
                    {step.n} <i /> 04
                  </span>

                  <Icon size={18} strokeWidth={1.3} />
                </div>

                <div className="pipeline-icon">
                  <Icon size={25} strokeWidth={1.25} />
                </div>

                <h3>
                  {step.title}
                  <span>.</span>
                </h3>

                <p>{step.body}</p>

                {index < pipeline.length - 1 && (
                  <span
                    className="pipeline-connect"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                )}

                <div className="pipeline-baseline">
                  <span />
                </div>
              </article>
            );
          })}
        </div>

      </section>

      <section
        className="workspace-section section-frame"
        id="workspace"
        ref={workspaceRef}
      >
        <div className="section-kicker" data-reveal>
          <span>Interactive Audit</span>
          <span>Put your PDF on the witness stand</span>
        </div>

        <div className="workspace-heading" data-reveal>
          <div>
            <h2>
              Cross-examine
              <br />
              <em>your document.</em>
            </h2>
          </div>

          <p>
            Drop your contract, filing, or research below. Ask what you need,
            and see the exact paragraphs behind the answer.
          </p>
        </div>

        <div className="workbench">
          <div className="workbench-topbar">
            <div className="workbench-brand">
              <span className="mini-brand">
                <DocuTraceLogoIcon size={15} />
              </span>

              <span>DOCUTRACE</span>
              <i />
              Document Workbench
            </div>

            <div className="workbench-status">
              <span
                className={`status-point ${
                  uploadState === 'success' ? 'status-live' : ''
                }`}
              />

              {uploadState === 'success'
                ? 'PDF READY TO AUDIT'
                : uploadState === 'uploading'
                  ? 'INDEXING PAGES…'
                  : 'WAITING FOR PDF'}
            </div>

            <div className="workbench-window">
              <i />
              <i />
              <i />
            </div>
          </div>

          <div className="workbench-grid">
            <aside className="document-rail">
              <div className="rail-label">
                <span>Active File</span>
              </div>

              {uploadState === 'success' ? (
                <div className="file-mini-card">
                  <div className="file-mini-preview">
                    <div className="file-mini-fold" />
                    <FileText size={30} strokeWidth={1.1} />
                    <span>Your PDF</span>
                    <i />
                  </div>

                  <span className="file-mini-type">
                    READY TO QUERY
                  </span>

                  <span
                    className="file-mini-name"
                    title={documentName}
                  >
                    {documentName}
                  </span>

                  <span className="file-mini-size">
                    {prettyBytes(documentSize)}
                  </span>

                  <span className="indexed-tag">
                    <Check size={11} /> INDEXED
                  </span>

                  <button
                    className="replace-file"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace document <ArrowUpRight size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`upload-zone ${
                    isDragging ? 'is-dragging' : ''
                  } ${
                    uploadState === 'uploading'
                      ? 'is-uploading'
                      : ''
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  disabled={uploadState === 'uploading'}
                >
                  <span className="upload-graphic">
                    {uploadState === 'uploading' ? (
                      <LoaderCircle className="spin" size={29} />
                    ) : (
                      <FileUp size={27} strokeWidth={1.25} />
                    )}
                  </span>

                  <span className="upload-title">
                    {uploadState === 'uploading'
                      ? 'Indexing your PDF…'
                      : 'Drop your PDF here'}
                  </span>

                  <span className="upload-copy">
                    {uploadState === 'uploading'
                      ? 'Mapping sentences and page numbers.'
                      : 'Contracts, compliance filings, or reports.'}
                  </span>

                  <span className="upload-limit">
                    PDF · UP TO 10 MB
                  </span>
                </button>
              )}

              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  uploadFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />

              {uploadState === 'success' && (
                <div className="source-status-list">
                  <div>
                    <span>Status</span>
                    <strong>
                      <i /> Indexed
                    </strong>
                  </div>

                  <div>
                    <span>Chunks mapped</span>
                    <strong>{chunksIndexed ?? '—'}</strong>
                  </div>
                </div>
              )}

              <div className="rail-bottom-note">
                <Fingerprint size={17} />

                <span>
                  If it's not in the PDF,
                  <br />
                  DocuTrace won't invent it.
                </span>
              </div>
            </aside>

            <section
              className="query-panel"
              aria-label="Ask questions about your PDF"
            >
              <div className="query-panel-head">
                <div>
                  <span className="panel-kicker">Live Inquiry</span>

                  <h3>Ask your document.</h3>
                </div>

                <span className="console-tag">
                  <BookOpen size={13} /> Audited Q&amp;A
                </span>
              </div>

              {!documentId && messages.length === 0 && (
                <div className="empty-console">
                  <div className="forensic-radar" aria-hidden="true">
                    <div className="radar-grid" />
                    <div className="radar-crosshair-h" />
                    <div className="radar-crosshair-v" />
                    <div className="radar-corner top-left" />
                    <div className="radar-corner top-right" />
                    <div className="radar-corner bottom-left" />
                    <div className="radar-corner bottom-right" />
                    <div className="radar-sweep" />
                    <div className="radar-center-mark">
                      <ScanLine size={22} />
                    </div>
                    <span className="radar-tag top-l">SYS // READY</span>
                    <span className="radar-tag bottom-r">STAGE: CALIBRATED</span>
                  </div>

                  <span className="empty-console-index">
                    DOCUMENT INSPECTION BENCH
                  </span>

                  <h4>Awaiting document upload.</h4>

                  <p>
                    Select or drop any PDF on the rail to initialize deterministic chunk indexing
                    and verbatim citation tracing.
                  </p>
                </div>
              )}

              {documentId && messages.length === 0 && (
                <div className="question-starters">
                  <span className="starter-label">
                    Recommended questions:
                  </span>

                  {promptIdeas.map((idea, idx) => (
                    <button
                      key={idea}
                      type="button"
                      className="starter-prompt"
                      onClick={() => {
                        setQuestion(idea);
                        questionInputRef.current?.focus();
                      }}
                    >
                      <span className="starter-index">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="starter-prompt-text">{idea}</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              )}

              {messages.length > 0 && (
                <div
                  className="conversation"
                  aria-live="polite"
                  data-lenis-prevent
                >
                  {messages.map((message) => (
                    <article
                      className={`message message-${message.role}`}
                      key={message.id}
                    >
                      <div className="message-label">
                        <span>
                          {message.role === 'user'
                            ? 'You asked'
                            : message.role === 'error'
                              ? 'Couldn’t answer'
                              : 'Verified Answer'}
                        </span>

                        {message.role === 'assistant' && (
                          <button
                            type="button"
                            className="copy-answer"
                            onClick={() => copyText(message.content)}
                            title="Copy answer"
                            aria-label="Copy answer"
                          >
                            <Copy size={13} />
                          </button>
                        )}
                      </div>

                      <p className="message-content">
                        {message.content}
                      </p>

                      {message.role === 'assistant' &&
                        message.sources?.length > 0 && (
                          <div className="sources-wrap">
                            <div className="sources-heading">
                              <span>Exact Passages from your PDF</span>

                              <span>
                                {message.sources.length}{' '}
                                {message.sources.length === 1
                                  ? 'CITED PASSAGE'
                                  : 'CITED PASSAGES'}
                              </span>
                            </div>

                            {message.sources.map(
                              (source, index) => (
                                <SourceCard
                                  key={`${message.id}-source-${index}`}
                                  source={source}
                                  index={index}
                                />
                              )
                            )}
                          </div>
                        )}

                      {message.role === 'assistant' &&
                        message.sources?.length === 0 && (
                          <div className="no-sources-note">
                            <ScanLine size={14} />
                            No supporting passages came back with
                            this answer.
                          </div>
                        )}
                    </article>
                  ))}

                  {queryState === 'loading' && (
                    <div className="thinking-state">
                      <span className="thinking-dots">
                        <i />
                        <i />
                        <i />
                      </span>

                      <span>
                        Scanning paragraphs for exact proof…
                      </span>
                    </div>
                  )}

                  <div ref={messageEndRef} />
                </div>
              )}

              <form
                className="question-form"
                onSubmit={askQuestion}
              >
                <label
                  htmlFor="document-question"
                  className="question-label"
                >
                  <span>Your question</span>
                  <span>{question.length}/1000</span>
                </label>

                <div className="question-field">
                  <input
                    ref={questionInputRef}
                    id="document-question"
                    value={question}
                    maxLength={1000}
                    onChange={(event) =>
                      setQuestion(event.target.value)
                    }
                    placeholder={
                      documentId
                        ? 'Ask anything about this document... (e.g. "What happens if we terminate early?")'
                        : 'Drop a PDF on the left to start…'
                    }
                    disabled={
                      !documentId || queryState === 'loading'
                    }
                    autoComplete="off"
                  />

                  <button
                    type="submit"
                    aria-label="Send question"
                    disabled={
                      !documentId ||
                      !question.trim() ||
                      queryState === 'loading'
                    }
                  >
                    {queryState === 'loading' ? (
                      <LoaderCircle
                        className="spin"
                        size={18}
                      />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </button>
                </div>

                <div className="question-foot">
                  <span>
                    <ShieldCheck size={13} />
                    Deterministic citation engine · Exact character grounding
                  </span>
                </div>
              </form>
            </section>
          </div>

          <div className="workbench-footer">
            <span>DOCUTRACE</span>
            <span>
              <i />{' '}
              {documentId
                ? 'PDF READY TO AUDIT'
                : 'WAITING FOR PDF'}
            </span>
          </div>
        </div>

        {notice && (
          <div
            className={`notice ${
              uploadState === 'error' || queryState === 'error'
                ? 'notice-error'
                : ''
            }`}
            role="status"
          >
            {notice}

            <button
              type="button"
              onClick={() => setNotice('')}
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="workspace-footnote">
          <span>
            Verbatim answers extracted directly from your document pages.
          </span>
        </div>
      </section>

      <section
        className="closing-section section-frame"
        data-reveal
      >
        <div className="closing-copy">
          <div className="section-kicker">
            <span>The Bottom Line</span>
            <span>Stop Skimming Fine Print</span>
          </div>

          <h2>
            Stop reading 80-page PDFs
            <br />
            like it’s <em>1999.</em>
          </h2>

          <p>
            Contracts, compliance filings, research reports: get straight to the clause
            that matters—verified in seconds.
          </p>

          <button
            className="button-primary"
            type="button"
            onClick={scrollToWorkspace}
          >
            Audit Your PDF Now <ArrowUpRight size={16} />
          </button>
        </div>

        <div className="closing-art" aria-hidden="true">
          <div className="closing-image-frame">
            <img
              src="/audit_document_inspector.jpg"
              alt="Laser-precise document inspection and verbatim clause tracing"
              className="closing-image"
              loading="lazy"
            />
            <div className="closing-image-overlay">
              <div className="image-badge-top">
                <span className="live-dot" />
              </div>
              <div className="image-badge-bottom">
                <span>VERBATIM ANCHOR CONFIRMED · 100% CITED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-top">
            <div className="footer-brand-wrap">
              <a className="footer-brand" href="#top" onClick={() => handleNavClick('top')}>
                <DocuTraceLogoIcon size={20} /> DOCUTRACE
              </a>
              <p className="footer-tagline">
                Deterministic passage verification and page-level receipts for high-stakes documents.
              </p>
            </div>

            <nav className="footer-nav" aria-label="Footer Navigation">
              <a href="#top" onClick={() => handleNavClick('top')}>Home</a>
              <a href="#approach" onClick={() => handleNavClick('approach')}>The Reality</a>
              <a href="#pipeline" onClick={() => handleNavClick('pipeline')}>How it works</a>
              <a href="#workspace" onClick={() => handleNavClick('workspace')}>Workbench</a>
            </nav>

            <a className="back-to-top" href="#top" onClick={() => handleNavClick('top')}>
              Back to top ↑
            </a>
          </div>

          <div className="footer-bottom">
            <span className="footer-dev">
              Developed by <strong>Ishwari Tidke</strong> @2026
            </span>

            <span className="footer-rights">
              © 2026 DocuTrace · All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}