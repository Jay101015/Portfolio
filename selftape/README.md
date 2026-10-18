# Cue — self-tape reader

A small Raft-style app for rehearsing and recording acting self-tapes, entirely in the browser.

- Paste sides (`NAME: line` or screenplay format), or pick photos/screenshots of your sides and it reads the text (on-device OCR via tesseract.js, bundled in `vendor/`).
- Pick your character.
- The other characters are read aloud by text-to-speech (pick a voice, speed and pitch per character).
- Built-in studio voices (Heart & Michael — US, Emma & George — UK) from the open-source Kokoro-82M model, running on the device via kokoro-js in a Web Worker. One-time ~115 MB download (model from Hugging Face), then offline; generated lines are cached in IndexedDB.
- After your lines the reader cues automatically when you stop speaking (mic), when you press Space, or on a timer.
- Record takes with your camera, or import videos from your camera roll; takes are stored locally in your browser (IndexedDB) and can be downloaded.
- Memorisation modes: show only the first words of your lines, or hide them.

No build step and no backend — just static files. On a phone, use **Add to Home Screen** so it runs like an app and the browser keeps your saved takes.

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import this GitHub repository.
2. Set **Root Directory** to `selftape` and **Framework Preset** to `Other` (leave build command empty).
3. Deploy. Camera and mic need HTTPS, which Vercel provides.

Run locally with any static server, e.g. `npx serve selftape` (use `localhost`, which browsers treat as secure).
