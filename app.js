import * as pdfjs from "./vendor/pdf.min.mjs";
import * as mammoth from "mammoth/mammoth.browser";

pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";

const SAMPLE = `Bienvenido a Lector. Esta aplicación convierte tus documentos en una experiencia de escucha sencilla y privada.\n\nCarga un archivo o pega tu propio texto. Después podrás iniciar la lectura, cambiar la velocidad y saltar hacia delante o hacia atrás sin perderte.`;
const $ = (id) => document.getElementById(id);
const state = { text: SAMPLE, position: 0, speed: 1, playing: false, runId: 0, voices: [], voiceName: "" };

function cleanText(value) { return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
function formatTime(seconds) { const minutes = Math.floor(seconds / 60); return `${minutes}:${Math.max(0, Math.floor(seconds % 60)).toString().padStart(2, "0")}`; }
function totalSeconds() { return Math.max(1, wordCount() / (2.55 * state.speed)); }
function wordCount() { return state.text.trim().split(/\s+/).filter(Boolean).length; }
function splitChunks(text) {
  const pieces = text.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g) || [text];
  const chunks = []; let cursor = 0; let current = ""; let start = 0;
  for (const piece of pieces) {
    const found = text.indexOf(piece, cursor); const pieceStart = found >= 0 ? found : cursor; cursor = pieceStart + piece.length;
    if (current && current.length + piece.length > 260) { chunks.push({ text: current, start }); current = piece; start = pieceStart; }
    else { if (!current) start = pieceStart; current += piece; }
  }
  if (current) chunks.push({ text: current, start }); return chunks;
}
function render() {
  const end = Math.min(state.text.length, state.position + 90);
  $("text-preview").innerHTML = "";
  $("text-preview").append(document.createTextNode(state.text.slice(0, state.position)));
  const mark = document.createElement("mark"); mark.textContent = state.text.slice(state.position, end) || " "; $("text-preview").append(mark);
  $("text-preview").append(document.createTextNode(state.text.slice(end)));
  $("word-count").textContent = wordCount().toLocaleString("es-ES");
  $("timeline").max = Math.max(1, state.text.length); $("timeline").value = state.position;
  const progress = state.position / Math.max(1, state.text.length); $("timeline").style.setProperty("--progress", `${progress * 100}%`);
  $("elapsed").textContent = formatTime(totalSeconds() * progress); $("remaining").textContent = `-${formatTime(totalSeconds() * (1 - progress))}`;
  $("play").textContent = state.playing ? "Ⅱ" : "▶"; $("play").setAttribute("aria-label", state.playing ? "Pausar" : "Reproducir");
}
function stop(reset = false) { state.runId += 1; speechSynthesis.cancel(); state.playing = false; if (reset) state.position = 0; render(); }
function speakFrom(startAt) {
  if (!state.text.trim()) return; speechSynthesis.cancel(); const id = ++state.runId;
  const safeStart = Math.max(0, Math.min(startAt, state.text.length - 1)); state.position = safeStart; state.playing = true; render();
  const chunks = splitChunks(state.text.slice(safeStart)); let index = 0;
  const next = () => {
    if (id !== state.runId || index >= chunks.length) { if (id === state.runId) { state.playing = false; state.position = state.text.length; render(); } return; }
    const chunk = chunks[index]; const utterance = new SpeechSynthesisUtterance(chunk.text); utterance.rate = state.speed; utterance.lang = "es-ES";
    utterance.voice = state.voices.find((voice) => voice.name === state.voiceName) || null;
    utterance.onboundary = (event) => { if (id === state.runId) { state.position = safeStart + chunk.start + event.charIndex; render(); } };
    utterance.onend = () => { index += 1; next(); }; utterance.onerror = (event) => { if (!["canceled", "interrupted"].includes(event.error)) showError("No se ha podido reproducir la voz seleccionada."); };
    speechSynthesis.speak(utterance);
  }; next();
}
function seek(seconds) { const next = Math.max(0, Math.min(state.text.length - 1, state.position + seconds * (state.text.length / totalSeconds()))); const wasPlaying = state.playing; stop(); state.position = next; render(); if (wasPlaying) setTimeout(() => speakFrom(next), 60); }
function skipSection(direction) {
  const breaks = [0, ...Array.from(state.text.matchAll(/\n\s*\n/g), (match) => match.index + match[0].length), state.text.length];
  const target = direction > 0 ? breaks.find((point) => point > state.position + 2) ?? state.text.length : [...breaks].reverse().find((point) => point < state.position - 2) ?? 0;
  const wasPlaying = state.playing; stop(); state.position = target; render(); if (wasPlaying) setTimeout(() => speakFrom(target), 60);
}
function showError(message = "") { $("error").textContent = message; $("error").hidden = !message; }
async function extractFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!result.value?.trim()) throw new Error("WORD_EMPTY");
    return result.value;
  }
  if (extension === "doc") throw new Error("OLD_WORD_FORMAT");
  if (extension === "pdf") { const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const pages = []; for (let n = 1; n <= pdf.numPages; n++) { const content = await (await pdf.getPage(n)).getTextContent(); pages.push(content.items.map((item) => item.str || "").join(" ")); } return pages.join("\n\n"); }
  const raw = await file.text();
  if (["html", "htm"].includes(extension)) return new DOMParser().parseFromString(raw, "text/html").body.textContent || "";
  if (extension === "rtf") return raw.replace(/\\par[d]?/g, "\n").replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+\d* ?/gi, "").replace(/[{}]/g, "");
  return raw;
}
async function loadFile(file) {
  if (!file) return; $("upload-title").textContent = "Extrayendo el texto…"; showError(); stop(true);
  try { const text = cleanText(await extractFile(file)); if (!text) throw new Error("EMPTY"); state.text = text; state.position = 0; $("file-name").textContent = file.name; $("editor").value = text; }
  catch (error) {
    if (error?.message === "OLD_WORD_FORMAT") showError("Este archivo usa el formato antiguo .doc. Ábrelo en Word y guárdalo como .docx para poder leerlo.");
    else showError(`No he podido extraer el texto de ${file.name}. Comprueba que el documento Word sea .docx y que no esté protegido con contraseña.`);
  }
  finally { $("upload-title").textContent = "Arrastra tu documento aquí"; render(); }
}
function updateVoices() {
  state.voices = speechSynthesis.getVoices(); const previous = state.voiceName; $("voice").innerHTML = "";
  state.voices.forEach((voice) => { const option = document.createElement("option"); option.value = voice.name; option.textContent = `${voice.name} · ${voice.lang}`; $("voice").append(option); });
  const preferred = state.voices.find((voice) => voice.name === previous) || state.voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) || state.voices[0];
  if (preferred) { state.voiceName = preferred.name; $("voice").value = preferred.name; }
}

