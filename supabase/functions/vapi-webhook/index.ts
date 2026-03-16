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

    // ─── TOOL CALLS (mid-call, real-time) ───
    if (message?.type === "tool-calls") {
      for (const toolCall of message.toolCalls ?? []) {
        const fn = toolCall.function;
        let args: Record<string, unknown>;

        try {
          args = typeof fn.arguments === "string"
            ? JSON.parse(fn.arguments)
            : fn.arguments;
        } catch {
          args = {};
        }

        // schedule_appointment
        if (fn.name === "schedule_appointment") {
          await supabase
            .from("calls")
            .update({
              status: "scheduled",
              scheduled_date: args.scheduled_date ?? null,
              scheduled_time: args.scheduled_time ?? null,
              contact_name: args.contact_name ?? null,
              notes: args.notes ?? null,
              scheduled_at: args.scheduled_date
                ? new Date(
                    `${args.scheduled_date}T${convertTo24h(String(args.scheduled_time ?? "12:00 PM"))}`
                  ).toISOString()
                : new Date().toISOString(),
            })
            .eq("vapi_call_id", callId);

          return Response.json({
            results: [
              {
                toolCallId: toolCall.id,
                result: `Appointment confirmed for ${args.scheduled_date} at ${args.scheduled_time}.`,
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

        // mark_callback
        if (fn.name === "mark_callback") {
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
      }
    }

    // ─── END-OF-CALL REPORT ───
    if (message?.type === "end-of-call-report") {
      // Don't overwrite tool-call statuses like 'scheduled' or 'declined'
      const { data: existing } = await supabase
        .from("calls")
        .select("status")
        .eq("vapi_call_id", callId)
        .single();

      const preserveStatus = ["scheduled", "declined"].includes(existing?.status ?? "");

      await supabase
        .from("calls")
        .update({
          ...(preserveStatus ? {} : { status: determineStatus(message) }),
          transcript: message.transcript ?? null,
          duration_sec: message.durationSeconds ?? 0,
          end_reason: message.endedReason ?? null,
          summary: message.summary ?? null,
          recording_url: message.recordingUrl ?? null,
          sentiment: extractSentiment(message),
          called_at: new Date().toISOString(),
        })
        .eq("vapi_call_id", callId);

      return Response.json({ success: true });
    }

    // ─── STATUS UPDATES (in-progress → calling) ───
    if (message?.type === "status-update") {
      if (message.status === "in-progress") {
        await supabase
          .from("calls")
          .update({ status: "calling" })
          .eq("vapi_call_id", callId);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
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
  ) return "no_answer";
  if (
    r.includes("error") ||
    r.includes("failed") ||
    r.includes("provider") ||
    r.includes("websocket")
  ) return "failed";
  return "answered";
}

// Optional: derive sentiment from the report if VAPI provides it
function extractSentiment(report: Record<string, unknown>): string | null {
  // VAPI doesn't natively provide sentiment yet — leave this for post-call
  // analysis (e.g. send transcript to Claude/GPT and write back)
  return null;
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
