# ASA TUK Connect edge functions — UNTESTED (no credentials were available)

Secrets to set (Supabase → Edge Functions → Secrets): LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
OPENAI_API_KEY, OPENAI_TRANSCRIBE_MODEL, OPENAI_MINUTES_MODEL (model ids are never hardcoded: check
https://platform.openai.com/docs/models for ids your account can use).
Deploy: `supabase functions deploy connect-livekit-token connect-ai`.
Needs paid services: LiveKit Cloud (or self-hosted LiveKit server) and OpenAI API usage.
