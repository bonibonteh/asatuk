// UNTESTED: needs OPENAI_* secrets. Drafts minutes from the stored transcript ONLY. Output is saved as a draft via connect_save_draft; the Secretary General must approve it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const apiKey = Deno.env.get("OPENAI_API_KEY"), model = Deno.env.get("OPENAI_MINUTES_MODEL");
  if (!apiKey || !model) return Response.json({ error: "OpenAI is not configured" }, { status: 503, headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { meeting_id } = await req.json();
  const job = await sb.rpc("connect_enqueue_job", { p_meeting: meeting_id, p_kind: "ai_minutes" });
  if (job.error) return Response.json({ error: job.error.message }, { status: 403, headers: cors });
  const { data: segs } = await sb.from("connect_transcript_segments").select("speaker_name,start_ms,text").eq("meeting_id", meeting_id).order("start_ms");
  if (!segs?.length) { await sb.rpc("connect_log_job_result", { p_job: job.data, p_ok: false, p_error: "No transcript to summarise" }); return Response.json({ error: "No transcript" }, { status: 422, headers: cors }); }
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [
        { role: "system", content: 'Summarise ONLY what is in the transcript. Never invent names, decisions or deadlines. Reply JSON: {"summary":string,"decisions":string[],"actions":[{"title":string,"docket":string,"due_date":string|null}]}. If unclear, leave empty.' },
        { role: "user", content: segs.map((s) => `[${s.speaker_name}] ${s.text}`).join("\n") }] }) });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const o = JSON.parse((await r.json()).choices[0].message.content);
    const d = await sb.rpc("connect_save_draft", { p_meeting: meeting_id, p_summary: o.summary ?? "", p_decisions: o.decisions ?? [], p_actions: o.actions ?? [], p_model: model });
    if (d.error) throw new Error(d.error.message);
    await sb.rpc("connect_log_job_result", { p_job: job.data, p_ok: true, p_model: model });
    return Response.json({ draft_id: d.data }, { headers: cors });
  } catch (e) {
    await sb.rpc("connect_log_job_result", { p_job: job.data, p_ok: false, p_error: String(e) });
    return Response.json({ error: String(e) }, { status: 502, headers: cors });
  }
});
