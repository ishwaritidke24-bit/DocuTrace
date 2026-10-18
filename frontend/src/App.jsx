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
  Orbit,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  BookOpen,
} from 'lucide-react';
import './index.css';

gsap.registerPlugin(ScrollTrigger);

const API = {
  upload: '/api/upload',
  query: '/api/query',
};

const pipeline = [
  {
    n: '01',
    title: 'Ingest',
    label: 'SOURCE MATERIAL',
    body: 'Bring the original PDF into the workspace. The source stays at the centre of every answer.',
    icon: FileUp,
  },
  {
    n: '02',
    title: 'Index',
    label: 'PASSAGE MAPPING',
    body: 'Text is extracted and divided into focused chunks for semantic retrieval.',
    icon: Layers3,
  },
  {
    n: '03',
    title: 'Retrieve',
    label: 'RELEVANCE SEARCH',
    body: 'Your question is matched against the indexed content, not the open web.',
    icon: Search,
  },
  {
    n: '04',
    title: 'Verify',
    label: 'TRACE THE ANSWER',
    body: 'Read the response beside the passages that were returned as supporting evidence.',
    icon: ShieldCheck,
  },
];

const promptIdeas = [
  'What is the main purpose of this document?',
  'Summarise the key obligations.',
  'Which dates or deadlines are mentioned?',
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

function sourceChunk(source, index) {
  const raw =
    source?.chunk_id ??
    source?.chunk ??
    source?.metadata?.chunk_id ??
    source?.metadata?.chunk ??
    source?.id;

  return raw === undefined || raw === null || raw === ''
    ? index + 1
    : raw;
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
      aria-label="Stylised illustration of a document passage being traced to an answer"
      onPointerMove={moveEvidenceScene}
      onPointerLeave={resetEvidenceScene}
    >
      <div className="scene-topline">
        <span>FIG. 001 / EVIDENCE STUDY</span>
        <span>DOCUMENT → PASSAGE → ANSWER</span>
      </div>

      <div className="scene-coordinate coord-left">
        N 19° 59′ 12.4″
      </div>

      <div className="scene-coordinate coord-right">
        SOURCE / 001—A
      </div>

      <div className="scene-glow" />

      <div
        className="evidence-parallax evidence-parallax-left"
        aria-hidden="true"
      >
        <div className="paper-sheet paper-back paper-back-left">
          <div className="paper-mini-top">
            <span>CONFIDENTIAL REPORT</span>
            <span>04</span>
          </div>

          <div className="paper-photo" />

          <div className="paper-line w-92" />
          <div className="paper-line w-84" />
          <div className="paper-line w-88" />
          <div className="paper-line w-70" />
          <div className="paper-line w-90" />

          <div className="paper-subhead">SECTION 02</div>

          <div className="paper-line w-85" />
          <div className="paper-line w-78" />
          <div className="paper-line w-68" />

          <div className="paper-number">04 / 18</div>
        </div>
      </div>

      <div
        className="evidence-parallax evidence-parallax-right"
        aria-hidden="true"
      >
        <div className="paper-sheet paper-back paper-back-right">
          <div className="paper-mini-top">
            <span>AGREEMENT NOTES</span>
            <span>12</span>
          </div>

          <div className="paper-subhead">
            TERMS &amp; CONDITIONS
          </div>

          <div className="paper-line w-92" />
          <div className="paper-line w-82" />
          <div className="paper-line w-88" />
          <div className="paper-line w-73" />
          <div className="paper-line w-95" />

          <div className="paper-stamp-muted">REVIEW COPY</div>

          <div className="paper-line w-88" />
          <div className="paper-line w-76" />
          <div className="paper-line w-91" />

          <div className="paper-number">12 / 28</div>
        </div>
      </div>

      <div
        className="evidence-parallax evidence-parallax-main"
        aria-hidden="true"
      >
        <div className="paper-sheet paper-main">
          <div className="paper-header">
            <span>INTERNATIONAL TRADE AGREEMENT</span>
            <span>PAGE 12</span>
          </div>

          <div className="paper-rule" />

          <div className="paper-section-title">
            SECTION 4.2 <span>DURATION &amp; TERMINATION</span>
          </div>

          <div className="paper-copy">
            <p>
              The parties agree to the terms set forth in this
              document and the obligations described herein.
            </p>

            <p>
              <mark>
                The agreement shall enter into force on January 1,
                2024, and remain in effect for a period of five years.
              </mark>
            </p>

            <p>
              All amendments must be recorded in writing and approved
              by the authorised parties.
            </p>
          </div>

          <div className="paper-verified">
            <Check size={10} />
            PASSAGE IDENTIFIED
          </div>

          <div className="paper-footer">
            <span>ARCHIVE / CONTRACTS</span>
            <span>12—28</span>
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
        <span className="inspect-label">INSPECT PASSAGE</span>
      </div>

      <div className="evidence-stamp">
        <span className="stamp-top">SOURCE FOUND</span>
        <strong>EVIDENCE</strong>
        <span className="stamp-bottom">TRACE / CONFIRM / TRUST</span>
      </div>

      <div className="trace-card">
        <div>
          <span>PAGE</span>
          <strong>12</strong>
        </div>

        <div>
          <span>CHUNK</span>
          <strong>03</strong>
        </div>

        <div>
          <span>SCORE</span>
          <strong className="score-lime">0.82</strong>
        </div>
      </div>

      <div className="scene-bottomline">
        <span>
          <i /> PASSAGE LOCATED
        </span>
        <span>01 SOURCE / 03 RETRIEVED CHUNKS</span>
      </div>

      <div className="scene-cross cross-a">+</div>
      <div className="scene-cross cross-b">+</div>
    </div>
  );
}