$("dropzone").addEventListener("click", () => $("file-input").click());
$("dropzone").addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) $("file-input").click(); });
$("dropzone").addEventListener("dragover", (event) => { event.preventDefault(); $("dropzone").classList.add("dragging"); });
$("dropzone").addEventListener("dragleave", () => $("dropzone").classList.remove("dragging"));
$("dropzone").addEventListener("drop", (event) => { event.preventDefault(); $("dropzone").classList.remove("dragging"); loadFile(event.dataTransfer.files[0]); });
$("file-input").addEventListener("change", (event) => loadFile(event.target.files[0]));
$("play").addEventListener("click", () => state.playing ? stop() : speakFrom(state.position >= state.text.length ? 0 : state.position));
$("previous").addEventListener("click", () => skipSection(-1)); $("next").addEventListener("click", () => skipSection(1));
document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => seek(Number(button.dataset.jump))));
document.querySelectorAll("[data-speed]").forEach((button) => button.addEventListener("click", () => { const wasPlaying = state.playing; const position = state.position; stop(); state.speed = Number(button.dataset.speed); document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", item === button)); render(); if (wasPlaying) setTimeout(() => speakFrom(position), 60); }));
$("timeline").addEventListener("input", (event) => { stop(); state.position = Number(event.target.value); render(); });
$("voice").addEventListener("change", (event) => { state.voiceName = event.target.value; });
$("editor").addEventListener("input", (event) => { stop(true); state.text = event.target.value; $("file-name").textContent = "Texto pegado"; render(); });
speechSynthesis.addEventListener("voiceschanged", updateVoices); updateVoices(); $("editor").value = SAMPLE; render();
