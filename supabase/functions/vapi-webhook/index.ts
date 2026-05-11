import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const { message } = payload;
    const callId = message?.call?.id ?? payload.call?.id;

    console.log(
      `[webhook] type=${message?.type} status=${message?.status} endedReason=${message?.endedReason} callId=${callId}`
    );

    // ─── TOOL CALLS (mid-call, real-time) ───
    if (message?.type === "tool-calls") {
      for (const toolCall of message.toolCalls ?? []) {
        const fn = toolCall.function;

        // Per VAPI docs, arguments is an object — but parse defensively in case it's a string
        let args: Record<string, unknown>;
        try {
          args = typeof fn.arguments === "string"
            ? JSON.parse(fn.arguments)
            : (fn.arguments ?? {});
        } catch {
          args = {};
        }

        // schedule_appointment
        // Note: VAPI tool definition uses "schedule_time" (not "scheduled_time") — handle both
        if (fn.name === "schedule_appointment") {
          const scheduledTime = String(args.scheduled_time ?? args.schedule_time ?? "12:00 PM");
          await supabase
            .from("calls")
            .update({
              status: "scheduled",
              scheduled_date: args.scheduled_date ?? null,
              scheduled_time: scheduledTime,
              contact_name: args.contact_name ?? null,
              notes: args.notes ?? null,
              scheduled_at: args.scheduled_date
                ? new Date(
                    `${args.scheduled_date}T${convertTo24h(scheduledTime)}`
                  ).toISOString()
                : new Date().toISOString(),
            })
            .eq("vapi_call_id", callId);

          return Response.json({
            results: [
              {
                toolCallId: toolCall.id,
                result: `Appointment confirmed for ${args.scheduled_date} at ${scheduledTime}.`,
              },
            ],
          });
        }

        // mark_declined
        if (fn.name === "mark_declined") {
          await supabase
            .from("calls")
            .update({
              status: "declined",
              decline_reason: args.reason ?? "Not interested",
            })
            .eq("vapi_call_id", callId);

          return Response.json({
            results: [{ toolCallId: toolCall.id, result: "Marked as declined." }],
          });
        }

        // mark_callback / mark_call (VAPI assistant uses "mark_call")
        if (fn.name === "mark_callback" || fn.name === "mark_call") {
          await supabase
            .from("calls")
            .update({
              callback_requested: true,
              notes: args.notes ?? "Callback requested",
            })
            .eq("vapi_call_id", callId);

          return Response.json({
            results: [{ toolCallId: toolCall.id, result: "Callback request noted." }],
          });
        }

        // Unknown tool — return empty result so VAPI doesn't hang
        console.warn(`[webhook] Unhandled tool: ${fn.name}`);
        return Response.json({
          results: [{ toolCallId: toolCall.id, result: "Acknowledged." }],
        });
      }
    }

    // ─── END-OF-CALL REPORT ───
    // Docs: https://docs.vapi.ai/server-url/events
    // Payload paths:
    //   transcript  → message.artifact.transcript (string)
    //   summary     → message.analysis.summary (string, requires summaryPlan enabled)
    //   recording   → message.artifact.recordingUrl OR message.artifact.recording.url
    //   duration    → not sent in webhook; calculated from call.createdAt / updatedAt
    if (message?.type === "end-of-call-report") {
      const { data: existing } = await supabase
        .from("calls")
        .select("status")
        .eq("vapi_call_id", callId)
        .single();

      const preserveStatus = ["scheduled", "declined"].includes(existing?.status ?? "");

      // Transcript: prefer the string field; fall back to building from messages array
      const transcript =
        (message.artifact?.transcript as string | null) ??
        buildTranscript(message.artifact?.messages ?? []);

      // Summary: VAPI provides this when analysisPlan.summaryPlan is enabled on the assistant.
      // If disabled, we derive a plain-English summary from the tool call outcome.
      const summary =
        (message.analysis?.summary as string | null) ??
        buildFallbackSummary(message);

      // Recording URL: VAPI may send either field depending on version
      const recordingUrl =
        (message.artifact?.recordingUrl as string | null) ??
        (message.artifact?.recording?.url as string | null) ??
        (message.artifact?.recording?.recordingUrl as string | null) ??
        null;

      // Duration: not in webhook payload — calculate from call timestamps
      const durationSec = calcDuration(message);

      await supabase
        .from("calls")
        .update({
          ...(preserveStatus ? {} : { status: determineStatus(message) }),
          transcript,
          duration_sec: durationSec,
          end_reason: message.endedReason ?? null,
          summary,
          recording_url: recordingUrl,
          sentiment: extractSentiment(message),
          called_at: new Date().toISOString(),
        })
        .eq("vapi_call_id", callId);

      return Response.json({ success: true });
    }

    // ─── STATUS UPDATES ───
    if (message?.type === "status-update") {
      if (message.status === "in-progress") {
        await supabase
          .from("calls")
          .update({ status: "calling" })
          .eq("vapi_call_id", callId);
      }

      // Advance campaign immediately on call end — before the full end-of-call-report arrives
      if (message.status === "ended") {
        const { data: existing } = await supabase
          .from("calls")
          .select("status")
          .eq("vapi_call_id", callId)
          .single();

        const preserve = ["scheduled", "declined"].includes(existing?.status ?? "");
        if (!preserve) {
          await supabase
            .from("calls")
            .update({
              status: determineStatus(message),
              end_reason: message.endedReason ?? null,
            })
            .eq("vapi_call_id", callId);
        }
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[webhook] Unhandled error:", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

// ─── Helpers ───

function determineStatus(report: { endedReason?: string }): string {
  const r = (report.endedReason ?? "").toLowerCase();
  if (r.includes("voicemail")) return "voicemail";
  if (
    r.includes("no-answer") ||
    r.includes("no_answer") ||
    r.includes("did-not-answer") ||
    r.includes("silence-timed-out") ||
    r.includes("dial-no-answer")
  )
    return "no_answer";
  if (
    r.includes("error") ||
    r.includes("provider-error") ||
    r.includes("websocket-error") ||
    r.includes("transport-error")
  )
    return "failed";
  return "answered";
}

function extractSentiment(_report: Record<string, unknown>): string | null {
  // VAPI doesn't provide sentiment natively.
  // To add: send transcript to Claude/GPT after the call and write back.
  return null;
}

// Build plain-text transcript from VAPI's messages array (used as fallback
// if message.artifact.transcript is absent)
function buildTranscript(
  messages: Array<Record<string, unknown>>
): string | null {
  const lines = messages
    .filter((m) => (m.role === "user" || m.role === "bot") && m.message)
    .map((m) => `${m.role === "bot" ? "AI" : "User"}: ${m.message}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// Build a plain-English summary when VAPI analysisPlan.summaryPlan is disabled.
// To get real AI summaries: go to VAPI dashboard → Assistant → Analysis Plan →
// enable Summary and set a summaryPrompt.
function buildFallbackSummary(
  message: Record<string, unknown>
): string | null {
  const artifact = message.artifact as Record<string, unknown> | undefined;
  const messages =
    (artifact?.messages as Array<Record<string, unknown>>) ?? [];
  const endedReason = (message.endedReason as string) ?? "";

  // Find the tool call to understand the outcome
  const toolCallMsg = messages.find((m) => Array.isArray(m.toolCalls));
  const firstToolCall = toolCallMsg
    ? (toolCallMsg.toolCalls as Array<Record<string, unknown>>)[0]
    : null;
  const fn = firstToolCall?.function as Record<string, unknown> | undefined;
  const toolName = fn?.name as string | undefined;
  const toolArgs =
    typeof fn?.arguments === "string"
      ? (() => {
          try {
            return JSON.parse(fn.arguments as string);
          } catch {
            return {};
          }
        })()
      : (fn?.arguments as Record<string, unknown>) ?? {};
  const notes = toolArgs?.notes as string | undefined;

  if (toolName === "schedule_appointment") {
    const date = toolArgs?.scheduled_date as string | undefined;
    const time = (toolArgs?.scheduled_time ?? toolArgs?.schedule_time) as string | undefined;
    return `Appointment scheduled${date ? ` for ${date}` : ""}${time ? ` at ${time}` : ""}.${notes ? ` Notes: ${notes}` : ""}`;
  }
  if (toolName === "mark_declined") {
    return `Contact declined.${notes ? ` Reason: ${notes}` : ""}`;
  }
  if (toolName === "mark_call" || toolName === "mark_callback") {
    return `Callback requested.${notes ? ` Notes: ${notes}` : ""}`;
  }
  if (endedReason) {
    return `Call ended: ${endedReason}`;
  }
  return null;
}

// Calculate call duration from call object timestamps.
// VAPI does not send durationSeconds in the webhook payload.
function calcDuration(message: Record<string, unknown>): number {
  const call = message.call as Record<string, unknown> | undefined;
  if (!call) return 0;
  const created = call.createdAt as string | undefined;
  const updated = call.updatedAt as string | undefined;
  if (!created || !updated) return 0;
  const diff = Math.round(
    (new Date(updated).getTime() - new Date(created).getTime()) / 1000
  );
  return diff > 0 ? diff : 0;
}

// Convert "2:00 PM" → "14:00:00"
function convertTo24h(time12h: string): string {
  const parts = time12h.trim().split(" ");
  const modifier = parts[1]?.toUpperCase() ?? "AM";
  const [hourStr, minStr] = (parts[0] ?? "12:00").split(":");
  let hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr ?? "0", 10);
  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}
