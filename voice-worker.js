/* Runs the Kokoro neural voice model off the main thread so the app stays responsive while lines are generated. */
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';

const base = new URL('./vendor/kokoro/', import.meta.url).href;
// The plain build of ONNX Runtime. The JSEP build that transformers.js loads by default pins the CPU, leaks memory
// and crashes the page in Safari 26.2+ (microsoft/onnxruntime#26827), and it is only needed for GPU inference.
env.wasmPaths = { mjs: base + 'ort-wasm-simd-threaded.mjs', wasm: base + 'ort-wasm-simd-threaded.wasm' };

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// The 8-bit model: small, and numerically safe. The half-precision variants (fp16, q4f16) are a little faster but
// return nothing but NaN for some sentences, which plays as silence.
const DTYPE = 'q8';
let ttsPromise = null;
let loaded = null; // { threads, capPages }

// The runtime asks for a shared WebAssembly memory that may grow to 4 GB. iPhones can refuse to reserve that much
// ("Out of memory"), and the model needs well under 1 GB, so ask for a lower ceiling.
function capWasmMemory(pages) {
  if (!pages || WebAssembly.Memory.__cueCap) return;
  const Original = WebAssembly.Memory;
  const Capped = function (descriptor) {
    const d = descriptor && descriptor.shared && descriptor.maximum > pages ? Object.assign({}, descriptor, { maximum: pages }) : descriptor;
    return new Original(d);
  };
  Capped.prototype = Original.prototype;
  Capped.__cueCap = pages;
  WebAssembly.Memory = Capped;
}

function load(cfg) {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const threads = Math.max(1, Number(cfg.threads) || 1);
      env.numThreads = threads;
      capWasmMemory(Number(cfg.capPages) || 0);
      const files = {};
      postMessage({ type: 'phase', phase: 'download' });
      const tts = await KokoroTTS.from_pretrained(MODEL, {
        dtype: DTYPE,
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          let got = 0, total = 0;
          Object.values(files).forEach(([l, t]) => { got += l; total += t; });
          postMessage({ type: 'progress', loaded: got, total });
        },
      });
      // Prove the engine really produces sound before anything relies on it.
      postMessage({ type: 'phase', phase: 'warm' });
      const test = await tts.generate('Hi.', { voice: 'af_heart' });
      if (!test || !test.audio || !soundOk(measure(test.audio))) throw new Error('the voice engine produced no sound');
      loaded = { threads, capPages: Number(cfg.capPages) || 0 };
      return tts;
    })();
    ttsPromise.catch(() => { ttsPromise = null; });
  }
  return ttsPromise;
}

function measure(pcm) {
  let nan = 0, sum = 0, peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i];
    if (v !== v) { nan++; continue; }
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  return { nan, peak, rms: Math.sqrt(sum / Math.max(1, pcm.length - nan)), length: pcm.length };
}
const soundOk = (m) => m.length > 0 && !m.nan && m.peak > 0.01;

async function synth(tts, text, voice, speed) {
  const audio = await tts.generate(text, { voice, speed });
  return { pcm: new Float32Array(audio.audio), rate: audio.sampling_rate }; // a copy: the model may reuse its buffer
}

// Even loudness from line to line, without clipping.
function normalise(pcm) {
  let peak = 0, sum = 0;
  for (let i = 0; i < pcm.length; i++) { const v = pcm[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
  if (!peak) return;
  const rms = Math.sqrt(sum / pcm.length);
  const gain = Math.min(0.13 / rms, 0.98 / peak, 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
}

// The model pads each clip with silence; trim it so the reader answers on cue, and fade the edges to avoid clicks.
function trim(pcm, rate) {
  const floor = 0.006;
  let a = 0, b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < floor) a++;
  while (b > a && Math.abs(pcm[b]) < floor) b--;
  a = Math.max(0, a - Math.round(rate * 0.04));
  b = Math.min(pcm.length - 1, b + Math.round(rate * 0.12));
  const out = pcm.subarray(a, b + 1);
  const fade = Math.min(Math.round(rate * 0.008), out.length >> 1);
  for (let i = 0; i < fade; i++) { const g = i / fade; out[i] *= g; out[out.length - 1 - i] *= g; }
  return out;
}

// 16-bit mono WAV.
function encodeWav(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0, o = 44; i < pcm.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      const t0 = performance.now();
      await load(data);
      postMessage({ id, type: 'ready', threads: loaded.threads, capPages: loaded.capPages, ms: Math.round(performance.now() - t0) });
    } else if (type === 'speak') {
      const tts = await load(data);
      const t0 = performance.now();
      let { pcm, rate } = await synth(tts, data.text, data.voice, data.speed);
      if (!soundOk(measure(pcm))) {
        // Never hand back a silent clip. Awkward punctuation is the usual cause, so try once more without it.
        const plain = data.text.replace(/\.{2,}|…/g, ',').replace(/--+|[—–]/g, ',').replace(/["“”]/g, '').replace(/\s+,/g, ',').replace(/,[,\s]*/g, ', ').trim();
        ({ pcm, rate } = await synth(tts, plain || data.text, data.voice, data.speed));
        if (!soundOk(measure(pcm))) throw new Error('the voice model produced no sound for this line');
      }
      normalise(pcm);
      const clip = trim(pcm, rate);
      const wav = encodeWav(clip, rate);
      postMessage({ id, type: 'audio', wav, ms: Math.round(performance.now() - t0), seconds: clip.length / rate }, [wav]);
    }
  } catch (err) {
    postMessage({ id, type: 'error', name: (err && err.name) || 'Error', message: String((err && err.message) || err) });
  }
};
