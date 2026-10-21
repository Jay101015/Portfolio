# Studio courier: sending what the studio queued

claude.ai has no GitHub connector, and a web page cannot make Claude commit on its own. So the studio (the artifact
page https://claude.ai/artifact/VB5NA2S3VMxxKTUHRWtvgn) stores what it sends in its own storage and queues a job;
you then say **send** in the courier Claude Code session, which follows the steps below. The studio watches the job
and loads the result by itself.

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
      prints "still waiting", run it once more. When it writes the result file, update the job with `file_path` set
      to it. If it is still waiting after the second run, update the job with `{"status": "timeout"}`.
   5. If the job's `wait` has `render: true` (a Ship: the push starts a render of about half an hour), first set up
      the "it's done" notification, then bring the video back so the studio can save it to the phone:
      - Right after the push, create a one-shot scheduled task with `create_trigger`: `create_new_session_on_fire`
        true, `notifications` `{"push": true, "email": true}`, `run_once_at` 35 minutes from now, name
        `Tell me when <title> is rendered`, and this prompt (fill in the title, the commit and the run: the run id is
        the newest "Render video" run for that commit from
        `curl -s "https://api.github.com/repos/Jay101015/Portfolio/actions/runs?branch=claude/video-pipeline&per_page=5"`):

        > You are the render watcher for the MONEY MOVES studio. Unattended: do only these steps, never ask
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
      - Upload every piece listed in the manifest (`video.landscape.pieces` and `video.vertical.pieces`, in order)
        with the Artifact tool: `asset: true`, the artifact URL above, `file_paths` = the pieces. Note each piece's
        asset id.
      - Update the job with `{"status": "rendered", "video": {"landscape": {"name", "bytes", "assets": [ids in
        order]}, "vertical": {...}}}` (name and bytes from the manifest).
      - Then, for every OTHER job of the same video that has a `video` field, delete its pieces from the store
        (Artifact action `delete`, `path` = each asset id) and update that job with `{"video": {"__delete__": true}}`,
        so the store holds one video per project.
      If it is still rendering after the eighth run, update the job with `{"status": "timeout"}`.
   6. If a step fails, update that job with `{"status": "failed", "error": "<one line: which step, and the error>"}`
      and go on to the next job.

Do not edit or create any other files, do not open pull requests, and do not post anywhere. Reply with one line per
job: its id and its final status.
