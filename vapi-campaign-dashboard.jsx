import { useState, useEffect, useCallback, useRef } from "react";

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

const StatusBadge = ({ status }) => {
  const c = stateColors[status] || stateColors[CALL_STATES.PENDING];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        background: c.bg,
        color: c.text,
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
          background: c.dot,
          animation: status === CALL_STATES.CALLING ? "pulse 1.2s infinite" : "none",
        }}
      />
      {status.replace("_", " ")}
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

  // Structured data from tool calls (only present when tools fire)
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
    // Structured fields from VAPI tool calls + webhook
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
      {/* Provider selector */}
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

      {/* Supabase fields */}
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
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={config.supabaseAnonKey}
              onChange={(e) => updateField("supabaseAnonKey", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Service Role Key (optional)</label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={config.supabaseServiceKey}
              onChange={(e) => updateField("supabaseServiceKey", e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Postgres / MySQL fields */}
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

      {/* SQLite fields */}
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

      {/* Custom REST API fields */}
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

      {/* Table name (shared across all providers) */}
      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Table / Collection Name</label>
        <input
          placeholder="calls"
          value={config.tableName}
          onChange={(e) => updateField("tableName", e.target.value)}
          style={{ ...inputStyle, maxWidth: 300 }}
        />
      </div>

      {/* Test connection + status */}
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

      {/* Schema hint */}
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
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   TEXT,
  business_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  contact_name  TEXT,
  status        TEXT DEFAULT 'pending',
  transcript    TEXT,
  duration_sec  INTEGER DEFAULT 0,
  scheduled_at  TIMESTAMPTZ,
  called_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
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

// ─── Main App ───
export default function VapiCampaignDashboard() {
  const [businessName, setBusinessName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [campaignState, setCampaignState] = useState(CAMPAIGN_STATES.IDLE);
  const [currentCallIndex, setCurrentCallIndex] = useState(-1);
  const [expandedRow, setExpandedRow] = useState(null);
  const [vapiConfig, setVapiConfig] = useState({
    apiKey: "",
    assistantId: "",
    phoneNumberId: "",
    delayBetweenCalls: 5,
  });
  const [dbConfig, setDbConfig] = useState({
    provider: "supabase",
    // Supabase
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseServiceKey: "",
    // Generic SQL (Postgres, MySQL)
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    ssl: true,
    // SQLite
    filePath: "",
    // Custom REST API
    baseUrl: "",
    authHeader: "",
    // Connection state
    tableName: "calls",
  });
  const [dbConnStatus, setDbConnStatus] = useState("idle"); // idle | testing | connected | error
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState("vapi"); // vapi | database
  const [tab, setTab] = useState("setup"); // setup | results
  const timerRef = useRef(null);
  const campaignRef = useRef(CAMPAIGN_STATES.IDLE);

  useEffect(() => {
    campaignRef.current = campaignState;
  }, [campaignState]);

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
      };
    });
  };

  const addContacts = () => {
    if (!phoneInput.trim()) return;
    const newContacts = parsePhoneNumbers(phoneInput);
    setContacts((prev) => [...prev, ...newContacts]);
    setPhoneInput("");
  };

  const removeContact = (id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    setContacts([]);
    setCurrentCallIndex(-1);
    setCampaignState(CAMPAIGN_STATES.IDLE);
    setExpandedRow(null);
  };

  const simulateCall = useCallback(
    async (index) => {
      if (campaignRef.current === CAMPAIGN_STATES.PAUSED) return;
      if (index >= contacts.length) {
        setCampaignState(CAMPAIGN_STATES.COMPLETE);
        setCurrentCallIndex(-1);
        return;
      }

      setCurrentCallIndex(index);
      setContacts((prev) =>
        prev.map((c, i) => (i === index ? { ...c, status: CALL_STATES.CALLING } : c))
      );

      // Simulate ringing (2-4 seconds)
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

      if (campaignRef.current === CAMPAIGN_STATES.PAUSED) return;

      const result = generateMockResult(contacts[index]);
      result.transcript = result.transcript.replace(/\{biz\}/g, businessName || "our company");

      setContacts((prev) =>
        prev.map((c, i) =>
          i === index ? { ...c, status: result.status, result } : c
        )
      );

      // Wait before next call
      timerRef.current = setTimeout(
        () => simulateCall(index + 1),
        vapiConfig.delayBetweenCalls * 1000
      );
    },
    [contacts, businessName, vapiConfig.delayBetweenCalls]
  );

  const startCampaign = () => {
    if (!businessName.trim()) return alert("Please enter a business name.");
    if (contacts.length === 0) return alert("Please add at least one contact.");
    const startIdx = contacts.findIndex((c) => c.status === CALL_STATES.PENDING);
    if (startIdx === -1) return alert("All contacts have been called.");
    setCampaignState(CAMPAIGN_STATES.RUNNING);
    setTab("results");
    simulateCall(startIdx);
  };

  const pauseCampaign = () => {
    setCampaignState(CAMPAIGN_STATES.PAUSED);
    clearTimeout(timerRef.current);
  };

  const resumeCampaign = () => {
    setCampaignState(CAMPAIGN_STATES.RUNNING);
    const nextIdx = contacts.findIndex((c) => c.status === CALL_STATES.PENDING);
    if (nextIdx !== -1) simulateCall(nextIdx);
    else setCampaignState(CAMPAIGN_STATES.COMPLETE);
  };

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
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
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
              {/* Config sub-tabs */}
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
                    // Simulate connection test — replace with real logic
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
              {/* Business Name */}
              <div
                style={{
                  background: "#0f1124",
                  border: "1px solid #1e2140",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <label style={labelStyle}>Business Name</label>
                <input
                  placeholder="e.g. Acme Plumbing Solutions"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  style={{ ...inputStyle, fontSize: 15, padding: "12px 16px" }}
                />
                <p style={{ fontSize: 11, color: "#6b7094", margin: "8px 0 0 0" }}>
                  The AI will introduce itself on behalf of this business during calls.
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
                <label style={labelStyle}>Phone Numbers</label>
                <textarea
                  placeholder={`Enter phone numbers (one per line)\nOptionally add a name after a tab:\n+1 (555) 123-4567\t John Smith\n+1 (555) 987-6543\t Jane Doe`}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  rows={6}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: 120,
                    lineHeight: 1.6,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <p style={{ fontSize: 11, color: "#6b7094", margin: 0 }}>
                    Paste numbers separated by new lines, commas, or semicolons.
                  </p>
                  <button
                    onClick={addContacts}
                    style={{
                      ...btnBase,
                      background: "linear-gradient(135deg, #4ecdc4, #44b8b0)",
                      color: "#0a0c18",
                      fontWeight: 800,
                    }}
                  >
                    + Add to List
                  </button>
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

              {/* Launch */}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                {campaignState === CAMPAIGN_STATES.IDLE || campaignState === CAMPAIGN_STATES.COMPLETE ? (
                  <button
                    onClick={startCampaign}
                    disabled={!businessName.trim() || contacts.length === 0}
                    style={{
                      ...btnBase,
                      background:
                        !businessName.trim() || contacts.length === 0
                          ? "#1e2140"
                          : "linear-gradient(135deg, #4ecdc4, #00d2ff)",
                      color: !businessName.trim() || contacts.length === 0 ? "#3a3d5c" : "#0a0c18",
                      fontWeight: 800,
                      fontSize: 14,
                      padding: "14px 32px",
                      cursor: !businessName.trim() || contacts.length === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    ▶ Launch Campaign
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
                {/* Header */}
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
                            c.result && setExpandedRow(expandedRow === c.id ? null : c.id)
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
                          <StatusBadge status={c.status} />
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
                            {c.result?.calledAt
                              ? new Date(c.result.calledAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
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
                            {/* Summary + Metadata Row */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 12,
                                marginBottom: 16,
                              }}
                            >
                              {/* AI Summary */}
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
                                <p style={{ fontSize: 12, color: "#9ca0b8", margin: 0, lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}>
                                  {c.result.summary}
                                </p>
                              </div>

                              {/* Structured Tool Call Data */}
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

                            {/* Metadata pills */}
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
                                <span
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    background: "#1a1f3a",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: "#4ecdc4",
                                    cursor: "pointer",
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  ▶ Recording
                                </span>
                              )}
                            </div>

                            {/* Scheduled appointment callout */}
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

                            {/* Callback requested callout */}
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

                            {/* Full transcript (collapsible) */}
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
                                {c.result.transcript}
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

          {/* Footer note about VAPI integration */}
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
            <strong style={{ color: "#4ecdc4" }}>Integration Notes:</strong> This interface is
            currently running in <strong>demo mode</strong> with simulated calls. To connect to VAPI's
            real calling infrastructure, add your API credentials in the Config → VAPI panel. Configure
            your database under Config → DATABASE — Supabase is pre-selected, but you can switch to
            raw Postgres, MySQL, SQLite, or a custom REST API. The recommended schema is shown in the
            config panel. When connected, all campaign data (contacts, call statuses, transcripts,
            scheduling outcomes) will be persisted to your database in real time, surviving page
            refreshes and enabling historical queries across campaigns.
          </div>
        </div>
      </div>
    </>
  );
}
