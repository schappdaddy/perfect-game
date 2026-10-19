// app/api/assistant/route.ts
// Perfect Game assistant — server-side proxy to the Anthropic API.
// The API key lives here (Vercel env var ANTHROPIC_API_KEY) and never reaches the browser.
// The client executes tools against app state and calls back with results; this route is stateless.

export const runtime = 'edge'

const MODEL = process.env.ASSISTANT_MODEL || 'claude-haiku-4-5-20251001'

const TOOLS = [
  {
    name: 'add_item',
    description: 'Add a BACKLOG ITEM — a piece of work to be built/fixed/delivered by the team (a bug, enhancement, tech debt, business request). This is the default for "add an item", "add a backlog item", "add a bug/enhancement/request", or "add X to <project>" with no personal-reminder framing. If in doubt between this and add_task, prefer add_item — items are the team\'s work; tasks are the user\'s personal to-dos.',
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
    description: 'Add a personal TASK — a reminder/to-do for the USER personally (e.g. "remind me to...", "add a task for me to...", "I need to follow up on/reach out to/call/email/schedule..."). NOT for team work items — "add a backlog item" or "add X to the backlog" is add_item, never add_task, even if it mentions a project. Only use add_task when the request is explicitly about a personal reminder/to-do, typically with a due date and an action verb like follow up, reach out, call, review, send.',
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
    name: 'delete_item',
    description: 'Permanently delete a backlog item. ALWAYS call find_items first if there is any chance of ambiguity, and confirm the exact item with the user (name it back to them) before calling this — deletion cannot be undone.',
    input_schema: {
      type: 'object',
      properties: { item: { type: 'string', description: 'RTL id (e.g. RTL-042) or an exact/distinctive part of the item name, confirmed with the user' } },
      required: ['item'],
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a personal task. Confirm which task (title, and project if there are several similar) with the user before calling this — deletion cannot be undone.',
    input_schema: {
      type: 'object',
      properties: { task: { type: 'string', description: 'Distinctive part of the task title, optionally with its project, confirmed with the user' } },
      required: ['task'],
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
  {
    name: 'get_strategy',
    description: 'Get a strategy roadmap: fiscal-year window, BAU share, code-freeze months, its tracks with yearly goals and projects (dates, planning state, dependencies), plus active projects not on any track. Call this before drafting or changing a roadmap.',
    input_schema: {
      type: 'object',
      properties: { strategy: { type: 'string', description: 'Strategy name (optional; defaults to the first one)' } },
    },
  },
  {
    name: 'create_strategy',
    description: 'Create a new strategy spanning whole fiscal years. FY runs Apr–Mar and is named for the year it ends in (FY27 = Apr 2026–Mar 2027).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        start_fy: { type: 'integer', description: 'e.g. 2027 for FY27' },
        end_fy: { type: 'integer' },
        bau_pct: { type: 'number', description: 'Capacity share reserved for ongoing/BAU work (default 30)' },
        code_freeze_months: { type: 'array', items: { type: 'integer' }, description: 'Calendar months 1–12 under code freeze (default [10,11,12])' },
      },
      required: ['name', 'start_fy', 'end_fy'],
    },
  },
  {
    name: 'add_track',
    description: 'Add a track (e.g. Foundation, Revenue) to a strategy.',
    input_schema: {
      type: 'object',
      properties: { strategy: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', description: 'Short subtitle, e.g. "Starts when its foundation is ready"' } },
      required: ['name'],
    },
  },
  {
    name: 'set_track_goal',
    description: "Set a track's goal for one fiscal year (replaces any existing goal for that year).",
    input_schema: {
      type: 'object',
      properties: { strategy: { type: 'string' }, track: { type: 'string' }, fy: { type: 'integer', description: 'e.g. 2028' }, goal: { type: 'string' } },
      required: ['track', 'fy', 'goal'],
    },
  },
  {
    name: 'plan_project',
    description: 'Place or update a project (a bar on the strategy roadmap): its track, start/end dates and planning state. With create_if_missing it adds a new project as proposed. Projects you place are "proposed" unless the user explicitly says they are planned/approved.',
    input_schema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        strategy: { type: 'string' },
        track: { type: 'string', description: 'Track name, or empty string to take it off its track' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        planning_state: { type: 'string', enum: ['planned', 'proposed', 'bau'] },
        team: { type: 'string', description: 'For new projects: Consumer Experience or Operational Efficiency' },
        description: { type: 'string' },
        create_if_missing: { type: 'boolean' },
      },
      required: ['project'],
    },
  },
  {
    name: 'add_dependency',
    description: 'Record that a project cannot start until another one finishes (draws an arrow on the roadmap).',
    input_schema: {
      type: 'object',
      properties: { project: { type: 'string', description: 'The project that waits' }, depends_on: { type: 'string', description: 'The project it waits on' } },
      required: ['project', 'depends_on'],
    },
  },
  {
    name: 'remove_dependency',
    description: 'Remove a dependency between two projects.',
    input_schema: {
      type: 'object',
      properties: { project: { type: 'string' }, depends_on: { type: 'string' } },
      required: ['project', 'depends_on'],
    },
  },
  {
    name: 'list_project_items',
    description: "List a project's backlog items (id, name, type, status, short description, current epic) and its epics. Use before grouping items into epics.",
    input_schema: {
      type: 'object',
      properties: { project: { type: 'string' } },
      required: ['project'],
    },
  },
  {
    name: 'create_epic',
    description: 'Create an epic inside a project. Epics group related backlog items.',
    input_schema: {
      type: 'object',
      properties: { project: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } },
      required: ['project', 'name'],
    },
  },
  {
    name: 'assign_items_to_epic',
    description: 'Put backlog items (by RTL id) into an epic of the same project.',
    input_schema: {
      type: 'object',
      properties: { project: { type: 'string' }, epic: { type: 'string' }, items: { type: 'array', items: { type: 'string' }, description: 'RTL ids, e.g. ["RTL-042","RTL-051"]' } },
      required: ['project', 'epic', 'items'],
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
Strategies: ${(context?.strategies || []).join('; ') || '(none yet)'}.

Rules:
- Deletion is permanent and cannot be undone. Before calling delete_item or delete_task, always state exactly what you're about to delete (its name/id) and get an explicit yes in the same or a following turn — never delete on the first ambiguous mention. If find_items returns more than one plausible match, list them and ask which one.
- Tool choice: "add a backlog item" / "add an item" / "add a bug/enhancement" → add_item, always — never add_task, even when a project is named. "add a task" / "remind me to" / "I need to follow up/reach out/call" → add_task. When genuinely ambiguous, ask one short question rather than guessing.
- Be brief and concrete. Confirm every write by restating exactly what was created or changed (ids, project, flags, dates).
- Resolve relative dates ("next Tuesday", "Friday") to YYYY-MM-DD yourself using today's date.
- If a project or item reference doesn't match, the tool result will say so and list candidates — ask the user, never guess between candidates.
- For destructive or sweeping changes, confirm intent in one short question first.
- When asked for a morning brief or overview, call get_overview and present it tightly: overdue first, then today/this week, milestones, CCRs owed, flags, open tasks. Bullets, not paragraphs. End with one line offering to act on any of it.
- Never invent data — everything you report must come from tool results.
- Hierarchy: strategy → tracks (each with a goal per fiscal year) → projects (the roadmap bars) → epics → items. FY runs Apr–Mar and is named for the year it ends in (FY27 = Apr 2026–Mar 2027; Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar).
- Drafting a roadmap ("Plan A"): call get_strategy first. Place projects with plan_project so that each starts after everything it depends on ends, no go-live (end date) falls in a code-freeze month, and a team doesn't carry more parallel work than its capacity after the BAU share. Keep everything you place as planning_state "proposed" — the user accepts proposals themselves. Before writing more than a handful of changes, summarise the plan and ask for a go-ahead. Afterwards, list what you placed and any trade-offs.
- Grouping items into epics: call list_project_items, propose the epics and which item ids go in each, and only create them after the user agrees.${context?.voice ? `

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
    body: JSON.stringify({ model: MODEL, max_tokens: 2400, system, tools: TOOLS, messages }),
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
