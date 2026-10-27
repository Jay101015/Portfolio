# Studio courier: sending what the studio queued

claude.ai has no GitHub connector, and a web page cannot make Claude commit on its own. So the studio (the artifact
page https://claude.ai/artifact/VB5NA2S3VMxxKTUHRWtvgn) stores what it sends in its own storage and queues a job;
you then say **send** in the courier Claude Code session, which follows the steps below. The studio watches the job
and loads the result by itself.

## Before a video goes out

Check the length: the goal is 10 minutes, 8 at the least (mid-roll ads start at 8). Say the running time when the
video is delivered, and if it is short, which section a fresh recording could add.

Footage the stock libraries do not have (UK streets, terraces, estates, named places) is not forced: push
`scout.txt` with a few searches first (`.github/workflows/footage-scout.yml`, a contact sheet in minutes on the
footage-scout release), and where nothing fits use a drawing or Jeffrey's own phone clips.

Open the render's `footage-check.png` (kept with the project and on the release page): one frame from every piece of
footage beside the words it plays under. For a clip that does not show the idea of its sentence, open
`footage-candidates.png`: the finder ranked twenty results and shows the chosen clip with the two runners-up. If a
runner-up is right, put `pick=2` (or `pick=3`) on the scene, drop its `src=`/`credit=` and delete the file from
`media/`; if none is right, change the `search=` words to name the thing in the picture. Either way before the
video is sent. The same for the opening: the first five seconds are checked frame by frame. A scene that names a
company or a public body gets its footage from that organisation's press room or an Open Government Licence source
(docs/footage-sources.md), linked in media/sources.txt, not from a stock search.

## Steps (for Claude in the courier session, when the user says "send")

Use the ArtifactData tool (load it with ToolSearch `select:ArtifactData` if it is not loaded). Jobs are documents in
collection `data/users/me` of the artifact above. Every write to a job after you read it must pass `if_version` = the
version from your previous read or write of that job.

1. ArtifactData `query` collection `data/users/me` with where `[["kind", "==", "job"]]` and out_dir
   `/tmp/courier/jobs` (clear `/tmp/courier` first). Keep only jobs whose status is `queued` or `started`, oldest
   `createdAt` first. If there are none, say "nothing queued" and stop.
2. In the repository checkout (`/home/user/Portfolio`): `git checkout claude/video-pipeline && git pull -q --rebase origin claude/video-pipeline`
3. For each job, in order:
   1. ArtifactData `update` the job with `{"status": "working"}`.
   2. For every id in the `assets` lists of the job's `files` entries (there may be none), fetch it with the Artifact
      tool: action `read`, the artifact URL above, `path` = the id, out_dir `/tmp/courier/fetched`. Do not open or
      print what you fetch.
   3. `cd video-pipeline && python3 -m pipeline.courier place <that job's JSON file> /tmp/courier/fetched`
      writes the files (only ever inside `video-pipeline/projects/<project>/`), commits, pushes and prints
      `pushed <commit>`. Then update the job with `{"status": "pushed", "commit": "<commit>"}`.
   4. If the job's `wait` is not null: `cd video-pipeline && python3 -m pipeline.courier wait <the job JSON file>
      /tmp/courier/result-<job id>.json` waits for the transcription (a GitHub Action) for up to 9 minutes; if it
      prints "still waiting", run it once more. If it is still waiting after the second run, update the job with
      `{"status": "timeout"}`. When it writes the result file and the result says `transcribed`, give the draft the
      editor's pass BEFORE the studio sees it (this is the one file you edit): keep the original,
      `cp video-pipeline/projects/<slug>/draft.md /tmp/courier/before-<job id>.md`, read `video-pipeline/EDITOR.md`
      and rewrite `draft.md` as it says (tags only: a hook with a drawing, a headline and a drawing on every text
      scene, stock footage as its own `[broll]` scene about one in four, takeaway cards, a recap; every spoken word
      stays). Real figures: every sentence that states or leans on a UK or US figure gets `[stat fact="..."]` from
      the catalogue (`python3 -m pipeline.find_facts --list`), or a figure you look up with WebSearch written as
      `value=` and `source="<publisher>, <month year>"`; a sentence about what may happen (a rule or rate changing)
      gets a `[news search="..."]` scene. Check it: `cd video-pipeline && python3 -m
      pipeline.polish_check /tmp/courier/before-<job id>.md projects/<slug>/draft.md`. If it prints REFUSED, fix the
      draft and check again, at most three times; if it still refuses, put the original back. Commit `Editor's pass:
      <title>`, push, then run the `wait` command once more so the result file carries the polished draft. Then
      update the job with `file_path` set to the result file.
   5. If the job's `wait` has `render: true` (a Ship: the push starts a render of about half an hour), first set up
      the "it's done" notification, then bring the video back so the studio can save it to the phone:
      - Right after the push, create a one-shot scheduled task with `create_trigger`: `create_new_session_on_fire`
        true, `notifications` `{"push": true, "email": true}`, `run_once_at` 35 minutes from now, name
        `Tell me when <title> is rendered`, and this prompt (fill in the title, the commit and the run: the run id is
        the newest "Render video" run for that commit from
        `curl -s "https://api.github.com/repos/Jay101015/Portfolio/actions/runs?branch=claude/video-pipeline&per_page=5"`):

        > You are the render watcher for the Everyday Investor studio. Unattended: do only these steps, never ask
        > questions. The video "<title>" (commit <commit>) is rendering on GitHub Actions in the public repository
        > Jay101015/Portfolio. 1. Run: curl -s -H "Accept: application/vnd.github+json"
        > "https://api.github.com/repos/Jay101015/Portfolio/actions/runs/<run id>" and read "status" and
        > "conclusion". 2. If status is "completed" and conclusion is "success": reply with exactly this, and nothing
        > else: "Your video “<title>” is rendered. Open the studio and tap ⬇ under the timeline to save it to your
        > camera roll. If it is not on the list yet, give the courier a few more minutes." 3. If status is "completed"
        > and conclusion is anything else: reply "The render of “<title>” failed on GitHub (conclusion:
        > <conclusion>). Tell Claude in the studio chat and it will look at the logs." 4. If it is still running:
        > create a one-shot scheduled task with create_trigger (create_new_session_on_fire true, notifications push
        > and email on, run_once_at 15 minutes from now, this same prompt with the check number raised by one) and
        > reply "Still rendering: I will check again in 15 minutes." This is check number 1 of at most 6; at check
        > number 6, instead reply "The render has been going for over two hours: tell Claude in the studio chat." Do
        > not change any files, do not push anything, do not post anywhere else.
      - `cd video-pipeline && python3 -m pipeline.courier video <the job JSON file> <the commit from step 3> /tmp/courier/video-<job id>`
        waits for the render to replace the release's videos (up to 9 minutes a run; it prints "still rendering: run
        this again" until then: run it again, up to eight times in all), then fetches both cuts and writes them in
        pieces with a `manifest.json`.
      - Upload every piece listed in the manifest (`video.landscape.pieces`, `video.vertical.pieces` and any Shorts,
        `video.short1.pieces`, `video.short2.pieces`..., in order)
        with the Artifact tool: `asset: true`, the artifact URL above, `file_paths` = the pieces. Note each piece's
        asset id.
      - Update the job with `{"status": "rendered", "video": {"landscape": {"name", "bytes", "assets": [ids in
        order]}, "vertical": {...}, "short1": {...}, ...}}` (name and bytes from the manifest; one entry per key in
        the manifest's `video`).
      - Then, for every OTHER job of the same video that has a `video` field, delete its pieces from the store
        (Artifact action `delete`, `path` = each asset id) and update that job with `{"video": {"__delete__": true}}`,
        so the store holds one video per project.
      If it is still rendering after the eighth run, update the job with `{"status": "timeout"}`.
   A ship whose script is the same as the last rendered one is a duplicate and is marked `cancelled`, unless its
   files include a `shorts.json`: that is a request to cut Shorts from the video already made, and it goes through.
   6. If a step fails, update that job with `{"status": "failed", "error": "<one line: which step, and the error>"}`
      and go on to the next job.

Apart from the editor's pass on a project's draft.md, do not edit or create any other files; do not open pull requests, and do not post anywhere. Reply with one line per
job: its id and its final status.
