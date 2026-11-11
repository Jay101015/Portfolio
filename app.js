/* Cue — a tiny self-tape reader. No build step, no backend: everything runs and is stored in the browser. */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const STORE_KEY = 'cue:v1';
  const APP_VERSION = '3.0.0';
  const UA = navigator.userAgent;
  // Every browser on an iPhone or iPad is Safari underneath, whatever its name.
  const isWebKit = /AppleWebKit/.test(UA) && !/Chrome|Chromium|Edg\/|Android/.test(UA);
  const isIOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;

  // A running log of what the reader, the microphone and the voice engine did. It goes into the problem report.
  const events = [];
  const bootAt = performance.now();
  function log(msg) {
    events.push(((performance.now() - bootAt) / 1000).toFixed(1) + 's ' + msg);
    if (events.length > 120) events.shift();
  }

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
      micMode: 'auto',
      silenceMs: 1000,
      sensitivity: 5,
      matchWords: 'off',
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
        if (typeof state.settings.matchWords !== 'string') state.settings.matchWords = 'off';
        if (saved.settings && !saved.settings.matchWordsV2) { state.settings.matchWords = 'off'; state.settings.matchWordsV2 = true; } // v1 default stole the mic on iPhone
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

  // Roughly how many syllables a line has: groups of vowels, less the silent endings.
  function syllableCount(text) {
    const words = spokenText(text).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
    let n = 0;
    for (let w of words) {
      w = w.replace(/'/g, '');
      if (/^\d+$/.test(w)) { n += w.length; continue; }
      let c = (w.match(/[aeiouy]+/g) || []).length;
      if (c > 1 && /[^aeiouyl]e$/.test(w)) c--; // silent e
      if (c > 1 && /[^aeiouytd]ed$/.test(w)) c--; // jumped, pulled
      n += Math.max(1, c);
    }
    return n;
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

  // First-name guess for a character's voice; anything unknown alternates. The actor can always flip it.
  const F_NAMES = new Set('MARY PATRICIA JENNIFER LINDA ELIZABETH BARBARA SUSAN JESSICA SARAH KAREN LISA NANCY BETTY SANDRA MARGARET ASHLEY KIMBERLY EMILY DONNA MICHELLE CAROL AMANDA MELISSA DEBORAH STEPHANIE REBECCA SHARON LAURA CYNTHIA AMY KATHLEEN ANGELA SHIRLEY ANNA BRENDA PAMELA EMMA NICOLE HELEN SAMANTHA KATHERINE CHRISTINE DEBRA RACHEL CAROLYN JANET MARIA OLIVIA HEATHER DIANE JULIE JOYCE VICTORIA RUTH VIRGINIA LAUREN KELLY CHRISTINA JOAN EVELYN JUDITH ANDREA HANNAH MEGAN CHERYL JACQUELINE MARTHA MADISON TERESA GLORIA SARA JANICE ANN KATHRYN ABIGAIL SOPHIA FRANCES JEAN ALICE JUDY ISABELLA JULIA GRACE AMBER DENISE DANIELLE MARILYN BEVERLY CHARLOTTE NATALIE THERESA DIANA BRITTANY DORIS KAYLA ALEXIS LORI MARIE BIANCA KEISHA MAYA MIA AVA ZOE CHLOE LILY ELLA ARIA LAYLA NORA RILEY ZOEY STELLA HAZEL VIOLET AURORA LUCY ANNE ANNIE KATE KATIE CLAIRE ROSE RUBY IVY NAOMI ELENA EVA EVE LEAH AUDREY BELLA SKYLAR PAISLEY NOVA ELLIE JADE TIFFANY MONICA VANESSA ERICA ERIKA TARA CARMEN ROSA GINA TINA LENA NINA DANA JOY HOPE FAITH IRIS JUNE MAE FIONA MOLLY HOLLY SALLY WENDY PEGGY BETH LIZ JEN JENNY JESS KIM MEG MAGGIE SOPHIE AMELIA HARPER MILA LUNA CAMILA GIANNA PENELOPE ELEANOR SCARLETT MADELINE ALEXA SERENA VENUS TANYA SONIA NADIA PRIYA AISHA FATIMA LEILA YASMIN MEI YUKI MOM MOTHER MAMA GRANDMA NANA AUNT SISTER WIFE GIRL WOMAN LADY MRS MS MISS QUEEN PRINCESS NURSE WAITRESS ACTRESS HOSTESS GIRLFRIEND DAUGHTER BRIDE MADAM MAAM'.split(' '));
  const M_NAMES = new Set('JAMES ROBERT JOHN MICHAEL DAVID WILLIAM RICHARD JOSEPH THOMAS CHARLES CHRISTOPHER DANIEL MATTHEW ANTHONY MARK DONALD STEVEN STEPHEN PAUL ANDREW JOSHUA KENNETH KEVIN BRIAN GEORGE TIMOTHY RONALD EDWARD JASON JEFFREY RYAN JACOB GARY NICHOLAS ERIC JONATHAN LARRY JUSTIN SCOTT BRANDON BENJAMIN SAMUEL GREGORY ALEXANDER FRANK PATRICK RAYMOND JACK DENNIS JERRY TYLER AARON JOSE ADAM NATHAN HENRY DOUGLAS ZACHARY PETER KYLE ETHAN WALTER NOAH JEREMY CHRISTIAN KEITH ROGER TERRY GERALD HAROLD SEAN AUSTIN CARL ARTHUR LAWRENCE DYLAN JESSE JORDAN BRYAN BILLY JOE BRUCE GABRIEL LOGAN ALBERT WILLIE ALAN JUAN WAYNE ELIJAH RANDY ROY VINCENT RALPH EUGENE RUSSELL BOBBY MASON PHILIP LOUIS ADONIS DAME DAMIAN DEV BEN TOM TIM JIM BOB BILL MIKE DAVE DAN STEVE CHRIS MATT NICK TONY SAM MAX LEO LIAM LUCAS OLIVER OWEN LUKE ISAAC CALEB CONNOR EVAN IAN COLE MILES FELIX HUGO OSCAR OMAR MARCUS MALIK JAMAL DARIUS TYRONE DEVON ANDRE CARLOS LUIS MIGUEL DIEGO MATEO RAFAEL PEDRO ANTONIO MARCO LUCA ENZO IVAN VICTOR VIKTOR NIKOLAI DMITRI AHMED ALI HASSAN RAJ ARJUN WEI KENJI HIRO LEON ROCKY APOLLO CREED DAD FATHER PAPA GRANDPA UNCLE BROTHER HUSBAND BOY MAN GUY MR SIR KING PRINCE WAITER ACTOR HOST BOYFRIEND SON GROOM COP OFFICER DETECTIVE SERGEANT CAPTAIN COACH FATHER PRIEST'.split(' '));
  function guessGender(name) {
    for (const w of name.split(/[^A-Z]+/)) { if (F_NAMES.has(w)) return 'f'; if (M_NAMES.has(w)) return 'm'; }
    return '';
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
      if (!r.gender || (!r.genderChosen && guessGender(c) && r.gender !== guessGender(c))) {
        const g = guessGender(c) || (k % 2 ? 'm' : 'f');
        if (r.gender !== g) { r.gender = g; r.voiceURI = ''; r.studioVoice = ''; } // re-pick voices for the corrected guess
      }
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

  function renderStudioPanel() {
    const p = $('#studioPanel');
    if (!p) return;
    if (!studioSupported) {
      p.innerHTML = '<p class="hint">Studio voices need a newer browser. Your phone\'s built-in voice is used instead.</p>';
      return;
    }
    const pct = Math.round(studio.progress * 100);
    const voicesList = STUDIO_VOICES.map((v) => `<span class="vchip">${v.name} <small>${v.accent} ${v.gender === 'f' ? 'F' : 'M'}</small></span>`).join('');
    let body;
    if (studio.status === 'loading') {
      const fetching = studio.phase === 'download' && studio.progress > 0 && studio.progress < 1;
      body = `<p class="hint">${fetching ? `${modelChanged ? 'Updating the studio voices' : 'Downloading the studio voices'}… ${pct}%` : 'Starting the studio voices…'}</p><div class="bar"><i style="width:${fetching ? pct : 100}%"></i></div>`;
    } else if (engineBlocked()) {
      body = `<p class="hint err">The studio voices closed the page last time they ran on this phone, so they are switched off for now and the phone's own voice is reading.</p><button class="btn primary sm" data-act="studio-retry">Try again</button>`;
    } else if (studio.status === 'error') {
      body = `<p class="hint err">The studio voices couldn't start: ${esc(studio.error)}</p><button class="btn primary sm" data-act="studio-retry">Try again</button>`;
    } else if (studio.downloaded) {
      const speed = studio.genSec > 2 ? ` · a line takes ${(studio.genMs / 1000 / studio.genSec).toFixed(1)}× its length to make` : '';
      body = `<p class="hint ok">✓ Studio voices are on this phone${speed}</p>
        <div class="row"><button class="btn ghost sm" data-act="studio-test">▶ Test a line</button><button class="btn ghost sm" data-act="studio-clear">Clear saved lines</button></div>`;
    } else {
      body = `<p class="hint">Natural, human-sounding reader voices that run on your phone — free, no account, nothing leaves the phone. One-time download of about 90 MB (use Wi-Fi), then they work offline.</p>
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
    const now = performance.now();
    const st = mic.track && mic.track.getSettings ? mic.track.getSettings() : {};
    return [
      `Cue ${APP_VERSION} · ${new Date().toISOString()}`,
      `Browser: ${UA}`,
      `Platform: webkit=${isWebKit} ios=${isIOS} home-screen=${window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true} isolated=${!!window.crossOriginIsolated} cores=${navigator.hardwareConcurrency || '?'} wake-lock=${'wakeLock' in navigator ? (wakeLock ? 'held' : 'available') : 'none'}`,
      `Audio: session=${audioSession ? audioSession.type + '/' + (audioSession.state || '?') : 'n/a'} context=${audioCtx ? audioCtx.state + ' ' + audioCtx.sampleRate + 'Hz' : 'none'} output=${out.path || 'not used yet'} lines-played=${out.lines} web-audio-fails=${out.webAudioFails} element-fails=${out.elementFails}${out.lastError ? ' last=' + out.lastError : ''} reader-heard-by-mic=${out.loopHeard}`,
      `Mic: state=${mic.state}${mic.error ? ' (' + mic.error + ')' : ''} delivering=${micDelivering(now)} label=${mic.track ? mic.track.label || 'default' : '-'} rate=${st.sampleRate || '?'} muted=${mic.track ? mic.track.muted : '-'} level=${mic.level.toFixed(4)} room=${mic.noise.toFixed(4)} threshold=${thrOn().toFixed(4)} loudest=${mic.maxLevel.toFixed(4)} recoveries=${mic.recoveries} duplex=${useHalf() ? 'half' : 'full'} opens=${mic.opens} last-open=${Math.round(mic.openMs)}ms slow-opens=${mic.slowOpens}`,
      `Studio voices: supported=${studioSupported} downloaded=${studio.downloaded} status=${studio.status} model=${studio.model || '?'} threads=${studio.threads || '?'} cfg=${engine.cfg ? JSON.stringify(engine.cfg) : '-'} crashes=${studio.crashes} no-threads=${studio.noThreads} phase=${studio.phase || '-'} ${Math.round(studio.progress * 100)}%${studio.error ? ' error=' + studio.error : ''}${studio.genSec ? ` speed=${(studio.genMs / 1000 / studio.genSec).toFixed(2)}x` : ''}`,
      `Scene prep: ${prep.done}/${prep.total} pieces ready, ${queue.length} queued, storage ${dbTimeouts >= 2 ? 'not responding' : 'ok'}`,
      `Phone voices: ${voices.length} (${voices.slice(0, 6).map((v) => v.name).join(', ')}${voices.length > 6 ? '…' : ''})`,
      `Playing: ${state.me || '(none)'} · readers: ${others.map((c) => { const r = readerFor(c); return `${c}=${usesStudio(r) ? 'studio:' + r.studioVoice : 'phone:' + (r.voiceURI || 'default')}`; }).join(', ') || '(none)'}`,
      `Characters found: ${Object.entries(state.nameInfo.counts).map(([n, k]) => `${n}(${k})`).join(', ')}`,
      `Settings: ${JSON.stringify(state.settings)}`,
      `Last error: ${lastError || '(none)'}`,
      'Recent events:',
      ...events.slice(-50),
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
    const silentTip = isIOS ? ' If you can\'t hear it, switch off silent mode.' : '';
    let msg = '', action = '';
    if (!others.length || !state.me) msg = '';
    else if (!studioSupported) msg = 'This browser can\'t run the studio voices, so the phone\'s own voice is reading.' + silentTip;
    else if (engineBlocked()) { msg = 'The studio voices closed the page last time they ran, so the phone\'s own voice is reading for now.' + silentTip; action = 'Try again'; }
    else if (studio.status === 'error') { msg = `The studio voices couldn't start: ${studio.error}. The phone's own voice is reading.` + silentTip; action = 'Retry'; }
    else if (!studio.downloaded) { msg = 'The studio voices aren\'t downloaded yet, so the phone\'s own voice is reading.' + silentTip; action = 'Get them'; }
    else if (phoneReaders.length) { msg = `${phoneReaders.join(', ')} ${phoneReaders.length > 1 ? 'are' : 'is'} set to the phone voice.`; action = 'Use studio voice'; }
    b.hidden = !msg;
    b.innerHTML = msg ? `<span>⚠ ${esc(msg)}</span>${action ? `<button class="btn sm" data-act="fix-voices">${action}</button>` : ''}` : '';
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

  // Voices nobody chose by hand are handed out again, so the readers get the first (American) voices of each kind
  // rather than whatever was left over while every character still counted as a reader.
  function repickVoices() {
    Object.values(state.readers).forEach((r) => { if (!r.genderChosen) r.studioVoice = ''; });
  }
  function setMe(name) {
    if (run) return;
    state.me = name;
    state.startIndex = 0;
    repickVoices();
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
    ['advanceMode', 'micMode', 'silenceMs', 'sensitivity', 'gapMs', 'countdown', 'myLineDisplay'].forEach((k) => {
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

  // ---------- audio: one AudioContext carries the reader's voice and the microphone meter ----------
  const AC = window.AudioContext || window.webkitAudioContext;
  const audioSession = navigator.audioSession || null; // iOS 17+: lets a page say how it uses audio
  let audioCtx = null;
  let outChain = null;

  // iPhones choose the speaker, the volume and whether the silent switch applies from the audio session type.
  // While the mic is in use it has to be play-and-record; otherwise playback, so the reader is heard with the
  // ringer switched off.
  function setSessionType(type) {
    if (!audioSession) return;
    try {
      if (audioSession.type !== type) { audioSession.type = type; log('audio session: ' + type); }
    } catch (e) { log('audio session ' + type + ' refused: ' + (e && e.message)); }
  }

  function newContext(quiet) {
    const ctx = new AC();
    if (!quiet) ctx.addEventListener('statechange', () => log('audio context ' + ctx.state));
    return ctx;
  }

  // resume() can stay pending for ever on iPhone when it isn't allowed, so never wait on it without a time limit.
  function resumeCtx(ms) {
    if (!AC) return Promise.resolve(false);
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = newContext();
    return resumeOf(audioCtx, ms);
  }
  function resumeOf(ctx, ms) {
    if (ctx.state === 'running') return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(ctx.state === 'running'); } };
      try { ctx.resume().then(fin, fin); } catch { fin(); }
      setTimeout(fin, ms);
    });
  }

  // The second way to play the reader: a plain <audio> element. iPhones only let it play after a tap has
  // "unlocked" it (or while the mic is recording).
  const player = new Audio();
  player.setAttribute('playsinline', '');
  player.preload = 'auto';
  const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABAAAAlgAenp6enp6enp6enp6enp6enp6enp6enp6pqampqampqampqampqampqampqampqamptPT09PT09PT09PT09PT09PT09PT09PT09P/////////////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCcQAAAAAAAAJY+/rsqgAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

  // Call inside a tap: iPhones only start audio from a user gesture.
  function unlockAudio(withElement) {
    try {
      if (AC) {
        if (!audioCtx || audioCtx.state === 'closed') audioCtx = newContext();
        if (audioCtx.state !== 'running') { const p = audioCtx.resume(); if (p && p.catch) p.catch(() => {}); }
        const s = audioCtx.createBufferSource();
        s.buffer = audioCtx.createBuffer(1, 1, 22050);
        s.connect(audioCtx.destination);
        s.start(0);
      }
    } catch (e) { log('audio unlock: ' + (e && e.message)); }
    if (withElement) {
      try { player.src = SILENT; const p = player.play(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
  }
  const unlockPlayer = () => { unlockAudio(true); unlockSpeech(); };
  // The phone's own voice needs the same: its first words have to be asked for inside a tap.
  function unlockSpeech() {
    if (!('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
  }

  // The reader goes through a little extra gain and a limiter: phone speakers are small.
  function outputNode() {
    if (!outChain || outChain.ctx !== audioCtx) {
      const gain = audioCtx.createGain();
      gain.gain.value = 1.4;
      let last = gain;
      try {
        const limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.value = -4; limiter.knee.value = 4; limiter.ratio.value = 14;
        limiter.attack.value = 0.003; limiter.release.value = 0.12;
        gain.connect(limiter);
        last = limiter;
      } catch { /* no compressor: plain gain */ }
      last.connect(audioCtx.destination);
      outChain = { ctx: audioCtx, input: gain };
    }
    return outChain.input;
  }

  const out = { playing: false, endedAt: 0, path: '', webAudioFails: 0, elementFails: 0, lastError: '', loopPeak: 0, loopHeard: null, lines: 0 };

  const wavRate = (wav) => new DataView(wav).getUint32(24, true);
  // A clip with nothing in it must never be saved or played as if it were the reader speaking.
  function wavHasSound(wav) {
    if (!wav || wav.byteLength < 44 + 2400) return false;
    const dv = new DataView(wav);
    for (let o = 44; o + 1 < wav.byteLength; o += 2) { const v = dv.getInt16(o, true); if (v > 300 || v < -300) return true; }
    return false;
  }
  const wavSeconds = (wav) => ((wav.byteLength - 44) / 2) / wavRate(wav);
  function wavToBuffer(ctx, wav) {
    const dv = new DataView(wav);
    const n = (wav.byteLength - 44) >> 1;
    const buffer = ctx.createBuffer(1, Math.max(1, n), wavRate(wav));
    const ch = buffer.getChannelData(0);
    for (let i = 0, o = 44; i < n; i++, o += 2) ch[i] = dv.getInt16(o, true) / 32768;
    return buffer;
  }

  async function playWebAudio(wav, signal) {
    if (!AC) throw new Error('no Web Audio in this browser');
    if (!(await resumeCtx(500))) throw new Error('audio context is ' + (audioCtx ? audioCtx.state : 'missing'));
    const ctx = audioCtx;
    const buffer = wavToBuffer(ctx, wav);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(outputNode());
    await step(signal, (done, onClean, fail) => {
      const startedAt = ctx.currentTime;
      // A context that claims to run but whose clock stands still is playing nothing.
      const stalled = setTimeout(() => { if (ctx.currentTime - startedAt < 0.05) fail(new Error('audio context is not advancing (' + ctx.state + ')')); }, 700);
      const safety = setTimeout(done, buffer.duration * 1000 + 1200);
      src.onended = () => done();
      onClean(() => {
        clearTimeout(stalled); clearTimeout(safety);
        src.onended = null;
        try { src.stop(); } catch { /* never started */ }
        try { src.disconnect(); } catch { /* ignore */ }
      });
      src.start();
    });
  }

  function playElement(wav, signal) {
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const seconds = wavSeconds(wav);
    return step(signal, (done, onClean, fail) => {
      let started = false;
      const onStart = () => { started = true; };
      const onEnd = () => done();
      const onError = () => fail(new Error('audio element error ' + (player.error ? player.error.code : '?')));
      player.addEventListener('playing', onStart);
      player.addEventListener('timeupdate', onStart);
      player.addEventListener('ended', onEnd);
      player.addEventListener('error', onError);
      const stalled = setTimeout(() => { if (!started && !(player.currentTime > 0)) fail(new Error('audio element did not start')); }, 2500);
      const safety = setTimeout(done, seconds * 1000 + 3500);
      onClean(() => {
        clearTimeout(stalled); clearTimeout(safety);
        player.removeEventListener('playing', onStart);
        player.removeEventListener('timeupdate', onStart);
        player.removeEventListener('ended', onEnd);
        player.removeEventListener('error', onError);
        try { player.pause(); } catch { /* ignore */ }
        URL.revokeObjectURL(url);
      });
      player.src = url;
      let p = null;
      try { p = player.play(); } catch (e) { fail(e); return; }
      if (p && p.catch) p.catch((e) => { if (!started) fail(e); });
    });
  }

  // Did the microphone pick the reader up? Proof that sound really left the speaker (unless headphones are in).
  function noteLoopback() {
    if (!micDelivering(performance.now())) return;
    const heard = out.loopPeak > Math.max(mic.noise * 4, 0.003);
    if (heard !== out.loopHeard) { out.loopHeard = heard; log(heard ? 'the mic can hear the reader' : 'the mic cannot hear the reader (volume down or headphones?)'); }
  }

  // Plays one piece of the reader's speech. With the mic live the same audio context is used for both, which is
  // what iPhones handle best; without it a plain audio element, which ignores the silent switch.
  async function playReaderAudio(wav, signal) {
    let order = micLive() ? ['webaudio', 'element'] : ['element', 'webaudio'];
    if (order[0] === 'webaudio' && out.webAudioFails >= 2 && out.elementFails < 2) order = ['element', 'webaudio'];
    if (order[0] === 'element' && out.elementFails >= 2 && out.webAudioFails < 2) order = ['webaudio', 'element'];
    let lastErr = null;
    out.playing = true;
    out.loopPeak = 0;
    try {
      for (const path of order) {
        try {
          if (path === 'webaudio') { await playWebAudio(wav, signal); out.webAudioFails = 0; } else { await playElement(wav, signal); out.elementFails = 0; }
          if (out.path !== path) { out.path = path; log('reader audio: ' + (path === 'webaudio' ? 'web audio' : 'audio element')); }
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
          lastErr = e;
          if (path === 'webaudio') out.webAudioFails++; else out.elementFails++;
          out.lastError = path + ': ' + (e && e.message);
          log('reader audio failed (' + out.lastError + ')');
        }
      }
      throw lastErr || new Error('no way to play audio');
    } finally {
      out.playing = false;
      out.endedAt = performance.now();
      noteLoopback();
    }
  }

  // A tap re-enables sound on iPhone, so if both routes were refused ask for one and try again.
  async function playWav(wav, signal) {
    try { await playReaderAudio(wav, signal); } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (run && run.noTap) throw e; // asked once in this scene already and nobody tapped: don't hold every line up
      const tapped = await askForTap(signal, 'Tap here to turn the reader\'s sound on', 9000);
      if (!tapped && run) run.noTap = true;
      await playReaderAudio(wav, signal);
    }
  }

  // Resolves true if the button was tapped, false if the time ran out (or Next was pressed).
  function askForTap(signal, label, ms) {
    const btn = $('#tapBtn');
    let tapped = false;
    return step(signal, (done, onClean) => {
      const onTap = () => { tapped = true; unlockAudio(true); unlockSpeech(); done(); };
      btn.textContent = label;
      btn.hidden = false;
      btn.addEventListener('click', onTap);
      const t = setTimeout(done, ms);
      onClean(() => { clearTimeout(t); btn.removeEventListener('click', onTap); btn.hidden = true; });
    }).then(() => tapped);
  }

  // Keep the screen on: an iPhone locks after 30 seconds without a touch, which would end a hands-free scene.
  let wakeLock = null, wakeWanted = false, wakeBusy = false, wakeFailed = false;
  async function keepAwake(on) {
    wakeWanted = on;
    if (wakeBusy) return;
    wakeBusy = true;
    try {
      if (wakeWanted && !wakeLock && navigator.wakeLock && !document.hidden) {
        const lock = await navigator.wakeLock.request('screen');
        wakeLock = lock;
        lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      }
      if (!wakeWanted && wakeLock) {
        const lock = wakeLock;
        wakeLock = null;
        await lock.release();
      }
    } catch (e) {
      if (!wakeFailed) { wakeFailed = true; log('wake lock: ' + (e && e.message)); }
    }
    wakeBusy = false;
  }
  const stageVisible = () => $('#view-stage').classList.contains('active') && !document.hidden;
  function updateAwake() {
    keepAwake(!!run || !!micTest || (pumping && stageVisible()));
  }

  // ---------- microphone ----------
  // iPhones play a page's sound badly while its microphone is open: quietly, out of the earpiece, or crackling,
  // depending on the iOS version. So there the mic is only open during the actor's own lines ("half duplex") and
  // the reader always has the loudspeaker to itself. Recording a take needs the mic throughout, so it stays open then.
  // A setting can force either way, in case a phone behaves differently from what is expected here.
  const useHalf = () => state.settings.micMode === 'half' || (state.settings.micMode !== 'full' && isIOS);

  const mic = {
    state: 'off', // off | starting | live | denied | error
    error: '', stream: null, track: null, nodes: null, buf: null,
    level: 0, noise: 0.001, hist: [], maxLevel: 0,
    openedAt: 0, lastSignalAt: 0, closedAt: 0, recoveries: 0, timer: null, releaseTimer: null, listener: null,
    half: false,   // opened for one of the actor's lines only: the meter then runs on an audio context of its own
    ownCtx: null, shareCtx: false, gen: 0, opening: null, granted: false, opens: 0, openMs: 0, slowOpens: 0, fails: 0, calibrated: false,
  };
  const micLive = () => mic.state === 'live' && !!mic.track && mic.track.readyState === 'live';
  // Real microphones are never perfectly silent: a run of exact zeros means no sound is arriving at all.
  const micDelivering = (now) => micLive() && !!mic.nodes && (now - mic.lastSignalAt < 1500 || now - mic.openedAt < 1500);

  // A line starts when the level stands clearly above the room (sensitivity 5 = 4x the background, 10 = 1.9x,
  // 1 = 5.7x). Once it is under way, anything a little above the room counts as still talking: missing soft speech
  // would make the reader interrupt, which is far worse than the reader waiting a moment longer.
  const ABS_MIN = 0.0012;
  const thrFactor = () => 1.9 + (10 - state.settings.sensitivity) * 0.42;
  const thrOn = () => Math.max(ABS_MIN, mic.noise * thrFactor());
  const thrOff = () => Math.max(ABS_MIN * 0.6, mic.noise * Math.max(1.6, thrFactor() * 0.45));

  function teardownMicGraph() {
    const n = mic.nodes;
    if (n) ['src', 'hp', 'an', 'sink'].forEach((k) => { try { n[k].disconnect(); } catch { /* ignore */ } });
    mic.nodes = null;
    if (mic.ownCtx) {
      const c = mic.ownCtx;
      mic.ownCtx = null;
      try { const p = c.close(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
  }
  async function buildMicGraph() {
    teardownMicGraph();
    const stream = mic.stream;
    let ctx = null;
    if (mic.half && !mic.shareCtx) {
      // A context made now, after recording has begun: the arrangement iPhones most reliably feed with mic audio.
      const own = mic.ownCtx = newContext(true);
      const running = await resumeOf(own, 500);
      if (mic.ownCtx !== own || mic.stream !== stream) return; // closed again meanwhile
      if (running) ctx = own;
      else {
        // It won't start without a tap: use the context the Start tap unlocked instead, from now on.
        mic.shareCtx = true;
        mic.ownCtx = null;
        try { const p = own.close(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
        log('mic meter: a context of its own would not start (' + own.state + '), sharing the playback one');
      }
    }
    if (!ctx) {
      await resumeCtx(600); // starting to record can interrupt the context on iPhone
      ctx = audioCtx;
    }
    if (!mic.stream || mic.stream !== stream) return;
    const src = ctx.createMediaStreamSource(mic.stream);
    const hp = ctx.createBiquadFilter(); // rumble and handling noise aren't speech
    hp.type = 'highpass';
    hp.frequency.value = 110;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0;
    // Safari only processes nodes that lead to the output, so finish the chain with a silent gain.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(hp); hp.connect(an); an.connect(sink); sink.connect(ctx.destination);
    mic.nodes = { ctx, src, hp, an, sink };
    mic.buf = new Float32Array(an.fftSize);
    mic.openedAt = performance.now();
    mic.lastSignalAt = 0;
  }

  // Switches the microphone on. Calls made while it is already starting share the same attempt; a closeMic() in
  // the meantime cancels it (the promise then rejects with an AbortError).
  function openMic() {
    clearTimeout(mic.releaseTimer);
    if (mic.opening) return mic.opening;
    if (micLive() && !mic.track.muted) return Promise.resolve();
    const attempt = (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        mic.state = 'error';
        mic.error = 'this browser has no microphone access';
        throw new Error('This browser cannot use the microphone.');
      }
      closeMic(true);
      const gen = mic.gen;
      const stale = () => gen !== mic.gen;
      mic.state = 'starting';
      mic.half = useHalf() && !(run && run.recording);
      setSessionType('play-and-record');
      const t0 = performance.now();
      let s;
      try {
        // Raw audio: with echo cancellation on, iPhones play everything at phone-call volume.
        s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        if (stale()) throw abortError();
        mic.fails++;
        mic.state = e && e.name === 'NotAllowedError' ? 'denied' : 'error';
        mic.error = (e && e.name) + ': ' + (e && e.message);
        log('mic refused (' + mic.error + ')');
        setSessionType('playback');
        throw e;
      }
      const drop = () => { s.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } }); };
      if (stale()) { drop(); throw abortError(); } // no longer wanted
      mic.stream = s;
      mic.track = s.getAudioTracks()[0];
      mic.track.addEventListener('mute', () => log('mic muted by the system'));
      mic.track.addEventListener('unmute', () => log('mic unmuted'));
      mic.track.addEventListener('ended', () => { if (mic.stream !== s) return; log('mic ended by the system'); if (mic.state === 'live') mic.state = 'off'; });
      try { await buildMicGraph(); } catch (e) { log('mic meter: ' + (e && e.message)); }
      if (stale()) { if (mic.stream === s) { mic.stream = null; mic.track = null; } drop(); throw abortError(); }
      mic.state = 'live';
      mic.error = '';
      mic.fails = 0;
      mic.hist = [];
      if (!mic.opens) mic.maxLevel = 0;
      const took = performance.now() - t0;
      mic.opens++;
      mic.openMs = took;
      const st = mic.track.getSettings ? mic.track.getSettings() : {};
      const ctx = mic.nodes && mic.nodes.ctx;
      if (!mic.granted || !mic.half) log(`mic on (${mic.track.label || 'default'}, ${st.sampleRate || '?'} Hz; context ${ctx ? ctx.sampleRate + ' Hz ' + ctx.state : 'none'}; ${Math.round(took)} ms)`);
      if (mic.granted && took > 1500) { mic.slowOpens++; log(`the mic took ${(took / 1000).toFixed(1)}s to come back (was the phone asking for permission again?)`); }
      mic.granted = true;
      if (!mic.timer) mic.timer = setInterval(meterTick, 40);
    })();
    mic.opening = attempt;
    const clear = () => { if (mic.opening === attempt) mic.opening = null; };
    attempt.then(clear, clear);
    return attempt;
  }

  function closeMic(keepSession) {
    clearTimeout(mic.releaseTimer);
    mic.gen++;
    mic.opening = null;
    teardownMicGraph();
    if (mic.stream) {
      mic.stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
      mic.closedAt = performance.now();
      if (!mic.half) log('mic off');
    }
    mic.stream = null;
    mic.track = null;
    if (mic.state === 'live' || mic.state === 'starting') mic.state = 'off';
    clearInterval(mic.timer);
    mic.timer = null;
    mic.level = 0;
    renderMeter();
    if (!keepSession) setSessionType('playback');
  }

  // The stream is open but nothing is arriving. Either the audio graph isn't being fed (rebuild it on a fresh
  // context, created now that recording has started) or the system took the microphone away (ask for it again).
  async function recoverMic() {
    mic.recoveries++;
    log('no sound from the mic: recovering');
    try {
      if (mic.track && mic.track.readyState === 'live' && !mic.track.muted) {
        if (mic.half) {
          mic.shareCtx = !mic.shareCtx; // whichever kind of context it was on heard nothing: try the other
          log('mic meter: trying ' + (mic.shareCtx ? 'the playback context' : 'a context of its own'));
          await buildMicGraph();
        } else {
          const old = audioCtx;
          audioCtx = newContext();
          await buildMicGraph();
          try { if (old) { const p = old.close(); if (p && p.catch) p.catch(() => {}); } } catch { /* ignore */ }
        }
      } else {
        closeMic(true);
        await openMic();
      }
    } catch (e) { log('mic recovery failed: ' + (e && e.message)); }
  }

  // Safari forgets a page's microphone permission about a minute after the mic was last on. During a long stretch
  // of reader lines the mic is switched on for a moment between lines, so the actor isn't asked again mid-scene.
  async function micKeepAlive(signal) {
    let done = false;
    const opened = openMic().then(() => { done = true; }, () => { done = true; });
    await Promise.race([opened, sleep(1500, signal)]);
    if (!done) log('mic keep-alive: the mic did not come on in time');
    closeMic();
  }

  function meterTick() {
    const an = mic.nodes && mic.nodes.an;
    if (!an || mic.state !== 'live') return;
    const b = mic.buf;
    an.getFloatTimeDomainData(b);
    let sum = 0, peak = 0;
    for (let i = 0; i < b.length; i++) { const v = b[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    const now = performance.now();
    const rms = Math.sqrt(sum / b.length);
    if (peak > 1e-6) mic.lastSignalAt = now;
    mic.level = rms;
    if (rms > mic.maxLevel) mic.maxLevel = rms;
    if (out.playing) {
      if (rms > out.loopPeak) out.loopPeak = rms; // the reader, coming back through the mic
    } else if (now - out.endedAt > 350 && peak > 1e-6) {
      // Room level = the quietest tenth of the last four seconds. Speech always has gaps that reach down to the
      // room; a steady hum or fan sits there the whole time. It follows a quieter room quickly, a louder one slowly.
      const h = mic.hist;
      h.push(rms);
      if (h.length > 100) h.shift();
      if (h.length >= 10) {
        const s = h.slice().sort((x, y) => x - y);
        const p10 = s[Math.floor(s.length * 0.1)];
        if (!mic.calibrated) { mic.noise = p10; mic.calibrated = true; } // the first measure of this room: take it as it is
        else mic.noise += (p10 - mic.noise) * (p10 < mic.noise ? 0.3 : 0.04);
        mic.noise = Math.min(Math.max(mic.noise, 2e-5), 0.06);
      }
    }
    if (mic.listener) mic.listener(rms, now);
    renderMeter();
  }

  // -72 dBFS .. -10 dBFS across the bar.
  const dbPos = (v) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-6)) + 72) / 62));
  function renderMeter() {
    const el = $('#meter');
    if (!el) return;
    const on = micLive();
    el.classList.toggle('on', on);
    if (!on) return;
    el.firstElementChild.style.width = (dbPos(mic.level) * 100).toFixed(1) + '%';
    el.lastElementChild.style.left = (dbPos(thrOn()) * 100).toFixed(1) + '%';
    el.classList.toggle('speaking', mic.level > thrOn());
  }

  function micBlockedText(e) {
    const denied = e && e.name === 'NotAllowedError';
    return denied
      ? 'The microphone is blocked for this site. To let me listen: tap the page menu in the address bar → Website Settings → Microphone → Allow, then reload.'
      : 'The microphone could not start (' + ((e && (e.message || e.name)) || 'unknown') + ').';
  }

  // A way to see that the app hears you, without starting a scene.
  let micTest = null;
  function stopMicTest(keepMic) {
    if (!micTest) return;
    clearInterval(micTest);
    micTest = null;
    $('#micBtn').textContent = '🎤 Test my mic';
    if (!keepMic) { closeMic(); renderPrep(); }
    updateAwake();
  }
  async function toggleMicTest() {
    if (run) return;
    if (micTest) { stopMicTest(); return; }
    unlockAudio(false);
    try { await openMic(); } catch (e) { setTurn('idle', micBlockedText(e)); renderStrip(); return; }
    const started = performance.now();
    let voiced = 0, heard = false;
    $('#micBtn').textContent = 'Stop mic test';
    setTurn('me', '🎤 Say something…');
    micTest = setInterval(() => {
      const now = performance.now();
      if (now - started > 30000) { stopMicTest(); return; }
      if (!micDelivering(now)) {
        if (now - started > 2500 && !heard) setTurn('me', '⚠ The mic is on but no sound is arriving from it.');
        return;
      }
      if (mic.level > thrOn()) voiced += 40;
      if (voiced >= 300 && !heard) { heard = true; log('mic test: heard you'); setTurn('hearing', '✓ I can hear you. You\'re set.'); }
      renderStrip();
    }, 40);
    updateAwake();
  }

  // ---------- run engine ----------
  let run = null;

  function abortError() { return new DOMException('Stopped', 'AbortError'); }

  // A wait that ends when `setup` calls done(), when Next is pressed, rejects with fail(err), or rejects when the
  // run is stopped.
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
      const skip = () => { if (run) run.skipped = true; finish(); };
      const onAbort = () => finish(abortError());
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
      if (run) run.skip = skip;
      setup(() => finish(), (fn) => cleanups.push(fn), (err) => finish(err || new Error('failed')));
    });
  }

  const sleep = (ms, signal) => step(signal, (done, onClean) => {
    const t = setTimeout(done, ms);
    onClean(() => clearTimeout(t));
  });

  // Split a speech into pieces short enough to make quickly. With quickStart the first piece is a single
  // sentence, so the reader can begin speaking as soon as possible.
  function chunkText(text, max, quickStart) {
    max = max || 160;
    const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*|\S[^.!?…]*$/g) || [text];
    const parts = [];
    sentences.forEach((s) => {
      s = s.trim();
      if (!s) return;
      if (s.length > max * 1.6) {
        // A very long sentence is cut at commas and dashes instead.
        let cur = '';
        (s.match(/[^,;:—–]+[,;:—–]*\s*/g) || [s]).forEach((piece) => {
          if (cur && (cur + piece).length > max) { parts.push(cur.trim()); cur = piece; } else cur += piece;
        });
        if (cur.trim()) parts.push(cur.trim());
      } else parts.push(s);
    });
    const chunks = [];
    parts.forEach((p) => {
      const last = chunks[chunks.length - 1];
      const keepFirstShort = quickStart && chunks.length === 1 && last.length >= 12;
      if (last && !keepFirstShort && last.length + p.length < max) chunks[chunks.length - 1] = last + ' ' + p;
      else chunks.push(p);
    });
    return chunks;
  }

  let studioWarned = false;
  // Says one reader line. The actor is never left waiting: a studio line that isn't made yet (and won't be within a
  // moment) is read in the phone's own voice instead, while the engine gets on with the lines that come next.
  async function speakLine(line, signal, opts) {
    opts = opts || {};
    let text = spokenText(line.text);
    if (!text) return;
    const r = readerFor(line.character);
    let standIn = false;
    if (usesStudio(r)) {
      const chunks = lineChunks(line);
      chunks.forEach((c) => { want(c).catch(() => {}); });
      prioritise(chunks);
      await fetchSaved(chunks);
      if (signal.aborted) throw abortError();
      const delay = opts.patient ? 0 : studioDelay(chunks);
      if (delay <= PATIENCE_MS) {
        try {
          await speakStudio(line, chunks, signal, opts.patient ? CHUNK_WAIT_MS : 3500);
          out.lines++;
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
          if (e && e.rest) text = e.rest;
          log(`${line.character}: studio voice unavailable for this line (${(e && e.message) || e}), using the phone voice`);
          if (!(e && e.name === 'NotReady') && !studioWarned) { studioWarned = true; studioNotice('The studio voice failed (' + ((e && e.message) || e) + '). Using the phone voice instead.'); }
          renderVoiceBanner();
        }
      } else {
        log(`${line.character}: studio voice not ready (${delay === Infinity ? 'engine ' + studio.status : 'about ' + (delay / 1000).toFixed(1) + 's away'}), using the phone voice for this line`);
      }
      standIn = usesStudio(r); // still being prepared, as opposed to broken
      if (opts.index !== undefined) frontload(opts.index + 1);
    }
    if (run && run.skipped) return;
    setTurn('reader', `🔊 ${line.character} is speaking` + (standIn ? ` · phone voice until the studio voice is ready (${prepPct()}%)` : ' · phone voice')
      + (isIOS ? '. Can\'t hear it? Switch the ringer on.' : ''));
    await speakDevice(text, r, signal);
    out.lines++;
  }

  // The phone's own text-to-speech: used when the studio voice isn't ready or can't run.
  let keepUtterance = null; // a reference, so the utterance isn't garbage-collected mid-speech (Chrome bug)
  // Speaks one piece. Resolves with 'ok', 'blocked' (the browser wants a tap first), 'error' or 'skipped'.
  function utter(chunk, voice, r, signal) {
    let outcome = 'ok';
    return step(signal, (done, onClean) => {
      const u = new SpeechSynthesisUtterance(chunk);
      try { if (voice) { u.voice = voice; u.lang = voice.lang; } } catch { /* a stale voice: the default will do */ }
      u.rate = r.rate;
      u.pitch = r.pitch;
      let over = false;
      const fin = (how) => { if (over) return; over = true; if (how) outcome = how; done(); };
      // Some engines occasionally never fire onend. Notice that the voice has stopped by itself, and failing that
      // fall back to a generous estimate.
      const fallback = setTimeout(() => { try { speechSynthesis.cancel(); } catch { /* ignore */ } fin(); }, 4000 + (wordCount(chunk) / (1.8 * r.rate)) * 1000);
      let heard = false, idle = 0;
      const poll = setInterval(() => {
        let busy = false;
        try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch { /* ignore */ }
        if (busy) { heard = true; idle = 0; } else if (heard && ++idle >= 3) fin();
      }, 250);
      u.onstart = () => { heard = true; };
      u.onend = () => fin();
      u.onerror = (e) => {
        const kind = e && e.error;
        if (kind === 'interrupted' || kind === 'canceled') return fin();
        log('phone voice error: ' + (kind || 'unknown'));
        fin(kind === 'not-allowed' ? 'blocked' : 'error');
      };
      onClean(() => {
        clearTimeout(fallback);
        clearInterval(poll);
        u.onstart = u.onend = u.onerror = null;
        if (!over) { over = true; outcome = 'skipped'; try { speechSynthesis.cancel(); } catch { /* ignore */ } } // Next or Stop
      });
      keepUtterance = u;
      speechSynthesis.speak(u);
    }).then(() => outcome);
  }
  async function speakDevice(text, r, signal) {
    if (!hasTTS) return sleep(1000 + wordCount(text) * 400 / r.rate, signal);
    const chunks = chunkText(text);
    const voice = voices.find((v) => v.voiceURI === r.voiceURI);
    out.playing = true; // the mic must not take the reader's voice for the actor's, or for the room
    out.loopPeak = 0;
    try {
      // Clear anything left over, but only if there is something: on iPhone a speak() straight after a cancel()
      // can be swallowed, so give it a moment.
      let busy = false;
      try { busy = speechSynthesis.speaking || speechSynthesis.pending; } catch { /* ignore */ }
      if (busy) { try { speechSynthesis.cancel(); } catch { /* ignore */ } await sleep(120, signal); }
      for (let i = 0; i < chunks.length; i++) {
        let res = await utter(chunks[i], voice, r, signal);
        if (res === 'blocked' && !(run && run.noTap)) {
          // iPhones only let a page talk after a tap.
          const tapped = await askForTap(signal, 'Tap here to turn the reader\'s sound on', 9000);
          if (!tapped && run) run.noTap = true;
          res = await utter(chunks[i], voice, r, signal);
        }
        if (res === 'skipped') return;
        if (res !== 'ok') {
          // No voice at all for this piece: give the actor the time to read it on screen instead.
          out.path = '';
          setTurn('reader', '🔇 No voice available for this line — read it on screen');
          await sleep(600 + wordCount(chunks[i]) * 380 / r.rate, signal);
          if (run && run.skipped) return;
        } else if (out.path !== 'device') { out.path = 'device'; log('reader audio: phone voice'); }
      }
    } finally {
      out.playing = false;
      out.endedAt = performance.now();
      noteLoopback();
    }
  }

  // ---------- studio voices: Kokoro neural TTS running on the device ----------
  const STUDIO_VOICES = [
    { id: 'af_heart', name: 'Heart', accent: 'US', gender: 'f' },
    { id: 'am_michael', name: 'Michael', accent: 'US', gender: 'm' },
    { id: 'bf_emma', name: 'Emma', accent: 'UK', gender: 'f' },
    { id: 'bm_george', name: 'George', accent: 'UK', gender: 'm' },
  ];
  const STUDIO_KEY = 'cue:studio';
  const STUDIO_MODEL = 'q8'; // the model file voice-worker.js loads
  const studioSupported = typeof Worker !== 'undefined' && typeof WebAssembly === 'object';
  const studio = { downloaded: false, model: '', crashes: 0, noThreads: false, msPerChar: 0, status: 'idle', progress: 0, phase: '', error: '', threads: 0, genMs: 0, genSec: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_KEY) || '{}');
    ['downloaded', 'model', 'crashes', 'noThreads', 'msPerChar'].forEach((k) => { if (k in saved) studio[k] = saved[k]; });
  } catch { /* ignore */ }
  const modelChanged = studio.downloaded && studio.model !== STUDIO_MODEL; // an earlier model is on this phone
  if (modelChanged) { studio.crashes = 0; studio.noThreads = false; studio.msPerChar = 0; } // a different engine: judge it afresh
  const saveStudio = () => {
    try { localStorage.setItem(STUDIO_KEY, JSON.stringify({ downloaded: studio.downloaded, model: studio.model, crashes: studio.crashes, noThreads: studio.noThreads, msPerChar: Math.round(studio.msPerChar) })); } catch { /* ignore */ }
  };
  try { localStorage.removeItem('cue:elevenlabs'); } catch { /* old ElevenLabs key: don't keep it around */ }

  // iPhones close a page that uses too much memory. A crumb is left while the voice engine works; finding one at
  // start-up means the page died mid-work. After that the engine no longer starts by itself (the phone's voice
  // reads, and a button offers another try), so the app can never get stuck in a crash loop.
  const CRUMB_KEY = 'cue:engineBusy';
  try {
    const crumb = Number(localStorage.getItem(CRUMB_KEY) || 0);
    if (crumb && Date.now() - crumb < 30 * 60 * 1000) {
      studio.crashes = (studio.crashes || 0) + 1;
      log('the page closed while the voice engine was working (' + studio.crashes + ' time' + (studio.crashes > 1 ? 's' : '') + ')');
      saveStudio();
    }
    localStorage.removeItem(CRUMB_KEY);
  } catch { /* ignore */ }
  const setCrumb = (on) => {
    try { if (on) localStorage.setItem(CRUMB_KEY, String(Date.now())); else localStorage.removeItem(CRUMB_KEY); } catch { /* ignore */ }
  };
  const engineBlocked = () => studio.crashes >= 1;

  const studioReady = () => studio.status === 'ready';
  const usesStudio = (r) => studioSupported && studio.downloaded && studio.status !== 'error' && !engineBlocked()
    && r.engine !== 'device' && STUDIO_VOICES.some((v) => v.id === r.studioVoice);

  const engine = { worker: null, seq: 0, pending: new Map(), cfg: null, idleTimer: null, fails: 0 };

  // Fastest setting first, safest last. Safari runs the model on one thread: several threads there have a
  // history of running out of memory or hanging.
  function engineLadder() {
    const cap = isWebKit ? 20480 : 0; // a 1.25 GB memory ceiling on iPhone / Safari
    const threads = !isWebKit && window.crossOriginIsolated && !studio.noThreads ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)) : 1;
    const ladder = [];
    if (threads > 1) ladder.push({ threads, capPages: cap });
    ladder.push({ threads: 1, capPages: cap });
    if (isWebKit) ladder.push({ threads: 1, capPages: 12288 }); // 768 MB: still enough, easier for the phone to grant
    return ladder;
  }

  function stopWorker(why) {
    if (engine.worker) { try { engine.worker.terminate(); } catch { /* ignore */ } }
    engine.worker = null;
    engine.cfg = null;
    const err = Object.assign(new Error(why || 'the voice engine was restarted'), { name: 'EngineGone' });
    engine.pending.forEach((p) => { clearTimeout(p.timer); p.reject(err); });
    engine.pending.clear();
  }
  function killEngine(why) {
    stopWorker(why);
    loadPromise = null;
    if (studio.status !== 'error') studio.status = 'idle';
  }

  function engineWorker() {
    if (engine.worker) return engine.worker;
    const w = new Worker('voice-worker.js?v=' + APP_VERSION, { type: 'module' });
    w.onmessage = ({ data }) => {
      if (w !== engine.worker) return;
      engine.pending.forEach((p) => p.arm()); // any message proves the engine is alive
      if (data.type === 'progress') {
        studio.progress = data.total ? data.loaded / data.total : 0;
        studio.phase = studio.progress < 1 ? 'download' : 'start';
        renderEngineUi();
        return;
      }
      if (data.type === 'phase') { studio.phase = data.phase; renderEngineUi(); return; }
      const p = engine.pending.get(data.id);
      if (!p) return;
      engine.pending.delete(data.id);
      clearTimeout(p.timer);
      if (data.type === 'error') p.reject(Object.assign(new Error(data.message), { name: 'EngineError' }));
      else p.resolve(data);
    };
    w.onerror = (e) => {
      if (w !== engine.worker) return;
      const msg = (e && e.message) || 'the voice engine failed to start';
      lastError = 'voice worker: ' + msg;
      log('voice worker error: ' + msg);
      stopWorker(msg);
      // Outside a start-up attempt nothing else will notice, so forget the dead engine here.
      if (studio.status !== 'loading') { loadPromise = null; if (studio.status !== 'error') studio.status = 'idle'; }
    };
    engine.worker = w;
    return w;
  }

  // A request to the engine that gives up if the worker goes silent for stallMs.
  function callEngine(msg, stallMs) {
    return new Promise((resolve, reject) => {
      const id = ++engine.seq;
      const p = { resolve, reject, timer: null, arm: null };
      p.arm = () => {
        clearTimeout(p.timer);
        p.timer = setTimeout(() => {
          if (engine.pending.delete(id)) reject(Object.assign(new Error('the voice engine stopped responding'), { name: 'EngineStall' }));
        }, stallMs);
      };
      p.arm();
      engine.pending.set(id, p);
      try { engineWorker().postMessage(Object.assign({ id }, msg)); } catch (e) {
        engine.pending.delete(id);
        clearTimeout(p.timer);
        reject(e);
      }
    });
  }

  function friendlyEngineError(err) {
    const m = String((err && err.message) || err || 'unknown error');
    if (/out of memory|RangeError|allocation|memory/i.test(m)) return 'not enough free memory for the voice engine (close other tabs and apps, then try again)';
    if (/fetch|network|load failed|NetworkError/i.test(m)) return 'the voice download failed (check the connection, then try again)';
    return m;
  }

  // Earlier versions used other variants of the voice model; their files are 80-330 MB each and no use now.
  function dropOldModels() {
    if (!window.caches) return;
    caches.open('transformers-cache').then((c) => c.keys().then((keys) => keys.forEach((req) => {
      if (/Kokoro-82M/.test(req.url) && /\/onnx\/model[^/]*\.onnx/.test(req.url) && !/\/onnx\/model_quantized\.onnx/.test(req.url)) {
        c.delete(req);
        log('removed an old voice model file');
      }
    }))).catch(() => {});
  }

  let loadPromise = null;
  function studioLoad() {
    if (loadPromise) return loadPromise;
    studio.status = 'loading';
    studio.error = '';
    studio.progress = 0;
    studio.phase = 'start';
    renderEngineUi();
    const attempt = (async () => {
      const ladder = engineLadder();
      let lastErr = null;
      for (const cfg of ladder) {
        try {
          setCrumb(true);
          log(`voice engine starting (${cfg.threads} thread${cfg.threads > 1 ? 's' : ''}${cfg.capPages ? ', ' + Math.round(cfg.capPages / 16) + ' MB ceiling' : ''})`);
          const res = await callEngine(Object.assign({ type: 'load' }, cfg), 90000);
          engine.cfg = cfg;
          studio.threads = res.threads || 1;
          log(`voice engine ready in ${(res.ms / 1000).toFixed(1)}s`);
          return;
        } catch (e) {
          lastErr = e;
          log('voice engine failed to start: ' + ((e && e.message) || e));
          stopWorker();
          if (cfg.threads > 1) { studio.noThreads = true; saveStudio(); }
        }
      }
      throw lastErr || new Error('the voice engine could not start');
    })();
    loadPromise = attempt.then(() => {
      studio.status = 'ready';
      studio.model = STUDIO_MODEL;
      studio.phase = '';
      if (!studio.downloaded) {
        studio.downloaded = true;
        Object.values(state.readers).forEach((r) => { if (r.engine !== 'device') r.engine = 'studio'; });
      }
      saveStudio();
      dropOldModels();
      if (!pumping) setCrumb(false);
      renderCast();
      prepareInBackground();
      scheduleUnload();
    }, (err) => {
      setCrumb(false);
      studio.status = 'error';
      studio.error = friendlyEngineError(err);
      lastError = 'studio: ' + ((err && err.message) || err);
      loadPromise = null;
      failQueue(err);
      renderCast();
      renderEngineUi();
      throw err;
    });
    return loadPromise;
  }

  // A reader line is made and played one sentence-sized piece at a time, so the reader can start speaking after
  // the first sentence instead of after the whole speech.
  function lineChunks(line) {
    const r = readerFor(line.character);
    const speed = Math.min(1.5, Math.max(0.6, r.rate));
    return chunkText(spokenText(line.text), 160, true).filter((text) => /[A-Za-z0-9]/.test(text)).map((text) => ({
      key: ['k3', r.studioVoice, Math.round(speed * 100), text].join('|'), text, voice: r.studioVoice, speed,
    }));
  }
  function studioLinesFrom(from) {
    return state.lines.slice(from).filter((l) => l.type === 'dialogue' && l.character !== state.me && spokenText(l.text) && usesStudio(readerFor(l.character)));
  }

  const ready = new Map();   // piece key -> WAV bytes (ArrayBuffer)
  const jobs = new Map();    // piece key -> piece, for everything queued or being made
  const waiters = new Map(); // piece key -> [{ resolve, reject }]
  let queue = [];            // piece keys still to make, in order
  let pumping = false;
  let making = null;         // the piece the engine is working on: { key, at, est }
  const prep = { total: 0, done: 0 };
  const prepPct = () => (prep.total ? Math.round((prep.done / prep.total) * 100) : 100);

  // The longest silence the actor is asked to sit through for a studio line. Anything slower is read in the phone's
  // voice, because a scene partner who answers late is worse than one who sounds plainer.
  const PATIENCE_MS = 2000;
  const pieceMs = (c) => 250 + c.text.length * (studio.msPerChar || 140); // time to make it
  const speechMs = (c) => { const w = ready.get(c.key); return w ? wavSeconds(w) * 1000 + 140 : c.text.length * 70; }; // time to say it

  // How long the actor would wait in silence if this line were left to the studio voice: 0 when every piece exists,
  // Infinity when the engine isn't running. Pieces made while earlier ones are being spoken cost nothing.
  function studioDelay(chunks) {
    if (chunks.every((c) => ready.has(c.key))) return 0;
    if (studio.status !== 'ready' || !engine.worker) return Infinity;
    const now = performance.now();
    let free = making ? Math.max(200, making.est - (now - making.at)) : 0; // when the engine can take the next piece
    let spoken = 0, worst = 0;
    chunks.forEach((c) => {
      if (!ready.has(c.key)) {
        if (!(making && making.key === c.key)) free += pieceMs(c);
        worst = Math.max(worst, free - spoken);
      }
      spoken += speechMs(c);
    });
    return worst;
  }

  // Bring pieces saved on the phone by an earlier visit straight into memory.
  async function fetchSaved(chunks) {
    const missing = chunks.filter((c) => !ready.has(c.key));
    if (!missing.length) return;
    await Promise.all(missing.map(async (c) => {
      const wav = await cacheGet(c.key);
      if (wav && !ready.has(c.key)) { ready.set(c.key, wav); settle(c.key, wav); }
    }));
    renderPrep();
  }

  function settle(key, wav, err) {
    (waiters.get(key) || []).forEach((w) => (err ? w.reject(err) : w.resolve(wav)));
    waiters.delete(key);
  }
  function failQueue(err) {
    queue = [];
    [...waiters.keys()].forEach((k) => settle(k, null, err));
    jobs.clear();
  }

  async function generate(c) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      await studioLoad();
      if (making && making.key === c.key) making.at = performance.now(); // the clock starts once the engine is up
      try {
        const res = await callEngine(Object.assign({ type: 'speak', text: c.text, voice: c.voice, speed: c.speed }, engine.cfg || {}), Math.max(40000, c.text.length * 700));
        studio.genMs += res.ms;
        studio.genSec += res.seconds;
        if (c.text.length >= 12) {
          const per = res.ms / c.text.length; // how fast this phone makes speech, to judge whether a line will be in time
          studio.msPerChar = studio.msPerChar ? studio.msPerChar * 0.7 + per * 0.3 : per;
        }
        engine.fails = 0;
        return res.wav;
      } catch (e) {
        lastErr = e;
        log('voice engine: ' + ((e && e.message) || e));
        if (e && (e.name === 'EngineStall' || e.name === 'EngineGone')) { killEngine(); continue; } // restart it once and retry
        break;
      }
    }
    if (++engine.fails >= 2) {
      // It keeps failing: stop using it rather than making the actor wait on every line.
      stopWorker();
      loadPromise = null;
      studio.status = 'error';
      studio.error = friendlyEngineError(lastErr);
      lastError = 'studio: ' + ((lastErr && lastErr.message) || lastErr);
    }
    throw lastErr || new Error('the voice engine failed');
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    clearTimeout(engine.idleTimer);
    updateAwake();
    try {
      while (queue.length) {
        const key = queue.shift();
        const c = jobs.get(key);
        if (!c) continue;
        if (ready.has(key)) { jobs.delete(key); settle(key, ready.get(key)); continue; }
        try {
          let wav = await cacheGet(key); // lines already made are saved on the phone and reused
          if (!wav && ready.has(key)) wav = ready.get(key);
          if (!wav) {
            setCrumb(true);
            making = { key, at: performance.now(), est: pieceMs(c) };
            wav = await generate(c);
            if (!wavHasSound(wav)) throw new Error('the voice model produced no sound for this line');
            cachePut(key, wav);
          }
          ready.set(key, wav);
          settle(key, wav);
        } catch (err) {
          settle(key, null, err);
          if (studio.status === 'error') { making = null; failQueue(err); renderCast(); break; }
        }
        making = null;
        jobs.delete(key);
        renderPrep();
      }
      if (studio.status !== 'error' && studio.crashes) { studio.crashes = 0; }
      if (studio.status !== 'error') saveStudio();
    } finally {
      pumping = false;
      making = null;
      setCrumb(false);
      renderPrep();
      scheduleUnload();
    }
  }

  // The model holds several hundred MB. Once every line is made it isn't needed, and iPhones close pages that
  // hold too much memory, so let it go; it reloads from the phone's storage when another line is wanted.
  function scheduleUnload() {
    clearTimeout(engine.idleTimer);
    if (!engine.worker) return;
    engine.idleTimer = setTimeout(() => {
      if (pumping || engine.pending.size || queue.length || studio.status === 'loading') return;
      log('voice engine unloaded (idle)');
      killEngine();
      renderEngineUi();
    }, 30000);
  }

  function want(chunk) {
    if (ready.has(chunk.key)) return Promise.resolve(ready.get(chunk.key));
    if (studio.status === 'error') return Promise.reject(new Error(studio.error || 'the voice engine is unavailable'));
    const p = new Promise((resolve, reject) => {
      if (!waiters.has(chunk.key)) waiters.set(chunk.key, []);
      waiters.get(chunk.key).push({ resolve, reject });
    });
    if (!jobs.has(chunk.key)) { jobs.set(chunk.key, chunk); queue.push(chunk.key); }
    pump();
    return p;
  }
  // Move these pieces to the front of the queue (the line the scene needs right now).
  function prioritise(chunks) {
    const keys = [...new Set(chunks.map((c) => c.key))].filter((k) => queue.includes(k));
    if (keys.length) queue = keys.concat(queue.filter((k) => !keys.includes(k)));
  }
  // The engine works on the lines the scene reaches next, in order; anything already passed goes to the back.
  function frontload(fromIndex) {
    prioritise(studioLinesFrom(fromIndex).flatMap(lineChunks));
  }

  function renderPrep() {
    const chunks = state.me ? studioLinesFrom(state.startIndex).flatMap(lineChunks) : [];
    prep.total = chunks.length;
    prep.done = chunks.filter((c) => ready.has(c.key)).length;
    const pct = prepPct();
    const working = prep.total > 0 && prep.done < prep.total && studio.status !== 'error' && !engineBlocked();
    updateAwake();
    renderStrip();
    if (run || micTest) return;
    if (!state.me) { setTurn('idle', 'Choose who you\'re playing to begin.'); return; }
    if (working) {
      const what = studio.status === 'loading'
        ? (studio.phase === 'download' && studio.progress > 0 && studio.progress < 1
          ? `Downloading the studio voices… ${Math.round(studio.progress * 100)}% (one time only).`
          : 'Starting the studio voices…')
        : `Preparing the studio voices… ${pct}%.`;
      setTurn('idle', `${what} You can start now — until they're ready I'll read in the phone's voice.`);
    } else if (prep.total && studio.status !== 'error') {
      setTurn('idle', 'Ready. Tap ▶ Start scene — I\'ll speak the other parts and listen for yours.');
    } else {
      setTurn('idle', 'Tap ▶ Start scene — I\'ll speak the other parts and listen for yours.');
    }
  }
  function renderEngineUi() {
    renderStudioPanel();
    renderVoiceBanner();
    renderPrep();
  }

  // Queue every reader piece of the scene, in scene order, dropping work nobody needs any more.
  function prepareScene(from) {
    const chunks = studioLinesFrom(from).flatMap(lineChunks);
    const needed = new Set(chunks.map((c) => c.key));
    queue = queue.filter((k) => needed.has(k) || waiters.has(k));
    [...jobs.keys()].forEach((k) => { if (!needed.has(k) && !waiters.has(k) && !queue.includes(k)) jobs.delete(k); });
    chunks.forEach((c) => { want(c).catch(() => {}); });
    prioritise(chunks);
    renderPrep();
  }
  let booted = false; // set a moment after start-up, so nothing heavy begins while the page may still reload
  function prepareInBackground() {
    if (!booted || !studioSupported || !studio.downloaded || !state.me || studio.status === 'error' || engineBlocked()) return;
    prepareScene(state.startIndex);
  }
  let prepTimer = null;
  const prepareSoon = () => { clearTimeout(prepTimer); prepTimer = setTimeout(prepareInBackground, 700); };

  class NotReady extends Error { constructor() { super('the line was not ready in time'); this.name = 'NotReady'; } }
  const CHUNK_WAIT_MS = 90000;
  // Plays a line in the studio voice, piece by piece. A piece that isn't made within waitMs gives up with NotReady.
  async function speakStudio(line, chunks, signal, waitMs) {
    chunks.forEach((c) => { want(c).catch(() => {}); });
    prioritise(chunks);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      try {
        let wav = ready.get(c.key) || null;
        if (!wav) {
          let err = null;
          const waitStart = performance.now();
          const note = setTimeout(() => setTurn('wait', `⏳ ${line.character} is getting ready…`), 350);
          try {
            await step(signal, (done, onClean) => {
              let settled = false;
              const finish = () => { if (!settled) { settled = true; done(); } };
              want(c).then((w) => { wav = w; finish(); }, (e) => { err = e; finish(); });
              const timer = setTimeout(() => { err = new NotReady(); finish(); }, waitMs || CHUNK_WAIT_MS);
              onClean(() => { clearTimeout(timer); settled = true; });
            });
          } finally { clearTimeout(note); }
          if (err) throw err;
          if (!wav) return; // skipped with Next while it was being made
          log(`${line.character}: waited ${((performance.now() - waitStart) / 1000).toFixed(1)}s for a line to be made`);
        }
        setTurn('reader', `🔊 ${line.character} is speaking`);
        await playWav(wav, signal);
        if (run && run.skipped) return; // Next skips the rest of the speech, not just this sentence
        if (i < chunks.length - 1) await sleep(140, signal);
      } catch (e) {
        if (e && e.name !== 'AbortError') e.rest = chunks.slice(i).map((x) => x.text).join(' ');
        throw e;
      }
    }
  }

  function studioNotice(msg) {
    status(msg);
    const m = $('#studioMsg');
    if (m) m.textContent = msg;
  }

  // ---------- listening for the actor's line ----------
  // Resolves when the actor has finished: they spoke and then went quiet. It can never hang: a dead microphone is
  // timed instead, and there are limits for "never started" and "never stopped".
  async function waitForMe(line, signal) {
    const mode = state.settings.advanceMode;
    const words = wordCount(line.text);
    const timedMs = 1200 + words * 420;
    const tapHint = hasTouch ? 'tap here' : 'press Space';
    if (mode === 'timed') {
      setTurn('me', `Your line (timed). ${hasTouch ? 'Tap here' : 'Press Space'} to move on sooner.`);
      await sleep(timedMs, signal);
      return { reason: 'timed' };
    }
    if (mode !== 'voice') {
      setTurn('me', `Your line — ${tapHint} when you've finished.`);
      await step(signal, () => {});
      return { reason: 'tap' };
    }

    // How far through the line the actor is, judged by counting syllables against the number the line has. It doesn't
    // depend on how fast they speak or how long they pause. Early in a line a pause is a breath or a beat, and has to
    // be long before the reader comes in; once nearly all the syllables have been heard, a short pause is the end.
    const expSyl = syllableCount(line.text);
    const ratio = Math.min(1.1, Math.max(0.6, state.settings.sylRatio || 0.78)); // share of syllables the meter catches
    const shortQuiet = state.settings.silenceMs;
    const midQuiet = Math.max(shortQuiet, Math.min(shortQuiet * 2, 2200));
    const longQuiet = Math.max(4000, shortQuiet * 3.5);
    // Long speeches are counted more accurately, and they are where the long pauses are, so they stay patient longer.
    const nearEnd = expSyl >= 40 ? 0.85 : 0.8;
    const pastMiddle = expSyl >= 40 ? 0.72 : 0.5;
    const noVoiceLimit = Math.max(12000, words * 600 + 8000);
    const hardLimit = Math.max(25000, words * 1500 + 12000);
    const result = { reason: 'tap', voicedMs: 0, peak: 0, syl: 0, expSyl, progress: 0 };
    setTurn('me', '🎤 Your line — I\'m listening');

    await step(signal, (done, onClean) => {
      const start = performance.now();
      const guardUntil = Math.max(start, out.endedAt + 350); // let the reader's last word die away first
      let voicedMs = 0, firstVoice = 0, lastVoice = 0, prev = 0, inVoice = false;
      let syl = 0, lastSyl = 0, rising = false, valley = Infinity, peakDb = -Infinity;
      let recovering = false, tried = 0, timedNote = false, hinted = false, shown = '', lead = 3;
      const finish = (reason) => { result.reason = reason; result.voicedMs = Math.round(voicedMs); result.syl = syl; done(); };
      const show = (kind, text) => { if (shown !== text) { shown = text; setTurn(kind, text); } };
      const progressNow = () => Math.max(syl / Math.max(1, expSyl * ratio), firstVoice ? (lastVoice - firstVoice) / Math.max(1500, words * 900) : 0);

      // Every reading of the mic meter (25 a second) lands here.
      mic.listener = (level, now) => {
        if (now < guardUntil || now - mic.openedAt < 150) { prev = now; return; } // skip the click of the mic coming on
        const dt = prev ? Math.min(200, now - prev) : 40;
        prev = now;
        if (lead > 0) {
          // The mic came on to find the actor already talking (three readings in a row, so not just the click of
          // it switching on): count the part of the line it missed.
          if (level <= thrOn()) lead = 0;
          else if (--lead === 0 && mic.half && now - start < 2500) voicedMs += Math.min(250, mic.openMs || 0);
        }
        if (level > result.peak) result.peak = level;
        if (level > thrOn()) {
          voicedMs += dt;
          if (!firstVoice) firstVoice = now;
          lastVoice = now;
          inVoice = true;
        } else if (level > thrOff() && (inVoice || voicedMs >= 250)) lastVoice = now;
        else inVoice = false;
        // A syllable is a rise in level of 3 dB or more followed by a fall of 3 dB.
        const db = 20 * Math.log10(Math.max(level, 1e-7));
        if (!rising) {
          if (db < valley) valley = db;
          if (db > valley + 3 && level > thrOff()) { rising = true; peakDb = db; }
        } else {
          if (db > peakDb) peakDb = db;
          if (db < peakDb - 3) {
            if (now - lastSyl >= 90) { syl++; lastSyl = now; }
            rising = false;
            valley = db;
          }
        }
      };

      const iv = setInterval(() => {
        const now = performance.now();
        const elapsed = now - start;
        if (elapsed > hardLimit) { finish('limit'); return; }

        if (mic.state === 'starting') {
          // The mic is being switched on. If that drags on, the phone is asking for permission.
          if (elapsed > 2500) {
            show('me', `Your line — waiting for the microphone (tap Allow if your phone is asking). ${hasTouch ? 'Tap here' : 'Press Space'} when you've finished.`);
            if (elapsed > Math.max(timedMs, 8000)) finish('timed');
          }
          return;
        }
        if (!micDelivering(now)) {
          // No microphone, or one that has sent nothing for a second and a half. Try to get it back (once per line,
          // twice per scene); failing that, time the line so the scene still moves.
          if (mic.state === 'live' && !recovering && tried < 1 && mic.recoveries < 2) {
            recovering = true;
            tried++;
            recoverMic().then(() => { recovering = false; });
          }
          if (!recovering) {
            if (!timedNote) {
              timedNote = true;
              log('your line: no sound from the mic, timing it instead');
              show('me', `Your line — the mic isn't picking anything up, so I'm timing it. ${hasTouch ? 'Tap here' : 'Press Space'} when you've finished.`);
            }
            if (elapsed > timedMs) finish('timed');
          }
          return;
        }
        if (now < guardUntil) return;

        if (voicedMs >= 250) {
          const quiet = now - lastVoice;
          const progress = progressNow();
          const need = expSyl <= 4 || progress >= nearEnd ? shortQuiet : progress >= pastMiddle ? midQuiet : longQuiet;
          if (quiet >= need) { result.progress = progress; finish('quiet'); return; }
          show('hearing', quiet < 300 ? '🎤 Hearing you…' : '🎤 Listening… (pause when you\'re done)');
        } else {
          if (voicedMs > 0 && now - lastVoice > 1500) { voicedMs = 0; firstVoice = 0; syl = 0; } // a click or a cough, not a line
          if (elapsed > noVoiceLimit) { finish('no-voice'); return; }
          if (!hinted && elapsed > 7000) {
            hinted = true;
            show('me', `🎤 I can't hear you yet — speak up or move closer, or ${tapHint} when you've finished.`);
          }
        }
      }, 40);
      onClean(() => { clearInterval(iv); mic.listener = null; });
    });
    // Learn what share of this actor's syllables the meter catches (it depends on the voice, the mic and the room).
    // It may rise freely but only falls a little per line, so one line that was cut short can't make the next worse.
    if (result.reason === 'quiet' && expSyl >= 10 && result.syl > 0) {
      const seen = result.syl / expSyl;
      if (seen >= 0.4 && seen <= 1.4) {
        const next = seen > ratio ? ratio * 0.5 + seen * 0.5 : Math.max(ratio * 0.93, ratio * 0.8 + seen * 0.2);
        state.settings.sylRatio = +Math.min(1.1, Math.max(0.6, next)).toFixed(3);
        save();
      }
    }
    return result;
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
    const rec = new MediaRecorder(mic.stream, mime ? { mimeType: mime, audioBitsPerSecond: 128_000 } : undefined);
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
    $('#micBtn').hidden = on;
    $$('.tab').forEach((t) => { if (t.dataset.view !== 'stage') t.disabled = on && record; });
  }
  const status = (msg) => { $('#status').textContent = msg || ''; };
  const nowState = (msg) => { const el = $('#nowState'); if (el) el.textContent = msg || ''; };
  // What the big card says and how it looks: idle | reader | wait | me | hearing.
  function setTurn(kind, text) {
    const card = $('#nowCard');
    if (card) card.dataset.turn = kind;
    nowState(text);
  }

  function renderStrip() {
    const el = $('#strip');
    if (!el) return;
    const bits = [];
    const others = state.characters.filter((c) => c !== state.me);
    if (others.length && state.me) {
      if (others.some((c) => usesStudio(readerFor(c)))) bits.push(studio.status === 'loading' ? 'reader: studio voice starting' : `reader: studio voice ${prep.done}/${prep.total}`);
      else bits.push('reader: phone voice');
    }
    const now = performance.now();
    bits.push('mic: ' + (mic.state === 'live' ? (micDelivering(now) ? 'on' : 'on but silent') : mic.state === 'off' && run && run.half ? 'paused' : mic.state));
    if (out.path) bits.push('sound: ' + (out.path === 'webaudio' ? 'web audio' : out.path === 'device' ? 'phone voice' : 'audio element'));
    bits.push('v' + APP_VERSION);
    el.textContent = bits.join(' · ');
  }

  async function runScene(record) {
    if (run || !state.lines.length || !state.me) return;
    const wantsMic = record || state.settings.advanceMode === 'voice';
    const half = wantsMic && useHalf() && !record; // iPhone: the mic is on for the actor's lines only
    const readers = state.characters.filter((c) => c !== state.me).map(readerFor);
    // Everything an iPhone only allows from a tap happens here, before the first wait.
    unlockAudio(!wantsMic || half);
    if (readers.length) unlockSpeech(); // the phone's voice stands in whenever a studio line isn't ready
    stopMicTest(true);
    const ac = new AbortController();
    run = { ac, skip: null, skipped: false, recording: record, half, turn: '' };
    const mineNext = (from) => { for (let k = from; k < state.lines.length; k++) if (state.lines[k].type === 'dialogue') return state.lines[k].character === state.me; return false; };
    const micUsable = () => wantsMic && mic.state !== 'denied' && mic.fails < 3; // a passing failure may be retried
    let settleUntil = 0; // after the mic goes off an iPhone needs a moment to give the loudspeaker back
    setRunning(true, record);
    status('');
    setTurn('idle', record ? 'Getting ready to record…' : 'Starting…');
    updateAwake();
    studioWarned = false;
    mic.recoveries = 0;
    mic.fails = 0;
    mic.slowOpens = 0;
    let failed = '';
    log(`scene started (${record ? 'recording' : 'rehearsal'}, cue: ${state.settings.advanceMode}, from line ${state.startIndex})`);
    let recorder = null;
    try {
      if (wantsMic) {
        // Asked for now, while the actor is still at the phone, even if the first line is the reader's.
        try { await openMic(); } catch (e) {
          if (ac.signal.aborted || (e && e.name === 'AbortError')) throw abortError();
          if (record) throw new Error(micBlockedText(e));
          status(micBlockedText(e) + ' Until then I\'ll time your lines.');
        }
        // A moment of listening to the room, so the first line is judged against the right background level.
        if (micLive() && !mic.calibrated) {
          setTurn('idle', 'Listening to the room…');
          const t0 = performance.now();
          while (!mic.calibrated && performance.now() - t0 < 900 && micLive()) await sleep(60, ac.signal);
        }
      } else setSessionType('playback');
      if (studio.downloaded && !engineBlocked() && studioLinesFrom(state.startIndex).length) prepareScene(state.startIndex);
      if (record) {
        if (isIOS) status('Recording keeps the mic on, and an iPhone then plays the reader more quietly. Headphones avoid that.');
        const n = Number(state.settings.countdown);
        if (n) await countdown(n, ac.signal);
        recorder = startRecorder();
        await sleep(600, ac.signal); // a beat of air before the first line
      }
      for (let i = state.startIndex; i < state.lines.length; i++) {
        const l = state.lines[i];
        if (l.type !== 'dialogue') continue;
        setCurrent(i);
        run.skipped = false;
        if (l.character === state.me) {
          // On iPhone the mic is usually on its way already; elsewhere this brings back a mic the system took away.
          // waitForMe copes while it starts.
          if (micUsable() && (half || !micLive())) openMic().catch(() => {});
          run.turn = 'me';
          const r = await waitForMe(l, ac.signal);
          run.turn = '';
          log(`your line ${i} (${wordCount(l.text)} words): ended by ${r.reason}${r.voicedMs !== undefined ? ` (heard ${(r.voicedMs / 1000).toFixed(1)}s of speech, ${r.syl} of ~${r.expSyl} syllables, loudest ${r.peak.toFixed(4)}, room ${mic.noise.toFixed(4)}${half ? ', mic on in ' + Math.round(mic.openMs) + ' ms' : ''})` : ''}`);
          if (half && !mineNext(i + 1)) { closeMic(); settleUntil = performance.now() + 350; }
        } else {
          if (half) {
            if (micLive() || mic.state === 'starting') { closeMic(); settleUntil = performance.now() + 350; }
            // Would the mic have been off for most of a minute by the end of this line? Then refresh its permission now.
            const off = performance.now() - mic.closedAt;
            if (mic.granted && micUsable() && off > 3000 && (off > 40000 || off + wordCount(l.text) * 420 > 52000)) { await micKeepAlive(ac.signal); settleUntil = performance.now() + 350; }
            const wait = settleUntil - performance.now();
            if (wait > 0) await sleep(wait, ac.signal);
          }
          run.turn = 'reader';
          setTurn('reader', `🔊 ${l.character} is speaking`);
          try { await speakLine(l, ac.signal, { index: i }); } catch (e) {
            if (e && e.name === 'AbortError') throw e;
            // Whatever went wrong with this one line, the scene goes on: hold it on screen for as long as it takes to read.
            lastError = 'reader line: ' + ((e && e.message) || e);
            log(`${l.character}: line ${i} could not be spoken (${(e && e.message) || e})`);
            setTurn('reader', `🔇 ${l.character}'s line couldn't be spoken — read it on screen`);
            await sleep(800 + wordCount(l.text) * 380, ac.signal);
          }
          run.turn = '';
          if (half && micUsable() && mineNext(i + 1)) openMic().catch(() => {}); // the mic comes back on during the gap
        }
        renderStrip();
        if (state.settings.gapMs) await sleep(state.settings.gapMs, ac.signal);
      }
      status('Scene complete.');
      setTurn('idle', 'Scene complete.');
      log('scene complete');
      if (record) await sleep(1200, ac.signal);
    } catch (err) {
      if (err && err.name === 'AbortError') { status('Stopped.'); log('scene stopped'); }
      else {
        const msg = (err && err.message) || String(err);
        failed = msg;
        status(msg);
        lastError = 'scene: ' + msg;
        log('scene error: ' + msg);
        console.error(err);
      }
    } finally {
      if (hasTTS) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
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
      // Keep the mic for a minute in case another run-through follows, then let it go. (On iPhone it goes off at
      // once: the mic being on is what spoils the sound there.)
      if (half) {
        closeMic();
        // Each of those was most likely the phone asking for the microphone again.
        if (mic.slowOpens >= 2 && !failed) status('Your phone kept asking for the microphone. To stop that: page menu in the address bar → Website Settings → Microphone → Allow.');
      } else if (micLive()) mic.releaseTimer = setTimeout(() => { if (!run && !micTest) closeMic(); renderStrip(); }, 60000);
      updateAwake();
      renderDiag();
      setTimeout(() => { if (!run) renderPrep(); }, failed ? 6000 : 2500);
      if (failed) setTurn('idle', '⚠ ' + failed);
      renderStrip();
    }
  }

  // ---------- storage (IndexedDB) ----------
  // IndexedDB has a history of hanging on iPhone, and nothing here may wait on it for ever.
  const withTimeout = (p, ms, what) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(what + ' timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
  let dbp = null;
  let dbTimeouts = 0;
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
        req.onblocked = () => reject(new Error('storage is blocked by another tab'));
      });
    }
    return dbp;
  }
  function tx(mode, fn, store = 'takes', ms = 6000) {
    if (dbTimeouts >= 2) return Promise.reject(new Error('storage is not responding'));
    const work = db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('storage transaction aborted'));
    }));
    return withTimeout(work, ms, 'storage').catch((e) => {
      if (/timed out/.test(e.message) && ++dbTimeouts >= 2) log('phone storage is not responding: working without it');
      throw e;
    });
  }
  // Saved reader audio. Raw bytes rather than Blobs: Blobs kept in IndexedDB are unreliable on iPhone.
  async function cacheGet(key) {
    try {
      const row = await tx('readonly', (s) => s.get(key), 'tts', 1500);
      const wav = row && row.wav;
      return wav && wavHasSound(wav) ? wav : null;
    } catch { return null; }
  }
  function cachePut(key, wav) {
    tx('readwrite', (s) => s.put({ key, wav, created: Date.now() }), 'tts').catch(() => {});
  }
  function cacheClear() { return tx('readwrite', (s) => s.clear(), 'tts').catch(() => {}); }
  // Audio saved by earlier versions (different loudness, stored as Blobs) is no use any more.
  function cachePrune() {
    tx('readwrite', (s) => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (!String(cur.key).startsWith('k3|')) cur.delete();
        cur.continue();
      };
      return req;
    }, 'tts').catch(() => {});
  }

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
    } finally {
      // The text reader's memory isn't needed any more, and iPhones may refuse the voice engine its own while it is held.
      if (ocrWorker) { try { ocrWorker.terminate(); } catch { /* ignore */ } ocrWorker = null; }
    }
  }

  // ---------- wiring ----------
  function showView(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'takes') renderTakes();
    if (name === 'stage') { prepareInBackground(); renderPrep(); }
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
    updateAwake();
  }

  function init() {
    // Ask the browser not to evict saved scripts and takes under storage pressure.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    load();
    if (modelChanged) repickVoices(); // every line is made again for this version anyway
    $('#scriptInput').value = state.script || SAMPLE;
    onScriptChange();
    bindSettings();
    renderTakes();
    cachePrune();
    // Straight to the scene when a script and a role are already set.
    if (state.me && state.lines.some((l) => l.type === 'dialogue')) showView('stage');
    // Start making the reader's lines a moment after start-up.
    setTimeout(() => { booted = true; prepareInBackground(); renderPrep(); }, 1200);
    setInterval(renderStrip, 1000);

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
      if (e.target.dataset.k === 'studioVoice' || e.target.dataset.k === 'voiceURI') r.genderChosen = true;
      save();
      prepareSoon();
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
        r.genderChosen = true;
        r.voiceURI = r.studioVoice = ''; // let autoAssignVoices pick the best unused voice of that type
        renderCast();
        return;
      }
      if (e.target.dataset.act !== 'test') return;
      if (run) return;
      unlockPlayer();
      const name = e.target.closest('.reader').dataset.char;
      const line = state.lines.find((l) => l.character === name) || { character: name, text: 'Hi, I\'ll be reading with you today.' };
      const tmp = { ac: new AbortController(), skip: null, test: true };
      run = tmp;
      speakLine(line, tmp.ac.signal, { patient: true }).catch(() => {}).finally(() => { if (run === tmp) { run = null; renderPrep(); } });
    });

    $('#voiceBanner').addEventListener('click', (e) => {
      if (e.target.dataset.act !== 'fix-voices') return;
      if (engineBlocked() || studio.status === 'error') {
        studio.crashes = 0;
        saveStudio();
        studio.status = 'idle';
        engine.fails = 0;
        renderCast();
        studioLoad().catch(() => {});
      } else if (!studio.downloaded) {
        showView('script');
        $('#voices').scrollIntoView({ behavior: 'smooth', block: 'start' });
        studioLoad().catch(() => {});
      } else {
        state.characters.filter((c) => c !== state.me).forEach((c) => { readerFor(c).engine = 'studio'; });
        renderCast();
        prepareInBackground();
      }
    });
    $('#diag').addEventListener('toggle', renderDiag);
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
      else if (act === 'studio-retry') {
        studio.crashes = 0;
        saveStudio();
        studio.status = 'idle';
        engine.fails = 0;
        renderCast();
        studioLoad().catch(() => {});
      } else if (act === 'studio-clear') {
        await cacheClear();
        ready.clear();
        studioNotice('Saved lines cleared.');
        prepareInBackground();
      } else if (act === 'studio-test') {
        if (run) return;
        unlockPlayer();
        const other = state.characters.find((c) => c !== state.me && usesStudio(readerFor(c)));
        const line = { type: 'dialogue', character: other || '__test', text: 'You were a kid. Anybody would have run. That\'s not on you.' };
        if (!other) state.readers.__test = { engine: 'studio', studioVoice: 'am_michael', gender: 'm', rate: 1, pitch: 1 };
        const tmp = { ac: new AbortController(), skip: null, test: true };
        run = tmp;
        studioNotice('Making a test line…');
        speakStudio(line, lineChunks(line), tmp.ac.signal, CHUNK_WAIT_MS).then(() => studioNotice(''), (err) => studioNotice('Test failed: ' + ((err && err.message) || err)))
          .finally(() => { delete state.readers.__test; if (run === tmp) { run = null; renderPrep(); } });
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
      prepareInBackground();
    });
    $('#micBtn').addEventListener('click', toggleMicTest);
    // During your own line the whole card is a "done" button, in case the mic misses the end of it.
    $('#nowCard').addEventListener('click', (e) => {
      if (run && run.turn === 'me' && run.skip && !e.target.closest('button')) run.skip();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // A locked or backgrounded phone suspends the page: end cleanly rather than freeze mid-line.
        if (run && !run.test) { log('the app went to the background: scene stopped'); run.ac.abort(); }
        stopMicTest();
        closeMic();
        setCrumb(false);
      } else {
        if (audioCtx && audioCtx.state !== 'running') { const p = audioCtx.resume(); if (p && p.catch) p.catch(() => {}); }
        if (pumping) setCrumb(true);
        updateAwake();
        renderPrep();
      }
    });
    window.addEventListener('pagehide', () => setCrumb(false));
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
  window.__cue = { pageToBlocks, blocksToScript, parseScript, chunkText, mic, out, studio, engine, events, state, prep, ready }; // for automated tests
})();
