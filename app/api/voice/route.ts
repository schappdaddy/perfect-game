// app/api/voice/route.ts
// Perfect Game voice — proxies OpenAI text-to-speech so replies sound human.
// Key lives in Vercel env var OPENAI_API_KEY and never reaches the browser.

export const runtime = 'edge'

const TTS_MODEL = process.env.VOICE_MODEL || 'gpt-4o-mini-tts'
const VOICE = process.env.VOICE_NAME || 'coral'

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not set in Vercel environment variables.' }), { status: 500 })
  let body: any
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }) }
  const text = String(body?.text || '').slice(0, 3000)
  if (!text.trim()) return new Response(JSON.stringify({ error: 'No text' }), { status: 400 })

  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: VOICE,
      input: text,
      response_format: 'mp3',
      instructions: 'Speak like a laid-back surfer buddy giving you the rundown — chill, unhurried, easygoing, a little breezy. Still clear and easy to follow, just totally relaxed, like you\'re catching up on the beach, not delivering a report.',
    }),
  })
  if (!resp.ok) {
    let msg = 'OpenAI TTS error'
    try { const j = await resp.json(); msg = j?.error?.message || msg } catch {}
    return new Response(JSON.stringify({ error: msg }), { status: 502 })
  }
  return new Response(resp.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } })
}
