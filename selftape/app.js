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
      matchWords: 'rehearse',
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
        if (typeof state.settings.matchWords !== 'string') state.settings.matchWords = 'rehearse';
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

  // Robotic/novelty voices that ship with Apple devices; never pick these for a scene partner.
  const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;
  const FEMALE = /\b(female|woman|samantha|karen|moira|tessa|victoria|allison|ava|susan|zoe|nicky|joelle|noelle|serena|martha|catherine|kate|fiona|veena|siri female|aria|jenny|michelle|sonia|libby|natasha|clara|emma|ana|ashley|amber|sara|nancy|jane|monica|elizabeth|hazel|zira|heera|neerja|google us english|google uk english female|en-us-x-(sfg|tpc|iob|iog)|en-gb-x-(gba|gbc|gbg))\b/i;
  const MALE = /\b(male|man|daniel|alex|aaron|arthur|evan|nathan|tom|gordon|lee|oliver|rishi|thomas|siri male|guy|davis|tony|jason|christopher|eric|ryan|brian|andrew|william|george|james|mark|david|ravi|prabhat|google uk english male|en-us-x-(iol|iom|tpd)|en-gb-x-(gbb|gbd|rjs))\b/i;

  const voiceGender = (v) => (MALE.test(v.name) && !/female/i.test(v.name) ? 'm' : FEMALE.test(v.name) ? 'f' : '');
  function voiceScore(v) {
    let s = 0;
    if (/premium/i.test(v.name)) s += 60;
    else if (/enhanced|neural|natural|wavenet|studio/i.test(v.name)) s += 50;
    if (/siri/i.test(v.name)) s += 45;
    if (/^google/i.test(v.name) || /^microsoft .*online/i.test(v.name)) s += 35;
    if (/en-(us|gb)-x-/i.test(v.voiceURI)) s += 30; // Android network voices
    if (/^en[-_]US/i.test(v.lang)) s += 12; else if (/^en[-_](GB|AU|IE|CA)/i.test(v.lang)) s += 10; else if (/^en/i.test(v.lang)) s += 6;
    if (voiceGender(v)) s += 4;
    if (v.default) s += 2;
    if (NOVELTY.test(v.name)) s -= 200;
    return s;
  }

  function refreshVoices() {
    if (!hasTTS) return;
    const all = speechSynthesis.getVoices();
    const en = all.filter((v) => /^en/i.test(v.lang));
    voices = (en.length ? en : all).filter((v) => !NOVELTY.test(v.name))
      .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
    renderCast();
  }

  function readerFor(name) {
    if (!state.readers[name]) state.readers[name] = { voiceURI: '', gender: '', rate: 1, pitch: 1 };
    return state.readers[name];
  }

  function bestVoice(gender, exclude) {
    const pool = voices.filter((v) => !gender || voiceGender(v) === gender);
    return pool.find((v) => !exclude.has(v.voiceURI)) || pool[0] || voices[0] || null;
  }

  // Give every reader character its own good voice, alternating female/male unless the actor chose.
  function autoAssignVoices() {
    const used = new Set(), usedEl = new Set();
    state.characters.filter((c) => c !== state.me).forEach((c, k) => {
      const r = readerFor(c);
      if (!r.gender) r.gender = k % 2 ? 'm' : 'f';
      const current = voices.find((v) => v.voiceURI === r.voiceURI);
      if (!current || used.has(current.voiceURI)) {
        const v = bestVoice(r.gender, used);
        r.voiceURI = v ? v.voiceURI : '';
      }
      used.add(r.voiceURI);
      if (elConnected()) {
        if (!r.engine) r.engine = 'eleven';
        if (!el.voices.some((v) => v.id === r.elVoiceId) || usedEl.has(r.elVoiceId)) {
          const v = bestElVoice(r.gender, usedEl);
          r.elVoiceId = v ? v.id : '';
        }
        usedEl.add(r.elVoiceId);
      }
    });
  }

  // ---------- cast / settings UI ----------
  function onScriptChange() {
    state.script = $('#scriptInput').value;
    state.lines = parseScript(state.script);
    const seen = [];
    state.lines.forEach((l) => { if (l.type === 'dialogue' && !seen.includes(l.character)) seen.push(l.character); });
    state.characters = seen;
    if (!seen.includes(state.me)) state.me = ''; // the actor chooses their role; never guess
    state.startIndex = 0;
    renderCast();
    renderLines();
    save();
  }

  function renderCast() {
    const has = state.characters.length > 0;
    $('#castEmpty').hidden = has;
    $('#castPanel').hidden = !has;
    $('#toStage').disabled = !has || !state.me;
    $('#toStage').textContent = state.me ? `Tape as ${state.me} →` : 'Choose who you\'re playing';
    renderRolePickers();
    if (!has) return;

    autoAssignVoices();
    const others = state.characters.filter((c) => c !== state.me);
    const voiceOpts = (uri) => voices.length
      ? voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === uri ? 'selected' : ''}>${voiceScore(v) >= 40 ? '★ ' : ''}${esc(v.name.replace(/\s*\(.*\)$/, ''))} · ${esc(v.lang)}</option>`).join('')
      : '<option value="">Default voice</option>';

    if (!state.me) {
      $('#readerList').innerHTML = '<p class="hint">Pick your character above — I\'ll voice everyone else.</p>';
      save();
      return;
    }
    $('#readerList').innerHTML = (others.length ? `<p class="hint">I'll voice ${others.map(esc).join(', ')}.</p>` : '') + (others.length ? others.map((c) => {
      const r = readerFor(c);
      return `<div class="reader" data-char="${esc(c)}">
        <div class="reader-top"><span>${esc(c)}</span>
          <span class="reader-acts">
            <span class="seg"><button data-act="gender" data-g="f" class="${r.gender === 'f' ? 'on' : ''}">Female</button><button data-act="gender" data-g="m" class="${r.gender === 'm' ? 'on' : ''}">Male</button></span>
            <button class="btn ghost sm" data-act="test">▶ Test</button>
          </span></div>
        ${elConnected() ? `<span class="seg engine"><button data-act="engine" data-e="eleven" class="${usesEleven(r) ? 'on' : ''}">ElevenLabs</button><button data-act="engine" data-e="device" class="${usesEleven(r) ? '' : 'on'}">Phone voice</button></span>` : ''}
        ${usesEleven(r)
          ? `<select data-k="elVoiceId">${el.voices.map((v) => `<option value="${esc(v.id)}" ${v.id === r.elVoiceId ? 'selected' : ''}>${esc(v.name)}${v.desc ? ' · ' + esc(v.desc) : ''}</option>`).join('')}</select>`
          : `<select data-k="voiceURI">${voiceOpts(r.voiceURI)}</select>`}
        <div class="row" style="margin-top:6px">
          <label>Speed<input type="range" data-k="rate" min="0.6" max="1.5" step="0.05" value="${r.rate}"></label>
          ${usesEleven(r) ? '' : `<label>Pitch<input type="range" data-k="pitch" min="0.6" max="1.5" step="0.05" value="${r.pitch}"></label>`}
        </div>
      </div>`;
    }).join('') : '<p class="hint">No other characters — it\'s a monologue. The reader stays quiet.</p>');
    renderElPanel();
    if (hasTTS && others.length && !elConnected() && !voices.some((v) => voiceScore(v) >= 40)) {
      $('#readerList').insertAdjacentHTML('beforeend', /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent)
        ? '<p class="hint tip">Tip: for much more natural reader voices, download free Enhanced or Premium voices — Settings → Accessibility → Spoken Content → Voices → English (try Ava, Zoe, Evan or Nathan). Then reopen Cue.</p>'
        : '<p class="hint tip">Tip: for more natural reader voices, install a high-quality voice in your phone\'s Text-to-speech settings (Settings → Accessibility → Text-to-speech), or use Chrome/Edge.</p>');
    }
    if (!hasTTS) $('#readerList').insertAdjacentHTML('afterbegin', '<p class="hint">This browser has no text-to-speech; reader lines will be shown and timed instead.</p>');
    save();
  }

  function readerChars() {
    let n = 0;
    state.lines.forEach((l) => { if (l.type === 'dialogue' && l.character !== state.me) n += spokenText(l.text).length; });
    return n;
  }

  function renderElPanel() {
    const p = $('#elPanel');
    if (!p) return;
    if (!elConnected()) {
      p.innerHTML = `<p class="hint">Use lifelike AI voices from your own <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener">ElevenLabs API key</a>. The key stays on this phone and is only sent to ElevenLabs.</p>
        <div class="row el-connect"><input id="elKey" type="password" placeholder="Paste API key" autocomplete="off" spellcheck="false"><button class="btn primary sm" data-act="el-connect">Connect</button></div>
        <p id="elMsg" class="hint"></p>`;
      return;
    }
    p.innerHTML = `<p class="hint ok">✓ Connected · ${el.voices.length} voices</p>
      <label class="field"><span>Voice model</span>
        <select data-act="el-model">
          <option value="quality" ${el.model === 'quality' ? 'selected' : ''}>Most expressive (Multilingual v2)</option>
          <option value="fast" ${el.model === 'fast' ? 'selected' : ''}>Fastest, half the credits (Flash v2.5)</option>
        </select></label>
      <p class="hint">This scene's reader lines ≈ ${readerChars().toLocaleString()} characters of credit, charged once — lines are saved on this phone and replay free.</p>
      <p id="elMsg" class="hint"></p>
      <div class="row"><button class="btn ghost sm" data-act="el-clear">Clear saved voice audio</button><button class="btn ghost sm" data-act="el-disconnect">Disconnect</button></div>`;
  }

  function alertEl(msg) {
    status(msg);
    const m = $('#elMsg');
    if (m) m.textContent = msg;
  }

  function renderRolePickers() {
    const opts = '<option value="">Choose your character…</option>' +
      state.characters.map((c) => `<option value="${esc(c)}" ${c === state.me ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#mySelect').innerHTML = opts;
    $('#stageRole').innerHTML = opts;
    const others = state.characters.filter((c) => c !== state.me);
    $('#stageReads').textContent = !state.me ? 'Pick your role to start.' : others.length ? `I'll read ${others.join(', ')}` : 'Monologue — no reader lines';
    $('#rehearseBtn').disabled = $('#recordBtn').disabled = !state.me || !!run;
  }

  function setMe(name) {
    if (run) return;
    state.me = name;
    state.startIndex = 0;
    renderCast();
    renderLines();
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
    ['advanceMode', 'silenceMs', 'sensitivity', 'matchWords', 'gapMs', 'countdown', 'myLineDisplay', 'mirror'].forEach((k) => {
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
      const who = l.type === 'dialogue' ? `<span class="who">${esc(l.character)}</span>${l.character === state.me ? '<span class="tag me">YOU</span>' : '<span class="tag">READER</span>'}` : '';
      return `<li class="${cls}" data-i="${i}">${who}${l.type === 'dialogue' ? `<div>${displayText(l)}</div>` : displayText(l)}</li>`;
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
    p.innerHTML = `<span class="who">${l.character === state.me ? 'You · ' : ''}${esc(l.character)}</span>${displayText(l)}`;
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

  // iOS keeps an AudioContext silent unless it is created/resumed inside a tap, so call this first thing in click handlers.
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state !== 'running') audioCtx.resume();
    } catch { /* no Web Audio */ }
  }

  function setupMeter(s) {
    try {
      unlockAudio();
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
  // Speech must clear both the sensitivity setting and the room's background noise.
  let noiseFloor = 0.005;
  const threshold = () => Math.max(0.2 * Math.pow(0.7, state.settings.sensitivity), noiseFloor * 2.5);
  function trackNoise(level) {
    if (run && run.readerSpeaking) return; // the reader's voice through the speaker isn't room noise
    if (level < noiseFloor) noiseFloor += (level - noiseFloor) * 0.1;
    else if (level < threshold()) noiseFloor += (level - noiseFloor) * 0.01;
    noiseFloor = Math.min(Math.max(noiseFloor, 0.001), 0.05);
  }

  let meterRunning = false;
  function meterLoop() {
    if (meterRunning) return;
    meterRunning = true;
    const bar = $('#meter i'), meter = $('#meter');
    const tick = () => {
      currentLevel = readLevel();
      trackNoise(currentLevel);
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

  async function speakLine(line, signal) {
    const text = spokenText(line.text);
    if (!text) return;
    const r = readerFor(line.character);
    if (usesEleven(r)) {
      try { return await speakEleven(line, signal); } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn(e);
        if (!elWarned) { elWarned = true; alertEl(e.message + ' Using the phone voice instead.'); }
      }
    }
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

  // ---------- ElevenLabs studio voices (optional, uses the actor's own API key) ----------
  const EL_KEY = 'cue:elevenlabs';
  const EL_API = 'https://api.elevenlabs.io';
  const EL_MODELS = { quality: 'eleven_multilingual_v2', fast: 'eleven_flash_v2_5' };
  const el = { apiKey: '', model: 'quality', voices: [] };
  try { Object.assign(el, JSON.parse(localStorage.getItem(EL_KEY) || '{}')); } catch { /* ignore */ }
  const elConnected = () => !!el.apiKey && el.voices.length > 0;
  function saveEl() { try { localStorage.setItem(EL_KEY, JSON.stringify(el)); } catch { /* ignore */ } }

  async function elError(res) {
    let msg = '';
    try { const j = await res.json(); msg = (j.detail && (j.detail.message || j.detail.status || j.detail)) || j.message || ''; } catch { /* not JSON */ }
    if (res.status === 401) return new Error('ElevenLabs rejected the API key' + (msg ? ` (${msg})` : '.'));
    if (res.status === 429) return new Error('ElevenLabs is busy or your plan limit was hit — try again shortly.');
    return new Error(`ElevenLabs error ${res.status}${msg ? ': ' + msg : ''}`);
  }

  async function elConnect(apiKey) {
    const res = await fetch(EL_API + '/v1/voices', { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) throw await elError(res);
    const data = await res.json();
    el.apiKey = apiKey;
    el.voices = (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      gender: /female|woman/i.test((v.labels && v.labels.gender) || '') ? 'f' : /male|man/i.test((v.labels && v.labels.gender) || '') ? 'm' : '',
      desc: [v.labels && v.labels.accent, v.labels && v.labels.age].filter(Boolean).join(', '),
    })).sort((a, b) => a.name.localeCompare(b.name));
    if (!el.voices.length) throw new Error('No voices found on this ElevenLabs account.');
    saveEl();
    // Switch every reader to a studio voice.
    Object.values(state.readers).forEach((r) => { r.engine = 'eleven'; });
  }

  function elDisconnect() {
    el.apiKey = ''; el.voices = [];
    saveEl();
    Object.values(state.readers).forEach((r) => { r.engine = 'device'; });
  }

  function bestElVoice(gender, exclude) {
    const pool = el.voices.filter((v) => !gender || v.gender === gender);
    return pool.find((v) => !exclude.has(v.id)) || pool[0] || el.voices[0] || null;
  }
  const usesEleven = (r) => elConnected() && r.engine !== 'device' && el.voices.some((v) => v.id === r.elVoiceId);

  // Generated lines are cached on the phone, so rehearsing the same scene again costs nothing.
  const elInflight = new Map();
  function elAudioFor(line) {
    const r = readerFor(line.character);
    const i = state.lines.indexOf(line);
    const prev = state.lines.slice(0, i).reverse().find((l) => l.type === 'dialogue');
    const text = spokenText(line.text);
    const speed = Math.min(1.2, Math.max(0.7, r.rate));
    const model = EL_MODELS[el.model] || EL_MODELS.quality;
    const key = [model, r.elVoiceId, speed, prev ? spokenText(prev.text) : '', text].join('|');
    if (elInflight.has(key)) return elInflight.get(key);
    const p = (async () => {
      const cached = await cacheGet(key);
      if (cached) return cached;
      const res = await fetch(`${EL_API}/v1/text-to-speech/${encodeURIComponent(r.elVoiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': el.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: model,
          previous_text: prev ? spokenText(prev.text) : undefined,
          voice_settings: { stability: 0.4, similarity_boost: 0.75, use_speaker_boost: true, speed },
        }),
      });
      if (!res.ok) throw await elError(res);
      const blob = await res.blob();
      cachePut(key, blob);
      return blob;
    })();
    elInflight.set(key, p);
    p.catch(() => elInflight.delete(key));
    return p;
  }

  // Fetch upcoming reader lines in the background so there's no pause before each cue.
  async function prefetchEleven(from, signal) {
    for (let i = from; i < state.lines.length && !signal.aborted; i++) {
      const l = state.lines[i];
      if (l.type !== 'dialogue' || l.character === state.me || !spokenText(l.text) || !usesEleven(readerFor(l.character))) continue;
      try { await elAudioFor(l); } catch { return; }
    }
  }

  // One shared <audio>: iOS only lets an element play after a tap has "unlocked" it.
  const player = new Audio();
  player.setAttribute('playsinline', '');
  const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABAAAAlgAenp6enp6enp6enp6enp6enp6enp6enp6pqampqampqampqampqampqampqampqamptPT09PT09PT09PT09PT09PT09PT09PT09P/////////////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCcQAAAAAAAAJY+/rsqgAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  function unlockPlayer() {
    if (!elConnected()) return;
    try { player.src = SILENT; player.play().catch(() => {}); } catch { /* ignore */ }
  }

  let elWarned = false;
  async function speakEleven(line, signal) {
    let blob = null, err = null;
    status(`${line.character} is reading…`);
    await step(signal, (done) => { elAudioFor(line).then((b) => { blob = b; done(); }, (e) => { err = e; done(); }); });
    if (err) throw err;
    if (!blob) return; // skipped with Next while loading
    await step(signal, (done, onClean) => {
      const url = URL.createObjectURL(blob);
      onClean(() => { player.onended = player.onerror = null; player.pause(); URL.revokeObjectURL(url); });
      player.onended = () => done();
      player.onerror = () => done();
      player.src = url;
      player.play().catch(() => done());
    });
  }

  // ---------- following the actor's words ----------
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let speechRecBroken = false; // set after a permission/network failure so we stop retrying every line

  const toWords = (s) => spokenText(s).toLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

  function similar(a, b) {
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))) return true;
    return false;
  }

  // How far through the expected line the heard words have got, matching in order and tolerating skipped words.
  function lineProgress(expected, heard) {
    let pos = 0, matched = 0, last = -1;
    for (const w of heard) {
      for (let j = pos; j < Math.min(expected.length, pos + 4); j++) {
        if (similar(expected[j], w)) { matched++; last = j; pos = j + 1; break; }
      }
    }
    const n = expected.length || 1;
    return { ratio: matched / n, matched, atEnd: last >= n - Math.min(2, n) };
  }

  function startListening(onWords) {
    const m = state.settings.matchWords;
    // Recognition can take the mic away from the recorder on some phones, so by default it's rehearsal-only.
    if (!SpeechRec || speechRecBroken || m === 'off' || (m !== 'always' && run && run.recording)) return null;
    let stopped = false, finalText = '';
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += ' ' + e.results[i][0].transcript;
        else interim += ' ' + e.results[i][0].transcript;
      }
      onWords(toWords(finalText + ' ' + interim));
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'network') speechRecBroken = true;
    };
    rec.onend = () => { if (!stopped && !speechRecBroken) { try { rec.start(); } catch { /* already restarting */ } } };
    try { rec.start(); } catch { return null; }
    return () => { stopped = true; try { rec.abort(); } catch { /* ignore */ } };
  }

  function waitForMe(line, signal) {
    const mode = state.settings.advanceMode;
    if (mode === 'timed') return sleep(1200 + wordCount(line.text) * 420, signal);
    if (mode !== 'voice') return step(signal, () => {}); // manual: only Next advances

    const expected = toWords(line.text);
    return step(signal, (done, onClean) => {
      const start = performance.now();
      let voicedMs = 0, lastVoice = 0, prev = start;
      let progress = { ratio: 0, matched: 0, atEnd: false }, lastHeard = 0;
      const stopListening = startListening((heard) => {
        progress = lineProgress(expected, heard);
        lastHeard = performance.now();
        status(`Listening… ${progress.matched}/${expected.length} words`);
      });
      if (stopListening) onClean(stopListening);
      status(stopListening ? 'Listening for your line…' : (analyser ? 'Your line — I\'ll cue when you finish.' : 'Your line — press Space when done.'));

      const iv = setInterval(() => {
        const now = performance.now();
        const dt = now - prev; prev = now;
        if (now - start < 300) return; // ignore the tail of the reader's audio
        const hasMic = !!analyser;
        if (hasMic && readLevel() > threshold()) { voicedMs += dt; lastVoice = now; }
        const quietFor = hasMic && voicedMs > 250 ? now - lastVoice : 0;
        const following = stopListening && !speechRecBroken && lastHeard > 0;

        if (following && progress.atEnd && progress.ratio >= 0.5) {
          // Reached the last words: cue once they stop talking.
          if (!hasMic ? now - lastHeard > 700 : quietFor > Math.min(state.settings.silenceMs, 600)) done();
        } else if (following) {
          // Mid-line pause: only cue on a long silence, in case recognition missed the ending.
          if (quietFor > Math.max(state.settings.silenceMs * 2.5, 2500)) done();
        } else if (quietFor > state.settings.silenceMs) {
          done(); // no recognition available: fall back to silence detection
        }
      }, 40);
      onClean(() => clearInterval(iv));
    });
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
    $('#rehearseBtn').disabled = $('#recordBtn').disabled = on || !state.me;
    $('#stageRole').disabled = on;
    $('#nextBtn').disabled = !on;
    $('#stopBtn').disabled = !on;
    $$('.tab').forEach((t) => { if (t.dataset.view !== 'stage') t.disabled = on && record; });
  }
  const status = (msg) => { $('#status').textContent = msg || ''; };

  async function runScene(record) {
    if (run || !state.lines.length || !state.me) return;
    // iOS only lets speech start from a user gesture: prime the engine before any await.
    if (hasTTS) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    unlockAudio();
    unlockPlayer();
    const ac = new AbortController();
    run = { ac, skip: null, recording: record };
    setRunning(true, record);
    let recorder = null;
    try {
      if (elConnected()) prefetchEleven(state.startIndex, ac.signal);
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
          if (state.settings.advanceMode !== 'voice') status('Your line — press Space when done.');
          await waitForMe(l, ac.signal);
        } else {
          status(`${l.character} is reading…`);
          run.readerSpeaking = true;
          try { await speakLine(l, ac.signal); } finally { if (run) run.readerSpeaking = false; }
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
        const req = indexedDB.open('cue-takes', 2);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('takes')) d.createObjectStore('takes', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('tts')) d.createObjectStore('tts', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }
  async function tx(mode, fn, store = 'takes') {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }
  async function cacheGet(key) {
    try { const row = await tx('readonly', (s) => s.get(key), 'tts'); return row ? row.blob : null; } catch { return null; }
  }
  function cachePut(key, blob) {
    tx('readwrite', (s) => s.put({ key, blob, created: Date.now() }), 'tts').catch(() => {});
  }
  function cacheClear() { return tx('readwrite', (s) => s.clear(), 'tts').catch(() => {}); }

  const memTakes = []; // fallback if IndexedDB is unavailable (e.g. some private windows)

  async function allTakes() {
    try { return (await tx('readonly', (s) => s.getAll())).sort((a, b) => b.created - a.created); }
    catch { return memTakes.slice().sort((a, b) => b.created - a.created); }
  }
  async function saveTake(blob, duration, name) {
    const n = (await allTakes()).length + 1;
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    const take = { id, name: name || `${state.me || 'Take'} — Take ${n}`, created: Date.now(), duration, mime: blob.type, blob };
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
  let renderSeq = 0;
  async function renderTakes() {
    const seq = ++renderSeq;
    const takes = await allTakes();
    if (seq !== renderSeq) return; // a newer render is on its way
    $$('#takesGrid video').forEach((v) => { v.removeAttribute('src'); v.load(); });
    takeUrls.forEach((u) => URL.revokeObjectURL(u));
    takeUrls = [];
    $('#takeCount').textContent = takes.length;
    $('#takesEmpty').hidden = takes.length > 0;
    $('#takesGrid').innerHTML = takes.map((t) => {
      const url = URL.createObjectURL(t.blob);
      takeUrls.push(url);
      const mime = t.mime || '';
      const ext = mime.includes('mp4') ? 'mp4' : mime.includes('quicktime') ? 'mov' : mime.includes('webm') ? 'webm' : (t.ext || 'mp4');
      const file = t.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.' + ext;
      return `<div class="card take" data-id="${t.id}">
        <video src="${url}" controls playsinline preload="metadata"></video>
        <div class="meta"><div style="flex:1;min-width:0"><input value="${esc(t.name)}" aria-label="Take name"><small>${new Date(t.created).toLocaleString()}${t.duration ? ' · ' + fmtDur(t.duration) : ''}</small></div></div>
        <div class="acts"><a class="btn primary sm" href="${url}" download="${esc(file)}">⬇ Download</a><button class="btn ghost sm" data-act="del">Delete</button></div>
      </div>`;
    }).join('');
  }

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }


  // ---------- imports from the camera roll ----------
  function videoDuration(blob) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(blob);
      const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
      v.preload = 'metadata';
      v.onloadedmetadata = () => done(v.duration);
      v.onerror = () => done(0);
      setTimeout(() => done(0), 8000);
      v.src = url;
    });
  }

  async function importVideos(files) {
    const st = $('#importStatus');
    let k = 0;
    for (const f of files) {
      st.textContent = `Importing ${++k} of ${files.length}…`;
      const duration = await videoDuration(f);
      const name = f.name.replace(/\.[^.]+$/, '') || 'Imported take';
      await saveTake(f, duration, name);
    }
    st.textContent = files.length ? `Imported ${files.length} video${files.length > 1 ? 's' : ''}.` : '';
  }

  let ocrWorker = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  async function getOcrWorker(onProgress) {
    if (ocrWorker) return ocrWorker;
    const base = new URL('vendor/tesseract/', location.href).href;
    if (!window.Tesseract) await loadScript(base + 'tesseract.min.js');
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base,
      logger: (m) => onProgress && onProgress(m),
    });
    return ocrWorker;
  }

  // Undo the common ways OCR mangles screenplay pages.
  function cleanOcr(text) {
    const lines = text
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .split('\n').map((l) => l.trim())
      .filter((l) => !/^\d+\.?$/.test(l)); // page numbers
    // OCR loses screenplay indentation and adds blank lines after character names:
    // put each name on a fresh block, directly above its dialogue.
    const out = [];
    let afterCue = false;
    for (const l of lines) {
      if (!l) { if (!afterCue) out.push(''); continue; }
      const cueLike = l.length <= 40 && /[A-Z]/.test(l) && l === l.toUpperCase() && !SCENE_HEADING.test(l) && !l.endsWith(':') && !/[.!?]$/.test(normName(l));
      if (cueLike && out.length && out[out.length - 1] !== '') out.push('');
      out.push(l);
      afterCue = cueLike;
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function importPhotos(files) {
    const st = $('#ocrStatus');
    st.hidden = false;
    const pages = [];
    try {
      let k = 0;
      for (const f of files) {
        k++;
        st.textContent = `Reading page ${k} of ${files.length}…`;
        const w = await getOcrWorker((m) => {
          if (m.status === 'recognizing text') st.textContent = `Reading page ${k} of ${files.length}… ${Math.round(m.progress * 100)}%`;
          else if (!ocrWorker) st.textContent = 'Loading text reader (first time only)…';
        });
        const { data } = await w.recognize(f);
        pages.push(cleanOcr(data.text));
      }
      const text = pages.join('\n\n');
      const box = $('#scriptInput');
      const existing = box.value.trim();
      const replace = !existing || existing === SAMPLE.trim() || confirm('Replace the current script? (Cancel adds the photos to the end.)');
      box.value = replace ? text : existing + '\n\n' + text;
      onScriptChange();
      st.textContent = `Read ${files.length} page${files.length > 1 ? 's' : ''}. Check the text and fix any typos before taping.`;
    } catch (err) {
      console.error(err);
      st.textContent = 'Could not read that image: ' + (err.message || err);
    }
  }

  // ---------- wiring ----------
  function showView(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'takes') renderTakes();
  }

  function init() {
    // Ask the browser not to evict saved scripts and takes under storage pressure.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
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
    $('#photoInput').addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) importPhotos(files);
    });
    $('#videoInput').addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) importVideos(files);
    });
    $('#mySelect').addEventListener('change', (e) => setMe(e.target.value));
    $('#stageRole').addEventListener('change', (e) => setMe(e.target.value));

    $('#readerList').addEventListener('input', (e) => {
      const box = e.target.closest('.reader');
      if (!box || !e.target.dataset.k) return;
      const r = readerFor(box.dataset.char);
      r[e.target.dataset.k] = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
      save();
    });
    $('#readerList').addEventListener('click', (e) => {
      if (e.target.dataset.act === 'engine') {
        readerFor(e.target.closest('.reader').dataset.char).engine = e.target.dataset.e;
        renderCast();
        return;
      }
      if (e.target.dataset.act === 'gender') {
        const r = readerFor(e.target.closest('.reader').dataset.char);
        r.gender = e.target.dataset.g;
        r.voiceURI = r.elVoiceId = ''; // let autoAssignVoices pick the best unused voice of that type
        renderCast();
        return;
      }
      if (e.target.dataset.act !== 'test') return;
      unlockPlayer();
      const name = e.target.closest('.reader').dataset.char;
      const line = state.lines.find((l) => l.character === name) || { character: name, text: 'Hi, I\'ll be reading with you today.' };
      if (!hasTTS || run) return;
      const tmp = { ac: new AbortController(), skip: null };
      const prev = run; run = tmp;
      speakLine(line, tmp.ac.signal).catch(() => {}).finally(() => { if (run === tmp) run = prev; });
    });

    $('#elPanel').addEventListener('click', async (e) => {
      const act = e.target.dataset.act;
      if (act === 'el-connect') {
        const key = $('#elKey').value.trim();
        if (!key) return;
        e.target.disabled = true;
        alertEl('Connecting…');
        try { await elConnect(key); renderCast(); alertEl(''); }
        catch (err) { alertEl(err.message || String(err)); e.target.disabled = false; }
      } else if (act === 'el-disconnect') {
        if (confirm('Disconnect ElevenLabs and remove the API key from this phone?')) { elDisconnect(); renderCast(); }
      } else if (act === 'el-clear') {
        await cacheClear();
        alertEl('Saved voice audio cleared.');
      }
    });
    $('#elPanel').addEventListener('change', (e) => {
      if (e.target.dataset.act === 'el-model') { el.model = e.target.value; saveEl(); }
    });
    $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $('#toStage').addEventListener('click', () => showView('stage'));

    $('#enableCam').addEventListener('click', async () => {
      unlockAudio();
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
