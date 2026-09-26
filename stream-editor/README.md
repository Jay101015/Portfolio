# Clip Cutter: a phone-first stream editor

Turn long stream VODs into a highlight video and a thumbnail from your phone. Everything runs in the browser. Your video is never uploaded anywhere.

## How it works

1. **✨ Auto-edit.** Scans the VOD by seeking through it and measuring how much each frame changes. Big changes mean fights, kills and chaos. Small changes mean menus, loading screens and AFK. Pick a style:
   - 🔥 Highlight Reel (~8 min) · 📱 Shorts/TikTok (<60s, 9:16) · ⚡ Quick Montage (~3 min) · 🎬 Stream Recap (~20 min)
   - 🧹 Cut Dead Air: keeps the whole stream and drops the quiet parts
   - ✋ Do it yourself: starts from the full video
2. **✂️ Edit.** If you don't like the auto cut, you can:
   - drag clips by the ⠿ handle to reorder them
   - trim with sliders, ±1s nudges or "Start/End = playhead"
   - split, duplicate, delete, add a clip at the playhead, and undo
   - use the heat-map timeline to jump to any spot in the VOD
3. **🖼️ Thumbnail** (1280×720):
   - use suggested high-action frames or any frame you pick
   - brightness, contrast and color-pop sliders, plus a vignette
   - big outlined text in 4 fonts, emoji stickers, and your face or logo image
   - drag to move and pinch to resize, or start from a template
   - download it as a PNG
4. **⬇️ Export.** YouTube 16:9 or Shorts/TikTok 9:16 (blurred fill, zoom, or black bars), 720p or 1080p. You can show the thumbnail as a 1–3s intro. Then save the file or share it straight to another app.

Rendering happens in real time on the device (MediaRecorder). A 5-minute edit takes about 5 minutes, and you need to keep the screen on. Safari saves MP4; Chrome saves MP4 or WebM, depending on version.

Your edit is saved in the browser for each file, so if you pick the same VOD again it offers to restore your work.

## Develop

```bash
cd stream-editor
npm install
npm run dev      # opens on your LAN too, so you can test on your phone
npm run build
```

## Deploy to Vercel

1. On vercel.com, go to **Add New → Project** and import this GitHub repo.
2. Set **Root Directory** to `stream-editor`. Vercel detects Vite, and `vercel.json` sets the build settings.
3. Click Deploy. On your phone, open the URL and use **Share → Add to Home Screen** so it runs like an app.

Or deploy from the CLI: `cd stream-editor && npx vercel --prod`.
