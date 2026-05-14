# VAPI Campaign Dialer

An AI-powered outbound call campaign dashboard built with React + Vite, [VAPI](https://vapi.ai) (AI phone calls), and [Supabase](https://supabase.com) (database + real-time updates).

Upload a contact list, configure your AI assistant, and launch fully automated outbound call campaigns — all from a single dashboard.

---

## What Is This?

VAPI Campaign Dialer lets you run outbound AI phone call campaigns. You provide a list of contacts (CSV, Excel, or TXT), and the dashboard dials each one using a VAPI AI voice assistant. As calls complete, outcomes update in real time: answered, voicemail, declined, no answer, or failed.

This is a **base template** — the AI assistant's purpose and script are fully customizable. Drop in your own VAPI system prompt for any outbound use case (lead qualification, outreach, reminders, surveys, etc.).

**Key features:**
- Upload contacts via CSV, Excel (.xlsx / .xls), or TXT
- Map columns (phone, name) during import
- Configurable delay between calls
- Pause / resume campaigns mid-run
- Live call status feed with per-contact transcripts, summaries, and recordings
- Stats: answered, voicemail, declined / no answer / failed
- Export results to CSV, Excel (.xlsx), LibreOffice Calc (.ods), or Text (.txt)
- Campaign history — reload any past campaign's results from the History tab
- DEMO mode — full simulated campaign with no external services required
- LIVE mode — real VAPI calls with real-time Supabase updates

---

## How It Works

```
┌──────────────┐     REST API      ┌──────────────┐
│   Dashboard  │ ──────────────▶  │  VAPI API     │
│  (React/Vite)│                   │  (outbound    │
│              │ ◀── Supabase ──   │   AI calls)   │
│              │   Realtime        └──────┬────────┘
└──────────────┘                         │ webhook
                                         ▼
                                 ┌──────────────────┐
                                 │ Supabase Edge Fn  │
                                 │  /vapi-webhook    │
                                 │  (updates calls   │
                                 │   table in DB)    │
                                 └──────────────────┘
```

1. You import contacts and click **Launch Campaign**
2. The dashboard inserts each contact into Supabase and fires a VAPI outbound call via the REST API
3. During and after the call, VAPI sends webhooks to the Supabase Edge Function (`mark_declined`, `mark_call`, `end-of-call-report`, etc.)
4. The Edge Function writes outcomes back to Supabase
5. Supabase Realtime pushes the update to the dashboard instantly

---

## Prerequisites

| Service | What you need | Where to get it |
|---------|--------------|-----------------|
| **Supabase** | Project URL, Anon (publishable) key, Service Role key | [supabase.com](https://supabase.com) → your project → Settings → API |
| **VAPI** | API Key, Assistant ID, Phone Number ID | [vapi.ai](https://vapi.ai) → dashboard |
| **Node.js** | v18 or later | [nodejs.org](https://nodejs.org) |
| **Supabase CLI** | For deploying the Edge Function | `npm i -g supabase` |

---

## Step-by-Step Setup

### Step 1 — Clone and install

```bash
git clone https://github.com/dquinn089/vapi-campaign-dialer.git
cd vapi-campaign-dialer
npm install
```

### Step 2 — Configure credentials

You have two options — pick one:

#### Option A: Dashboard UI (no `.env` required)

Leave the `.env` file blank and enter everything through the dashboard after running `npm run dev`. Open ⚙ **CONFIG** and fill in:

- **VAPI tab** — API Key, Assistant ID, Phone Number ID
- **Database tab** — Supabase Project URL and Anon Key

Credentials are saved to `localStorage` and persist across page reloads. Nothing is committed to the repo.

#### Option B: `.env` file (pre-fills the dashboard on first load)

```env
# Supabase
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>

# VAPI
VITE_VAPI_API_KEY=<your-vapi-api-key>
VITE_VAPI_ASSISTANT_ID=<your-vapi-assistant-id>
VITE_VAPI_PHONE_NUMBER_ID=<your-vapi-phone-number-id>
```

> `.env` is git-ignored and will never be committed. The dashboard UI always takes precedence over `.env` values once credentials have been saved once.

### Step 3 — Create the Supabase database schema

In the Supabase dashboard go to **SQL Editor** and run:

```sql
CREATE TABLE IF NOT EXISTS calls (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        TEXT,
  business_name      TEXT NOT NULL,
  phone              TEXT NOT NULL,
  contact_name       TEXT,
  status             TEXT DEFAULT 'pending',
  vapi_call_id       TEXT UNIQUE,
  transcript         TEXT,
  duration_sec       INTEGER DEFAULT 0,
  end_reason         TEXT,
  summary            TEXT,
  sentiment          TEXT,
  recording_url      TEXT,
  scheduled_date     TEXT,
  scheduled_time     TEXT,
  decline_reason     TEXT,
  callback_requested BOOLEAN DEFAULT false,
  notes              TEXT,
  called_at          TIMESTAMPTZ,
  scheduled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_campaign_id_idx ON calls (campaign_id);
CREATE INDEX IF NOT EXISTS calls_vapi_call_id_idx ON calls (vapi_call_id);
```

### Step 4 — Enable Realtime on the `calls` table

In the Supabase dashboard:
1. Go to **Database → Replication**
2. Find the `calls` table and toggle **Realtime** on

### Step 5 — Create your VAPI assistant

In the VAPI dashboard:
1. Create a new **Assistant** and write a system prompt for your use case (see [System Prompt](#system-prompt) below)
2. Add a **Phone Number** (outbound)
3. Add the following tools to the assistant, all pointing to your Edge Function URL:
   `https://<your-project-ref>.supabase.co/functions/v1/vapi-webhook`

   | Tool name | When to call | Arguments |
   |-----------|-------------|-----------|
   | `mark_declined` | Contact explicitly declines or says do not call | `reason` (string) |
   | `mark_call` | Contact wants a callback or the call ends with a note | `notes` (string) |

4. Copy the **Assistant ID** and **Phone Number ID** into the dashboard (or `.env`)

### Step 6 — Deploy the Supabase Edge Function

These commands are run in your **Terminal** (Mac/Linux) or **Command Prompt / PowerShell** (Windows), from inside the project folder. Make sure you have the Supabase CLI installed (`npm i -g supabase`) before running them.

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
supabase functions deploy vapi-webhook --no-verify-jwt
```

- `supabase login` — opens a browser to authenticate with your Supabase account
- `supabase link` — connects this project folder to your Supabase project. Your project ref is the string in your Supabase project URL: `https://supabase.com/dashboard/project/<your-project-ref>`
- `supabase secrets set` — uploads your Service Role key to the Edge Function as a secret (never hardcoded)
- `supabase functions deploy` — uploads the `supabase/functions/vapi-webhook/index.ts` file to Supabase and makes it live

Once deployed, the function URL will be:
`https://<your-project-ref>.supabase.co/functions/v1/vapi-webhook`

Use this URL when adding the tools to your VAPI assistant in Step 5.

### Step 7 — Run the dashboard

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## System Prompt

This is a base template — the assistant's personality, purpose, and script are yours to define. The only structural requirements are that the assistant knows when to call `mark_declined` and `mark_call`, and that it uses `end_call` to hang up cleanly.

A starter prompt is included in the repo. Key guidance to include in any prompt:

- **Call `mark_declined`** when the contact says no or asks to stop being called
- **Call `mark_call`** when the contact wants a follow-up or you need to log notes
- **Call `end_call` immediately after saying goodbye** — do not wait for a response

---

## Using the Dashboard

### DEMO mode vs LIVE mode

- **DEMO** (default) — simulated campaign with fake call outcomes. No credentials needed. Great for exploring the UI.
- **LIVE** — activated automatically once all three VAPI credentials are present (via dashboard config or `.env`). Makes real outbound calls.

The mode badge in the header shows `● LIVE` or `◌ DEMO`.

### Importing contacts

1. Click **Import File** in Campaign Setup
2. Drag-and-drop or select a file: CSV, Excel (.xlsx / .xls), or TXT
3. Map the **Phone** column (required) and optionally the **Name** column
4. Preview and confirm

### Running a campaign

1. Enter a **Campaign Name** and **Business Name**
2. Add contacts manually or via import
3. Click **Launch Campaign**
4. Use **Pause** / **Resume** to hold or continue mid-campaign
5. The **Results** tab updates in real time as calls complete

### Exporting results

Once any call has a result, an **↓ Export Results** button appears above the results table. Choose from:

- **CSV** — universal, opens in any spreadsheet app
- **Excel (.xlsx)** — Microsoft Excel
- **LibreOffice Calc (.ods)** — open format
- **Text (.txt)** — tab-separated, plain text

The export includes: contact name, phone, status, duration, called at, summary, transcript, sentiment, end reason, callback requested, decline reason, and notes.

### Campaign history

The **History** tab lists every campaign that has been launched. Click any entry to reload its contacts and results into the Results tab.

---

## Project Structure

```
vapi-campaign-dialer/
├── src/
│   ├── main.jsx                    # React entry point
│   ├── App.jsx                     # Root app component
│   ├── VapiCampaignDashboard.jsx   # Main dashboard
│   └── lib/
│       └── supabase.js             # Static Supabase client (env-var fallback)
├── supabase/
│   └── functions/
│       └── vapi-webhook/
│           └── index.ts            # Edge Function (Deno)
├── .env.example                    # Credentials template (optional)
├── index.html
├── vite.config.js
└── package.json
```

---

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys to GitHub Pages on every push to `main`.

**One-time setup:**

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Add the following secrets (optional — users can enter credentials via the dashboard UI instead):

   | Secret name | Value |
   |-------------|-------|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon key |
   | `VITE_VAPI_API_KEY` | Your VAPI API key |
   | `VITE_VAPI_ASSISTANT_ID` | Your VAPI assistant ID |
   | `VITE_VAPI_PHONE_NUMBER_ID` | Your VAPI phone number ID |

   > If you skip the secrets, the deployed app starts with empty credentials and users configure everything through the dashboard UI.

3. Go to **Settings → Pages** and set **Source** to `GitHub Actions`

After pushing to `main`, the dashboard will be live at:
`https://dquinn089.github.io/vapi-campaign-dialer/`

---

## Tech Stack

- **React 18** + **Vite 6**
- **Supabase** — PostgreSQL database, Realtime subscriptions, Edge Functions (Deno)
- **VAPI** — AI voice calls, tool calls, webhooks
- **PapaParse** — CSV parsing
- **SheetJS (xlsx)** — Excel / ODS file import and export

---

## License

MIT
