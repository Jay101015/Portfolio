/* Runs the Kokoro neural voice model off the main thread so the app stays responsive while lines are generated. */
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';

env.wasmPaths = new URL('./vendor/kokoro/', import.meta.url).href;

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;

function load() {
  if (!ttsPromise) {
    const files = {};
    ttsPromise = KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        let loaded = 0, total = 0;
        Object.values(files).forEach(([l, t]) => { loaded += l; total += t; });
        postMessage({ type: 'progress', loaded, total });
      },
    });
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
      await load();
      postMessage({ id, type: 'ready' });
    } else if (type === 'speak') {
      const tts = await load();
      const parts = [];
      let rate = 24000;
      for (const chunk of data.chunks) {
        const audio = await tts.generate(chunk, { voice: data.voice, speed: data.speed });
        rate = audio.sampling_rate;
        parts.push(audio.audio);
      }
      const wav = encodeWav(parts, rate, 0.2);
      postMessage({ id, type: 'audio', wav }, [wav]);
    }
  } catch (err) {
    postMessage({ id, type: 'error', message: String((err && err.message) || err) });
  }
};
