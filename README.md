# The Woodworking Guy — Voice Feedback App

A child scans a QR code (or clicks a link), talks to "The Woodworking Guy"
about the project they just built, and their feedback — transcript,
answers, an AI-written summary, key insights, improvement suggestions, and
sentiment — is automatically saved to a database and a Google Sheet.

**This version is built for cost at volume.** No per-minute voice platform
fee — you only pay for raw AI usage (transcription, one short chat
reply, and one short audio clip per turn), roughly **$0.03–0.06 per
interview** (~$30–60 per 1,000 interviews). See "Why turn-based" below for
what that trades off.

## How it works (architecture)

```
Child's phone
   |
   v
Next.js web app (Vercel, plain serverless functions - no always-on server)
   |
   | child taps "Talk", records their answer, taps "Done"
   v
/api/turn   (one call per back-and-forth exchange)
   |
   |-- 1. OpenAI transcription: their audio -> text
   |-- 2. OpenAI chat (gpt-4o-mini): conversation history -> The Woodworking
   |      Guy's next short reply, following the script in lib/systemPrompt.js
   |-- 3. OpenAI text-to-speech: that reply -> an mp3 clip, played back
   |
   v (once the AI has said its goodbye)
lib/analyze.js: one more cheap AI call reads the full transcript and
extracts project name, each answer, a summary, key insights, improvement
suggestions, and overall sentiment
   |
   v
Supabase (database, source of truth)  +  Google Sheet (auto-synced, easy to skim)
```

Everything runs through **one AI vendor (OpenAI)** for transcription, the
conversation itself, and voice — one API key, no separate voice-platform
account, and no per-minute markup on top of the raw usage.

## Why turn-based (and not full real-time interruption)

The original spec wanted the child able to interrupt the AI mid-sentence,
like a real-time phone call. That requires an always-on streaming server
holding a live connection per call — doable, but real infrastructure to
run and pay for. Given the priority is cost at volume (thousands of
interviews), this version uses a **tap-to-talk, then AI replies** flow
instead: still a natural, warm conversation, just without the ability to
talk over the AI. This runs entirely as stateless serverless functions —
nothing to keep running, nothing extra to pay for besides the AI calls
themselves.

If real-time interruption becomes a priority later, the answer is
Pipecat (open-source, free) on a small always-on server (~$10–25/month) —
a meaningful rebuild, not a config change, so worth doing deliberately
if/when it's actually needed.

## Test it for free before paying anything

Set `MOCK_MODE=true` in your `.env.local` and you can run the entire app -
recording, the AI "replying" (canned text, spoken via your browser's free
built-in voice, not OpenAI), a real row landing in Supabase, a real row
landing in your Google Sheet - **without an OpenAI key or any spend at
all.** It's the fastest way to confirm Supabase and Google Sheets are
wired up correctly before you add the $5 minimum OpenAI credit needed for
real AI conversations. Flip it to `MOCK_MODE=false` (and add
`OPENAI_API_KEY`) when you're ready to hear it for real.

## What you need to sign up for

| Service | Why | Cost |
|---|---|---|
| [OpenAI](https://platform.openai.com) | Transcription + conversation + voice | Not needed for testing (`MOCK_MODE=true`). For real use: $5 minimum prepaid credit, then ~$0.03-0.06/interview |
| [Supabase](https://supabase.com) | Database | Free tier is plenty |
| [Google Cloud](https://console.cloud.google.com) | Sheets API access | Free |
| [Vercel](https://vercel.com) | Hosting the web app | Free tier is plenty |

That's it — four accounts, one of which (OpenAI) is the only one that
costs anything, and only as you use it.

---

## Step 1 — Get an OpenAI API key

Go to platform.openai.com → API Keys → Create new key → `OPENAI_API_KEY`.
Add a small amount of credit (a few dollars covers hundreds of test
interviews).

## Step 2 — Set up Supabase (database)

1. Sign up at supabase.com, create a new project.
2. Go to **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. Go to **Project Settings → API**. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** (not the anon key) → `SUPABASE_SERVICE_ROLE_KEY`

## Step 3 — Set up the Google Sheet

1. Create a new Google Sheet, add a tab named exactly `Interviews`.
2. Copy the Sheet ID from its URL (the long string between `/d/` and `/edit`) → `GOOGLE_SHEET_ID`.
3. In [Google Cloud Console](https://console.cloud.google.com), create/reuse a project, enable the **Google Sheets API**.
4. **IAM & Admin → Service Accounts → Create service account**.
5. Open it → **Keys → Add key → Create new key → JSON**. Downloads a `.json` file.
6. Copy that file's entire contents as one string → `GOOGLE_SERVICE_ACCOUNT_JSON`.
7. In the Sheet, click **Share**, add the service account's email (looks like `...@your-project.iam.gserviceaccount.com`) as **Editor**.

## Step 4 — Deploy the app

1. Copy `.env.example` to `.env.local` and fill in every value from Steps 1-3.
2. Locally, inside this folder:
   ```
   npm install
   npm run dev
   ```
   Open `http://localhost:3000` and talk through a full interview to test end to end — this version works fully locally, no webhook/external callback needed.
3. Deploy to **Vercel** (push to GitHub, import in Vercel, or ask Claude to deploy it via the connected Vercel integration). Add every variable from `.env.local` as a Vercel **Environment Variable**.
4. Your production URL (e.g. `https://twg-feedback.vercel.app`) is the link/QR code for kids to use.

## Step 5 — Generate the QR code

Generate a QR code for your production URL with any free QR generator (or ask Claude to make one), and add it to the project's finished instructions/packaging.

## Step 6 — Test it end to end

1. Open the link on your phone, allow microphone access.
2. Talk through a full interview (tap to talk, tap when done, listen, repeat).
3. Check the Supabase `interviews` table and the Google Sheet — a row should appear within a few seconds of the interview ending.
4. If something's missing, check **Vercel → Deployments → Functions logs** for `/api/turn` first.

---

## Reviewing feedback later

- **Quick skim:** the Google Sheet — one row per interview with summary, insights, suggestions, sentiment, and every answer.
- **Deeper analysis:** the Supabase `interviews` table (filter by `project_name`, track sentiment over time, full transcripts in `full_transcript`).

## Editing the interview questions or personality later

Everything the AI does lives in `lib/systemPrompt.js` — no external
dashboard involved. Edit that file, redeploy (Vercel redeploys
automatically on a git push), done. If you add/remove a question, also
update the extraction schema in `lib/analyze.js` and the columns in
`lib/sheets.js` so the new field gets saved.

## Cost estimate (the part that matters most to you)

Per ~4-minute interview, roughly:
- Transcription (~2 min of child's speech): ~$0.006-0.012
- Conversation (gpt-4o-mini, ~12 short turns): ~$0.002-0.005
- Voice replies (~1,500-2,500 characters of TTS): ~$0.02-0.04
- Final analysis (one call): ~$0.001

**Total: roughly $0.03-0.06 per interview, or $30-60 per 1,000
interviews.** Supabase and Vercel stay free at this volume. Compare: the
platform-based version this replaced would have run $300-600 per 1,000
interviews — this is a 5-10x cost reduction, which is the whole point of
the rebuild.

## Browser compatibility note

This uses the browser's `MediaRecorder` API to record each answer.
Well-supported on modern Android Chrome and iOS Safari (14.3+), but worth
testing on both before printing QR codes widely — recording format
support varies slightly (handled automatically in `app/interview/page.js`
via `pickMimeType()`, but real-device testing is still worth doing once).
