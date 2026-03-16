# VAPI Campaign Dialer

An AI-powered outbound call campaign dashboard built with React + Vite, [VAPI](https://vapi.ai) (AI phone calls), and [Supabase](https://supabase.com) (database + real-time updates).

Upload a contact list, configure your AI assistant, and launch fully automated outbound call campaigns — all from a single dashboard.

---

## What Is This?

VAPI Campaign Dialer lets you run outbound AI phone call campaigns at scale. You provide a list of contacts (CSV, Excel, or TXT), and the dashboard dials each one using VAPI's AI voice assistant. As calls complete, outcomes are updated in real time: answered, voicemail, scheduled, declined, no answer, or failed.

**Key features:**
- Upload contacts via CSV, Excel (.xlsx/.xls), TXT, or TSV
- Map columns (name, phone, company, etc.) to contact fields
- Configurable concurrency (calls at once) and delay between calls
- Pause / resume campaigns mid-run
- Live call status feed with per-contact transcripts
- Appointment scheduling via VAPI tool calls
- Stats bar: answered, voicemail, scheduled, no-answer, declined, failed
- DEMO mode — runs a full simulated campaign with no external services required
- LIVE mode — real VAPI calls, real-time Supabase updates

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

1. You import contacts and click **Start Campaign**
2. The dashboard inserts each contact into Supabase and fires a VAPI outbound call via the REST API
3. During the call, VAPI sends tool-call webhooks to the Supabase Edge Function (e.g., `schedule_appointment`, `mark_declined`, `update_status`)
4. The Edge Function writes outcomes back to Supabase
5. Supabase Realtime pushes the update to the dashboard instantly

---

## Prerequisites

Before you begin you will need accounts and credentials from three services:

| Service | What you need | Where to get it |
|---------|--------------|-----------------|
| **Supabase** | Project URL, Publishable (anon) key, Service Role key | [supabase.com](https://supabase.com) → your project → Settings → API |
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

### Step 2 — Configure environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>

VITE_VAPI_API_KEY=<your-vapi-api-key>
VITE_VAPI_ASSISTANT_ID=<your-vapi-assistant-id>
VITE_VAPI_PHONE_NUMBER_ID=<your-vapi-phone-number-id>
```

> `.env` is git-ignored and will never be committed.

### Step 3 — Create the Supabase database schema

In the Supabase dashboard go to **SQL Editor** and run the following:

```sql
CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       TEXT NOT NULL,
  vapi_call_id      TEXT,
  contact_name      TEXT,
  contact_phone     TEXT NOT NULL,
  contact_company   TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  transcript        TEXT,
  notes             TEXT,
  scheduled_date    TEXT,
  scheduled_time    TEXT,
  duration          INTEGER,
  scheduled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
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
1. Create a new **Assistant** and write a system prompt for your use case
2. Add a **Phone Number** (outbound)
3. Add the following three **tools** to the assistant, all pointing to your Edge Function URL:
   `https://<your-project-ref>.supabase.co/functions/v1/vapi-webhook`

   | Tool name | Description |
   |-----------|-------------|
   | `schedule_appointment` | Called when contact agrees to a meeting. Args: `contact_name`, `scheduled_date` (YYYY-MM-DD), `scheduled_time`, `notes` |
   | `mark_declined` | Called when contact explicitly declines. Args: `reason` |
   | `update_status` | Called to set the final call status. Args: `status` (answered/voicemail/no_answer/failed), `notes` |

4. Copy the **Assistant ID** and **Phone Number ID** into your `.env`

### Step 6 — Deploy the Supabase Edge Function

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
supabase functions deploy vapi-webhook --no-verify-jwt
```

The function URL will be:
`https://<your-project-ref>.supabase.co/functions/v1/vapi-webhook`

### Step 7 — Run the dashboard locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Using the Dashboard

### DEMO mode vs LIVE mode

- **DEMO** (default) — runs a simulated campaign with fake call outcomes. No VAPI credentials needed. Great for testing the UI.
- **LIVE** — activated automatically when all three VAPI credentials are present in the settings panel (or in `.env`). Makes real outbound calls.

The mode badge in the top-right corner shows `● LIVE` or `◌ DEMO`.

### Importing contacts

1. Click **Import Contacts**
2. Drag-and-drop or select a file: CSV, Excel (.xlsx/.xls), TXT, or TSV
3. Map the columns to fields: **Phone** (required), Name, Company, Email
4. Preview the contacts and click **Import**

Minimum required: a **Phone** column. Everything else is optional.

### Running a campaign

1. Enter a **Business Name** (used in the AI's greeting)
2. Open **VAPI Settings** and paste your API Key, Assistant ID, and Phone Number ID (if not already in `.env`)
3. Set **Concurrent Calls** (how many calls run simultaneously)
4. Set **Delay Between Calls** (seconds between dialing each contact)
5. Click **Start Campaign**
6. Use **Pause** / **Resume** to hold/continue mid-campaign

### Reading results

Each contact card shows:
- Status badge (Calling, Answered, Voicemail, Scheduled, Declined, No Answer, Failed)
- Duration
- Appointment time (if scheduled)
- Expandable transcript

The stats bar at the top tracks totals per outcome in real time.

---

## Project Structure

```
vapi-campaign-dialer/
├── src/
│   ├── main.jsx                    # React entry point
│   ├── App.jsx                     # Root app component
│   ├── VapiCampaignDashboard.jsx   # Main dashboard (2300+ lines)
│   └── lib/
│       └── supabase.js             # Supabase client
├── supabase/
│   └── functions/
│       └── vapi-webhook/
│           └── index.ts            # Edge Function (Deno)
├── .env.example                    # Credentials template
├── index.html
├── vite.config.js
└── package.json
```

---

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow that automatically builds and deploys the dashboard to GitHub Pages on every push to `main`.

**One-time setup:**

1. Go to your repo on GitHub → **Settings → Secrets and variables → Actions**
2. Add the following repository secrets:

   | Secret name | Value |
   |-------------|-------|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon/publishable key |
   | `VITE_VAPI_API_KEY` | Your VAPI API key |
   | `VITE_VAPI_ASSISTANT_ID` | Your VAPI assistant ID |
   | `VITE_VAPI_PHONE_NUMBER_ID` | Your VAPI phone number ID |

3. Go to **Settings → Pages** and set **Source** to `GitHub Actions`

After pushing to `main`, the dashboard will be live at:
`https://dquinn089.github.io/vapi-campaign-dialer/`

---

## Tech Stack

- **React 18** + **Vite 6**
- **Supabase** — PostgreSQL database, Realtime subscriptions, Edge Functions (Deno)
- **VAPI** — AI voice calls, tool calls, webhooks
- **PapaParse** — CSV parsing
- **SheetJS (xlsx)** — Excel file parsing

---

## License

MIT
