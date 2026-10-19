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
    aliases: {},
    nameInfo: { counts: {}, auto: {}, resolve: (n) => n },
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
        state.aliases = saved.aliases || {};
        Object.assign(state.settings, saved.settings || {});
        if (typeof state.settings.matchWords !== 'string') state.settings.matchWords = 'rehearse';
      }
    } catch { /* storage unavailable: start fresh */ }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        script: state.script, me: state.me, readers: state.readers, aliases: state.aliases, settings: state.settings,
      }));
    } catch { /* ignore */ }
  }

  // ---------- script parsing ----------
  const SCENE_HEADING = /^(INT|EXT|INT\.?\/EXT|I\/E)[.\s]/i;
  const TRANSITION = /(TO:|^FADE (IN|OUT)|^CUT TO|^DISSOLVE|^THE END)/;

  // Screenplay extensions that follow a character name and aren't part of it.
  const NAME_EXT = /\b(CONT'?D|CONTD|CONT|CONTINUING|CONTINUED|V\s*\.?\s*O|O\s*\.?\s*S|O\s*\.?\s*C|PRE-?LAP|ON PHONE|INTO PHONE|ON SCREEN|ON TV|ON RADIO|FILTERED|SUBTITLED|OFF|OS|VO)\b\.?/g;
  // All-caps lines that are page furniture or directions, never a character.
  const NOT_CUE = /^(MORE|CONTINUED|CONTINUOUS|THE END|END|END OF SCENE|END SCENE|SIDES|SCENE|SCENES|PAGE|PAGES|INTERCUT|INTERCUT WITH|MONTAGE|END MONTAGE|SERIES OF SHOTS|BACK TO SCENE|BACK TO|LATER|MOMENTS LATER|FLASHBACK|END FLASHBACK|TITLE|TITLE CARD|SUPER|BLACK|BLACKOUT|BLACK SCREEN|FADE|FADE IN|FADE OUT|FADE TO BLACK|CUT|CUT TO|CUT TO BLACK|SMASH CUT|MATCH CUT|DISSOLVE|OMITTED|START|BEAT|PAUSE|SILENCE|NOTE|SOUND|SFX|ANGLE ON|CLOSE ON|CLOSE UP|POV|INSERT|WIDE|ESTABLISHING|DAY|NIGHT|MORNING|EVENING|TOP OF SCENE|DRAFT|REVISED|REVISIONS|FINAL DRAFT|SHOOTING SCRIPT)$/;

  function normName(s) {
    return s.toUpperCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/\([^)]*\)?/g, ' ').replace(/\[[^\]]*\]?/g, ' ') // (V.O.), (CONT'D), even if OCR lost the ")"
      .replace(NAME_EXT, ' ')
      .replace(/^\s*\d+[A-Z]?\.?\s+/, '').replace(/\s+\d+[A-Z]?\.?\s*$/, '') // scene numbers either side
      .replace(/[^A-Z0-9#'&\- ]/g, ' ') // stray OCR marks: . : * " |
      .replace(/\s+/g, ' ').trim()
      .replace(/^['\-]+|['\-]+$/g, '')
      .replace(/^(.{3,}?)(\s+[A-Z]{1,2})+$/, '$1'); // "ADONIS D" from a mangled (CONT'D)
  }
  // Markdown / rich-text leftovers around names: **ADONIS**, _ADONIS_, "ADONIS"
  const unwrap = (t) => t.replace(/\*\*|__/g, '').replace(/^[*_"'`~\s]+|[*_"'`~\s]+$/g, '').trim();
  function isBracketed(t) {
    return /^\(.*\)$/.test(t) || /^\[.*\]$/.test(t);
  }
  function isCue(t, next) {
    if (!next || !next.trim()) return false;
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (t.length > 40 || !letters) return false;
    // Mostly capitals (allows an OCR slip like "ADONlS").
    if (letters.replace(/[^A-Z]/g, '').length / letters.length < 0.8) return false;
    if (SCENE_HEADING.test(t) || TRANSITION.test(t)) return false;
    const bare = t.replace(/\([^)]*\)?/g, '').trim();
    if (/[!?,;]$/.test(bare)) return false; // shouted action like "BANG!"
    if (/\.$/.test(bare) && !/\b(V\.?O|O\.?S|O\.?C|CONT'?D)\.$/i.test(bare)) return false;
    if (/\d+\/\d+/.test(t)) return false; // revision dates in page headers
    const name = normName(t);
    return !!name && name.split(' ').length <= 4 && /[A-Z]/.test(name) && !NOT_CUE.test(name);
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  // Suggest folding misspelt/variant names (OCR typos, "ADONIS JR" leftovers) into the main spelling.
  // OCR swaps letters for look-alike digits inside words (ADON1S, R0SE); COP 1 keeps its number.
  const defuzz = (s) => s.replace(/[A-Z]+[0158]+[A-Z]*|[A-Z]*[0158]+[A-Z]+/g, (w) => w.replace(/[0158]/g, (d) => ({ 0: 'O', 1: 'I', 5: 'S', 8: 'B' }[d])));
  function autoMerges(counts) {
    const names = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
    const map = {};
    names.forEach((n0, i) => {
      const n = defuzz(n0);
      for (const m0 of names.slice(0, i)) {
        const m = defuzz(m0);
        if (map[m0] || counts[m0] < counts[n0]) continue;
        const digits = (s) => s.replace(/\D/g, '');
        const trailingNum = n.match(/^(.+?)\s+\d{1,2}$/);
        if (trailingNum && trailingNum[1] === m && !names.some((o) => o !== n0 && new RegExp('^' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+#?\\d{1,2}$').test(defuzz(o)))) { map[n0] = m0; break; } // "ADONIS 3" = margin junk, not a second Adonis
        if (digits(n) !== digits(m)) continue; // COP 1 vs COP 2 are different people
        const close = n.length >= 4 && editDistance(n, m) <= (n.length >= 7 ? 2 : 1) && counts[n0] <= Math.max(2, counts[m0] / 3);
        const compact = n.replace(/[^A-Z0-9]/g, '') === m.replace(/[^A-Z0-9]/g, ''); // "O BRIEN" vs "O'BRIEN"
        if (close || compact) { map[n0] = m0; break; }
      }
    });
    return map;
  }

  // Short, unpunctuated lines that repeat (in any case) with text under them are character names too —
  // this catches sides typed as "Adonis" / "Keisha" instead of screenplay capitals.
  function repeatedNames(raw) {
    const counts = {};
    for (let i = 0; i < raw.length; i++) {
      const t = unwrap(raw[i]);
      const next = raw[i + 1];
      if (!t || !next || !next.trim() || t.length > 30 || /[.!?,;:]$/.test(t)) continue;
      const words = t.split(/\s+/);
      if (words.length > 3 || !words.every((w) => /^[A-Za-z][A-Za-z'\-.]*$/.test(w) || /^#?\d+$/.test(w))) continue;
      if (!/^[A-Z]/.test(t) || SCENE_HEADING.test(t) || TRANSITION.test(t) || NOT_CUE.test(normName(t))) continue;
      const n = normName(t);
      if (n) counts[n] = (counts[n] || 0) + 1;
    }
    // "KEISHA And I told you" — a capitals prefix that starts several lines is a name too.
    const inline = {};
    for (const line of raw) {
      const m = unwrap(line).match(/^([A-Z][A-Z0-9#'.\-]*(?: [A-Z][A-Z0-9#'.\-]*){0,2})(?:\s*\([^)]*\))?[:.\-–—]?\s+(?=[A-Za-z("'“])(.*)$/);
      if (!m || m[2] === m[2].toUpperCase() || SCENE_HEADING.test(line) || TRANSITION.test(line)) continue;
      const n = normName(m[1]);
      if (n && !NOT_CUE.test(n) && !/^(I|A|OK|NO|YES|HEY|OH|GOD|SIR|MA'AM|MOM|DAD)$/.test(n)) inline[n] = (inline[n] || 0) + 1;
    }
    Object.keys(inline).forEach((n) => { if (inline[n] >= 2 || counts[n]) counts[n] = (counts[n] || 0) + inline[n]; });
    return new Set(Object.keys(counts).filter((n) => counts[n] >= 2));
  }

  function parseScript(text) {
    const raw = text.replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
    const out = [];
    let speaker = null;
    const known = repeatedNames(raw);
    // Names found in the first pass also start dialogue on the same line: "ADONIS I told you not to come."
    const inlineName = (t) => {
      const m = t.match(/^([A-Z][A-Z0-9#'.\- ]{1,30}?)(?:\s*\([^)]*\))?[:.\-–—]?\s+(?=[A-Za-z(\"'“])(.*)$/);
      if (!m) return null;
      const name = normName(m[1]);
      return name && (known.has(name) || knownCaps.has(name)) && m[2] && m[2] !== m[2].toUpperCase() ? { name, text: m[2] } : null;
    };
    const knownCaps = new Set();
    for (let i = 0; i < raw.length; i++) {
      const t = unwrap(raw[i]);
      if (t && isCue(t, raw[i + 1])) knownCaps.add(normName(t));
    }
    let gap = false;
    for (let i = 0; i < raw.length; i++) {
      const t = unwrap(raw[i]).replace(/(\s+[^A-Za-z0-9#\s.,;:!?'"()\-–—…]\S{0,2})+$/, '').trim(); // "£7", "*" margin junk
      if (!t) { gap = true; continue; }
      // A blank line only ends a speech if what follows looks like a new block, not a wrapped continuation.
      if (gap) { if (!(speaker && (/^[a-z(]/.test(t) || (out.length && out[out.length - 1].type === 'dialogue' && /[,;:\-–—]$/.test(out[out.length - 1].text))))) speaker = null; gap = false; }
      // Page-break furniture: skip it without ending the current speech.
      if (/^\(?\s*(MORE|CONTINUED|CONT'?D|CONTINUED\s*\(\d+\))\s*:?\s*\)?$/i.test(t.replace(/[’‘]/g, "'"))) continue;
      if (/\d+\/\d+(\/\d+)?/.test(t) && /\b(rev\.?|revised|revision|draft|pink|blue|yellow|green|goldenrod|white|salmon|cherry|buff|tan)\b/i.test(t)) continue;

      const m = t.match(/^([A-Za-z][A-Za-z0-9 #.'\-]{0,30}?)\s*(\([^)]*\))?\s*:\s*(.+)$/);
      if (m && !SCENE_HEADING.test(t) && !TRANSITION.test(t) && !NOT_CUE.test(normName(m[1])) && m[1].split(/\s+/).length <= 3) {
        speaker = normName(m[1]);
        out.push({ type: 'dialogue', character: speaker, text: (m[2] ? m[2] + ' ' : '') + m[3] });
        continue;
      }
      if (isCue(t, raw[i + 1])) { speaker = normName(t); continue; }
      if ((known.has(normName(t)) || (/^[A-Z][A-Z0-9#' ]{1,30}[.:]$/.test(t) && knownCaps.has(normName(t)))) && raw[i + 1] && raw[i + 1].trim() && !/[a-z]/.test(t.replace(/\(.*$/, '')) === (t === t.toUpperCase()) && t.split(/\s+/).length <= 4 && !/[!?,;]$/.test(t)) { speaker = normName(t); continue; }
      const inl = inlineName(t);
      if (inl) {
        speaker = inl.name;
        out.push({ type: 'dialogue', character: speaker, text: inl.text, fromCue: true });
        continue;
      }

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

  const spokenText = (s) => s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/(^|\s)[£©®§¤¢¥€*=|~^@]+\S{0,2}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
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
    const used = new Set(), usedStudio = new Set();
    state.characters.filter((c) => c !== state.me).forEach((c, k) => {
      const r = readerFor(c);
      if (!r.gender) r.gender = k % 2 ? 'm' : 'f';
      const current = voices.find((v) => v.voiceURI === r.voiceURI);
      if (!current || used.has(current.voiceURI)) {
        const v = bestVoice(r.gender, used);
        r.voiceURI = v ? v.voiceURI : '';
      }
      used.add(r.voiceURI);
      if (!STUDIO_VOICES.some((v) => v.id === r.studioVoice) || usedStudio.has(r.studioVoice)) {
        // Prefer an unused voice of the right gender, alternating US/UK accents across the cast.
        const pool = STUDIO_VOICES.filter((v) => v.gender === r.gender);
        const v = pool.find((x) => !usedStudio.has(x.id)) || pool[k % pool.length];
        r.studioVoice = v.id;
      }
      usedStudio.add(r.studioVoice);
    });
  }

  // ---------- cast / settings UI ----------
  function onScriptChange() {
    state.script = $('#scriptInput').value;
    const parsed = parseScript(state.script);
    const counts = {};
    parsed.forEach((l) => { if (l.type === 'dialogue') counts[l.character] = (counts[l.character] || 0) + 1; });
    const auto = autoMerges(counts);
    const resolve = (n) => {
      const user = state.aliases[n];
      const to = user === undefined ? (auto[n] || n) : user;
      return to === n || to === 'action' || !counts[to] ? to : (state.aliases[to] === 'action' ? 'action' : to);
    };
    state.nameInfo = { counts, auto, resolve };
    state.lines = parsed.map((l) => {
      if (l.type !== 'dialogue') return l;
      const to = resolve(l.character);
      return to === 'action' ? { type: 'action', text: l.text } : Object.assign({}, l, { character: to });
    });
    // Merge back-to-back speeches that now belong to the same character.
    state.lines = state.lines.reduce((acc, l) => {
      const prev = acc[acc.length - 1];
      if (prev && l.type === 'dialogue' && prev.type === 'dialogue' && prev.character === l.character && l.fromCue && prev.fromCue) prev.text += ' ' + l.text;
      else acc.push(l);
      return acc;
    }, []);
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
    $('#toStage').textContent = state.me ? `Start the scene as ${state.me} →` : 'Choose who you\'re playing';
    renderRolePickers();
    renderNameFixer();
    renderStudioPanel();
    renderVoiceBanner();
    renderDiag();
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
        ${studio.downloaded && studioSupported ? `<span class="seg engine"><button data-act="engine" data-e="studio" class="${usesStudio(r) ? 'on' : ''}">Studio voice</button><button data-act="engine" data-e="device" class="${usesStudio(r) ? '' : 'on'}">Phone voice</button></span>` : ''}
        ${usesStudio(r)
          ? `<select data-k="studioVoice">${STUDIO_VOICES.map((v) => `<option value="${v.id}" ${v.id === r.studioVoice ? 'selected' : ''}>${v.name} · ${v.accent} ${v.gender === 'f' ? 'female' : 'male'}</option>`).join('')}</select>`
          : `<select data-k="voiceURI">${voiceOpts(r.voiceURI)}</select>`}
        <div class="row" style="margin-top:6px">
          <label>Speed<input type="range" data-k="rate" min="0.6" max="1.5" step="0.05" value="${r.rate}"></label>
          ${usesStudio(r) ? '' : `<label>Pitch<input type="range" data-k="pitch" min="0.6" max="1.5" step="0.05" value="${r.pitch}"></label>`}
        </div>
      </div>`;
    }).join('') : '<p class="hint">No other characters — it\'s a monologue. The reader stays quiet.</p>');
    if (hasTTS && others.length && !studio.downloaded && !voices.some((v) => voiceScore(v) >= 40)) {
      $('#readerList').insertAdjacentHTML('beforeend', /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent)
        ? '<p class="hint tip">Tip: for much more natural reader voices, download free Enhanced or Premium voices — Settings → Accessibility → Spoken Content → Voices → English (try Ava, Zoe, Evan or Nathan). Then reopen Cue.</p>'
        : '<p class="hint tip">Tip: for more natural reader voices, install a high-quality voice in your phone\'s Text-to-speech settings (Settings → Accessibility → Text-to-speech), or use Chrome/Edge.</p>');
    }
    if (!hasTTS) $('#readerList').insertAdjacentHTML('afterbegin', '<p class="hint">This browser has no text-to-speech; reader lines will be shown and timed instead.</p>');
    save();
  }

  function qualityPicker() {
    const gpu = typeof navigator !== 'undefined' && !!navigator.gpu;
    return `<label class="field"><span>Quality</span>
      <select data-act="studio-quality">
        <option value="standard" ${studio.quality !== 'best' ? 'selected' : ''}>Standard — compact model, ~115 MB, any phone</option>
        <option value="best" ${studio.quality === 'best' ? 'selected' : ''}>Best — full model on the GPU, ~330 MB${gpu ? ', newer phones only' : ' (no GPU access in this browser)'}</option>
      </select></label>`;
  }

  function renderStudioPanel() {
    const p = $('#studioPanel');
    if (!p) return;
    if (!studioSupported) {
      p.innerHTML = '<p class="hint">Studio voices need a newer browser. Your phone\'s built-in voices are used instead.</p>';
      return;
    }
    const pct = Math.round(studio.progress * 100);
    const voicesList = STUDIO_VOICES.map((v) => `<span class="vchip">${v.name} <small>${v.accent} ${v.gender === 'f' ? 'F' : 'M'}</small></span>`).join('');
    let body;
    if (studio.status === 'loading') {
      body = `<p class="hint">${studio.downloaded ? 'Starting studio voices…' : `Downloading studio voices… ${pct}%`}</p><div class="bar"><i style="width:${studio.downloaded ? 100 : pct}%"></i></div>`;
    } else if (studio.status === 'error') {
      body = `<p class="hint err">Couldn't load studio voices: ${esc(studio.error)}</p><button class="btn primary sm" data-act="studio-load">Try again</button>`;
    } else if (studio.downloaded) {
      const running = studio.device === 'webgpu' ? 'full-quality model on the GPU' : studio.device === 'wasm' ? 'compact model on the CPU' : '';
      body = `<p class="hint ok">✓ Studio voices on this phone${studioReady() ? (running ? ' · ' + running : '') : ' (they start when you rehearse)'}</p>
        ${studio.note ? `<p class="hint">${esc(studio.note)}</p>` : ''}
        ${qualityPicker()}
        <div class="row"><button class="btn ghost sm" data-act="studio-test">▶ Test a line</button><button class="btn ghost sm" data-act="studio-clear">Clear saved lines</button></div>`;
    } else {
      body = `<p class="hint">Natural, human-sounding reader voices that run on your phone — free, no account, nothing leaves the phone. One-time download (use Wi-Fi), then they work offline.</p>
        ${qualityPicker()}
        <button class="btn primary sm" data-act="studio-load">Download studio voices</button>`;
    }
    p.innerHTML = `<div class="vchips">${voicesList}</div>${body}<p id="studioMsg" class="hint"></p>`;
  }

  function renderNameFixer() {
    const box = $('#nameFix');
    if (!box) return;
    const { counts, auto } = state.nameInfo;
    const names = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
    $('#castSummary').textContent = state.characters.length
      ? `Found ${state.characters.length} character${state.characters.length > 1 ? 's' : ''}: ${state.characters.map((c) => `${c} (${state.lines.filter((l) => l.character === c).length})`).join(', ')}`
      : '';
    box.innerHTML = names.map((n) => {
      const cur = state.aliases[n] === undefined ? (auto[n] || n) : state.aliases[n];
      const targets = names.filter((m) => m !== n);
      return `<div class="fixrow" data-name="${esc(n)}"><span>${esc(n)} <small>${counts[n]} line${counts[n] > 1 ? 's' : ''}</small></span>
        <select data-act="alias">
          <option value="${esc(n)}" ${cur === n ? 'selected' : ''}>Character</option>
          ${targets.map((m) => `<option value="${esc(m)}" ${cur === m ? 'selected' : ''}>Same as ${esc(m)}${auto[n] === m && state.aliases[n] === undefined ? ' (auto)' : ''}</option>`).join('')}
          <option value="action" ${cur === 'action' ? 'selected' : ''}>Not a character</option>
        </select></div>`;
    }).join('');
  }

  function diagnostics() {
    const others = state.characters.filter((c) => c !== state.me);
    return [
      `Cue ${APP_VERSION} · ${new Date().toISOString()}`,
      `Browser: ${navigator.userAgent}`,
      `Standalone (home screen): ${window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true}`,
      `Workers/WASM: ${studioSupported} · SharedArrayBuffer: ${typeof SharedArrayBuffer !== 'undefined'} · isolated: ${!!window.crossOriginIsolated} · memory: ${navigator.deviceMemory || '?'}GB`,
      `Studio voices: downloaded=${studio.downloaded} status=${studio.status} progress=${Math.round(studio.progress * 100)}%${studio.error ? ' error=' + studio.error : ''}`,
      `Phone voices: ${voices.length} (${voices.slice(0, 6).map((v) => v.name).join(', ')}${voices.length > 6 ? '…' : ''})`,
      `Speech recognition: ${!!SpeechRec}${speechRecBroken ? ' (failed)' : ''} · mic meter: ${!!analyser}`,
      `Playing: ${state.me || '(none)'} · readers: ${others.map((c) => { const r = readerFor(c); return `${c}=${usesStudio(r) ? 'studio:' + r.studioVoice : 'phone:' + (r.voiceURI || 'default')}`; }).join(', ') || '(none)'}`,
      `Characters found: ${Object.entries(state.nameInfo.counts).map(([n, k]) => `${n}(${k})`).join(', ')}`,
      `Settings: ${JSON.stringify(state.settings)}`,
      `Last error: ${lastError || '(none)'}`,
    ].join('\n');
  }
  let lastError = '';
  window.addEventListener('error', (e) => { lastError = String(e.message || e.error); renderDiag(); });
  window.addEventListener('unhandledrejection', (e) => { lastError = String((e.reason && e.reason.message) || e.reason); renderDiag(); });
  function renderDiag() {
    const el = $('#diagOut');
    if (el) el.textContent = diagnostics();
  }

  function renderVoiceBanner() {
    const b = $('#voiceBanner');
    if (!b) return;
    const others = state.characters.filter((c) => c !== state.me);
    const phoneReaders = others.filter((c) => !usesStudio(readerFor(c)));
    let msg = '';
    if (!studioSupported) msg = 'This browser can\'t run studio voices — the phone voice is reading.';
    else if (studio.status === 'error') msg = `Studio voices failed to load (${studio.error}). The phone voice is reading.`;
    else if (!studio.downloaded && others.length) msg = 'Studio voices aren\'t downloaded yet — the phone voice is reading.';
    else if (studio.downloaded && phoneReaders.length && others.length) msg = `${phoneReaders.join(', ')} ${phoneReaders.length > 1 ? 'are' : 'is'} set to the phone voice.`;
    b.hidden = !msg || !others.length;
    b.innerHTML = msg ? `<span>⚠ ${esc(msg)}</span><button class="btn sm" data-act="fix-voices">${studio.status === 'error' ? 'Retry' : 'Fix'}</button>` : '';
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
    prepareInBackground();
  }

  function bindSettings() {
    const s = state.settings;
    const sync = () => {
      $('#silenceVal').textContent = (s.silenceMs / 1000).toFixed(1) + 's';
      $('#gapVal').textContent = (s.gapMs / 1000).toFixed(1) + 's';
      $$('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== s.advanceMode; });
      renderLines();
      save();
    };
    ['advanceMode', 'silenceMs', 'sensitivity', 'matchWords', 'gapMs', 'countdown', 'myLineDisplay'].forEach((k) => {
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

  async function ensureMedia() {
    if (stream && stream.getAudioTracks().some((t) => t.readyState === 'live')) return stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser cannot use the microphone. Open the app in Safari or Chrome.');
    }
    // Echo cancellation off so the reader's voice from your speakers lands on the recording, like a real reader.
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = s;
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
      bar.style.width = Math.min(100, Math.sqrt(currentLevel) * 220) + '%';
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
    if (usesStudio(r)) {
      try { return await speakStudio(line, signal); } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn(e);
        if (!studioWarned) { studioWarned = true; studioNotice('Studio voice failed (' + e.message + '). Using the phone voice instead.'); }
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

  // ---------- studio voices: Kokoro neural TTS running on the device ----------
  const STUDIO_VOICES = [
    { id: 'af_heart', name: 'Heart', accent: 'US', gender: 'f' },
    { id: 'am_michael', name: 'Michael', accent: 'US', gender: 'm' },
    { id: 'bf_emma', name: 'Emma', accent: 'UK', gender: 'f' },
    { id: 'bm_george', name: 'George', accent: 'UK', gender: 'm' },
  ];
  const APP_VERSION = '1.4.0';
  const STUDIO_KEY = 'cue:studio';
  const studioSupported = typeof Worker !== 'undefined' && typeof WebAssembly === 'object';
  const studio = { downloaded: false, status: 'idle', progress: 0, error: '', quality: 'standard', device: '', note: '' };
  try { Object.assign(studio, JSON.parse(localStorage.getItem(STUDIO_KEY) || '{}')); } catch { /* ignore */ }
  studio.status = 'idle'; studio.progress = 0; studio.error = ''; studio.note = '';
  const saveStudio = () => { try { localStorage.setItem(STUDIO_KEY, JSON.stringify({ downloaded: studio.downloaded, quality: studio.quality, device: studio.device })); } catch { /* ignore */ } };
  try { localStorage.removeItem('cue:elevenlabs'); } catch { /* old ElevenLabs key: don't keep it around */ }
  const studioReady = () => studio.status === 'ready';
  const usesStudio = (r) => studioSupported && studio.downloaded && studio.status !== 'error' && r.engine !== 'device' && STUDIO_VOICES.some((v) => v.id === r.studioVoice);

  let worker = null, workerSeq = 0;
  const pending = new Map();
  function studioWorker() {
    if (worker) return worker;
    worker = new Worker('voice-worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        studio.progress = data.total ? data.loaded / data.total : 0;
        renderStudioPanel();
        renderDiag();
        return;
      }
      if (data.type === 'note') { studio.note = data.message; lastError = 'studio: ' + data.message; renderStudioPanel(); renderDiag(); return; }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.message));
      else p.resolve(data);
    };
    worker.onerror = (e) => {
      lastError = 'worker: ' + (e.message || 'failed to start') + (e.filename ? ` @${e.filename.split('/').pop()}:${e.lineno}` : '');
      pending.forEach((p) => p.reject(new Error(e.message || 'Voice engine failed to start')));
      pending.clear();
      worker = null;
    };
    return worker;
  }
  function callWorker(msg) {
    return new Promise((resolve, reject) => {
      const id = ++workerSeq;
      pending.set(id, { resolve, reject });
      studioWorker().postMessage(Object.assign({ id }, msg));
    });
  }

  let loadPromise = null;
  function studioLoad() {
    if (!loadPromise) {
      studio.status = 'loading';
      studio.error = '';
      renderStudioPanel();
      loadPromise = callWorker({ type: 'load', quality: studio.quality }).then((res) => {
        studio.status = 'ready';
        studio.device = res.device || '';
        if (!studio.downloaded) {
          studio.downloaded = true;
          Object.values(state.readers).forEach((r) => { if (r.engine !== 'device') r.engine = 'studio'; });
        }
        saveStudio();
        renderCast();
        prepareInBackground();
      }, (err) => {
        studio.status = 'error';
        studio.error = err.message || String(err);
        lastError = 'studio: ' + studio.error;
        loadPromise = null;
        renderStudioPanel();
        renderVoiceBanner();
        renderDiag();
        throw err;
      });
    }
    return loadPromise;
  }

  function studioKey(line) {
    const r = readerFor(line.character);
    return ['kokoro', studio.device || studio.quality, r.studioVoice, Math.round(r.rate * 100), spokenText(line.text)].join('|');
  }

  // Generated lines are saved on the phone, so each one is only ever made once.
  const inflight = new Map();
  function studioAudioFor(line) {
    const key = studioKey(line);
    if (inflight.has(key)) return inflight.get(key);
    const r = readerFor(line.character);
    const p = (async () => {
      const cached = await cacheGet(key);
      if (cached) return cached;
      await studioLoad();
      const { wav } = await callWorker({ type: 'speak', quality: studio.quality, chunks: chunkText(spokenText(line.text)), voice: r.studioVoice, speed: Math.min(1.5, Math.max(0.6, r.rate)) });
      const blob = new Blob([wav], { type: 'audio/wav' });
      cachePut(key, blob);
      return blob;
    })();
    inflight.set(key, p);
    p.then(() => inflight.delete(key), () => inflight.delete(key));
    return p;
  }

  function studioLinesFrom(from) {
    return state.lines.slice(from).filter((l) => l.type === 'dialogue' && l.character !== state.me && spokenText(l.text) && usesStudio(readerFor(l.character)));
  }

  // Generate every reader line before the scene starts, so the reader never keeps you waiting mid-take.
  async function prepareScene(from, signal, onProgress) {
    const lines = studioLinesFrom(from);
    for (let k = 0; k < lines.length; k++) {
      if (signal && signal.aborted) throw abortError();
      onProgress && onProgress(k, lines.length);
      await studioAudioFor(lines[k]);
    }
  }

  let bgPrep = null;
  function prepareInBackground() {
    if (!studioReady() || !state.me || bgPrep) return;
    bgPrep = prepareScene(0).catch(() => {}).finally(() => { bgPrep = null; });
  }

  // One shared <audio>: iOS only lets an element play after a tap has "unlocked" it.
  const player = new Audio();
  player.setAttribute('playsinline', '');
  const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABAAAAlgAenp6enp6enp6enp6enp6enp6enp6enp6pqampqampqampqampqampqampqampqamptPT09PT09PT09PT09PT09PT09PT09PT09P/////////////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCcQAAAAAAAAJY+/rsqgAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  function unlockPlayer() {
    try { player.src = SILENT; player.play().catch(() => {}); } catch { /* ignore */ }
  }

  async function speakStudio(line, signal) {
    let blob = null, err = null;
    const key = studioKey(line);
    if (!inflight.has(key)) { /* not generated yet: say so instead of looking frozen */ }
    const t = setTimeout(() => nowState(`${line.character} — generating the line…`), 600);
    await step(signal, (done) => { studioAudioFor(line).then((b) => { blob = b; done(); }, (e) => { err = e; done(); }); });
    clearTimeout(t);
    if (err) throw err;
    if (!blob) return; // skipped with Next while it was generating
    await step(signal, (done, onClean) => {
      const url = URL.createObjectURL(blob);
      onClean(() => { player.onended = player.onerror = null; player.pause(); URL.revokeObjectURL(url); });
      player.onended = () => done();
      player.onerror = () => done();
      player.src = url;
      player.play().catch(() => done());
    });
  }

  let studioWarned = false;
  function studioNotice(msg) {
    status(msg);
    const m = $('#studioMsg');
    if (m) m.textContent = msg;
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
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mpeg'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function startRecorder() {
    const mime = pickMime();
    if (mime === null) throw new Error('Recording is not supported in this browser.');
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128_000 } : undefined);
    const chunks = [];
    const started = Date.now();
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const finished = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
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
  const status = (msg) => { $('#status').textContent = msg || ''; if (msg) nowState(msg); };
  const nowState = (msg) => { const el = $('#nowState'); if (el) el.textContent = msg || ''; };

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
      if (record || state.settings.advanceMode === 'voice') {
        try { await ensureMedia(); } catch (e) {
          if (record) throw new Error('Microphone blocked (' + (e.message || e.name) + '). Allow the mic in your browser settings to record.');
          status('No mic — press Space after your lines.');
        }
      }
      if (studio.downloaded && studioLinesFrom(state.startIndex).length) {
        // Only the first reader line has to be ready before we start; the rest are made in the background.
        try {
          nowState('Warming up the reader voice…');
          await studioAudioFor(studioLinesFrom(state.startIndex)[0]);
          prepareScene(state.startIndex, ac.signal).catch(() => {});
          nowState('');
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          studioWarned = true;
          studioNotice('Studio voices unavailable (' + e.message + '). Using the phone voice instead.');
          renderVoiceBanner();
        }
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
      else { status(err.message || String(err)); nowState('⚠ ' + (err.message || String(err))); lastError = 'scene: ' + (err.message || err); renderDiag(); console.error(err); }
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
    $$('#takesGrid video, #takesGrid audio').forEach((v) => { v.removeAttribute('src'); v.load(); });
    takeUrls.forEach((u) => URL.revokeObjectURL(u));
    takeUrls = [];
    $('#takeCount').textContent = takes.length;
    $('#takesEmpty').hidden = takes.length > 0;
    $('#takesGrid').innerHTML = takes.map((t) => {
      const url = URL.createObjectURL(t.blob);
      takeUrls.push(url);
      const mime = t.mime || '';
      const isAudio = mime.startsWith('audio/');
      const ext = mime.includes('mp4') ? (isAudio ? 'm4a' : 'mp4') : mime.includes('quicktime') ? 'mov' : mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : (t.ext || 'mp4');
      const file = t.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.' + ext;
      return `<div class="card take" data-id="${t.id}">
        ${isAudio ? `<div class="audiotake"><audio src="${url}" controls preload="metadata"></audio></div>` : `<video src="${url}" controls playsinline preload="metadata"></video>`}
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


  // Screenplay pages have a strict column layout: action at the left margin, dialogue indented,
  // character names further in, and (on revised pages) a column of asterisks at the right edge.
  // Using the word positions from OCR instead of the text alone lets us drop the asterisk column,
  // tell names from dialogue without relying on capitals, and ignore blank lines OCR invents.
  const PAGE_JUNK = /^(\(?\s*(MORE|CONTINUED|CONT'?D)\s*:?\s*(\(\d+\))?\s*\)?|\d*\s*CONTINUED:?\s*(\(\d+\))?\s*\d*|\d+\.?|\d+ of \d+|\d+:\d\d|[A-Z]?\d*\s*.*\d+\/\d+\/\d+.*|.*\b(rev\.?|revised|revision|draft|shooting script)\b.*\d.*)$/i;
  const median = (xs) => { const s = xs.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pct = (xs, f) => { const s = xs.slice().sort((p, q) => p - q); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0; };
  const isSymbolToken = (w) => !/[A-Za-z0-9]/.test(w) && !/^(--|—|–|\.\.\.|…|-)$/.test(w);

  function layoutLines(data) {
    const blocks = data.blocks || [];
    const lines = blocks.flatMap((b) => (b.paragraphs || []).flatMap((p) => p.lines || []));
    return lines.filter((l) => l.words && l.words.length);
  }

  function pageToBlocks(data, pageIndex) {
    const lines = layoutLines(data);
    if (lines.length < 4) return null;
    const words = lines.flatMap((l) => l.words);
    const charW = median(words.filter((w) => w.text.length >= 3).map((w) => (w.bbox.x1 - w.bbox.x0) / w.text.length)) || 10;
    // Right edge of real text: anything starting beyond it is the revision-mark column.
    const rightEdge = pct(words.filter((w) => /[A-Za-z]{4,}/.test(w.text)).map((w) => w.bbox.x1), 0.97) + charW;
    const cleaned = lines.map((l) => {
      const ws = l.words.filter((w) => {
        const t = w.text.trim();
        if (!t || isSymbolToken(t)) return false;
        if (w.bbox.x0 > rightEdge && t.length <= 4) return false;
        return true;
      });
      // A short low-confidence tail far from the previous word is margin junk too ("bd", "£7", "bol").
      while (ws.length > 1) {
        const last = ws[ws.length - 1], prev = ws[ws.length - 2];
        const gap = (last.bbox.x0 - prev.bbox.x1) / charW;
        if (last.text.length <= 3 && gap > 3 && (last.confidence < 85 || !/^[A-Za-z]+[.,!?]?$/.test(last.text) || /^(bd|bol|hil|LJ|ED|w|i)$/.test(last.text))) ws.pop();
        else break;
      }
      return ws.length ? { x0: ws[0].bbox.x0, y: l.bbox.y0, text: ws.map((w) => w.text).join(' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim() } : null;
    }).filter(Boolean).filter((l) => l.text.length > 1 && /[A-Za-z]/.test(l.text) && !PAGE_JUNK.test(l.text) && !/\b\d+ of \d+\b|\b\d{1,2}:\d\d\b/.test(l.text));
    if (!cleaned.length) return [];

    const left = pct(cleaned.map((l) => l.x0), 0.05);
    cleaned.forEach((l) => { l.indent = (l.x0 - left) / charW; });
    const indented = cleaned.filter((l) => l.indent > 3);
    // Dialogue indent = the most common indent among indented lines; the name column sits well inside that.
    const hist = {};
    indented.forEach((l) => { const k = Math.round(l.indent / 2) * 2; hist[k] = (hist[k] || 0) + 1; });
    const D = Number(Object.keys(hist).sort((p, q) => hist[q] - hist[p])[0] || 8);
    const capsShort = (t) => { const letters = t.replace(/[^A-Za-z]/g, ''); return letters.length >= 2 && t.split(/\s+/).length <= 5 && letters.replace(/[^A-Z]/g, '').length / letters.length >= 0.8 && !SCENE_HEADING.test(t) && !TRANSITION.test(t); };
    const nameIndents = indented.filter((l) => capsShort(l.text) && l.indent > D + 3).map((l) => l.indent);
    const N = nameIndents.length ? median(nameIndents) : null;

    return cleaned.map((l) => {
      const t = l.text;
      let cls;
      if (l.indent <= 3) cls = SCENE_HEADING.test(t) ? 'heading' : (N === null && capsShort(t) && isCue(t, 'x') ? 'name' : 'action');
      else if (capsShort(t) && ((N !== null && l.indent >= N - 3) || (N === null && isCue(t, 'x')))) cls = 'name';
      else cls = 'dialogue';
      return { cls, text: t, page: pageIndex, y: l.y };
    });
  }

  // Turn classified lines from all pages into clean script text: group them into blocks (a name plus
  // its lines, or a run of action), join wrapped parentheticals, and drop blocks repeated where two
  // screenshots overlap.
  function blocksToScript(all) {
    const blocks = [];
    let cur = null, openParen = null;
    const push = (b) => { if (b && (b.lines.length || b.name)) blocks.push(b); };
    all.forEach(({ lines }, page) => {
      const ys = lines.map((l) => l.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
      lines.forEach((l) => {
        const yFrac = (l.y - y0) / (y1 - y0 || 1);
        if (openParen !== null) {
          openParen += ' ' + l.text;
          if (/\)/.test(l.text)) { cur.lines.push(openParen); openParen = null; }
          return;
        }
        if (l.cls === 'name') {
          push(cur);
          cur = { kind: 'speech', name: normName(l.text) + (/\(/.test(l.text) ? ' ' + (l.text.match(/\(.*\)?/) || [''])[0] : ''), lines: [], page, yFrac };
        } else if (l.cls === 'dialogue') {
          if (/^\(/.test(l.text) && !/\)/.test(l.text)) { openParen = l.text; if (!cur || cur.kind !== 'speech') cur = { kind: 'speech', name: '', lines: [], page, yFrac }; return; }
          if (!cur || cur.kind !== 'speech') { push(cur); cur = { kind: 'speech', name: '', lines: [], page, yFrac }; }
          cur.lines.push(l.text);
        } else {
          if (!cur || cur.kind !== 'action' || l.cls === 'heading') { push(cur); cur = { kind: 'action', heading: l.cls === 'heading', lines: [], page, yFrac }; }
          cur.lines.push(l.text);
        }
      });
      push(cur); cur = null;
      if (openParen) { blocks.push({ kind: 'speech', name: '', lines: [openParen], page, yFrac: 1 }); openParen = null; }
    });

    // Overlap between screenshots: a block near the top of a later page whose lines were already seen.
    const norm = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    const seen = [];
    // Same words in the same order (a few may be garbled by the phone's overlay or a page edge).
    const inOrder = (w, s) => { let j = 0, hits = 0; for (const x of w) { const k = s.indexOf(x, j); if (k >= 0) { hits++; j = k + 1; } } return hits / w.length; };
    const isDup = (w) => w.length >= 4 && seen.some((s) => Math.abs(s.length - w.length) <= 2 && inOrder(w, s) >= 0.75);
    const kept = [];
    let lastSpeaker = '';
    blocks.forEach((b) => {
      if (b.kind === 'speech') {
        const words = b.lines.map(norm);
        const candidate = b.page > 0 && b.yFrac < 0.6;
        const dups = candidate ? words.map(isDup) : words.map(() => false);
        const real = words.filter((w) => w.length >= 4).length;
        const dupCount = dups.filter(Boolean).length;
        if (candidate && real && dupCount / real >= 0.6) return; // whole block is a repeat
        b.lines = b.lines.filter((_, i) => !dups[i]);
        words.forEach((w, i) => { if (!dups[i] && !/^\(/.test(b.lines[i] || '')) seen.push(w); });
        if (!b.lines.length || b.lines.every((l) => /^\(/.test(l))) return; // nothing left to say
        if (!b.name) {
          // Dialogue with no name above it (a page that starts mid-speech).
          if (lastSpeaker) b.name = lastSpeaker;
          else { kept.push({ kind: 'action', lines: ['(continued from the previous page: ' + b.lines.join(' ') + ')'] }); return; }
        }
        lastSpeaker = b.name.replace(/\s*\(.*$/, '');
      } else if (b.heading) {
        lastSpeaker = '';
      }
      kept.push(b);
    });

    return kept.map((b) => (b.kind === 'speech' ? b.name + '\n' + b.lines.join('\n') : b.lines.join('\n'))).join('\n\n').trim();
  }

  // Undo the common ways OCR mangles screenplay pages (used when no layout information is available).
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
      const cueLike = isCue(l, 'x');
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
        const { data } = await w.recognize(f, {}, { text: true, blocks: true });
        const blocks = pageToBlocks(data, k - 1);
        pages.push(blocks && blocks.length ? { lines: blocks } : { text: cleanOcr(data.text) });
      }
      const laid = pages.filter((p) => p.lines);
      window.__cuePages = laid; // for automated tests
      const text = [blocksToScript(laid)].concat(pages.filter((p) => p.text).map((p) => p.text)).filter(Boolean).join('\n\n');
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
    if (name === 'stage' && studio.downloaded && studioSupported) studioLoad().catch(() => {});
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
    $('#nameFix').addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'alias') return;
      const n = e.target.closest('.fixrow').dataset.name;
      state.aliases[n] = e.target.value;
      onScriptChange();
    });
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
        r.voiceURI = r.studioVoice = ''; // let autoAssignVoices pick the best unused voice of that type
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

    $('#voiceBanner').addEventListener('click', (e) => {
      if (e.target.dataset.act !== 'fix-voices') return;
      if (studio.status === 'error' || !studio.downloaded) {
        showView('script');
        $('#voices').scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (studio.status === 'error') studioLoad().catch(() => {});
      } else {
        state.characters.filter((c) => c !== state.me).forEach((c) => { readerFor(c).engine = 'studio'; });
        renderCast();
      }
    });
    $('#diagCopy').addEventListener('click', async () => {
      renderDiag();
      const text = diagnostics();
      try { await navigator.clipboard.writeText(text); $('#diagCopy').textContent = 'Copied ✓'; }
      catch { $('#diagOut').focus(); $('#diagCopy').textContent = 'Select the text above and copy'; }
      setTimeout(() => { $('#diagCopy').textContent = 'Copy report'; }, 2500);
    });
    $('#studioPanel').addEventListener('click', async (e) => {
      const act = e.target.dataset.act;
      if (act === 'studio-load') studioLoad().catch(() => {});
      else if (act === 'studio-clear') { await cacheClear(); studioNotice('Saved lines cleared.'); }
      else if (act === 'studio-test') {
        unlockPlayer();
        const other = state.characters.find((c) => c !== state.me);
        const line = { type: 'dialogue', character: other || '__test', text: 'You were a kid. Anybody would have run. That\'s not on you.' };
        if (!other) state.readers.__test = { engine: 'studio', studioVoice: 'am_michael', gender: 'm', rate: 1, pitch: 1 };
        if (run) return;
        const tmp = { ac: new AbortController(), skip: null };
        run = tmp;
        studioNotice('Generating a test line…');
        speakStudio(line, tmp.ac.signal).then(() => studioNotice(''), (e) => studioNotice('Test failed: ' + (e.message || e))).finally(() => { if (run === tmp) run = null; });
      }
    });
    $('#studioPanel').addEventListener('change', (e) => {
      if (e.target.dataset.act !== 'studio-quality') return;
      const prev = studio.quality;
      studio.quality = e.target.value;
      saveStudio();
      if (prev !== studio.quality && studio.downloaded) {
        // A different model: restart the engine and regenerate lines with it.
        if (worker) { worker.terminate(); worker = null; }
        loadPromise = null; studio.status = 'idle'; studio.device = '';
        cacheClear().then(() => { renderStudioPanel(); studioLoad().catch(() => {}); });
      }
    });
    $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $('#toStage').addEventListener('click', () => showView('stage'));
    $('#voicesLink').addEventListener('click', () => {
      showView('script');
      $('#voices').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  window.__cue = { pageToBlocks, blocksToScript, parseScript }; // for automated tests
})();
