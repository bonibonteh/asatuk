// UNTESTED: needs LIVEKIT_* secrets. Mints a short-lived room token for a signed-in council member only after the meeting is visible to them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("LIVEKIT_URL"), key = Deno.env.get("LIVEKIT_API_KEY"), secret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!url || !key || !secret) return Response.json({ error: "LiveKit is not configured" }, { status: 503, headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  const { meeting_id } = await req.json();
  const { data: m } = await sb.from("council_meetings").select("id,status").eq("id", meeting_id).maybeSingle(); // RLS decides visibility
  if (!m || m.status === "cancelled") return Response.json({ error: "Meeting not available" }, { status: 403, headers: cors });
  const at = new AccessToken(key, secret, { identity: u.user.id, ttl: "2h" });
  at.addGrant({ roomJoin: true, room: `meeting-${m.id}`, canPublish: true, canSubscribe: true });
  return Response.json({ url, token: await at.toJwt() }, { headers: cors });
});
