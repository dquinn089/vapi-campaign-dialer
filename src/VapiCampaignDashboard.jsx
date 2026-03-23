import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";

const CAMPAIGN_STATES = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETE: "complete",
};

const CALL_STATES = {
  PENDING: "pending",
  CALLING: "calling",
  ANSWERED: "answered",
  VOICEMAIL: "voicemail",
  NO_ANSWER: "no_answer",
  SCHEDULED: "scheduled",
  DECLINED: "declined",
  FAILED: "failed",
};

const DONE_STATUSES = [
  CALL_STATES.ANSWERED,
  CALL_STATES.VOICEMAIL,
  CALL_STATES.NO_ANSWER,
  CALL_STATES.SCHEDULED,
  CALL_STATES.DECLINED,
  CALL_STATES.FAILED,
];

const stateColors = {
  [CALL_STATES.PENDING]: { bg: "#1a1a2e", text: "#6b7094", dot: "#6b7094" },
  [CALL_STATES.CALLING]: { bg: "#1a1f3a", text: "#4ecdc4", dot: "#4ecdc4" },
  [CALL_STATES.ANSWERED]: { bg: "#1a2a1f", text: "#7bed9f", dot: "#7bed9f" },
  [CALL_STATES.VOICEMAIL]: { bg: "#2a1f1a", text: "#f8a978", dot: "#f8a978" },
  [CALL_STATES.NO_ANSWER]: { bg: "#1a1a2e", text: "#6b7094", dot: "#6b7094" },
  [CALL_STATES.SCHEDULED]: { bg: "#0d2a1f", text: "#00d2ff", dot: "#00d2ff" },
  [CALL_STATES.DECLINED]: { bg: "#2a1a1f", text: "#ff6b6b", dot: "#ff6b6b" },
  [CALL_STATES.FAILED]: { bg: "#2a1a1a", text: "#ff4757", dot: "#ff4757" },
};

const StatusBadge = ({ status, isPaused }) => {
  const c = stateColors[status] || stateColors[CALL_STATES.PENDING];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        background: isPaused ? "#1f1a10" : c.bg,
        color: isPaused ? "#f8c97a" : c.text,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isPaused ? "#f8c97a" : c.dot,
          animation: status === CALL_STATES.CALLING && !isPaused ? "pulse 1.2s infinite" : "none",
        }}
      />
      {isPaused ? "on hold" : status.replace("_", " ")}
    </span>
  );
};

const generateMockResult = (contact) => {
  const outcomes = [
    { status: CALL_STATES.ANSWERED, weight: 25 },
    { status: CALL_STATES.VOICEMAIL, weight: 35 },
    { status: CALL_STATES.NO_ANSWER, weight: 15 },
    { status: CALL_STATES.SCHEDULED, weight: 10 },
    { status: CALL_STATES.DECLINED, weight: 10 },
    { status: CALL_STATES.FAILED, weight: 5 },
  ];
  const rand = Math.random() * 100;
  let cumulative = 0;
  let chosen = CALL_STATES.NO_ANSWER;
  for (const o of outcomes) {
    cumulative += o.weight;
    if (rand <= cumulative) {
      chosen = o.status;
      break;
    }
  }

  const transcripts = {
    [CALL_STATES.ANSWERED]:
      `AI: "Hi, this is an AI assistant calling on behalf of {biz}. We help businesses like yours grow with smart solutions. Would you be interested in scheduling a quick 15-minute call to learn more?"\nContact: "Hmm, tell me more about what you offer."\nAI: "We specialize in helping businesses streamline their operations and increase revenue. I'd love to set up a brief call with our team to discuss your specific needs. Would that work for you?"\nContact: "I'm a bit busy right now, maybe another time."`,
    [CALL_STATES.VOICEMAIL]:
      `AI: "Hi, this message is for ${contact.name || "the business owner"}. I'm an AI assistant calling on behalf of {biz}. This call could have been a potential client reaching out to your business. If you're missing calls like this, our AI-powered solution can help ensure you never miss another opportunity. Please call us back or visit our website to learn more. Thank you!"`,
    [CALL_STATES.SCHEDULED]:
      `AI: "Hi, this is an AI assistant calling on behalf of {biz}. We help businesses capture every lead and never miss a call. Would you be interested in a quick demo?"\nContact: "Actually, yes — we've been losing calls lately. When can we talk?"\nAI: "Wonderful! I can schedule you for a 15-minute call. How does tomorrow at 2 PM work?"\nContact: "That works. Let's do it."\n[Tool Call: schedule_appointment → {date: "2026-02-27", time: "2:00 PM"}]`,
    [CALL_STATES.DECLINED]:
      `AI: "Hi, this is an AI assistant calling on behalf of {biz}. We help businesses—"\nContact: "Not interested, thanks." *click*\n[Tool Call: mark_declined → {reason: "Not interested"}]`,
    [CALL_STATES.NO_ANSWER]: "No answer — call rang out after 30 seconds.",
    [CALL_STATES.FAILED]: "Call failed — number may be disconnected or invalid.",
  };

  const durations = {
    [CALL_STATES.ANSWERED]: Math.floor(Math.random() * 60) + 30,
    [CALL_STATES.VOICEMAIL]: Math.floor(Math.random() * 20) + 15,
    [CALL_STATES.SCHEDULED]: Math.floor(Math.random() * 90) + 45,
    [CALL_STATES.DECLINED]: Math.floor(Math.random() * 10) + 3,
    [CALL_STATES.NO_ANSWER]: 30,
    [CALL_STATES.FAILED]: 0,
  };

  const sentiments = {
    [CALL_STATES.ANSWERED]: ["warm", "neutral", "curious"][Math.floor(Math.random() * 3)],
    [CALL_STATES.SCHEDULED]: "positive",
    [CALL_STATES.DECLINED]: ["cold", "neutral", "annoyed"][Math.floor(Math.random() * 3)],
    [CALL_STATES.VOICEMAIL]: null,
    [CALL_STATES.NO_ANSWER]: null,
    [CALL_STATES.FAILED]: null,
  };

  const summaries = {
    [CALL_STATES.ANSWERED]: "Contact was interested but said they were busy. Did not commit to a meeting. Possible follow-up candidate.",
    [CALL_STATES.SCHEDULED]: "Contact expressed pain point about missing calls. Agreed to a 15-minute demo call tomorrow at 2:00 PM.",
    [CALL_STATES.DECLINED]: "Contact declined immediately. No interest expressed.",
    [CALL_STATES.VOICEMAIL]: "Voicemail reached. Left message about missed opportunity and AI solution.",
    [CALL_STATES.NO_ANSWER]: "No answer after 30 seconds of ringing.",
    [CALL_STATES.FAILED]: "Call could not connect. Number may be invalid.",
  };

  const endReasons = {
    [CALL_STATES.ANSWERED]: "customer-ended-call",
    [CALL_STATES.SCHEDULED]: "assistant-ended-call",
    [CALL_STATES.DECLINED]: "customer-ended-call",
    [CALL_STATES.VOICEMAIL]: "voicemail-reached",
    [CALL_STATES.NO_ANSWER]: "no-answer-timeout",
    [CALL_STATES.FAILED]: "call-failed",
  };

  const toolCallData = {};
  if (chosen === CALL_STATES.SCHEDULED) {
    const tomorrow = new Date(Date.now() + 86400000);
    toolCallData.scheduled_date = tomorrow.toISOString().split("T")[0];
    toolCallData.scheduled_time = "2:00 PM";
    toolCallData.contact_name = contact.name || null;
    toolCallData.notes = "Contact mentioned they've been losing calls. High intent.";
  }
  if (chosen === CALL_STATES.DECLINED) {
    toolCallData.decline_reason = "Not interested";
  }
  if (chosen === CALL_STATES.ANSWERED) {
    toolCallData.callback_requested = Math.random() > 0.5;
    toolCallData.notes = toolCallData.callback_requested
      ? "Said they were busy but open to a callback next week."
      : "Showed mild interest but didn't commit.";
  }

  return {
    status: chosen,
    transcript: transcripts[chosen] || "",
    duration: durations[chosen] || 0,
    scheduledTime:
      chosen === CALL_STATES.SCHEDULED
        ? `${toolCallData.scheduled_date} at ${toolCallData.scheduled_time}`
        : null,
    calledAt: new Date().toLocaleString(),
    end_reason: endReasons[chosen] || "unknown",
    summary: summaries[chosen] || "",
    sentiment: sentiments[chosen] || null,
    recording_url: chosen !== CALL_STATES.FAILED && chosen !== CALL_STATES.NO_ANSWER
      ? `https://storage.vapi.ai/recordings/demo-${Date.now()}.wav`
      : null,
    tool_call_data: Object.keys(toolCallData).length > 0 ? toolCallData : null,
  };
};

