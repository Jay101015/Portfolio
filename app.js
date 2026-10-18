/* Cue — a tiny self-tape reader. No build step, no backend: everything runs and is stored in the browser. */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const STORE_KEY = 'cue:v1';

  const SAMPLE = `INT. DINER - NIGHT

Rain against the windows. MAYA (30s) sits alone in a booth. DEV slides in across from her, soaked.

DEV
You said nine.

MAYA
I said nine-ish.

DEV
It's almost eleven, Maya.

MAYA
(not looking up)
Then why are you still here?

DEV
Because you called. You never call.

A long beat. She finally looks at him.

MAYA
I'm leaving. Tomorrow. I wanted someone to know.

DEV
Leaving where?

MAYA
Does it matter?

DEV
(quietly)
It does to me.`;

  // ---------- state ----------
  const state = {
    script: '',
    lines: [],
    characters: [],
    me: '',
    readers: {},
    settings: {
      advanceMode: 'voice',
      silenceMs: 1000,
      sensitivity: 5,
      gapMs: 300,
      countdown: '3',
      myLineDisplay: 'full',
      mirror: true,
    },
    startIndex: 0,
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved) {
        state.script = saved.script || '';
        state.me = saved.me || '';
        state.readers = saved.readers || {};
        Object.assign(state.settings, saved.settings || {});
      }
    } catch { /* storage unavailable: start fresh */ }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        script: state.script, me: state.me, readers: state.readers, settings: state.settings,
      }));
    } catch { /* ignore */ }
  }

  // ---------- script parsing ----------
  const SCENE_HEADING = /^(INT|EXT|INT\.?\/EXT|I\/E)[.\s]/i;
  const TRANSITION = /(TO:|^FADE (IN|OUT)|^CUT TO|^DISSOLVE|^THE END)/;

  function normName(s) {
    return s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function isBracketed(t) {
    return /^\(.*\)$/.test(t) || /^\[.*\]$/.test(t);
  }
  function isCue(t, next) {
    if (!next || !next.trim()) return false;
    if (t.length > 40 || !/[A-Z]/.test(t) || t !== t.toUpperCase()) return false;
    if (SCENE_HEADING.test(t) || TRANSITION.test(t) || t.endsWith(':')) return false;
    return normName(t).length > 0;
  }

  function parseScript(text) {
    const raw = text.replace(/\r/g, '').split('\n');
    const out = [];
    let speaker = null;
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i].trim();
      if (!t) { speaker = null; continue; }

      const m = t.match(/^([A-Z][A-Za-z0-9 .'\-]{0,30}?)\s*(\([^)]*\))?\s*:\s*(.+)$/);
      if (m && !SCENE_HEADING.test(t) && !TRANSITION.test(t)) {
        speaker = normName(m[1]);
        out.push({ type: 'dialogue', character: speaker, text: (m[2] ? m[2] + ' ' : '') + m[3] });
        continue;
      }
      if (isCue(t, raw[i + 1])) { speaker = normName(t); continue; }

      const last = out[out.length - 1];
      if (speaker && !(isBracketed(t) && last && last.character === speaker && !last.fromCue)) {
        if (last && last.type === 'dialogue' && last.character === speaker) last.text += ' ' + t;
        else out.push({ type: 'dialogue', character: speaker, text: t, fromCue: true });
        continue;
      }
      speaker = null;
      out.push({ type: 'action', text: t });
    }
    return out;
  }

  const spokenText = (s) => s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = (s) => (spokenText(s).match(/\S+/g) || []).length;

  // ---------- voices ----------
  let voices = [];
  const hasTTS = 'speechSynthesis' in window;

  function refreshVoices() {
    if (!hasTTS) return;
    voices = speechSynthesis.getVoices().slice().sort((a, b) => {
      const ae = a.lang.startsWith('en') ? 0 : 1, be = b.lang.startsWith('en') ? 0 : 1;
      return ae - be || a.name.localeCompare(b.name);
    });
    renderCast();
  }

  function readerFor(name) {
    if (!state.readers[name]) state.readers[name] = { voiceURI: '', rate: 1, pitch: 1 };
    return state.readers[name];
  }

  function autoAssignVoices() {
    const en = voices.filter((v) => v.lang.startsWith('en'));
    const pool = en.length ? en : voices;
    let k = 0;
    state.characters.filter((c) => c !== state.me).forEach((c) => {
      const r = readerFor(c);
      if (!r.voiceURI || !voices.some((v) => v.voiceURI === r.voiceURI)) {
        r.voiceURI = pool.length ? pool[(k * 3) % pool.length].voiceURI : '';
      }
      k++;
    });
  }

  // ---------- cast / settings UI ----------
  function onScriptChange() {
    state.script = $('#scriptInput').value;
    state.lines = parseScript(state.script);
    const seen = [];
    state.lines.forEach((l) => { if (l.type === 'dialogue' && !seen.includes(l.character)) seen.push(l.character); });
    state.characters = seen;
    if (!seen.includes(state.me)) state.me = seen[0] || '';
    state.startIndex = 0;
    renderCast();
    renderLines();
    save();
  }

  function renderCast() {
    const has = state.characters.length > 0;
    $('#castEmpty').hidden = has;
    $('#castPanel').hidden = !has;
    $('#toStage').disabled = !has;
    if (!has) return;

    const sel = $('#mySelect');
    sel.innerHTML = state.characters.map((c) => `<option ${c === state.me ? 'selected' : ''}>${esc(c)}</option>`).join('');

    autoAssignVoices();
    const others = state.characters.filter((c) => c !== state.me);
    const voiceOpts = (uri) => voices.length
      ? voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === uri ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')
      : '<option value="">Default voice</option>';

    $('#readerList').innerHTML = others.length ? others.map((c) => {
      const r = readerFor(c);
      return `<div class="reader" data-char="${esc(c)}">
        <div class="reader-top"><span>${esc(c)}</span><button class="btn ghost sm" data-act="test">▶ Test</button></div>
        <select data-k="voiceURI">${voiceOpts(r.voiceURI)}</select>
        <div class="row" style="margin-top:6px">
          <label>Speed<input type="range" data-k="rate" min="0.6" max="1.5" step="0.05" value="${r.rate}"></label>
          <label>Pitch<input type="range" data-k="pitch" min="0.6" max="1.5" step="0.05" value="${r.pitch}"></label>
        </div>
      </div>`;
    }).join('') : '<p class="hint">No other characters — it\'s a monologue. The reader stays quiet.</p>';
    if (!hasTTS) $('#readerList').insertAdjacentHTML('afterbegin', '<p class="hint">This browser has no text-to-speech; reader lines will be shown and timed instead.</p>');
    save();
  }

  function bindSettings() {
    const s = state.settings;
    const sync = () => {
      $('#silenceVal').textContent = (s.silenceMs / 1000).toFixed(1) + 's';
      $('#gapVal').textContent = (s.gapMs / 1000).toFixed(1) + 's';
      $$('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== s.advanceMode; });
      $('#preview').classList.toggle('mirror', !!s.mirror);
      renderLines();
      save();
    };
    ['advanceMode', 'silenceMs', 'sensitivity', 'gapMs', 'countdown', 'myLineDisplay', 'mirror'].forEach((k) => {
      const el = $('#' + k);
      if (el.type === 'checkbox') el.checked = !!s[k]; else el.value = s[k];
      el.addEventListener('input', () => {
        s[k] = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? Number(el.value) : el.value);
        sync();
      });
    });
    sync();
  }

  // ---------- line list / prompter ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtLine(text) {
    return esc(text).replace(/\([^)]*\)|\[[^\]]*\]/g, (m) => `<span class="paren">${m}</span>`);
  }
  function displayText(l) {
    if (l.type !== 'dialogue' || l.character !== state.me) return fmtLine(l.text);
    const mode = state.settings.myLineDisplay;
    if (mode === 'hidden') return '<span class="paren">— your line —</span>';
    if (mode === 'first') {
      const words = spokenText(l.text).split(' ');
      return esc(words.slice(0, 3).join(' ')) + (words.length > 3 ? ' …' : '');
    }
    return fmtLine(l.text);
  }

  function renderLines() {
    const list = $('#lineList');
    list.innerHTML = state.lines.map((l, i) => {
      const cls = [l.type === 'action' ? 'action' : '', l.character === state.me ? 'mine' : '', i === state.startIndex ? 'start' : ''].join(' ');
      const who = l.type === 'dialogue' ? `<span class="who">${esc(l.character)}${l.character === state.me ? ' · you' : ''}</span>` : '';
      return `<li class="${cls}" data-i="${i}">${who}${displayText(l)}</li>`;
    }).join('') || '<li class="action">No script yet.</li>';
  }

  function setCurrent(i) {
    $$('#lineList li').forEach((li) => {
      const n = Number(li.dataset.i);
      li.classList.toggle('current', n === i);
      li.classList.toggle('done', i >= 0 && n < i && n >= state.startIndex);
    });
    const cur = $(`#lineList li[data-i="${i}"]`);
    if (cur) {
      const list = $('#lineList');
      list.scrollTo({ top: cur.offsetTop - list.clientHeight / 2 + cur.clientHeight / 2, behavior: 'smooth' });
    }

    const p = $('#prompter');
    const l = state.lines[i];
    if (!l || l.type !== 'dialogue') { p.hidden = true; return; }
    p.hidden = false;
    p.classList.toggle('me', l.character === state.me);
    p.innerHTML = `<span class="who">${esc(l.character)}${l.character === state.me ? ' · you' : ''}</span>${displayText(l)}`;
  }

  // ---------- media ----------
  let stream = null;
  let audioCtx = null, analyser = null, levelBuf = null;
  let currentLevel = 0;

  async function ensureMedia({ requireVideo = false } = {}) {
    if (stream && (!requireVideo || stream.getVideoTracks().length)) return stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser cannot access the camera. Open the app over https in Chrome, Safari or Firefox.');
    }
    // Echo cancellation off so the reader's voice from your speakers lands on the tape, like a real reader.
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio,
      });
    } catch (err) {
      if (requireVideo) throw err;
      s = await navigator.mediaDevices.getUserMedia({ audio });
    }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = s;
    const v = $('#preview');
    v.srcObject = s;
    $('#camOff').hidden = s.getVideoTracks().length > 0;
    setupMeter(s);
    return s;
  }

  function setupMeter(s) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const src = audioCtx.createMediaStreamSource(s);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      levelBuf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      $('#meter').classList.add('on');
      meterLoop();
    } catch { analyser = null; }
  }

  function readLevel() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
    return Math.sqrt(sum / levelBuf.length);
  }
  const threshold = () => 0.2 * Math.pow(0.7, state.settings.sensitivity);

  let meterRunning = false;
  function meterLoop() {
    if (meterRunning) return;
    meterRunning = true;
    const bar = $('#meter i'), meter = $('#meter');
    const tick = () => {
      currentLevel = readLevel();
      bar.style.height = Math.min(100, Math.sqrt(currentLevel) * 220) + '%';
      meter.classList.toggle('speaking', currentLevel > threshold());
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------- run engine ----------
  let run = null;

  function abortError() { return new DOMException('Stopped', 'AbortError'); }

  // A wait that ends when `setup` calls done(), when Next is pressed, or rejects when the run is stopped.
  function step(signal, setup) {
    return new Promise((resolve, reject) => {
      const cleanups = [];
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
        if (run && run.skip === skip) run.skip = null;
        err ? reject(err) : resolve();
      };
      const skip = () => finish();
      const onAbort = () => finish(abortError());
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
      if (run) run.skip = skip;
      setup(() => finish(), (fn) => cleanups.push(fn));
    });
  }

  const sleep = (ms, signal) => step(signal, (done, onClean) => {
    const t = setTimeout(done, ms);
    onClean(() => clearTimeout(t));
  });

  function chunkText(text) {
    const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*|\S[^.!?…]*$/g) || [text];
    const chunks = [];
    sentences.forEach((s) => {
      s = s.trim();
      if (!s) return;
      const last = chunks[chunks.length - 1];
      if (last && last.length + s.length < 160) chunks[chunks.length - 1] = last + ' ' + s;
      else chunks.push(s);
    });
    return chunks;
  }

  function speakLine(line, signal) {
    const text = spokenText(line.text);
    if (!text) return Promise.resolve();
    const r = readerFor(line.character);
    if (!hasTTS) return sleep(1000 + wordCount(text) * 400 / r.rate, signal);

    return step(signal, (done, onClean) => {
      const chunks = chunkText(text);
      const voice = voices.find((v) => v.voiceURI === r.voiceURI);
      let idx = 0, stopped = false;
      onClean(() => { stopped = true; speechSynthesis.cancel(); });
      const next = () => {
        if (stopped) return;
        if (idx >= chunks.length) return done();
        const chunk = chunks[idx++];
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.rate = r.rate;
        u.pitch = r.pitch;
        let fired = false;
        // Some engines occasionally never fire onend; fall back to a generous estimate.
        const fallback = setTimeout(() => fin(), 4000 + (wordCount(chunk) / (1.8 * r.rate)) * 1000);
        function fin() { if (fired) return; fired = true; clearTimeout(fallback); next(); }
        u.onend = fin;
        u.onerror = fin;
        run.utterance = u; // keep a reference so it isn't garbage-collected mid-speech (Chrome bug)
        speechSynthesis.speak(u);
      };
      speechSynthesis.cancel();
      next();
    });
  }

  function waitForMe(line, signal) {
    const mode = state.settings.advanceMode;
    if (mode === 'timed') return sleep(1200 + wordCount(line.text) * 420, signal);
    if (mode === 'voice' && analyser) {
      return step(signal, (done, onClean) => {
        const start = performance.now();
        let voicedMs = 0, lastVoice = 0, prev = start;
        const iv = setInterval(() => {
          const now = performance.now();
          const dt = now - prev; prev = now;
          if (now - start < 300) return; // ignore the tail of the reader's audio
          if (readLevel() > threshold()) { voicedMs += dt; lastVoice = now; }
          else if (voicedMs > 250 && now - lastVoice > state.settings.silenceMs) done();
        }, 40);
        onClean(() => clearInterval(iv));
      });
    }
    return step(signal, () => {}); // manual: only Next advances
  }

  async function countdown(n, signal) {
    const o = $('#countdownOverlay');
    o.hidden = false;
    try {
      for (let k = n; k > 0; k--) {
        o.textContent = k;
        await sleep(1000, signal);
      }
    } finally { o.hidden = true; }
  }

  function pickMime() {
    if (!window.MediaRecorder) return null;
    const types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function startRecorder() {
    const mime = pickMime();
    if (mime === null) throw new Error('Recording is not supported in this browser.');
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const finished = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }));
    });
    rec.start(1000);
    $('#recBadge').hidden = false;
    const timer = setInterval(() => { $('#recTime').textContent = fmtDur((Date.now() - started) / 1000); }, 250);
    return {
      async stop() {
        clearInterval(timer);
        $('#recBadge').hidden = true;
        if (rec.state !== 'inactive') rec.stop();
        const blob = await finished;
        return { blob, duration: (Date.now() - started) / 1000 };
      },
    };
  }

  function setRunning(on, record) {
    $('#rehearseBtn').disabled = on;
    $('#recordBtn').disabled = on;
    $('#nextBtn').disabled = !on;
    $('#stopBtn').disabled = !on;
    $$('.tab').forEach((t) => { if (t.dataset.view !== 'stage') t.disabled = on && record; });
  }
  const status = (msg) => { $('#status').textContent = msg || ''; };

  async function runScene(record) {
    if (run || !state.lines.length) return;
    // iOS only lets speech start from a user gesture: prime the engine before any await.
    if (hasTTS) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    const ac = new AbortController();
    run = { ac, skip: null };
    setRunning(true, record);
    let recorder = null;
    try {
      if (hasTTS && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if (record) await ensureMedia({ requireVideo: true });
      else if (state.settings.advanceMode === 'voice') {
        try { await ensureMedia(); } catch { status('No mic — press Space after your lines.'); }
      }
      if (record) {
        const n = Number(state.settings.countdown);
        if (n) await countdown(n, ac.signal);
        recorder = startRecorder();
        await sleep(600, ac.signal); // a beat of air before the first line
      }
      for (let i = state.startIndex; i < state.lines.length; i++) {
        const l = state.lines[i];
        if (l.type !== 'dialogue') continue;
        setCurrent(i);
        if (l.character === state.me) {
          status(state.settings.advanceMode === 'voice' && analyser ? 'Your line — I\'ll cue when you finish.' : 'Your line — press Space when done.');
          await waitForMe(l, ac.signal);
        } else {
          status(`${l.character} is reading…`);
          await speakLine(l, ac.signal);
        }
        if (state.settings.gapMs) await sleep(state.settings.gapMs, ac.signal);
      }
      status('Scene complete.');
      if (record) await sleep(1200, ac.signal);
    } catch (err) {
      if (err.name === 'AbortError') status('Stopped.');
      else { status(err.message || String(err)); console.error(err); }
    } finally {
      if (hasTTS) speechSynthesis.cancel();
      run = null;
      setCurrent(-1);
      setRunning(false, record);
      if (recorder) {
        const { blob, duration } = await recorder.stop();
        if (blob.size) {
          await saveTake(blob, duration);
          status(`Saved take (${fmtDur(duration)}). See Takes.`);
        }
      }
    }
  }

  // ---------- takes (IndexedDB) ----------
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('cue-takes', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('takes', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('takes', mode);
      const r = fn(t.objectStore('takes'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }
  const memTakes = []; // fallback if IndexedDB is unavailable (e.g. some private windows)

  async function allTakes() {
    try { return (await tx('readonly', (s) => s.getAll())).sort((a, b) => b.created - a.created); }
    catch { return memTakes.slice().sort((a, b) => b.created - a.created); }
  }
  async function saveTake(blob, duration) {
    const n = (await allTakes()).length + 1;
    const take = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name: `${state.me || 'Take'} — Take ${n}`, created: Date.now(), duration, mime: blob.type, blob };
    try { await tx('readwrite', (s) => s.put(take)); } catch { memTakes.push(take); }
    renderTakes();
  }
  async function updateTake(id, patch) {
    try {
      const t = await tx('readonly', (s) => s.get(id));
      if (t) await tx('readwrite', (s) => s.put(Object.assign(t, patch)));
    } catch {
      const t = memTakes.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    }
  }
  async function deleteTake(id) {
    try { await tx('readwrite', (s) => s.delete(id)); } catch { /* ignore */ }
    const k = memTakes.findIndex((x) => x.id === id);
    if (k >= 0) memTakes.splice(k, 1);
    renderTakes();
  }

  let takeUrls = [];
  async function renderTakes() {
    const takes = await allTakes();
    takeUrls.forEach((u) => URL.revokeObjectURL(u));
    takeUrls = [];
    $('#takeCount').textContent = takes.length;
    $('#takesEmpty').hidden = takes.length > 0;
    $('#takesGrid').innerHTML = takes.map((t) => {
      const url = URL.createObjectURL(t.blob);
      takeUrls.push(url);
      const ext = (t.mime || '').includes('mp4') ? 'mp4' : 'webm';
      const file = t.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.' + ext;
      return `<div class="card take" data-id="${t.id}">
        <video src="${url}" controls playsinline preload="metadata"></video>
        <div class="meta"><div style="flex:1;min-width:0"><input value="${esc(t.name)}" aria-label="Take name"><small>${new Date(t.created).toLocaleString()} · ${fmtDur(t.duration)}</small></div></div>
        <div class="acts"><a class="btn primary sm" href="${url}" download="${esc(file)}">⬇ Download</a><button class="btn ghost sm" data-act="del">Delete</button></div>
      </div>`;
    }).join('');
  }

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  // ---------- wiring ----------
  function showView(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'takes') renderTakes();
  }

  function init() {
    load();
    $('#scriptInput').value = state.script || SAMPLE;
    onScriptChange();
    bindSettings();
    renderTakes();

    if (hasTTS) {
      refreshVoices();
      speechSynthesis.addEventListener ? speechSynthesis.addEventListener('voiceschanged', refreshVoices) : (speechSynthesis.onvoiceschanged = refreshVoices);
    }

    let debounce;
    $('#scriptInput').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(onScriptChange, 250); });
    $('#loadSample').addEventListener('click', () => { $('#scriptInput').value = SAMPLE; onScriptChange(); });
    $('#fileInput').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      $('#scriptInput').value = await f.text();
      onScriptChange();
      e.target.value = '';
    });
    $('#mySelect').addEventListener('change', (e) => { state.me = e.target.value; state.startIndex = 0; renderCast(); renderLines(); save(); });

    $('#readerList').addEventListener('input', (e) => {
      const box = e.target.closest('.reader');
      if (!box || !e.target.dataset.k) return;
      const r = readerFor(box.dataset.char);
      r[e.target.dataset.k] = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
      save();
    });
    $('#readerList').addEventListener('click', (e) => {
      if (e.target.dataset.act !== 'test') return;
      const name = e.target.closest('.reader').dataset.char;
      const line = state.lines.find((l) => l.character === name) || { character: name, text: 'Hi, I\'ll be reading with you today.' };
      if (!hasTTS || run) return;
      const tmp = { ac: new AbortController(), skip: null };
      const prev = run; run = tmp;
      speakLine(line, tmp.ac.signal).catch(() => {}).finally(() => { if (run === tmp) run = prev; });
    });

    $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $('#toStage').addEventListener('click', () => showView('stage'));

    $('#enableCam').addEventListener('click', async () => {
      try { await ensureMedia({ requireVideo: true }); status(''); }
      catch (err) { status('Camera blocked: ' + (err.message || err.name) + '. Allow camera access in your browser settings.'); }
    });
    $('#lineList').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li || run) return;
      state.startIndex = Number(li.dataset.i);
      renderLines();
    });
    $('#rehearseBtn').addEventListener('click', () => runScene(false));
    $('#recordBtn').addEventListener('click', () => runScene(true));
    $('#nextBtn').addEventListener('click', () => run && run.skip && run.skip());
    $('#stopBtn').addEventListener('click', () => run && run.ac.abort());

    document.addEventListener('keydown', (e) => {
      if (!run || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); run.skip && run.skip(); }
      if (e.code === 'Escape') run.ac.abort();
    });

    $('#takesGrid').addEventListener('click', (e) => {
      if (e.target.dataset.act !== 'del') return;
      const id = e.target.closest('.take').dataset.id;
      if (confirm('Delete this take?')) deleteTake(id);
    });
    $('#takesGrid').addEventListener('change', (e) => {
      if (e.target.tagName !== 'INPUT') return;
      updateTake(e.target.closest('.take').dataset.id, { name: e.target.value }).then(renderTakes);
    });
  }

  init();
})();
