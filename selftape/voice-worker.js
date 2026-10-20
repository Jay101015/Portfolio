/* Runs the Kokoro neural voice model off the main thread so the app stays responsive while lines are generated. */
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';

env.wasmPaths = new URL('./vendor/kokoro/', import.meta.url).href;

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;
let loadedWith = null; // { device, dtype }

// Best quality first: the full-precision model on the GPU (iOS 26+, Android Chrome). Phones without
// WebGPU, or where it fails, get the compact model on the CPU — smaller download, slightly flatter sound.
async function loadWith(device, dtype, progress) {
  const files = {};
  const tts = await KokoroTTS.from_pretrained(MODEL, {
    dtype,
    device,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      let loaded = 0, total = 0;
      Object.values(files).forEach(([l, t]) => { loaded += l; total += t; });
      progress(loaded, total);
    },
  });
  // Make sure the backend really works before we commit to it (WebGPU can load and then fail to run).
  await tts.generate('Ready.', { voice: 'af_heart' });
  return tts;
}

function load(quality) {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const progress = (loaded, total) => postMessage({ type: 'progress', loaded, total });
      const wantGpu = quality !== 'standard' && typeof navigator !== 'undefined' && !!navigator.gpu;
      if (wantGpu) {
        try {
          const tts = await loadWith('webgpu', 'fp32', progress);
          loadedWith = { device: 'webgpu', dtype: 'fp32' };
          return tts;
        } catch (err) {
          postMessage({ type: 'note', message: 'GPU voices unavailable (' + String((err && err.message) || err).slice(0, 120) + '); using the compact model.' });
        }
      }
      const tts = await loadWith('wasm', 'q8', progress);
      loadedWith = { device: 'wasm', dtype: 'q8' };
      return tts;
    })();
    ttsPromise.catch(() => { ttsPromise = null; });
  }
  return ttsPromise;
}

// 16-bit mono WAV, with a short silence between sentence chunks.
function encodeWav(parts, rate, gapSec) {
  const gap = Math.round(rate * gapSec);
  const length = parts.reduce((n, p, i) => n + p.length + (i ? gap : 0), 0);
  const buf = new ArrayBuffer(44 + length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, length * 2, true);
  let o = 44;
  parts.forEach((p, i) => {
    if (i) o += gap * 2;
    for (let j = 0; j < p.length; j++, o += 2) {
      const s = Math.max(-1, Math.min(1, p[j]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  });
  return buf;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      await load(data.quality);
      postMessage({ id, type: 'ready', device: loadedWith.device, dtype: loadedWith.dtype });
    } else if (type === 'speak') {
      const tts = await load(data.quality);
      const parts = [];
      let rate = 24000;
      for (const chunk of data.chunks) {
        const audio = await tts.generate(chunk, { voice: data.voice, speed: data.speed });
        rate = audio.sampling_rate;
        parts.push(audio.audio);
      }
      const wav = encodeWav(parts, rate, 0.2);
      postMessage({ id, type: 'audio', wav, device: loadedWith.device }, [wav]);
    }
  } catch (err) {
    postMessage({ id, type: 'error', message: String((err && err.message) || err) });
  }
};
