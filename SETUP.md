# VAPI Campaign Dialer — Tech Setup Guide

This document is for technicians setting up the VAPI Campaign Dialer on a new device. It covers all three operating systems and documents known issues encountered during prior deployments.

---

## Prerequisites

Install the following before starting:

| Requirement | Version | Download |
|-------------|---------|----------|
| Node.js | v18 or later | [nodejs.org](https://nodejs.org) |
| Git | Any recent version | [git-scm.com](https://git-scm.com) |
| Supabase CLI | Latest | See Step 5 |

---

## Accounts Required

The client must have active accounts with:

- **Supabase** — [supabase.com](https://supabase.com) — provides the database, realtime, and edge functions
- **VAPI** — [vapi.ai](https://vapi.ai) — provides the AI phone call service

Collect the following credentials before starting:

| Credential | Where to find it |
|------------|-----------------|
| Supabase Project URL | Supabase dashboard → Project Settings → API |
| Supabase Anon (Publishable) Key | Supabase dashboard → Project Settings → API |
| Supabase Service Role Key | Supabase dashboard → Project Settings → API → `service_role` |
| Supabase Project Ref | The ID in your project URL: `supabase.com/dashboard/project/<ref>` |
| VAPI API Key | VAPI dashboard → Account |
| VAPI Assistant ID | VAPI dashboard → Assistants |
| VAPI Phone Number ID | VAPI dashboard → Phone Numbers |

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/dquinn089/vapi-campaign-dialer.git
cd vapi-campaign-dialer
```

---

## Step 2 — Install Dependencies

```bash
npm install
```

---

## Step 3 — Create the Supabase Database Schema

In the Supabase dashboard go to **SQL Editor** and run the following:

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

---

## Step 4 — Enable Realtime on the `calls` Table

> **Critical.** If this step is skipped, the dashboard will never receive live updates. Call statuses will stay stuck on "Calling" even after calls complete.

1. In the Supabase dashboard go to **Database → Replication**
2. Find the `calls` table
3. Toggle **Realtime** on

---

## Step 5 — Install the Supabase CLI

**All platforms:**
```bash
npm install -g supabase
```

> You may see a deprecation warning about `node-domexception`. This is harmless — ignore it and proceed as long as there is no `npm error`.

**If the `supabase` command is not found after installing (common on macOS):**

The CLI installed but is not in the system PATH. Use `npx` to prefix all Supabase commands for the rest of this guide:

```bash
npx supabase <command>
```

All Supabase commands below are shown with `npx` to be safe. On Windows or Linux where the global install works, the `npx` prefix can be omitted.

---

## Step 6 — Authenticate and Link to the Supabase Project

Run these commands from inside the project folder.

**Login:**
```bash
npx supabase login
```

This prints a message and waits. **Press Enter** to open the browser and complete login. Wait for the terminal to confirm login before running the next command.

> **Known issue:** Running `supabase link` before login fully completes causes a `failed to scan line: expected newline` error. Always wait for the login confirmation first.

**Link to the project:**
```bash
npx supabase link --project-ref <your-project-ref>
```

Replace `<your-project-ref>` with the project ref collected in the prerequisites.

---

## Step 7 — Set the Service Role Key Secret

```bash
npx supabase secrets set SERVICE_ROLE_KEY=<your-service-role-key>
```

> **Critical naming note:** The secret must be named `SERVICE_ROLE_KEY` — not `SUPABASE_SERVICE_ROLE_KEY`. The Supabase CLI blocks any secret name beginning with `SUPABASE_` and will silently skip it with no error if you use that prefix.

---

## Step 8 — Deploy the Edge Function

```bash
npx supabase functions deploy vapi-webhook --no-verify-jwt --project-ref <your-project-ref>
```

> If you see a warning about Docker not running, ignore it. Docker is only needed for local development, not deployment.

Once deployed, the webhook URL is:
```
https://<your-project-ref>.supabase.co/functions/v1/vapi-webhook
```

You will need this URL in the next step.

---

## Step 9 — Configure the VAPI Assistant

In the VAPI dashboard:

1. Open the client's **Assistant**
2. Add the following two **tools**, both pointing to the webhook URL from Step 8:

   | Tool name | Purpose | Arguments |
   |-----------|---------|-----------|
   | `mark_declined` | Contact said no or do not call | `reason` (string) |
   | `mark_call` | Contact wants follow-up or call needs a note | `notes` (string) |

3. In the assistant settings, also configure the **Server URL** (webhook URL) under the assistant's server settings so VAPI sends call status updates and end-of-call reports to the edge function

---

## Step 10 — Configure Credentials in the Dashboard

Run the app:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click **⚙ CONFIG**.

- **VAPI tab** — paste API Key, Assistant ID, Phone Number ID
- **Database tab** — paste Supabase Project URL and Anon Key

Credentials are saved to `localStorage` automatically. They persist across page reloads with no further setup.

> **Note:** A `.env` file is not required. Entering credentials through the dashboard UI is the recommended approach for client deployments. If a `.env` file is present with values, the dashboard will pre-fill from it on first load, but the UI always takes precedence after that.

---

## Step 11 — Desktop Launcher (macOS only)

A `start.command` file is included in the project root. When double-clicked it starts the dev server and opens the browser automatically.

**One-time setup — make it executable:**

1. Open Terminal
2. Type `chmod +x ` (with a space after it)
3. Drag the `start.command` file from Finder into the Terminal window — this fills in the correct path
4. Press Enter

> **If `start.command` is not visible in Finder:** Press **Cmd + Shift + .** to toggle hidden files.

> **If `chmod +x` says permission denied:** Prefix with `sudo`:
> ```bash
> sudo chmod +x /path/to/start.command
> ```
> Enter the Mac password when prompted.

**After setup:** Double-click `start.command` from Finder (or the Desktop if you copied/aliased it there) to launch everything. Close the Terminal window to stop the server.

**To put it on the Desktop:**
- Drag to Desktop to copy it
- Or hold **Cmd + Option** while dragging to create an alias (recommended — keeps one copy)

---

## Step 12 — Windows and Linux

**Windows:** Run `npm run dev` from PowerShell or Command Prompt inside the project folder. Open [http://localhost:5173](http://localhost:5173) in a browser. The `start.command` file is macOS-only.

**Linux:** Same as Windows. Optionally create a shell script:
```bash
#!/bin/bash
cd /path/to/vapi-campaign-dialer
npm run dev &
sleep 3
xdg-open http://localhost:5173
```
Save as `start.sh`, run `chmod +x start.sh`, then execute it.

---

## Known Issues & Solutions

| Issue | Cause | Fix |
|-------|-------|-----|
| `zsh: command not found: upabase` | First character cut off when typing too fast | Wait for the prompt to fully load before typing, or use `npx supabase` |
| `failed to scan line: expected newline` | `supabase link` run before login completed | Re-run `npx supabase login`, press Enter, wait for confirmation, then link |
| `Env name cannot start with SUPABASE_` | CLI blocks that prefix | Use `SERVICE_ROLE_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY` |
| `failed to read file` on deploy | Wrong directory | Make sure Terminal is in the project root (`ls` should show `package.json`) |
| Docker warning on deploy | Local dev feature not installed | Harmless — deployment does not require Docker |
| Call status stuck on "Calling" | Realtime not enabled on `calls` table | Go to Supabase → Database → Replication → toggle Realtime on for `calls` |
| Call marked "Failed" immediately | `supabase` variable was undefined in old code | Resolved in current codebase — ensure the repo is up to date with `git pull` |
| History tab "Load" does nothing | Wrong Supabase client used | Resolved in current codebase — ensure repo is up to date with `git pull` |
| `start.command` says no privileges | File not marked executable | Run `chmod +x` on the file (see Step 11) |
| `chmod +x` says permission denied | Mac permissions restriction | Use `sudo chmod +x` and enter the Mac password |

---

## Verifying the Setup

Run through this checklist after setup:

- [ ] `npm run dev` starts without errors
- [ ] Dashboard opens at `http://localhost:5173`
- [ ] Mode badge shows **● LIVE** (not ◌ DEMO) — confirms VAPI credentials are set
- [ ] Config → Database shows credentials filled in
- [ ] Launch a test campaign with one contact (your own phone number)
- [ ] Call is received on the phone
- [ ] After the call ends, status updates in the dashboard (confirms Realtime is working)
- [ ] Row in Supabase `calls` table has `vapi_call_id` populated (confirms webhook link is set)
- [ ] Edge function logs in Supabase show incoming webhook events

---

## Pulling Updates

When the codebase is updated, run from the project folder:

```bash
git pull
npm install
```

If the Edge Function was changed:
```bash
npx supabase functions deploy vapi-webhook --no-verify-jwt --project-ref <your-project-ref>
```
