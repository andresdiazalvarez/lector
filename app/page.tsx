"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

const SPEEDS = [1, 1.25, 1.75, 2];
const SAMPLE = `Bienvenido a Ector. Esta aplicación convierte tus documentos en una experiencia de escucha sencilla y privada.\n\nCarga un archivo o pega tu propio texto. Después podrás iniciar la lectura, cambiar la velocidad y saltar hacia delante o hacia atrás sin perderte.`;

function cleanText(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitIntoChunks(text: string) {
  const pieces = text.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g) ?? [text];
  const chunks: { text: string; start: number }[] = [];
  let cursor = 0;
  let current = "";
  let start = 0;

  for (const piece of pieces) {
    const found = text.indexOf(piece, cursor);
    const pieceStart = found >= 0 ? found : cursor;
    cursor = pieceStart + piece.length;
    if (current && current.length + piece.length > 260) {
      chunks.push({ text: current, start });
      current = piece;
      start = pieceStart;
    } else {
      if (!current) start = pieceStart;
      current += piece;
    }
  }
  if (current) chunks.push({ text: current, start });
  return chunks;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, Math.floor(seconds % 60));
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function extractFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n\n");
  }
  const raw = await file.text();
  if (extension === "html" || extension === "htm") {
    return new DOMParser().parseFromString(raw, "text/html").body.textContent ?? "";
  }
  if (extension === "rtf") {
    return raw.replace(/\\par[d]?/g, "\n").replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+\d* ?/gi, "").replace(/[{}]/g, "");
  }
  return raw;
}

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [fileName, setFileName] = useState("Texto de bienvenida");
  const [speed, setSpeed] = useState(1);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const positionRef = useRef(0);
  const speedRef = useRef(1);

  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);
  const totalSeconds = Math.max(1, words / (2.55 * speed));
  const elapsedSeconds = totalSeconds * (position / Math.max(1, text.length));
  const progress = (position / Math.max(1, text.length)) * 100;

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    const update = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      if (!voiceName && available.length) {
        const spanish = available.find((voice) => voice.lang.toLowerCase().startsWith("es"));
        setVoiceName((spanish ?? available[0]).name);
      }
    };
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.removeEventListener("voiceschanged", update);
    };
  }, [voiceName]);

  const stop = (reset = false) => {
    runId.current += 1;
    window.speechSynthesis.cancel();
    setPlaying(false);
    if (reset) setPosition(0);
  };

  const speakFrom = (startAt: number) => {
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const id = ++runId.current;
    const safeStart = Math.max(0, Math.min(startAt, text.length - 1));
    setPosition(safeStart);
    setPlaying(true);
    const chunks = splitIntoChunks(text.slice(safeStart));
    let index = 0;

    const next = () => {
      if (id !== runId.current || index >= chunks.length) {
        if (id === runId.current) {
          setPlaying(false);
          setPosition(text.length);
        }
        return;
      }
      const chunk = chunks[index];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.rate = speedRef.current;
      utterance.lang = "es-ES";
      utterance.voice = voices.find((voice) => voice.name === voiceName) ?? null;
      utterance.onboundary = (event) => {
        if (id === runId.current) setPosition(safeStart + chunk.start + event.charIndex);
      };
      utterance.onend = () => {
        index += 1;
        next();
      };
      utterance.onerror = (event) => {
        if (event.error !== "canceled" && event.error !== "interrupted") setError("No se ha podido reproducir la voz seleccionada.");
      };
      window.speechSynthesis.speak(utterance);
    };
    next();
  };

  const togglePlayback = () => playing ? stop() : speakFrom(position >= text.length ? 0 : position);

  const seekSeconds = (seconds: number) => {
    const charsPerSecond = text.length / totalSeconds;
    const nextPosition = Math.max(0, Math.min(text.length - 1, positionRef.current + seconds * charsPerSecond));
    const wasPlaying = playing;
    stop();
    setPosition(nextPosition);
    if (wasPlaying) window.setTimeout(() => speakFrom(nextPosition), 60);
  };

  const skipSection = (direction: -1 | 1) => {
    const breaks = [0, ...Array.from(text.matchAll(/\n\s*\n/g), (match) => (match.index ?? 0) + match[0].length), text.length];
    const target = direction > 0
      ? breaks.find((point) => point > position + 2) ?? text.length
      : [...breaks].reverse().find((point) => point < position - 2) ?? 0;
    const wasPlaying = playing;
    stop();
    setPosition(target);
    if (wasPlaying) window.setTimeout(() => speakFrom(target), 60);
  };

  const changeSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    speedRef.current = nextSpeed;
    if (playing) {
      const current = positionRef.current;
      stop();
      window.setTimeout(() => speakFrom(current), 60);
    }
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    stop(true);
    try {
      const extracted = cleanText(await extractFile(file));
      if (!extracted) throw new Error("empty");
      setText(extracted);
      setFileName(file.name);
      setPosition(0);
    } catch {
      setError("No he podido extraer texto de este archivo. Prueba con PDF, DOCX, TXT, RTF, HTML, Markdown, CSV o JSON.");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files[0]);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Ector, inicio">
          <span className="brandMark">E</span>
          <span>Ector</span>
        </a>
        <div className="privacy"><span /> Tus documentos se procesan en este dispositivo</div>
      </header>

      <section className="hero" id="top">
        <span className="eyebrow">TU LECTOR PERSONAL</span>
        <h1>Escucha tus documentos.<br/><em>A tu ritmo.</em></h1>
        <p>Carga cualquier texto y conviértelo en audio al instante.</p>
      </section>

      <section className="workspace" aria-label="Lector de documentos">
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInput.current?.click(); }}
        >
          <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.rtf,.html,.htm,.md,.csv,.json" onChange={(event: ChangeEvent<HTMLInputElement>) => loadFile(event.target.files?.[0])} />
          <span className="uploadIcon">↥</span>
          <div><strong>{loading ? "Extrayendo el texto…" : "Arrastra tu documento aquí"}</strong><small>o haz clic para elegir un archivo</small></div>
          <span className="formats">PDF · DOCX · TXT · RTF · HTML · MD · CSV · JSON</span>
        </div>
        {error && <div className="error" role="alert">{error}</div>}

        <article className="player">
          <div className="documentHead">
            <div className="fileIcon">Aa</div>
            <div><span>LEYENDO AHORA</span><h2>{fileName}</h2></div>
            <div className="documentMeta"><b>{words.toLocaleString("es-ES")}</b><span>palabras</span></div>
          </div>

          <div className="textPreview" aria-live="polite">
            <span>{text.slice(0, position)}</span><mark>{text.slice(position, Math.min(text.length, position + 90)) || " "}</mark><span>{text.slice(Math.min(text.length, position + 90))}</span>
          </div>

          <div className="timeline">
            <input aria-label="Posición de lectura" type="range" min="0" max={Math.max(1, text.length)} value={position} style={{ "--progress": `${progress}%` } as React.CSSProperties} onChange={(event) => { const next = Number(event.target.value); stop(); setPosition(next); }} />
            <div><span>{formatTime(elapsedSeconds)}</span><span>-{formatTime(Math.max(0, totalSeconds - elapsedSeconds))}</span></div>
          </div>

          <div className="speedRow">
            <span>VELOCIDAD</span>
            <div>{SPEEDS.map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => changeSpeed(value)}>{value}×</button>)}</div>
          </div>

          <div className="mainControls">
            <button className="sectionButton" onClick={() => skipSection(-1)} aria-label="Párrafo anterior"><span>│◀</span><small>Anterior</small></button>
            <button className="playButton" onClick={togglePlayback} aria-label={playing ? "Pausar" : "Reproducir"}>{playing ? "Ⅱ" : "▶"}</button>
            <button className="sectionButton" onClick={() => skipSection(1)} aria-label="Párrafo siguiente"><span>▶│</span><small>Siguiente</small></button>
          </div>

          <div className="jumpControls">
            <button onClick={() => seekSeconds(-30)}><span>↶</span><b>30</b><small>seg</small></button>
            <button onClick={() => seekSeconds(-10)}><span>↶</span><b>10</b><small>seg</small></button>
            <button onClick={() => seekSeconds(10)}><span>↷</span><b>10</b><small>seg</small></button>
            <button onClick={() => seekSeconds(30)}><span>↷</span><b>30</b><small>seg</small></button>
          </div>

          <div className="voiceRow">
            <label htmlFor="voice">Voz</label>
            <select id="voice" value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>
              {voices.map((voice) => <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} · {voice.lang}</option>)}
            </select>
          </div>
        </article>

        <details className="pasteBox">
          <summary>Pegar o editar texto directamente</summary>
          <textarea value={text} onChange={(event) => { stop(true); setText(event.target.value); setFileName("Texto pegado"); }} aria-label="Texto para leer" />
        </details>
      </section>

      <footer><span>Privado por diseño</span><span>•</span><span>Sin cuentas</span><span>•</span><span>Sin subir archivos a servidores</span></footer>
    </main>
  );
}