function SourceCard({ source, index }) {
  const [expanded, setExpanded] = useState(index === 0);

  const text = sourceText(source);
  const page = sourcePage(source);
  const chunk = sourceChunk(source, index);
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
          <span className="source-title">Retrieved passage</span>

          <span className="source-meta">
            {page !== null && Number.isFinite(page)
              ? `PAGE ${page}`
              : 'PAGE NOT PROVIDED'}
            {' '}
            <i /> CHUNK {chunk}
          </span>
        </span>

        <span className="source-score">{score ?? '—'}</span>

        <ChevronDown size={14} className="source-chevron" />
      </button>

      {expanded && (
        <div className="source-passage">
          {text ||
            'The API returned a source without readable passage text. Check the source field names in the backend response.'}

          {(source?.metadata?.source || source?.source) && (
            <div className="source-file">
              SOURCE · {source?.metadata?.source ?? source?.source}
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

  const scrollToWorkspace = useCallback(() => {
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

    if (
      !file.name.toLowerCase().endsWith('.pdf') ||
      (file.type && file.type !== 'application/pdf')
    ) {
      setUploadState('error');
      setNotice('Choose a PDF file to continue.');
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
      setNotice(
        error.message ||
        'Could not upload this PDF. Check that FastAPI is running.'
      );
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
            <Orbit size={21} strokeWidth={1.4} />
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
            onClick={() => setMenuOpen(false)}
            className="nav-active"
          >
            Home
          </a>

          <a
            href="#approach"
            onClick={() => setMenuOpen(false)}
          >
            The idea
          </a>

          <a
            href="#pipeline"
            onClick={() => setMenuOpen(false)}
          >
            How it works
          </a>

          <a
            href="#workspace"
            onClick={() => setMenuOpen(false)}
          >
            Workspace
          </a>
        </nav>

        <div className="header-right">
          <span className="header-status">
            <i /> EVIDENCE-FIRST / 001
          </span>

          <button
            className="header-cta"
            onClick={scrollToWorkspace}
          >
            Try DocuTrace <ArrowUpRight size={14} />
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
              DOCUMENT INTELLIGENCE
              <br />
              BUILT FOR REAL ANSWERS.
            </span>
          </div>

          <h1 id="hero-title">
            <span className="hero-title-line">Every answer.</span>
            <span className="hero-title-line hero-italic">
              Traced<span className="hero-period">.</span>
            </span>
          </h1>

          <p className="hero-description">
            DocuTrace finds, verifies, and cites the exact
            information in your documents — so you can trust every
            answer.
          </p>

          <div className="hero-actions">
            <button
              className="button-primary"
              onClick={scrollToWorkspace}
            >
              Try it now <ArrowRight size={17} />
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
              REAL DOCUMENTS. REAL SOURCES. REAL ANSWERS.
            </span>
          </div>
        </div>

        <div className="hero-art-wrap">
          <EvidenceScene />
        </div>

        <div className="hero-scroll">
          <span className="scroll-symbol">↓</span>
          <span>SCROLL TO EXPLORE</span>
          <span className="hero-scroll-index">01 / 04</span>
        </div>
      </section>

      <div
        className="signal-strip"
        aria-label="DocuTrace workflow summary"
      >
        <div>
          <span className="signal-index">01</span>
          <span className="signal-name">SOURCE</span>
          <span className="signal-detail">
            Keep the origin visible
          </span>
        </div>

        <span className="signal-arrow">↗</span>

        <div>
          <span className="signal-index">02</span>
          <span className="signal-name">RETRIEVAL</span>
          <span className="signal-detail">
            Find relevant passages
          </span>
        </div>

        <span className="signal-arrow">↗</span>

        <div>
          <span className="signal-index">03</span>
          <span className="signal-name">EVIDENCE</span>
          <span className="signal-detail">
            Inspect what supports it
          </span>
        </div>
      </div>

      <section
        className="manifesto section-frame"
        id="approach"
      >
        <div className="section-kicker" data-reveal>
          <span>01 / THE PRINCIPLE</span>
          <span>NO ANSWER WITHOUT ORIGIN</span>
        </div>

        <div className="manifesto-main" data-reveal>
          <h2>
            See the <em>evidence.</em>
            <br />
            Not just the answer.
          </h2>

          <div className="manifesto-copy">
            <p>AI can sound certain. A source can be checked.</p>

            <p className="muted-copy">
              DocuTrace pairs document questions with retrieved
              passages, so an answer becomes something you can inspect
              — not something you have to take on faith.
            </p>

            <a className="arrow-link" href="#workspace">
              Inspect a document <ArrowRight size={16} />
            </a>
          </div>
        </div>

        <div className="manifesto-ruler" aria-hidden="true">
          <span>FIG. 01</span>
          <span className="ruler-line" />
          <span>DOCUMENT → CONTEXT → TRACEABLE ANSWER</span>
          <span>BUILT TO SHOW ITS WORK</span>
        </div>
      </section>

      <section
        className="pipeline-section section-frame"
        id="pipeline"
      >
        <div className="section-kicker" data-reveal>
          <span>02 / THE METHOD</span>
          <span>FOUR STEPS. VISIBLE LOGIC.</span>
        </div>

        <div className="pipeline-heading" data-reveal>
          <h2>
            From document
            <br />
            to <em>trusted answer.</em>
          </h2>

          <p>
            A transparent route from a source PDF to a response
            grounded in retrieved text. Each stage has a job. None
            should be a mystery.
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

                <span className="pipeline-label">
                  {step.label}
                </span>

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

        <div className="pipeline-caption">
          <span>FIG. 02 / PROCESS MAP</span>
          <span>
            CONCEPTUAL PIPELINE · LIVE ANSWERS COME FROM YOUR
            CONNECTED BACKEND
          </span>
          <ArrowUpRight size={15} />
        </div>
      </section>

      <section
        className="workspace-section section-frame"
        id="workspace"
        ref={workspaceRef}
      >
        <div className="section-kicker" data-reveal>
          <span>03 / THE EVIDENCE DESK</span>
          <span>LIVE WORKSPACE / 001</span>
        </div>

        <div className="workspace-heading" data-reveal>
          <div>
            <h2>
              Put the document
              <br />
              <em>on the record.</em>
            </h2>
          </div>

          <p>
            Upload a PDF. Ask a precise question. Inspect the answer
            alongside the source passages returned by your DocuTrace
            API.
          </p>
        </div>

        <div className="workbench">
          <div className="workbench-topbar">
            <div className="workbench-brand">
              <span className="mini-brand">
                <Orbit size={15} />
              </span>

              <span>DOCUTRACE</span>
              <i />
              EVIDENCE DESK
            </div>

            <div className="workbench-status">
              <span
                className={`status-point ${
                  uploadState === 'success' ? 'status-live' : ''
                }`}
              />

              {uploadState === 'success'
                ? 'SOURCE INDEXED'
                : uploadState === 'uploading'
                  ? 'INDEXING SOURCE'
                  : 'AWAITING SOURCE'}
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
                <span>THE SOURCE</span>
                <span>01</span>
              </div>

              {uploadState === 'success' ? (
                <div className="file-mini-card">
                  <div className="file-mini-preview">
                    <div className="file-mini-fold" />
                    <FileText size={30} strokeWidth={1.1} />
                    <span>PDF / SOURCE</span>
                    <i />
                  </div>

                  <span className="file-mini-type">
                    INDEXED DOCUMENT
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
                    Replace source <ArrowUpRight size={12} />
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
                      ? 'Reading your PDF…'
                      : 'Drop a PDF here'}
                  </span>

                  <span className="upload-copy">
                    {uploadState === 'uploading'
                      ? 'Extracting text and indexing passages'
                      : 'or browse files from your computer'}
                  </span>

                  <span className="upload-limit">
                    PDF ONLY <i /> MAX 10 MB
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
                    <span>INDEX STATUS</span>
                    <strong>
                      <i /> READY
                    </strong>
                  </div>

                  <div>
                    <span>CHUNKS INDEXED</span>
                    <strong>{chunksIndexed ?? '—'}</strong>
                  </div>

                  <div>
                    <span>DOCUMENT ID</span>
                    <strong className="id-value">
                      {documentId.slice(0, 12)}
                      {documentId.length > 12 ? '…' : ''}
                    </strong>
                  </div>
                </div>
              )}

              <div className="rail-bottom-note">
                <Fingerprint size={17} />

                <span>
                  Every answer begins
                  <br />
                  with a source.
                </span>
              </div>
            </aside>

            <section
              className="query-panel"
              aria-label="Ask questions about your PDF"
            >
              <div className="query-panel-head">
                <div>
                  <span className="panel-kicker">
                    THE QUESTION / 02
                  </span>

                  <h3>Ask the source.</h3>
                </div>

                <span className="console-tag">
                  <BookOpen size={13} /> PDF Q&amp;A
                </span>
              </div>

              {!documentId && messages.length === 0 && (
                <div className="empty-console">
                  <div className="empty-orbit">
                    <Orbit size={38} strokeWidth={0.8} />
                    <span />
                  </div>

                  <span className="empty-console-index">
                    AWAITING INPUT / 001
                  </span>

                  <h4>The record is empty.</h4>

                  <p>
                    Upload a PDF to create a searchable source. Your
                    first question starts the trace.
                  </p>

                  <div className="empty-checklist">
                    <span>
                      <Check size={12} /> Text extraction
                    </span>
                    <span>
                      <Check size={12} /> Passage retrieval
                    </span>
                    <span>
                      <Check size={12} /> Source context
                    </span>
                  </div>
                </div>
              )}

              {documentId && messages.length === 0 && (
                <div className="question-starters">
                  <span className="starter-label">
                    START WITH A QUESTION <i /> SELECT TO USE
                  </span>

                  {promptIdeas.map((idea, index) => (
                    <button
                      key={idea}
                      type="button"
                      className="starter-prompt"
                      onClick={() => {
                        setQuestion(idea);
                        questionInputRef.current?.focus();
                      }}
                    >
                      <span>
                        0{index + 1}
                      </span>

                      {idea}

                      <ArrowUpRight size={14} />
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
                            ? 'YOUR QUESTION'
                            : message.role === 'error'
                              ? 'REQUEST ERROR'
                              : 'DOCUTRACE / ANSWER'}
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
                              <span>SUPPORTING PASSAGES</span>

                              <span>
                                {String(
                                  message.sources.length
                                ).padStart(2, '0')}{' '}
                                FOUND
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
                            The API did not return source passages
                            for this answer.
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
                        RETRIEVING RELEVANT EVIDENCE
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
                  <span>ASK A QUESTION</span>
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
                        ? 'Ask something the document can answer…'
                        : 'Upload a document to begin…'
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
                    <Sparkles size={12} />
                    ANSWERS FROM YOUR CONNECTED API
                  </span>

                  <span>ENTER ↵ TO SEND</span>
                </div>
              </form>
            </section>
          </div>

          <div className="workbench-footer">
            <span>DOCUTRACE / EVIDENCE DESK</span>

            <span>
              <i />{' '}
              {documentId
                ? 'SOURCE TRACE ACTIVE'
                : 'READY FOR SOURCE INPUT'}
            </span>

            <span>LOCAL UI / 001</span>
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
          <span>NOTE / 03</span>
          <span>
            NO PLACEHOLDER ANSWERS. OUTPUTS SHOWN HERE COME FROM
            THE RUNNING API.
          </span>
        </div>
      </section>

      <section
        className="closing-section section-frame"
        data-reveal
      >
        <div className="closing-copy">
          <div className="section-kicker">
            <span>04 / THE STANDARD</span>
            <span>SHOW YOUR WORK</span>
          </div>

          <h2>
            Trust is not a tone
            <br />
            of voice. It is a <em>trace.</em>
          </h2>

          <p>
            For contracts, research, policies, reports, and details
            that deserve a second look.
          </p>

          <button
            className="button-primary"
            type="button"
            onClick={scrollToWorkspace}
          >
            Start with a PDF <ArrowUpRight size={16} />
          </button>
        </div>

        <div className="closing-art" aria-hidden="true">
          <div className="closing-document">
            <div className="closing-document-head">
              SOURCE REGISTER <span>001</span>
            </div>

            <div className="closing-highlight" />

            <i />
            <i />
            <i />
            <i />
            <i />

            <div className="closing-check">
              <Check size={16} />
            </div>
          </div>

          <div className="closing-orbit orbit-1" />
          <div className="closing-orbit orbit-2" />
          <div className="closing-orbit orbit-3" />

          <div className="closing-stamp">
            EVIDENCE
            <br />
            <span>OVER ASSERTION</span>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="#top">
          <Orbit size={18} /> DOCUTRACE
        </a>

        <span>
          DOCUMENT INTELLIGENCE / EVIDENCE-FIRST BY DESIGN
        </span>

        <a href="#top">BACK TO TOP ↑</a>

        <span className="footer-version">
          BUILD 002 · © 2026
        </span>
      </footer>
    </main>
  );
}