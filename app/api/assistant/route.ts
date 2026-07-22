// app/api/assistant/route.ts
// Perfect Game assistant — server-side proxy to the Anthropic API.
// The API key lives here (Vercel env var ANTHROPIC_API_KEY) and never reaches the browser.
// The client executes tools against app state and calls back with results; this route is stateless.

export const runtime = 'edge'

const MODEL = process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001'

const TOOLS = [
  {
    name: 'add_item',
    description: 'Add a backlog item. Use when the user asks to add/create a backlog item, bug, enhancement, or request.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name/title' },
        project: { type: 'string', description: 'Project name to attach to (optional). Match loosely; the app resolves it.' },
        team: { type: 'string', description: 'Team name if stated (optional; inherited from project when omitted)' },
        priority: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] },
        request_type: { type: 'string', enum: ['Bug', 'Tech Debt', 'Enhancement', 'Strategic Initiative', 'Business Request', 'Testing'] },
        description: { type: 'string' },
        effort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
        flag_audience: { type: 'string', enum: ['dev', 'stakeholder', 'both'], description: 'Set when the user asks to flag it for discussion' },
        flag_notes: { type: 'string', description: 'Discussion note if given' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_ccr',
    description: 'Create a change request (CCR). Use when the user asks to create/open a CCR or change request.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        project: { type: 'string', description: 'Project name (optional)' },
        target_date: { type: 'string', description: 'YYYY-MM-DD. Resolve relative dates ("next Tuesday") using the current date from context.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_task',
    description: 'Add a personal task, optionally against a project, optionally with a due date.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        project: { type: 'string', description: 'Project name (optional; omit for a general task)' },
        due_date: { type: 'string', description: 'YYYY-MM-DD. Resolve relative dates using the current date from context.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'flag_item',
    description: 'Flag an existing backlog item for discussion (dev, stakeholder, or both), optionally with a note. Also use to unflag (audience "none").',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'RTL id (e.g. RTL-042) or a distinctive part of the item name' },
        audience: { type: 'string', enum: ['dev', 'stakeholder', 'both', 'none'] },
        notes: { type: 'string' },
      },
      required: ['item', 'audience'],
    },
  },
  {
    name: 'update_item_status',
    description: 'Change the status of an existing backlog item.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'RTL id or a distinctive part of the item name' },
        status: { type: 'string', description: 'Target status — must be one of the statuses listed in context for the current space' },
      },
      required: ['item', 'status'],
    },
  },
  {
    name: 'get_overview',
    description: "Get a live snapshot: due-soon items, upcoming milestones, CCRs owed/open, flagged items and projects, open/overdue tasks, and counts. Use for the morning brief and for questions like \"what's due\", \"what do I owe\", \"what's flagged\".",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'find_items',
    description: 'Search backlog items by text (matches id, name, project, vendor). Use before flagging/updating when the reference is ambiguous.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
]

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set in Vercel environment variables.' }), { status: 500 })
  }
  let body: any
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }) }
  const { messages, context } = body || {}
  if (!Array.isArray(messages)) return new Response(JSON.stringify({ error: 'messages[] required' }), { status: 400 })

  const system = `You are the Perfect Game assistant — the operating copilot inside Casey's personal program-management app.

Today's date: ${context?.today || 'unknown'}. Current space: ${context?.space || 'work'}.
Projects in this space: ${(context?.projects || []).join('; ') || '(none)'}.
Teams: ${(context?.teams || []).join('; ') || '(none)'}.
Valid item statuses in this space: ${(context?.statuses || []).join('; ') || '(none)'}.

Rules:
- Be brief and concrete. Confirm every write by restating exactly what was created or changed (ids, project, flags, dates).
- Resolve relative dates ("next Tuesday", "Friday") to YYYY-MM-DD yourself using today's date.
- If a project or item reference doesn't match, the tool result will say so and list candidates — ask the user, never guess between candidates.
- For destructive or sweeping changes, confirm intent in one short question first.
- When asked for a morning brief or overview, call get_overview and present it tightly: overdue first, then today/this week, milestones, CCRs owed, flags, open tasks. Bullets, not paragraphs. End with one line offering to act on any of it.
- Never invent data — everything you report must come from tool results.${context?.voice ? `

VOICE MODE — the user is speaking with you and your reply will be read aloud:
- Reply in natural spoken prose, 1–3 short sentences. Contractions are good. Never use bullet points, headers, tables, or markdown.
- Don't read out ids, dates in ISO format, or field-by-field confirmations — say it like a person: "Done — that's in Boomi and flagged for the dev conversation."
- For the brief, give the headline version in a few flowing sentences (what's overdue, what's landing, what you owe) and offer detail if wanted.
- Ask at most one short question when you need clarification.` : ''}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, tools: TOOLS, messages }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const msg = data?.error?.message || 'Anthropic API error'
    return new Response(JSON.stringify({ error: /model/i.test(msg) ? `Model not available (${MODEL}): ${msg}. Set ASSISTANT_MODEL in Vercel to override.` : msg }), { status: 502 })
  }
  return new Response(JSON.stringify({ content: data.content, stop_reason: data.stop_reason }), {
    headers: { 'content-type': 'application/json' },
  })
}