// ─── VAPI Integration Config Panel ───
const VapiConfigPanel = ({ config, setConfig }) => (
  <div style={{ marginBottom: 24 }}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      <div>
        <label style={labelStyle}>VAPI API Key</label>
        <input
          type="password"
          placeholder="vapi_xxxxxxxxxxxx"
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Assistant ID</label>
        <input
          placeholder="asst_xxxxxxxxxxxx"
          value={config.assistantId}
          onChange={(e) => setConfig({ ...config, assistantId: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Phone Number ID</label>
        <input
          placeholder="Your VAPI phone number ID"
          value={config.phoneNumberId}
          onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Delay Between Calls (sec)</label>
        <input
          type="number"
          min={3}
          max={60}
          value={config.delayBetweenCalls}
          onChange={(e) =>
            setConfig({ ...config, delayBetweenCalls: parseInt(e.target.value) || 5 })
          }
          style={inputStyle}
        />
      </div>
    </div>
    <p style={{ fontSize: 11, color: "#6b7094", marginTop: 8, fontStyle: "italic" }}>
      In demo mode, calls are simulated. Connect your VAPI credentials to make real calls.
    </p>
  </div>
);

// ─── Database Config Panel ───
const DB_PROVIDERS = [
  { key: "supabase", label: "Supabase", icon: "⚡" },
  { key: "postgres", label: "PostgreSQL", icon: "🐘" },
  { key: "mysql", label: "MySQL", icon: "🐬" },
  { key: "sqlite", label: "SQLite", icon: "📦" },
  { key: "rest", label: "Custom REST API", icon: "🔌" },
];

const DatabaseConfigPanel = ({ config, setConfig, connStatus, onTestConnection }) => {
  const updateField = (field, value) => setConfig({ ...config, [field]: value });
  const provider = config.provider;

  return (
    <div style={{ marginBottom: 24 }}>
      <label style={labelStyle}>Database Provider</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {DB_PROVIDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => updateField("provider", p.key)}
            style={{
              ...btnBase,
              padding: "8px 14px",
              fontSize: 11,
              background: provider === p.key ? "#1e2140" : "transparent",
              color: provider === p.key ? "#e0e4f0" : "#6b7094",
              border: `1px solid ${provider === p.key ? "#4ecdc4" : "#1e2140"}`,
              borderRadius: 8,
            }}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {provider === "supabase" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Supabase Project URL</label>
            <input
              placeholder="https://xxxxxxxxxxxx.supabase.co"
              value={config.supabaseUrl}
              onChange={(e) => updateField("supabaseUrl", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Anon / Public Key</label>
            <input
              type="password"
              placeholder="sb_publishable_..."
              value={config.supabaseAnonKey}
              onChange={(e) => updateField("supabaseAnonKey", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Service Role Key (optional)</label>
            <input
              type="password"
              placeholder="sb_secret_..."
              value={config.supabaseServiceKey}
              onChange={(e) => updateField("supabaseServiceKey", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {(provider === "postgres" || provider === "mysql") && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Host</label>
            <input
              placeholder={provider === "postgres" ? "db.example.com" : "127.0.0.1"}
              value={config.host}
              onChange={(e) => updateField("host", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Port</label>
            <input
              placeholder={provider === "postgres" ? "5432" : "3306"}
              value={config.port}
              onChange={(e) => updateField("port", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Database</label>
            <input
              placeholder="campaign_db"
              value={config.database}
              onChange={(e) => updateField("database", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>SSL</label>
            <button
              onClick={() => updateField("ssl", !config.ssl)}
              style={{
                ...inputStyle,
                cursor: "pointer",
                textAlign: "left",
                color: config.ssl ? "#4ecdc4" : "#6b7094",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 16,
                  borderRadius: 8,
                  background: config.ssl ? "#4ecdc4" : "#1e2140",
                  display: "inline-block",
                  position: "relative",
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 2,
                    left: config.ssl ? 14 : 2,
                    transition: "left 0.2s",
                  }}
                />
              </span>
              {config.ssl ? "Enabled" : "Disabled"}
            </button>
          </div>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              placeholder="postgres"
              value={config.username}
              onChange={(e) => updateField("username", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={config.password}
              onChange={(e) => updateField("password", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {provider === "sqlite" && (
        <div>
          <label style={labelStyle}>Database File Path</label>
          <input
            placeholder="./data/campaign.db"
            value={config.filePath}
            onChange={(e) => updateField("filePath", e.target.value)}
            style={inputStyle}
          />
        </div>
      )}

      {provider === "rest" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Base URL</label>
            <input
              placeholder="https://api.example.com/v1"
              value={config.baseUrl}
              onChange={(e) => updateField("baseUrl", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Authorization Header</label>
            <input
              type="password"
              placeholder="Bearer xxxxxxxxxxxx"
              value={config.authHeader}
              onChange={(e) => updateField("authHeader", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Table / Collection Name</label>
        <input
          placeholder="calls"
          value={config.tableName}
          onChange={(e) => updateField("tableName", e.target.value)}
          style={{ ...inputStyle, maxWidth: 300 }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button
          onClick={onTestConnection}
          disabled={connStatus === "testing"}
          style={{
            ...btnBase,
            background: connStatus === "testing" ? "#1e2140" : "linear-gradient(135deg, #4ecdc4, #44b8b0)",
            color: connStatus === "testing" ? "#6b7094" : "#0a0c18",
            fontWeight: 800,
            fontSize: 12,
            padding: "8px 18px",
            cursor: connStatus === "testing" ? "wait" : "pointer",
          }}
        >
          {connStatus === "testing" ? "Testing..." : "Test Connection"}
        </button>
        <span
          style={{
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: 6,
            color:
              connStatus === "connected" ? "#7bed9f" :
              connStatus === "error" ? "#ff6b6b" :
              connStatus === "testing" ? "#f8a978" : "#6b7094",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                connStatus === "connected" ? "#7bed9f" :
                connStatus === "error" ? "#ff6b6b" :
                connStatus === "testing" ? "#f8a978" : "#3a3d5c",
              animation: connStatus === "testing" ? "pulse 1s infinite" : "none",
            }}
          />
          {connStatus === "idle" && "Not connected"}
          {connStatus === "testing" && "Testing connection..."}
          {connStatus === "connected" && "Connected"}
          {connStatus === "error" && "Connection failed"}
        </span>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "12px 16px",
          background: "#0a0c18",
          borderRadius: 8,
          border: "1px solid #1e2140",
        }}
      >
        <label style={{ ...labelStyle, color: "#4ecdc4", marginBottom: 8 }}>
          Recommended Schema
        </label>
        <pre
          style={{
            fontSize: 11,
            color: "#6b7094",
            fontFamily: "'JetBrains Mono', monospace",
            margin: 0,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
{`CREATE TABLE ${config.tableName || "calls"} (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       TEXT,
  business_name     TEXT NOT NULL,
  phone             TEXT NOT NULL,
  contact_name      TEXT,
  status            TEXT DEFAULT 'pending',
  vapi_call_id      TEXT UNIQUE,
  transcript        TEXT,
  duration_sec      INTEGER DEFAULT 0,
  end_reason        TEXT,
  summary           TEXT,
  sentiment         TEXT,
  recording_url     TEXT,
  scheduled_date    TEXT,
  scheduled_time    TEXT,
  decline_reason    TEXT,
  callback_requested BOOLEAN DEFAULT false,
  notes             TEXT,
  called_at         TIMESTAMPTZ,
  scheduled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);`}
        </pre>
      </div>
    </div>
  );
};

// ─── Styles ───
const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#6b7094",
  marginBottom: 6,
  fontFamily: "'JetBrains Mono', monospace",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  background: "#0d0f1a",
  border: "1px solid #1e2140",
  borderRadius: 8,
  color: "#e0e4f0",
  fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const btnBase = {
  padding: "10px 20px",
  borderRadius: 8,
  border: "none",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  letterSpacing: "0.03em",
  fontFamily: "'JetBrains Mono', monospace",
  transition: "all 0.2s",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

// ─── Import Modal ───
const ImportModal = ({ onClose, onAddContacts }) => {
  const [step, setStep] = useState("upload");
  const [parsedRows, setParsedRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [phoneCol, setPhoneCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [processed, setProcessed] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const fileRef = useRef(null);

  const normalizePhone = (raw) => {
    if (raw === null || raw === undefined || raw === "") return "";
    const s = String(raw).trim();
    const digits = s.replace(/\D/g, "");
    if (s.startsWith("+")) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
    return digits.length >= 7 ? `+${digits}` : "";
  };

  const isValidPhone = (p) => /^\+\d{10,15}$/.test(p);

  const autoDetect = (cols) => ({
    phone: cols.find((c) => /phone|mobile|cell|number|tel|ph$/i.test(c)) || "",
    name: cols.find((c) => /^(name|first|last|contact|person|customer|client)/i.test(c)) || "",
  });

  const handleFile = async (file) => {
    setParseError("");
    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      let rows = [], cols = [];
      if (["csv", "txt", "tsv"].includes(ext)) {
        const Papa = (await import("papaparse")).default;
        await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (r) => { rows = r.data; cols = r.meta.fields || []; resolve(); },
            error: reject,
          });
        });
      } else if (["xlsx", "xls"].includes(ext)) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        cols = Object.keys(rows[0] || {});
      } else {
        setParseError("Unsupported file. Use CSV, TXT, TSV, XLSX, or XLS.");
        return;
      }
      if (!rows.length) { setParseError("File appears to be empty."); return; }
      const detected = autoDetect(cols);
      setParsedRows(rows);
      setColumns(cols);
      setPhoneCol(detected.phone || cols[0] || "");
      setNameCol(detected.name || "");
      setStep("map");
    } catch (e) {
      setParseError(`Failed to parse: ${e.message}`);
    }
  };

  const handlePreview = () => {
    const p = parsedRows
      .map((row, i) => {
        const rawPhone = row[phoneCol] ?? "";
        const phone = normalizePhone(rawPhone);
        const name = nameCol ? String(row[nameCol] ?? "").trim() : "";
        return { id: i, rawPhone, phone, name, valid: isValidPhone(phone) };
      })
      .filter((r) => String(r.rawPhone).trim() !== "");
    setProcessed(p);
    setSelected(new Set(p.filter((r) => r.valid).map((r) => r.id)));
    setStep("preview");
  };

  const toggleAll = () => {
    const validIds = processed.filter((r) => r.valid).map((r) => r.id);
    setSelected(selected.size === validIds.length ? new Set() : new Set(validIds));
  };

  const toggleRow = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const handleAdd = () => {
    const toAdd = processed
      .filter((r) => selected.has(r.id))
      .map((r, i) => ({
        id: Date.now() + i,
        phone: r.phone,
        name: r.name,
        status: CALL_STATES.PENDING,
        result: null,
        supabaseId: null,
      }));
    onAddContacts(toAdd);
    onClose();
  };

  const validCount = processed.filter((r) => r.valid).length;
  const invalidCount = processed.length - validCount;
  const stepIndex = ["upload", "map", "preview"].indexOf(step);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#0f1124", border: "1px solid #1e2140", borderRadius: 16, width: "100%", maxWidth: 740, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", animation: "slideIn 0.2s ease" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e2140", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Import Contacts</div>
            <div style={{ fontSize: 11, color: "#6b7094", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              {step === "upload" && "Upload a file to import contacts"}
              {step === "map" && `${parsedRows.length} rows found in ${fileName} — map your columns`}
              {step === "preview" && `${processed.length} contacts parsed · ${validCount} valid · ${invalidCount} invalid`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {["Upload", "Map", "Select"].map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: stepIndex === i ? "#4ecdc4" : stepIndex > i ? "rgba(78,205,196,0.2)" : "#1e2140",
                  color: stepIndex === i ? "#0a0c18" : stepIndex > i ? "#4ecdc4" : "#3a3d5c",
                }}>
                  {stepIndex > i ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 10, color: stepIndex === i ? "#4ecdc4" : "#3a3d5c", fontFamily: "'JetBrains Mono', monospace", display: i === 2 ? "none" : "inline" }}>—</span>
              </div>
            ))}
            <button onClick={onClose} style={{ ...btnBase, background: "transparent", color: "#6b7094", padding: "2px 8px", fontSize: 20, marginLeft: 8 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* STEP 1: Upload */}
          {step === "upload" && (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#4ecdc4" : "#1e2140"}`,
                  borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer",
                  background: isDragging ? "rgba(78,205,196,0.05)" : "transparent",
                  transition: "all 0.2s", marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Drop a file here, or click to browse</div>
                <div style={{ fontSize: 12, color: "#6b7094" }}>CSV · Excel (.xlsx / .xls) · TXT · TSV</div>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>

              {parseError && (
                <div style={{ color: "#ff6b6b", fontSize: 12, padding: "10px 14px", background: "rgba(255,107,107,0.08)", borderRadius: 8, marginBottom: 16 }}>
                  {parseError}
                </div>
              )}

              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#6b7094", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
                More Sources — Coming Soon
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { icon: "🐘", label: "PostgreSQL" }, { icon: "📊", label: "Google Sheets" },
                  { icon: "🗄", label: "Airtable" }, { icon: "💼", label: "HubSpot CRM" },
                  { icon: "⚡", label: "Salesforce" }, { icon: "🔌", label: "Custom API" },
                ].map((s) => (
                  <div key={s.label} style={{ padding: "12px 14px", background: "#0a0c18", borderRadius: 8, border: "1px solid #1e2140", opacity: 0.45, cursor: "not-allowed" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: "#6b7094", marginTop: 2 }}>Coming soon</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Map Columns */}
          {step === "map" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Phone Number Column *</label>
                  <select value={phoneCol} onChange={(e) => setPhoneCol(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Name Column (optional)</label>
                  <select value={nameCol} onChange={(e) => setNameCol(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="">— skip —</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#6b7094", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                File Preview (first 5 rows)
              </div>
              <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #1e2140" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c} style={{ padding: "8px 12px", textAlign: "left", background: "#0a0c18", color: c === phoneCol ? "#4ecdc4" : c === nameCol ? "#f8a978" : "#6b7094", fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1px solid #1e2140", whiteSpace: "nowrap" }}>
                          {c}{c === phoneCol ? " 📞" : ""}{c === nameCol ? " 👤" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(30,33,64,0.5)" }}>
                        {columns.map((c) => (
                          <td key={c} style={{ padding: "7px 12px", color: c === phoneCol ? "#e0e4f0" : "#9ca0b8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {String(row[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: Preview & Select */}
          {step === "preview" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <span style={{ padding: "3px 12px", borderRadius: 20, background: "rgba(123,237,159,0.1)", color: "#7bed9f", fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>✓ {validCount} valid</span>
                {invalidCount > 0 && <span style={{ padding: "3px 12px", borderRadius: 20, background: "rgba(255,107,107,0.1)", color: "#ff6b6b", fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>✗ {invalidCount} invalid</span>}
                <span style={{ padding: "3px 12px", borderRadius: 20, background: "rgba(78,205,196,0.1)", color: "#4ecdc4", fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{selected.size} selected</span>
              </div>

              <div style={{ border: "1px solid #1e2140", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 72px", padding: "8px 12px", background: "#0a0c18", borderBottom: "1px solid #1e2140" }}>
                  <div><input type="checkbox" checked={selected.size === validCount && validCount > 0} onChange={toggleAll} style={{ cursor: "pointer" }} /></div>
                  {["Phone (normalized)", "Name", "Status"].map((h) => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7094", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{h}</div>
                  ))}
                </div>
                <div style={{ maxHeight: 340, overflowY: "auto" }}>
                  {processed.map((row) => (
                    <div
                      key={row.id}
                      onClick={() => row.valid && toggleRow(row.id)}
                      style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 72px", padding: "8px 12px", borderBottom: "1px solid rgba(30,33,64,0.4)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", opacity: row.valid ? 1 : 0.4, background: selected.has(row.id) ? "rgba(78,205,196,0.04)" : "transparent", cursor: row.valid ? "pointer" : "default" }}
                    >
                      <div><input type="checkbox" disabled={!row.valid} checked={selected.has(row.id)} onChange={() => row.valid && toggleRow(row.id)} style={{ cursor: row.valid ? "pointer" : "not-allowed" }} /></div>
                      <div style={{ color: row.valid ? "#e0e4f0" : "#ff6b6b" }}>{row.phone || row.rawPhone}</div>
                      <div style={{ color: "#9ca0b8" }}>{row.name || "—"}</div>
                      <div style={{ fontSize: 10 }}>{row.valid ? <span style={{ color: "#7bed9f" }}>✓ valid</span> : <span style={{ color: "#ff6b6b" }}>✗ skip</span>}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #1e2140", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => step === "upload" ? onClose() : setStep(step === "preview" ? "map" : "upload")} style={{ ...btnBase, background: "transparent", color: "#6b7094", border: "1px solid #1e2140" }}>
            {step === "upload" ? "Cancel" : "← Back"}
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {step === "map" && (
              <button onClick={handlePreview} disabled={!phoneCol} style={{ ...btnBase, background: phoneCol ? "linear-gradient(135deg, #4ecdc4, #44b8b0)" : "#1e2140", color: phoneCol ? "#0a0c18" : "#3a3d5c", fontWeight: 800, cursor: phoneCol ? "pointer" : "not-allowed" }}>
                Preview Contacts →
              </button>
            )}
            {step === "preview" && (
              <button onClick={handleAdd} disabled={selected.size === 0} style={{ ...btnBase, background: selected.size > 0 ? "linear-gradient(135deg, #4ecdc4, #00d2ff)" : "#1e2140", color: selected.size > 0 ? "#0a0c18" : "#3a3d5c", fontWeight: 800, cursor: selected.size > 0 ? "pointer" : "not-allowed" }}>
                + Add {selected.size} Contact{selected.size !== 1 ? "s" : ""} to Campaign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main App ───
export default function VapiCampaignDashboard() {
  const [businessName, setBusinessName] = useState(
    () => localStorage.getItem("vapi_businessName") || ""
  );
  const [phoneInput, setPhoneInput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [campaignState, setCampaignState] = useState(CAMPAIGN_STATES.IDLE);
  const [currentCallIndex, setCurrentCallIndex] = useState(-1);
  const [expandedRow, setExpandedRow] = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [vapiConfig, setVapiConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("vapi_config_v2") || "{}");
      return {
        apiKey: saved.apiKey || "",
        assistantId: saved.assistantId || "",
        phoneNumberId: saved.phoneNumberId || "",
        delayBetweenCalls: saved.delayBetweenCalls ?? 5,
      };
    } catch {
      return { apiKey: "", assistantId: "", phoneNumberId: "", delayBetweenCalls: 5 };
    }
  });
  const [dbConfig, setDbConfig] = useState({
    provider: "supabase",
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseServiceKey: "",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    ssl: true,
    filePath: "",
    baseUrl: "",
    authHeader: "",
    tableName: "calls",
  });
  const [dbConnStatus, setDbConnStatus] = useState("idle");
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState("vapi");
  const [tab, setTab] = useState("setup");
  const [campaignName, setCampaignName] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [contactNameInput, setContactNameInput] = useState("");

  // Refs
  const timerRef = useRef(null);
  const campaignRef = useRef(CAMPAIGN_STATES.IDLE);
  const contactsRef = useRef([]);
  const realtimeChannelRef = useRef(null);
  const fallbackTimersRef = useRef({});
  const currentVapiCallIdRef = useRef(null);
  // Always-fresh config snapshot for use inside async callbacks
  const configRef = useRef({ vapiConfig, businessName });

  useEffect(() => {
    campaignRef.current = campaignState;
  }, [campaignState]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    configRef.current = { vapiConfig, businessName };
  }, [vapiConfig, businessName]);

  useEffect(() => {
    localStorage.setItem("vapi_businessName", businessName);
  }, [businessName]);

  useEffect(() => {
    localStorage.setItem("vapi_config_v2", JSON.stringify(vapiConfig));
  }, [vapiConfig]);

  // Real mode = all three VAPI creds present
  const isRealMode = Boolean(
    vapiConfig.apiKey && vapiConfig.assistantId && vapiConfig.phoneNumberId
  );

  // ── Phone parsing ──
  const parsePhoneNumbers = (text) => {
    const lines = text
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((line, i) => {
      const parts = line.split(/\t|(?<=\d)\s{2,}/);
      const phone = parts[0].replace(/[^\d+()-\s]/g, "").trim();
      const name = parts[1]?.trim() || "";
      return {
        id: Date.now() + i,
        phone,
        name,
        status: CALL_STATES.PENDING,
        result: null,
        supabaseId: null,
      };
    });
  };

  const addContacts = () => {
    if (!phoneInput.trim()) return;
    const newContacts = parsePhoneNumbers(phoneInput);
    setContacts((prev) => [...prev, ...newContacts]);
    setPhoneInput("");
  };

  const addSingleContact = () => {
    const digits = phoneDigits.replace(/\D/g, "");
    if (!digits) return;
    const phone = `${countryCode}${digits}`;
    setContacts((prev) => [...prev, { id: Date.now(), phone, name: contactNameInput.trim(), status: CALL_STATES.PENDING, result: null }]);
    setPhoneDigits("");
    setContactNameInput("");
  };

  const loadCampaign = async (meta) => {
    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .eq("campaign_id", meta.id)
      .order("created_at", { ascending: true });
    if (error || !data) { alert("Failed to load campaign."); return; }

    const loaded = data.map((row, i) => ({
      id: Date.now() + i,
      phone: row.phone,
      name: row.contact_name || "",
      status: row.status,
      supabaseId: row.id,
      result: !["pending", "calling"].includes(row.status) ? mapRowToResult(row) : null,
    }));

    setContacts(loaded);
    contactsRef.current = loaded;
    setCampaignId(meta.id);
    setCampaignName(meta.name || "");
    setBusinessName(meta.businessName || "");
    const allDone = loaded.every((c) => !["pending", "calling"].includes(c.status));
    setCampaignState(allDone ? CAMPAIGN_STATES.COMPLETE : CAMPAIGN_STATES.IDLE);
    campaignRef.current = allDone ? CAMPAIGN_STATES.COMPLETE : CAMPAIGN_STATES.IDLE;
    setTab("results");
    setupRealtime(meta.id);
  };

  const expandContact = async (contactId) => {
    if (expandedRow === contactId) { setExpandedRow(null); return; }
    setExpandedRow(contactId);
    // Always fetch latest from Supabase so transcript/summary are up to date
    const contact = contactsRef.current.find((c) => c.id === contactId);
    if (contact?.supabaseId) {
      const { data } = await supabase.from("calls").select("*").eq("id", contact.supabaseId).single();
      if (data) {
        setContacts((prev) => prev.map((c) => c.id === contactId ? { ...c, result: mapRowToResult(data) } : c));
      }
    }
  };

  const removeContact = (id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    setContacts([]);
    setCurrentCallIndex(-1);
    setCampaignState(CAMPAIGN_STATES.IDLE);
    setCampaignId(null);
    setExpandedRow(null);
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  };

  // ── Demo mode simulation ──
  const simulateCall = useCallback(
    async (index) => {
      if (campaignRef.current === CAMPAIGN_STATES.PAUSED) return;
      if (index >= contactsRef.current.length) {
        setCampaignState(CAMPAIGN_STATES.COMPLETE);
        setCurrentCallIndex(-1);
        return;
      }

      setCurrentCallIndex(index);
      setContacts((prev) =>
        prev.map((c, i) => (i === index ? { ...c, status: CALL_STATES.CALLING } : c))
      );

      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

      if (campaignRef.current === CAMPAIGN_STATES.PAUSED) return;

      const result = generateMockResult(contactsRef.current[index]);
      result.transcript = result.transcript.replace(/\{biz\}/g, configRef.current.businessName || "our company");

      setContacts((prev) =>
        prev.map((c, i) =>
          i === index ? { ...c, status: result.status, result } : c
        )
      );

      timerRef.current = setTimeout(
        () => simulateCall(index + 1),
        configRef.current.vapiConfig.delayBetweenCalls * 1000
      );
    },
    []
  );

  // ── Real mode: map a Supabase row to the result shape the UI expects ──
  const mapRowToResult = (row) => {
    const toolCallData = {};
    if (row.scheduled_date) {
      toolCallData.scheduled_date = row.scheduled_date;
      toolCallData.scheduled_time = row.scheduled_time;
      if (row.contact_name) toolCallData.contact_name = row.contact_name;
      if (row.notes) toolCallData.notes = row.notes;
    }
    if (row.decline_reason) toolCallData.decline_reason = row.decline_reason;
    if (row.callback_requested) {
      toolCallData.callback_requested = row.callback_requested;
      if (row.notes) toolCallData.notes = row.notes;
    }

    return {
      status: row.status,
      transcript: row.transcript || "",
      duration: row.duration_sec || 0,
      calledAt: row.called_at ? new Date(row.called_at).toLocaleString() : new Date().toLocaleString(),
      end_reason: row.end_reason || null,
      summary: row.summary || "",
      sentiment: row.sentiment || null,
      recording_url: row.recording_url || null,
      scheduledTime:
        row.scheduled_date && row.scheduled_time
          ? `${row.scheduled_date} at ${row.scheduled_time}`
          : null,
      tool_call_data: Object.keys(toolCallData).length > 0 ? toolCallData : null,
    };
  };

  // ── Real mode: fire a single VAPI outbound call ──
  const callContactReal = useCallback(async (contact, contactIndex) => {
    if (campaignRef.current !== CAMPAIGN_STATES.RUNNING) return;

    setCurrentCallIndex(contactIndex);
    setContacts((prev) =>
      prev.map((c, i) => (i === contactIndex ? { ...c, status: CALL_STATES.CALLING } : c))
    );

    const { vapiConfig: cfg, businessName: biz } = configRef.current;

    // Normalize to E.164 format — VAPI requires +1XXXXXXXXXX for US numbers
    const normalizePhone = (raw) => {
      const digits = raw.replace(/\D/g, "");
      if (raw.startsWith("+")) return raw;          // already E.164
      if (digits.length === 10) return `+1${digits}`; // US 10-digit
      if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`; // US with country code
      return `+${digits}`;                           // best-effort
    };
    const e164Phone = normalizePhone(contact.phone);

    try {
      const resp = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: cfg.assistantId,
          phoneNumberId: cfg.phoneNumberId,
          customer: {
            number: e164Phone,
            ...(contact.name ? { name: contact.name } : {}),
          },
          assistantOverrides: {
            variableValues: {
              business_name: biz || "our company",
              contact_name: contact.name || "",
            },
          },
        }),
      });

      const callData = await resp.json();

      if (!resp.ok) {
        throw new Error(callData.message || `VAPI error ${resp.status}`);
      }

      if (callData.id) currentVapiCallIdRef.current = callData.id;

      // Link the VAPI call ID to the Supabase row so webhooks can match it
      if (callData.id && contact.supabaseId) {
        await supabase
          .from("calls")
          .update({ vapi_call_id: callData.id, status: "calling" })
          .eq("id", contact.supabaseId);
      }

      // Fallback: if realtime never fires within 6 min, poll Supabase and advance
      fallbackTimersRef.current[contactIndex] = setTimeout(async () => {
        const current = contactsRef.current[contactIndex];
        if (!current || current.status !== CALL_STATES.CALLING) return;

        let finalStatus = CALL_STATES.FAILED;
        let finalResult = {
          status: CALL_STATES.FAILED,
          summary: "No webhook received after 6 minutes — advanced automatically",
          duration: 0,
          calledAt: new Date().toLocaleString(),
          end_reason: "timeout",
          tool_call_data: null,
        };

        if (contact.supabaseId) {
          const { data } = await supabase
            .from("calls")
            .select("*")
            .eq("id", contact.supabaseId)
            .single();
          if (data && DONE_STATUSES.includes(data.status)) {
            finalStatus = data.status;
            finalResult = mapRowToResult(data);
          }
        }

        setContacts((prev) =>
          prev.map((c, i) => i === contactIndex ? { ...c, status: finalStatus, result: finalResult } : c)
        );
        contactsRef.current = contactsRef.current.map((c, i) =>
          i === contactIndex ? { ...c, status: finalStatus } : c
        );

        if (campaignRef.current === CAMPAIGN_STATES.RUNNING) {
          timerRef.current = setTimeout(() => {
            const latest = contactsRef.current;
            const nextIdx = latest.findIndex((c) => c.status === CALL_STATES.PENDING);
            if (nextIdx !== -1 && campaignRef.current === CAMPAIGN_STATES.RUNNING) {
              callContactRealRef.current(latest[nextIdx], nextIdx);
            } else if (!latest.some((c) => c.status === CALL_STATES.CALLING)) {
              setCampaignState(CAMPAIGN_STATES.COMPLETE);
              setCurrentCallIndex(-1);
            }
          }, configRef.current.vapiConfig.delayBetweenCalls * 1000);
        }
      }, 6 * 60 * 1000);
    } catch (err) {
      console.error("VAPI call error:", err);
      const failResult = {
        status: CALL_STATES.FAILED,
        summary: `API call failed: ${err.message}`,
        duration: 0,
        calledAt: new Date().toLocaleString(),
        end_reason: "call-failed",
        tool_call_data: null,
      };
      setContacts((prev) =>
        prev.map((c, i) =>
          i === contactIndex ? { ...c, status: CALL_STATES.FAILED, result: failResult } : c
        )
      );
      // Schedule next contact even on failure
      timerRef.current = setTimeout(() => {
        const latest = contactsRef.current;
        const nextIdx = latest.findIndex((c) => c.status === CALL_STATES.PENDING);
        if (nextIdx !== -1 && campaignRef.current === CAMPAIGN_STATES.RUNNING) {
          callContactReal(latest[nextIdx], nextIdx);
        } else {
          setCampaignState(CAMPAIGN_STATES.COMPLETE);
          setCurrentCallIndex(-1);
        }
      }, cfg.delayBetweenCalls * 1000);
    }
    // On success: next call is triggered by the Supabase realtime handler
  }, []);

  // Keep a ref to the latest version of callContactReal so async callbacks stay fresh
  const callContactRealRef = useRef(callContactReal);
  useEffect(() => {
    callContactRealRef.current = callContactReal;
  }, [callContactReal]);

  // ── Real mode: subscribe to Supabase realtime for this campaign ──
  const setupRealtime = useCallback((cid) => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel(`campaign-${cid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `campaign_id=eq.${cid}`,
        },
        (payload) => {
          const row = payload.new;

          // Update the matching contact in state
          const currentContacts = contactsRef.current;
          const updatedContacts = currentContacts.map((c) => {
            if (c.supabaseId !== row.id) return c;
            return { ...c, status: row.status, result: mapRowToResult(row) };
          });

          // Write back to both state and ref immediately
          setContacts(updatedContacts);
          contactsRef.current = updatedContacts;

          // Clear the fallback timer for this contact since realtime fired
          const updatedIdx = currentContacts.findIndex((c) => c.supabaseId === row.id);
          if (updatedIdx !== -1 && fallbackTimersRef.current[updatedIdx]) {
            clearTimeout(fallbackTimersRef.current[updatedIdx]);
            delete fallbackTimersRef.current[updatedIdx];
          }

          // If this call finished, schedule the next one
          if (DONE_STATUSES.includes(row.status) && campaignRef.current === CAMPAIGN_STATES.RUNNING) {
            const delay = configRef.current.vapiConfig.delayBetweenCalls * 1000;
            timerRef.current = setTimeout(() => {
              if (campaignRef.current !== CAMPAIGN_STATES.RUNNING) return;
              const latest = contactsRef.current;
              const nextIdx = latest.findIndex((c) => c.status === CALL_STATES.PENDING);
              if (nextIdx !== -1) {
                callContactRealRef.current(latest[nextIdx], nextIdx);
              } else if (!latest.some((c) => c.status === CALL_STATES.CALLING)) {
                setCampaignState(CAMPAIGN_STATES.COMPLETE);
                setCurrentCallIndex(-1);
              }
            }, delay);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  }, []);

  // ── Real mode: start campaign ──
  const startCampaignReal = async () => {
    const cid = crypto.randomUUID();
    setCampaignId(cid);

    // Save to campaign history in localStorage
    const entry = {
      id: cid,
      name: campaignName.trim() || `Campaign ${new Date().toLocaleDateString()}`,
      businessName,
      contactCount: contacts.length,
      createdAt: new Date().toISOString(),
    };
    const prev = JSON.parse(localStorage.getItem("vapi_campaign_history") || "[]");
    localStorage.setItem("vapi_campaign_history", JSON.stringify([entry, ...prev].slice(0, 50)));

    // Insert all contacts into Supabase
    const inserts = contacts.map((c) => ({
      campaign_id: cid,
      business_name: businessName,
      phone: c.phone,
      contact_name: c.name || null,
      status: "pending",
    }));

    const { data: rows, error } = await supabase.from("calls").insert(inserts).select("id");

    if (error) {
      console.error("Supabase insert error:", error);
      alert(`Failed to write contacts to Supabase.\n\n${error.message}\n\nCheck your Project URL in Config → DATABASE.`);
      return;
    }

    // Attach the Supabase row ID to each local contact
    const updatedContacts = contacts.map((c, i) => ({
      ...c,
      supabaseId: rows[i]?.id ?? null,
    }));
    setContacts(updatedContacts);
    contactsRef.current = updatedContacts;

    // Subscribe to realtime before making the first call
    setupRealtime(cid);

    campaignRef.current = CAMPAIGN_STATES.RUNNING;
    setCampaignState(CAMPAIGN_STATES.RUNNING);
    setTab("results");

    const firstIdx = updatedContacts.findIndex((c) => c.status === CALL_STATES.PENDING);
    if (firstIdx !== -1) {
      await callContactReal(updatedContacts[firstIdx], firstIdx);
    } else {
      setCampaignState(CAMPAIGN_STATES.COMPLETE);
    }
  };

  // ── Route to real or demo start ──
  const startCampaign = () => {
    if (contacts.length === 0) return alert("Please add at least one contact.");
    const startIdx = contacts.findIndex((c) => c.status === CALL_STATES.PENDING);
    if (startIdx === -1) return alert("All contacts have been called.");

    if (isRealMode) {
      startCampaignReal();
    } else {
      setCampaignState(CAMPAIGN_STATES.RUNNING);
      setTab("results");
      simulateCall(startIdx);
    }
  };

  const pauseCampaign = () => {
    setCampaignState(CAMPAIGN_STATES.PAUSED);
    clearTimeout(timerRef.current);
  };

  const resumeCampaign = () => {
    setCampaignState(CAMPAIGN_STATES.RUNNING);
    if (isRealMode) {
      const nextIdx = contactsRef.current.findIndex((c) => c.status === CALL_STATES.PENDING);
      if (nextIdx !== -1) {
        callContactReal(contactsRef.current[nextIdx], nextIdx);
      } else {
        setCampaignState(CAMPAIGN_STATES.COMPLETE);
      }
    } else {
      const nextIdx = contacts.findIndex((c) => c.status === CALL_STATES.PENDING);
      if (nextIdx !== -1) simulateCall(nextIdx);
      else setCampaignState(CAMPAIGN_STATES.COMPLETE);
    }
  };

  const hangupCurrentCall = async () => {
    const callId = currentVapiCallIdRef.current;
    if (!callId) return;
    try {
      await fetch(`https://api.vapi.ai/call/${callId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${configRef.current.vapiConfig.apiKey}` },
      });
      currentVapiCallIdRef.current = null;
    } catch (err) {
      console.error("Hangup error:", err);
    }
  };

  // Cleanup realtime on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      Object.values(fallbackTimersRef.current).forEach(clearTimeout);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, []);

  // Stats
  const stats = {
    total: contacts.length,
    called: contacts.filter((c) => c.status !== CALL_STATES.PENDING && c.status !== CALL_STATES.CALLING).length,
    scheduled: contacts.filter((c) => c.status === CALL_STATES.SCHEDULED).length,
    answered: contacts.filter((c) => c.status === CALL_STATES.ANSWERED).length,
    voicemail: contacts.filter((c) => c.status === CALL_STATES.VOICEMAIL).length,
    declined: contacts.filter((c) => c.status === CALL_STATES.DECLINED).length,
    noAnswer: contacts.filter((c) => c.status === CALL_STATES.NO_ANSWER).length,
    failed: contacts.filter((c) => c.status === CALL_STATES.FAILED).length,
  };

  const progress = stats.total > 0 ? (stats.called / stats.total) * 100 : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap');

        html, body { background: #0a0c18 !important; margin: 0; padding: 0; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(78, 205, 196, 0.15); }
          50% { box-shadow: 0 0 40px rgba(78, 205, 196, 0.3); }
        }

        input:focus, textarea:focus {
          border-color: #4ecdc4 !important;
          box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.15);
        }

        textarea::placeholder, input::placeholder {
          color: #3a3d5c;
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0c18; }
        ::-webkit-scrollbar-thumb { background: #1e2140; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2a2d50; }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "#0a0c18",
          color: "#e0e4f0",
          fontFamily: "'Outfit', sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid overlay */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(78,205,196,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(78,205,196,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto", padding: "24px 20px" }}>
          {/* Header */}
          <div style={{ marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: campaignState === CAMPAIGN_STATES.RUNNING ? "#4ecdc4" : "#1e2140",
                    animation: campaignState === CAMPAIGN_STATES.RUNNING ? "pulse 1.2s infinite" : "none",
                    boxShadow: campaignState === CAMPAIGN_STATES.RUNNING ? "0 0 12px #4ecdc4" : "none",
                  }}
                />
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: "-0.02em",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  VAPI Campaign Dialer
                </h1>
                {/* Live / Demo mode badge */}
                <span
                  style={{
                    padding: "2px 10px",
                    borderRadius: 20,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontFamily: "'JetBrains Mono', monospace",
                    background: isRealMode ? "rgba(123,237,159,0.12)" : "rgba(107,112,148,0.15)",
                    color: isRealMode ? "#7bed9f" : "#6b7094",
                    border: `1px solid ${isRealMode ? "rgba(123,237,159,0.25)" : "#1e2140"}`,
                  }}
                >
                  {isRealMode ? "● LIVE" : "◌ DEMO"}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#6b7094", margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                Automated outbound calling · AI-powered conversations
              </p>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              style={{
                ...btnBase,
                background: showConfig ? "#1e2140" : "transparent",
                color: "#6b7094",
                border: "1px solid #1e2140",
                fontSize: 11,
              }}
            >
              ⚙ CONFIG
            </button>
          </div>

          {/* Config panel */}
          {showConfig && (
            <div
              style={{
                background: "#0f1124",
                border: "1px solid #1e2140",
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
                animation: "slideIn 0.2s ease",
              }}
            >
              <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
                {[
                  { key: "vapi", label: "VAPI" },
                  { key: "database", label: "DATABASE" },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setConfigTab(t.key)}
                    style={{
                      ...btnBase,
                      padding: "6px 16px",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      background: configTab === t.key ? "#1e2140" : "transparent",
                      color: configTab === t.key ? "#4ecdc4" : "#6b7094",
                      border: "none",
                      borderBottom: configTab === t.key ? "2px solid #4ecdc4" : "2px solid transparent",
                      borderRadius: 0,
                    }}
                  >
                    {t.label}
                    {t.key === "database" && dbConnStatus === "connected" && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7bed9f", marginLeft: 6, display: "inline-block" }} />
                    )}
                  </button>
                ))}
              </div>

              {configTab === "vapi" && (
                <VapiConfigPanel config={vapiConfig} setConfig={setVapiConfig} />
              )}
              {configTab === "database" && (
                <DatabaseConfigPanel
                  config={dbConfig}
                  setConfig={setDbConfig}
                  connStatus={dbConnStatus}
                  onTestConnection={() => {
                    setDbConnStatus("testing");
                    setTimeout(() => {
                      const hasCredentials =
                        (dbConfig.provider === "supabase" && dbConfig.supabaseUrl && dbConfig.supabaseAnonKey) ||
                        ((dbConfig.provider === "postgres" || dbConfig.provider === "mysql") && dbConfig.host && dbConfig.database) ||
                        (dbConfig.provider === "sqlite" && dbConfig.filePath) ||
                        (dbConfig.provider === "rest" && dbConfig.baseUrl);
                      setDbConnStatus(hasCredentials ? "connected" : "error");
                    }, 1500);
                  }}
                />
              )}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
            {[
              { key: "setup", label: "CAMPAIGN SETUP" },
              { key: "results", label: `RESULTS ${stats.called > 0 ? `(${stats.called})` : ""}` },
              { key: "history", label: "HISTORY" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  ...btnBase,
                  background: tab === t.key ? "#1e2140" : "transparent",
                  color: tab === t.key ? "#e0e4f0" : "#6b7094",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  borderRadius: 8,
                  padding: "8px 20px",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ─── SETUP TAB ─── */}
          {tab === "setup" && (
            <div style={{ animation: "slideIn 0.2s ease" }}>
              {/* Campaign Name */}
              <div
                style={{
                  background: "#0f1124",
                  border: "1px solid #1e2140",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <label style={labelStyle}>Campaign Name</label>
                <input
                  placeholder={`e.g. March Leads, Q1 Outreach — ${new Date().toLocaleDateString()}`}
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  style={{ ...inputStyle, fontSize: 15, padding: "12px 16px" }}
                />
              </div>

              {/* Calling On Behalf Of */}
              <div
                style={{
                  background: "#0f1124",
                  border: "1px solid #1e2140",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <label style={labelStyle}>Calling On Behalf Of <span style={{ color: "#3a3d5c", fontWeight: 400 }}>(optional)</span></label>
                <input
                  placeholder="e.g. Acme Plumbing — AI uses this name when introducing itself"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  style={{ ...inputStyle, fontSize: 15, padding: "12px 16px" }}
                />
                <p style={{ fontSize: 11, color: "#6b7094", margin: "8px 0 0 0" }}>
                  The AI will say "I'm calling on behalf of [this name]." Leave blank to omit.
                </p>
              </div>

              {/* Phone Numbers Input */}
              <div
                style={{
                  background: "#0f1124",
                  border: "1px solid #1e2140",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Phone Numbers</label>
                  <button
                    onClick={() => setShowImport(true)}
                    style={{ ...btnBase, padding: "5px 12px", fontSize: 11, background: "transparent", color: "#4ecdc4", border: "1px solid rgba(78,205,196,0.3)", borderRadius: 6 }}
                  >
                    ↑ Import from File
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    style={{ ...inputStyle, width: 130, padding: "10px 10px", flexShrink: 0 }}
                  >
                    {[
                      ["+1",   "🇺🇸 +1 US/CA"],
                      ["+44",  "🇬🇧 +44 UK"],
                      ["+61",  "🇦🇺 +61 AU"],
                      ["+64",  "🇳🇿 +64 NZ"],
                      ["+27",  "🇿🇦 +27 ZA"],
                      ["+49",  "🇩🇪 +49 DE"],
                      ["+33",  "🇫🇷 +33 FR"],
                      ["+34",  "🇪🇸 +34 ES"],
                      ["+39",  "🇮🇹 +39 IT"],
                      ["+31",  "🇳🇱 +31 NL"],
                      ["+52",  "🇲🇽 +52 MX"],
                      ["+55",  "🇧🇷 +55 BR"],
                      ["+54",  "🇦🇷 +54 AR"],
                      ["+91",  "🇮🇳 +91 IN"],
                      ["+81",  "🇯🇵 +81 JP"],
                      ["+82",  "🇰🇷 +82 KR"],
                      ["+86",  "🇨🇳 +86 CN"],
                      ["+971", "🇦🇪 +971 UAE"],
                      ["+966", "🇸🇦 +966 SA"],
                    ].map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder="5551234567"
                    value={phoneDigits}
                    onChange={(e) => setPhoneDigits(e.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && addSingleContact()}
                    style={{ ...inputStyle, flex: 1, padding: "10px 14px" }}
                  />
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={contactNameInput}
                    onChange={(e) => setContactNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSingleContact()}
                    style={{ ...inputStyle, flex: 1, padding: "10px 14px" }}
                  />
                  <button
                    onClick={addSingleContact}
                    style={{ ...btnBase, padding: "10px 18px", background: "#1e2140", color: "#4ecdc4", border: "1px solid rgba(78,205,196,0.3)", borderRadius: 8, flexShrink: 0 }}
                  >
                    + Add
                  </button>
                </div>
                <div style={{ marginTop: 4 }}>
                  <p style={{ fontSize: 11, color: "#6b7094", margin: 0 }}>
                    Select country code, type digits and optional name, press Enter or Add. Use Import for bulk.
                  </p>
                </div>
              </div>

              {/* Contact List Preview */}
              {contacts.length > 0 && (
                <div
                  style={{
                    background: "#0f1124",
                    border: "1px solid #1e2140",
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>
                      Call List — {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
                    </label>
                    <button
                      onClick={clearAll}
                      style={{
                        ...btnBase,
                        background: "transparent",
                        color: "#ff6b6b",
                        fontSize: 11,
                        padding: "6px 12px",
                        border: "1px solid #2a1a1f",
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {contacts.map((c, i) => (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: i % 2 === 0 ? "transparent" : "rgba(30,33,64,0.3)",
                          fontSize: 13,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ color: "#3a3d5c", fontSize: 11, width: 24 }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span style={{ color: "#e0e4f0" }}>{c.phone}</span>
                          {c.name && <span style={{ color: "#6b7094" }}>{c.name}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <StatusBadge status={c.status} />
                          {c.status === CALL_STATES.PENDING && (
                            <button
                              onClick={() => removeContact(c.id)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#3a3d5c",
                                cursor: "pointer",
                                fontSize: 16,
                                padding: "2px 6px",
                                borderRadius: 4,
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Launch controls */}
              <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
                {campaignState === CAMPAIGN_STATES.IDLE || campaignState === CAMPAIGN_STATES.COMPLETE ? (
                  <button
                    onClick={startCampaign}
                    disabled={contacts.length === 0}
                    style={{
                      ...btnBase,
                      background:
                        contacts.length === 0
                          ? "#1e2140"
                          : "linear-gradient(135deg, #4ecdc4, #00d2ff)",
                      color: contacts.length === 0 ? "#3a3d5c" : "#0a0c18",
                      fontWeight: 800,
                      fontSize: 14,
                      padding: "14px 32px",
                      cursor: contacts.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    ▶ {isRealMode ? "Launch Campaign" : "Launch Demo"}
                  </button>
                ) : campaignState === CAMPAIGN_STATES.RUNNING ? (
                  <button
                    onClick={pauseCampaign}
                    style={{
                      ...btnBase,
                      background: "#f8a978",
                      color: "#0a0c18",
                      fontWeight: 800,
                      fontSize: 14,
                      padding: "14px 32px",
                    }}
                  >
                    ⏸ Pause
                  </button>
                ) : campaignState === CAMPAIGN_STATES.PAUSED ? (
                  <button
                    onClick={resumeCampaign}
                    style={{
                      ...btnBase,
                      background: "linear-gradient(135deg, #4ecdc4, #00d2ff)",
                      color: "#0a0c18",
                      fontWeight: 800,
                      fontSize: 14,
                      padding: "14px 32px",
                    }}
                  >
                    ▶ Resume
                  </button>
                ) : null}
                {!isRealMode && (
                  <span style={{ fontSize: 11, color: "#3a3d5c", fontFamily: "'JetBrains Mono', monospace" }}>
                    Add VAPI credentials in ⚙ CONFIG to make real calls
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ─── RESULTS TAB ─── */}
          {tab === "results" && (
            <div style={{ animation: "slideIn 0.2s ease" }}>
              {/* Progress Bar */}
              {contacts.length > 0 && (
                <div
                  style={{
                    background: "#0f1124",
                    border: "1px solid #1e2140",
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Campaign Progress</label>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#4ecdc4",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {stats.called}/{stats.total}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "#1e2140",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${progress}%`,
                        background: "linear-gradient(90deg, #4ecdc4, #00d2ff)",
                        borderRadius: 3,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>

                  {/* Stats Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 12,
                      marginTop: 16,
                    }}
                  >
                    {[
                      { label: "Scheduled", value: stats.scheduled, color: "#00d2ff" },
                      { label: "Answered", value: stats.answered, color: "#7bed9f" },
                      { label: "Voicemail", value: stats.voicemail, color: "#f8a978" },
                      { label: "Declined", value: stats.declined + stats.noAnswer + stats.failed, color: "#ff6b6b" },
                    ].map((s) => (
                      <div
                        key={s.label}
                        style={{
                          background: "#0a0c18",
                          borderRadius: 8,
                          padding: "12px 16px",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 800,
                            color: s.color,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {s.value}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "#6b7094",
                            marginTop: 2,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Controls */}
              {(campaignState === CAMPAIGN_STATES.RUNNING || campaignState === CAMPAIGN_STATES.PAUSED) && (
                <div style={{ marginBottom: 16, display: "flex", gap: 12 }}>
                  {campaignState === CAMPAIGN_STATES.RUNNING ? (
                    <button
                      onClick={pauseCampaign}
                      style={{
                        ...btnBase,
                        background: "#f8a978",
                        color: "#0a0c18",
                        fontWeight: 800,
                      }}
                    >
                      ⏸ Pause Campaign
                    </button>
                  ) : (
                    <button
                      onClick={resumeCampaign}
                      style={{
                        ...btnBase,
                        background: "linear-gradient(135deg, #4ecdc4, #00d2ff)",
                        color: "#0a0c18",
                        fontWeight: 800,
                      }}
                    >
                      ▶ Resume
                    </button>
                  )}
                  {campaignState === CAMPAIGN_STATES.RUNNING && currentCallIndex !== -1 && (
                    <button
                      onClick={hangupCurrentCall}
                      style={{
                        ...btnBase,
                        background: "transparent",
                        color: "#ff6b6b",
                        border: "1px solid #ff6b6b",
                        fontWeight: 700,
                      }}
                    >
                      ✕ Hang Up
                    </button>
                  )}
                </div>
              )}

              {/* Results Table */}
              <div
                style={{
                  background: "#0f1124",
                  border: "1px solid #1e2140",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 140px 140px 80px 100px",
                    padding: "12px 16px",
                    borderBottom: "1px solid #1e2140",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#3a3d5c",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span>#</span>
                  <span>Contact</span>
                  <span>Status</span>
                  <span>Outcome</span>
                  <span>Duration</span>
                  <span>Time</span>
                </div>

                {contacts.length === 0 ? (
                  <div
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "#3a3d5c",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                    }}
                  >
                    No contacts yet. Add numbers in the Setup tab.
                  </div>
                ) : (
                  <div style={{ maxHeight: 500, overflowY: "auto" }}>
                    {contacts.map((c, i) => (
                      <div key={c.id}>
                        <div
                          onClick={() =>
                            c.result && expandContact(c.id)
                          }
                          style={{
                            display: "grid",
                            gridTemplateColumns: "40px 1fr 140px 140px 80px 100px",
                            padding: "10px 16px",
                            borderBottom: "1px solid rgba(30,33,64,0.5)",
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', monospace",
                            cursor: c.result ? "pointer" : "default",
                            background:
                              currentCallIndex === i
                                ? "rgba(78,205,196,0.05)"
                                : "transparent",
                            transition: "background 0.2s",
                            animation:
                              currentCallIndex === i ? "glow 2s infinite" : "none",
                          }}
                          onMouseEnter={(e) => {
                            if (c.result) e.currentTarget.style.background = "rgba(30,33,64,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            if (currentCallIndex !== i)
                              e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <span style={{ color: "#3a3d5c", fontSize: 11 }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <span style={{ color: "#e0e4f0" }}>{c.phone}</span>
                            {c.name && (
                              <span style={{ color: "#6b7094", marginLeft: 10 }}>{c.name}</span>
                            )}
                          </div>
                          <StatusBadge
                            status={c.status}
                            isPaused={
                              campaignState === CAMPAIGN_STATES.PAUSED &&
                              c.status === CALL_STATES.CALLING
                            }
                          />
                          <span style={{ color: "#9ca0b8", fontSize: 11 }}>
                            {c.result?.tool_call_data?.scheduled_date
                              ? `📅 ${c.result.tool_call_data.scheduled_time}`
                              : c.result?.tool_call_data?.callback_requested
                              ? "📞 Callback"
                              : c.result?.tool_call_data?.decline_reason
                              ? `✗ ${c.result.tool_call_data.decline_reason}`
                              : c.result?.summary
                              ? c.result.summary.substring(0, 25) + "…"
                              : "—"}
                          </span>
                          <span style={{ color: "#6b7094" }}>
                            {c.result ? `${c.result.duration}s` : "—"}
                          </span>
                          <span style={{ color: "#6b7094", fontSize: 11 }}>
                            {campaignState === CAMPAIGN_STATES.PAUSED &&
                            c.status === CALL_STATES.PENDING ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = contacts.filter((_, idx) => idx !== i);
                                  setContacts(updated);
                                  contactsRef.current = updated;
                                }}
                                style={{
                                  background: "transparent",
                                  border: "1px solid #3a1a1f",
                                  borderRadius: 4,
                                  color: "#ff6b6b",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  padding: "2px 7px",
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                remove
                              </button>
                            ) : c.result?.calledAt ? (
                              new Date(c.result.calledAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>

                        {/* Expanded call details */}
                        {expandedRow === c.id && c.result && (
                          <div
                            style={{
                              padding: "16px 20px 16px 56px",
                              background: "#0a0c18",
                              borderBottom: "1px solid #1e2140",
                              animation: "slideIn 0.2s ease",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 12,
                                marginBottom: 16,
                              }}
                            >
                              <div
                                style={{
                                  padding: "10px 14px",
                                  background: "#0f1124",
                                  borderRadius: 8,
                                  border: "1px solid #1e2140",
                                  gridColumn: c.result.tool_call_data ? "1" : "1 / -1",
                                }}
                              >
                                <label style={{ ...labelStyle, fontSize: 9, color: "#4ecdc4", marginBottom: 6 }}>
                                  AI Summary
                                </label>
                                <p style={{ fontSize: 12, color: c.result.summary ? "#9ca0b8" : "#3a3d5c", margin: 0, lineHeight: 1.6, fontFamily: "'Outfit', sans-serif", fontStyle: c.result.summary ? "normal" : "italic" }}>
                                  {c.result.summary || "Generating summary…"}
                                </p>
                              </div>

                              {c.result.tool_call_data && (
                                <div
                                  style={{
                                    padding: "10px 14px",
                                    background: "#0f1124",
                                    borderRadius: 8,
                                    border: "1px solid #1e2140",
                                  }}
                                >
                                  <label style={{ ...labelStyle, fontSize: 9, color: "#f8a978", marginBottom: 6 }}>
                                    Extracted Data (Tool Calls)
                                  </label>
                                  {Object.entries(c.result.tool_call_data).map(([key, val]) => (
                                    <div
                                      key={key}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 11,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        padding: "3px 0",
                                        borderBottom: "1px solid rgba(30,33,64,0.4)",
                                      }}
                                    >
                                      <span style={{ color: "#6b7094" }}>
                                        {key.replace(/_/g, " ")}
                                      </span>
                                      <span style={{ color: "#e0e4f0" }}>
                                        {typeof val === "boolean" ? (val ? "Yes" : "No") : String(val || "—")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                              {c.result.sentiment && (
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    background: "#1a1a2e",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color:
                                      c.result.sentiment === "positive" || c.result.sentiment === "warm" ? "#7bed9f" :
                                      c.result.sentiment === "cold" || c.result.sentiment === "annoyed" ? "#ff6b6b" :
                                      "#6b7094",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  Sentiment: {c.result.sentiment}
                                </span>
                              )}
                              {c.result.end_reason && (
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    background: "#1a1a2e",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: "#6b7094",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  End: {c.result.end_reason}
                                </span>
                              )}
                              {c.result.recording_url && (
                                <a
                                  href={c.result.recording_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    background: "#1a1f3a",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: "#4ecdc4",
                                    letterSpacing: "0.08em",
                                    textDecoration: "none",
                                  }}
                                >
                                  ▶ Recording
                                </a>
                              )}
                            </div>

                            {c.result.scheduledTime && (
                              <div
                                style={{
                                  marginBottom: 14,
                                  padding: "10px 14px",
                                  background: "linear-gradient(135deg, rgba(0,210,255,0.08), rgba(78,205,196,0.05))",
                                  border: "1px solid rgba(0,210,255,0.2)",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  color: "#00d2ff",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span style={{ fontSize: 16 }}>📅</span>
                                Appointment Scheduled: {c.result.scheduledTime}
                              </div>
                            )}

                            {c.result.tool_call_data?.callback_requested && (
                              <div
                                style={{
                                  marginBottom: 14,
                                  padding: "10px 14px",
                                  background: "rgba(248,169,120,0.08)",
                                  border: "1px solid rgba(248,169,120,0.2)",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  color: "#f8a978",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span style={{ fontSize: 16 }}>📞</span>
                                Callback Requested — follow up next week
                              </div>
                            )}

                            <details style={{ marginTop: 4 }}>
                              <summary
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: "0.1em",
                                  textTransform: "uppercase",
                                  color: "#4ecdc4",
                                  cursor: "pointer",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  marginBottom: 8,
                                  userSelect: "none",
                                }}
                              >
                                Full Transcript
                              </summary>
                              <pre
                                style={{
                                  fontSize: 12,
                                  color: "#9ca0b8",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.7,
                                  margin: 0,
                                  padding: "10px 14px",
                                  background: "#0f1124",
                                  borderRadius: 8,
                                  border: "1px solid #1e2140",
                                }}
                              >
                                {c.result.transcript || "Transcript not yet available. It arrives a few seconds after the call ends."}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Campaign Complete Banner */}
              {campaignState === CAMPAIGN_STATES.COMPLETE && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 20,
                    background: "linear-gradient(135deg, rgba(78,205,196,0.1), rgba(0,210,255,0.05))",
                    border: "1px solid rgba(78,205,196,0.2)",
                    borderRadius: 12,
                    textAlign: "center",
                    animation: "slideIn 0.3s ease",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#4ecdc4", marginBottom: 4 }}>
                    Campaign Complete
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7094", fontFamily: "'JetBrains Mono', monospace" }}>
                    {stats.scheduled} scheduled · {stats.answered} answered · {stats.voicemail} voicemails left ·{" "}
                    {stats.declined + stats.noAnswer + stats.failed} unreached
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── HISTORY TAB ─── */}
          {tab === "history" && (() => {
            const history = JSON.parse(localStorage.getItem("vapi_campaign_history") || "[]");
            return (
              <div style={{ animation: "slideIn 0.2s ease" }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 48, color: "#6b7094", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                    No campaigns yet — run your first campaign and it will appear here.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {history.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => loadCampaign(c)}
                        style={{
                          background: "#0f1124",
                          border: "1px solid #1e2140",
                          borderRadius: 12,
                          padding: "16px 20px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(78,205,196,0.4)"}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1e2140"}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: "#e0e4f0", fontSize: 14, marginBottom: 4 }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#6b7094", fontFamily: "'JetBrains Mono', monospace" }}>
                            {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            {c.businessName ? ` · ${c.businessName}` : ""}
                            {" · "}{c.contactCount} contacts
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "#4ecdc4", fontFamily: "'JetBrains Mono', monospace" }}>
                          Load →
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Footer */}
          <div
            style={{
              marginTop: 32,
              padding: "16px 20px",
              background: "#0f1124",
              border: "1px solid #1e2140",
              borderRadius: 12,
              fontSize: 12,
              color: "#6b7094",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#4ecdc4" }}>Integration Notes:</strong>{" "}
            {isRealMode
              ? "Running in LIVE mode — calls are made via VAPI and results are saved to Supabase in real time via webhooks."
              : "Running in DEMO mode with simulated calls. Add your VAPI API Key, Assistant ID, and Phone Number ID in ⚙ CONFIG to go live. Configure your Supabase URL in Config → DATABASE — the schema is shown there."}
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onAddContacts={(newContacts) => setContacts((prev) => [...prev, ...newContacts])}
        />
      )}
    </>
  );
}
