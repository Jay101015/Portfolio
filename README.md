# Cue — self-tape reader

A small Raft-style app for rehearsing acting self-tapes, entirely in the browser: it speaks the other characters'
lines on cue and listens for the end of yours.

- Paste sides (`NAME: line` or screenplay format), or pick photos/screenshots of your sides and it reads the text
  (on-device OCR via tesseract.js, bundled in `vendor/`).
- Pick the character you play. Everyone else is voiced by the reader.
- **Listening:** the microphone meter tells when you have finished a line (it counts syllables against the length of
  the line, so a pause for a beat in the middle doesn't trigger the reader) and the reader answers. Tapping the card,
  or Space, moves on by hand; a dead or blocked microphone falls back to timing the line.
- **iPhone:** iOS plays a page's sound quietly, from the earpiece or with crackles while that page's microphone is
  open. So on iPhone and iPad the mic is only switched on for your own lines and the reader plays through the
  loudspeaker with the mic off. (Recording a take needs the mic throughout, so there it stays on.)
- **Studio voices:** Heart and Michael (US), Emma and George (UK), from the open-source Kokoro-82M model running on
  the device through kokoro-js in a Web Worker. One-time download of about 90 MB from Hugging Face (the 8-bit `q8`
  model), then offline. Lines are made sentence by sentence in scene order and saved in IndexedDB, so a scene that
  has been prepared once starts instantly afterwards.
- **Never waiting:** a line the studio voice hasn't finished making is read in the phone's own text-to-speech voice
  instead, so the scene always flows; the next run-through uses the studio voice.
- Record an audio take of the scene, or import videos from the camera roll; takes stay in the browser (IndexedDB)
  and can be downloaded.
- Memorisation modes: show only the first words of your lines, or hide them.

No build step and no backend — just static files.

## How the voice engine is set up

- `voice-worker.js` loads the plain (non-JSEP) WebAssembly build of ONNX Runtime from `vendor/kokoro/`. The JSEP
  build that transformers.js picks by default crashes Safari 26.2+.
- Safari (every browser on iPhone) runs the model on one thread with a lowered memory ceiling. Chrome, Edge and
  Firefox use several threads; `sw.js` adds the cross-origin-isolation headers that needs, and is never registered
  in Safari.
- The half-precision model variants (`fp16`, `q4f16`) return NaN audio for some sentences, so only `q8` is used, and
  every clip is checked for sound before it is saved or played.

## Deploy

Any static host works; the microphone needs HTTPS. The live copy is published to GitHub Pages from this folder:

    git subtree split --prefix selftape -b gh-pages-tmp
    git push origin gh-pages-tmp:gh-pages
    git branch -D gh-pages-tmp

On Vercel: import the repository, set **Root Directory** to `selftape`, **Framework Preset** to `Other`, no build
command.

Run locally with any static server, e.g. `npx serve selftape` (use `localhost`, which browsers treat as secure).
