'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// The Desk's notebook: the day's notes, and the tasks that come out of them.
// Note lines (plain text, stored in daily_notes.content):
//   [ ] to-do / [x] done         a checkbox; it becomes a real task (in Tasks) once you
//                                 leave the line, and stays in sync: {{t:<task id>}} links it
//   - bullet                     Text:  a section     ## Title | 09:30 | Dana, Juan  a meeting
//   @[Name](p|e|i:<id>)           a mention of an initiative, epic or story/bug (type @)
// Tasks group into Overdue / Today / This week / Later, and take quick dates ('tomorrow',
// 'fri', 'next week', 'in 3 days', '11/20') at the end of the title.

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS=['sun','mon','tue','wed','thu','fri','sat']
const pad=(n:number)=>String(n).padStart(2,'0')
export const isoOf=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const addDays=(iso:string,n:number)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return isoOf(d)}
const fmtDay=(iso:string)=>{const d=new Date(iso+'T12:00:00');return `${d.toLocaleDateString('en-US',{weekday:'short'})} ${MONTHS[d.getMonth()]} ${d.getDate()}`}
const TASK_MARK=/\s*\{\{t:([0-9a-zA-Z-]+)\}\}\s*$/
const MENTION=/@\[([^\]]+)\]\(([pei]):([0-9a-zA-Z-]+)\)/g
// Text without task links, mentions as names
export const plainText=(s:string)=>s.replace(TASK_MARK,'').replace(MENTION,(_m,n)=>n)
const isTaskLine=(l:string)=>/^\s*\[( |x)\]/.test(l)
const isBullet=(l:string)=>l.trimStart().startsWith('- ')&&!isTaskLine(l)
const isMeeting=(l:string)=>l.trimStart().startsWith('## ')
const isSection=(l:string)=>{const t=l.trim();return t.length>1&&!isTaskLine(t)&&!isMeeting(t)&&/:\s*↻?$/.test(t)}
const mentionsIn=(s:string)=>[...s.matchAll(MENTION)].map(m=>({name:m[1],k:m[2] as 'p'|'e'|'i',id:m[3]}))

// Quick dates at the end of a title: today, tomorrow, mon…sun, next week, in N days, m/d(/yy)
export function parseQuickDate(text:string,base=isoOf(new Date())):{title:string,due:string|null}{
  const t=text.trim()
  const rules:[RegExp,(m:RegExpMatchArray)=>string|null][]=[
    [/\s+(?:by\s+|due\s+)?today$/i,()=>base],
    [/\s+(?:by\s+|due\s+)?(?:tomorrow|tmrw|tmr)$/i,()=>addDays(base,1)],
    [/\s+(?:by\s+|due\s+)?next week$/i,()=>{const d=new Date(base+'T12:00:00');const k=(8-d.getDay())%7||7;return addDays(base,k)}],
    [/\s+in (\d{1,2}) days?$/i,m=>addDays(base,Number(m[1]))],
    [/\s+(?:by\s+|due\s+|on\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?$/i,m=>{const want=DAYS.indexOf(m[1].slice(0,3).toLowerCase());const d=new Date(base+'T12:00:00');let k=(want-d.getDay()+7)%7;if(k===0)k=7;return addDays(base,k)}],
    [/\s+(?:by\s+|due\s+|on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/,m=>{const b=new Date(base+'T12:00:00');let y=m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):b.getFullYear();const iso=`${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;if(!m[3]&&iso<base)y++;return `${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`}],
  ]
  for(const[re,fn]of rules){const m=t.match(re);if(m){const due=fn(m);if(due)return{title:t.slice(0,m.index).trim(),due}}}
  return{title:t,due:null}
}

const chip=(k:string)=>k==='p'?{c:'#C8973A',bg:'rgba(200,151,58,0.14)',i:'◈'}:k==='e'?{c:'#E07B2A',bg:'rgba(224,123,42,0.14)',i:'◆'}:{c:'#5DADE2',bg:'rgba(93,173,226,0.14)',i:'▪'}
// Mentions as chips, [text](https://…) as links, and a bullet's 'Label:' lead-in in bold
const TOKEN=/@\[([^\]]+)\]\(([pei]):([0-9a-zA-Z-]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
function Rendered({text,onMention,label}:{text:string,onMention?:(k:string,id:string)=>void,label?:boolean}){
  const out:any[]=[];let last=0
  const lm=label?text.match(/^([^:@\[\]]{2,70}):\s/):null
  if(lm){out.push(<b key="lbl" style={{color:'#E1EEF8'}}>{lm[1]}:</b>,' ');last=lm[0].length}
  for(const m of text.slice(last).matchAll(TOKEN)){
    const at=last+m.index!
    if(at>last)out.push(text.slice(last,at))
    if(m[1]){const c=chip(m[2])
      out.push(<span key={at} onClick={e=>{e.stopPropagation();onMention?.(m[2],m[3])}} title="Open"
        style={{color:c.c,background:c.bg,borderRadius:4,padding:'0 5px',fontWeight:600,cursor:onMention?'pointer':'default',whiteSpace:'nowrap' as const}}>{c.i} {m[1]}</span>)}
    else out.push(<a key={at} href={m[5]} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} title={m[5]} style={{color:'#5DADE2'}}>🔗 {m[4]}</a>)
    last=at+m[0].length
  }
  if(last<text.length)out.push(text.slice(last))
  return <>{out}</>
}

// ── Pasting a meeting recap (Teams / Copilot / Zoom notes) ──
// Turns pasted text into note lines: '*', '•', '-' or '1.' bullets (indent kept as sub-bullets),
// 'Heading:' lines as sections, the items under a 'Follow-up tasks:' / 'Action items:' /
// 'Next steps:' heading as to-dos, and a 'Recap: <title>' link as the meeting's title
const FOLLOW=/^(follow[- ]?up( tasks| items)?|action items?|next steps|to-?dos?|tasks)\s*:?\s*$/i
export function parseRecap(text:string){
  const raw=text.replace(/\r\n?/g,'\n').split('\n')
  let title:string|null=null,inFollow=false
  const out:string[]=[]
  const indents:number[]=[]
  for(const r0 of raw){
    const r=r0.replace(/\t/g,'    ').replace(/\s+$/,'')
    if(!r.trim()||/^generated by ai\b/i.test(r.trim()))continue
    const link=r.match(/\[(?:Recap:\s*)?([^\]|]+?)(?:\s*\|[^\]]*)?\]\((https?:[^)\s]+)\)/)
    if(!title&&/recap/i.test(r)&&link){title=link[1].trim();out.push(`- [Meeting recap in Teams](${link[2]})`);continue}
    const b=r.match(/^(\s*)(?:[*•‣◦▪●\-–]|\d+[.)])\s+(.*)$/)
    if(b){
      const sp=b[1].length
      // nesting by indent: each deeper indent is one level, back out to the matching level
      while(indents.length&&sp<indents[indents.length-1])indents.pop()
      if(!indents.length||sp>indents[indents.length-1])indents.push(sp)
      const lvl=Math.min(3,indents.length-1)
      if(inFollow&&lvl===0)out.push(`[ ] ${b[2].trim()}`)
      else out.push(`${'  '.repeat(lvl)}- ${b[2].trim()}`)
      continue
    }
    indents.length=0
    const t=r.trim()
    if(FOLLOW.test(t)){inFollow=true;out.push(t.endsWith(':')?t:t+':');continue}
    if(/:$/.test(t)&&t.length<=60){inFollow=false;out.push(t);continue}
    out.push(t)
  }
  return{title,lines:out}
}
// Make to-do lines into linked tasks (they'd otherwise become tasks when you leave each line)
export async function linkTodoLines(lines:string[],only:Set<number>,date:string,noteSpace:string,setTasks:any){
  const ls=[...lines],made:any[]=[]
  for(const i of only){
    const l=ls[i];if(!l||!/^\s*\[ \]/.test(l)||TASK_MARK.test(l))continue
    const{title,due}=parseQuickDate(plainText(l.replace(/^\s*\[ \]\s?/,'')).trim(),date)
    if(!title)continue
    const{data,error}=await supabase.from('tasks').insert({title,due_date:due||date,done:false,space:noteSpace,note_date:date}).select().single()
    if(error){alert('Failed to make a task: '+error.message);break}
    made.push(data);ls[i]=l+` {{t:${data.id}}}`
  }
  if(made.length)setTasks((p:any[])=>[...p,...made])
  return ls
}

// ── Tasks ────────────────────────────────────────────────────────────────────
export function TaskPanel({tasks,setTasks,projects,items,activeProjects,deskSpace,inDeskSpace,onOpenItem}:any){
  const [open,setOpen]=useState(true),[showDone,setShowDone]=useState(false)
  const [title,setTitle]=useState(''),[proj,setProj]=useState(''),[due,setDue]=useState(''),[sp,setSp]=useState('work')
  const [editDate,setEditDate]=useState<any>(null)
  const today=isoOf(new Date()),weekEnd=addDays(today,7-((new Date().getDay()+6)%7)-1)
  const mine=tasks.filter(inDeskSpace)
  const openT=mine.filter((t:any)=>!t.done),doneT=mine.filter((t:any)=>t.done)
  const groups:[string,string,any[]][]=[
    ['overdue','Overdue',openT.filter((t:any)=>t.due_date&&t.due_date<today)],
    ['today','Today',openT.filter((t:any)=>t.due_date===today)],
    ['week','This week',openT.filter((t:any)=>t.due_date&&t.due_date>today&&t.due_date<=weekEnd)],
    ['later','Later',openT.filter((t:any)=>t.due_date&&t.due_date>weekEnd)],
    ['none','No date',openT.filter((t:any)=>!t.due_date)]]
  const parsed=parseQuickDate(title)
  async function add(){
    const tt=parsed.title||title.trim();if(!tt)return
    const row:any={title:tt,due_date:due||parsed.due||null,done:false,project_id:proj||null,space:proj?(projects.find((p:any)=>p.id===proj)?.space||'work'):(deskSpace==='both'?sp:deskSpace)}
    const{data,error}=await supabase.from('tasks').insert(row).select().single()
    if(error){alert('Failed to add the task: '+error.message);return}
    if(data)setTasks((p:any[])=>[...p,data]);setTitle('');setDue('')
  }
  async function upd(t:any,f:any){setTasks((p:any[])=>p.map(x=>x.id===t.id?{...x,...f}:x));const{error}=await supabase.from('tasks').update(f).eq('id',t.id);if(error)alert('Failed to save: '+error.message)}
  async function del(t:any){setTasks((p:any[])=>p.filter(x=>x.id!==t.id));await supabase.from('tasks').delete().eq('id',t.id)}
  const row=(t:any)=>{
    const pr=projects.find((p:any)=>p.id===t.project_id),it=t.item_id&&items.find((i:any)=>i.id===t.item_id)
    const od=t.due_date&&t.due_date<today
    return(
      <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'3px 0',opacity:t.done?0.55:1}}>
        <input type="checkbox" checked={!!t.done} onChange={()=>upd(t,{done:!t.done})} style={{cursor:'pointer',flexShrink:0}}/>
        <span style={{fontSize:13,color:t.done?'#7A8FA6':'#F4F6F8',flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',textDecoration:t.done?'line-through':undefined}}>{t.title}</span>
        {t.note_date&&<span title={`From your notes on ${fmtDay(t.note_date)}`} style={{fontSize:9.5,color:'#5C6E80',flexShrink:0}}>📝 {fmtDay(t.note_date).slice(4)}</span>}
        {it&&<span onClick={()=>onOpenItem?.(it)} title="Open the item" style={{fontSize:10,color:'#5DADE2',background:'rgba(93,173,226,0.12)',borderRadius:3,padding:'1px 6px',flexShrink:0,cursor:'pointer',maxWidth:150,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>▪ {it.item_id}</span>}
        {pr?<span style={{fontSize:10,color:'#7A8FA6',background:'#1E3048',borderLeft:`3px solid ${pr.color||'#3A4A5E'}`,borderRadius:3,padding:'1px 7px',flexShrink:0,maxWidth:160,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{pr.name}</span>:null}
        {editDate===t.id?<input type="date" defaultValue={t.due_date||''} autoFocus onBlur={e=>{setEditDate(null);if((e.target.value||null)!==(t.due_date||null))upd(t,{due_date:e.target.value||null})}}
            onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();if(e.key==='Escape')setEditDate(null)}} style={{background:'#0D1B2A',border:'1px solid #C8973A',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'2px 5px'}}/>
          :<span onClick={()=>setEditDate(t.id)} title="Change the date" style={{fontSize:11,fontWeight:700,color:od&&!t.done?'#E74C3C':t.due_date===today?'#E8B95A':'#7A8FA6',flexShrink:0,cursor:'pointer',borderBottom:'1px dashed #3A4A5E'}}>{t.due_date?(t.due_date===today?'Today':fmtDay(t.due_date)):'+ date'}</span>}
        <button onClick={()=>del(t)} title="Delete" style={{background:'none',border:'none',color:'#3A4A5E',fontSize:12,cursor:'pointer',padding:0,flexShrink:0}}>✕</button>
      </div>)
  }
  return(
    <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'10px 14px',marginBottom:12,maxHeight:'40%',display:'flex',flexDirection:'column' as const}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:open?8:0}}>
        <span style={{fontSize:9}}>{open?'▾':'▸'}</span>☑ TASKS ({openT.length}{groups[0][2].length?<span style={{color:'#E74C3C'}}> · {groups[0][2].length} overdue</span>:''}{doneT.length?` · ${doneT.length} done`:''})
      </button>
      {open&&<>
        <div style={{overflowY:'auto',flex:1,minHeight:0}}>
          {!openT.length&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:6}}>No open tasks. Add one below, or type [ ] in your notes.</div>}
          {groups.filter(g=>g[2].length).map(([k,l,list])=>(
            <div key={k} style={{marginBottom:4}}>
              <div style={{fontSize:9.5,fontWeight:800,letterSpacing:0.8,color:k==='overdue'?'#E74C3C':k==='today'?'#E8B95A':'#5C6E80',margin:'4px 0 1px'}}>{l.toUpperCase()} · {list.length}</div>
              {list.sort((a:any,b:any)=>(a.due_date||'').localeCompare(b.due_date||'')).map(row)}
            </div>))}
          {doneT.length>0&&<button onClick={()=>setShowDone(o=>!o)} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:10,cursor:'pointer',padding:'2px 0'}}>{showDone?'Hide':'Show'} {doneT.length} completed</button>}
          {showDone&&doneT.slice(-20).map(row)}
        </div>
        <div style={{display:'flex',gap:6,marginTop:8,flexShrink:0}}>
          <select value={proj} onChange={e=>setProj(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px',maxWidth:170}}>
            <option value="">General</option>{activeProjects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {deskSpace==='both'&&!proj&&<select value={sp} onChange={e=>setSp(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 6px'}}><option value="work">🏢</option><option value="home">🏠</option></select>}
          <div style={{flex:1,position:'relative'}}>
            <input placeholder="New task… add a date: 'tomorrow', 'fri', 'next week', '11/20'" value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}}
              style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}/>
            {parsed.due&&!due&&<span style={{position:'absolute',right:6,top:5,fontSize:10,fontWeight:700,color:'#E8B95A',background:'#0D1B2A'}}>📅 {fmtDay(parsed.due)}</span>}
          </div>
          <input type="date" value={due} onChange={e=>setDue(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
          <button onClick={add} disabled={!title.trim()} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 14px',cursor:'pointer',opacity:!title.trim()?0.5:1}}>+ Task</button>
        </div>
      </>}
    </div>
  )
}

// ── Notes editor ─────────────────────────────────────────────────────────────
const TEMPLATES:[string,string,string[]][]=[
  ['blank','Meeting',['']],
  ['standup','Standup',['- Yesterday — ','- Today — ','- Blockers — ']],
  ['1on1','1:1',['- How it’s going — ','- Topics — ','[ ] ']],
  ['vendor','Vendor call',['- Status — ','- Risks / dates — ','[ ] Follow up — ']],
  ['steering','Steering',['- Decisions — ','- Risks — ','- Asks — ','[ ] ']],
]

export function NotesEditor({content,persist,date,noteSpace,tasks,setTasks,projects,epics,items,setItems,onOpenItem,onOpenProject,readOnly=false}:any){
  const lines:string[]=content.split('\n')
  const [focus,setFocus]=useState<number|null>(null)
  const [ac,setAc]=useState<{idx:number,start:number,q:string,sel:number}|null>(null)
  const [menu,setMenu]=useState<number|null>(null)
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({})
  const refs=useRef<any>({}),pending=useRef<any>(null)
  useEffect(()=>{if(pending.current!=null){const{idx,caret}=pending.current;const el=refs.current[idx];if(el){el.focus();if(caret!=null)try{el.setSelectionRange(caret,caret)}catch{}}pending.current=null}},[content,focus])
  const taskById=(id:string)=>tasks.find((t:any)=>t.id===id)
  // Always edit the latest text (async steps finish after more typing), and make each to-do
  // into a task only once
  const latest=useRef(content);latest.current=content
  const linking=useRef<Set<string>>(new Set())
  const setLines=(ls:string[])=>{const next=ls.join('\n');latest.current=next;persist(next)}
  const cur=()=>latest.current.split('\n')

  // A to-do line without a task yet becomes one when you leave it
  async function linkTask(idx:number){
    const l=cur()[idx];if(l==null||!isTaskLine(l)||TASK_MARK.test(l)||linking.current.has(l))return
    linking.current.add(l)
    const body=l.replace(/^\s*\[( |x)\]\s?/,'');const txt=plainText(body).trim();if(!txt)return
    const{title,due}=parseQuickDate(txt,date)
    const ms=mentionsIn(body),pm=ms.find(m=>m.k==='p'),im=ms.find(m=>m.k==='i'),em=ms.find(m=>m.k==='e')
    const proj=pm?.id||(im&&projects.find((p:any)=>p.name===items.find((i:any)=>i.id===im.id)?.parent_project)?.id)||(em&&epics.find((e:any)=>e.id===em.id)?.project_id)||null
    const{data,error}=await supabase.from('tasks').insert({title,due_date:due||date,done:/^\s*\[x\]/.test(l),project_id:proj,item_id:im?.id||null,space:noteSpace,note_date:date}).select().single()
    if(error){linking.current.delete(l);alert('Failed to make it a task: '+error.message);return}
    setTasks((p:any[])=>[...p,data])
    // The line may have moved while saving: find it again by its text
    const ls=cur(),at=ls[idx]===l?idx:ls.indexOf(l)
    if(at>=0){ls[at]=l+` {{t:${data.id}}}`;setLines(ls)}
    linking.current.delete(l)
  }
  async function toggleLine(idx:number){
    const l=cur()[idx],m=l.match(TASK_MARK),t=m&&taskById(m[1])
    const done=t?!t.done:/^\s*\[ \]/.test(l)
    if(t){setTasks((p:any[])=>p.map(x=>x.id===t.id?{...x,done}:x));await supabase.from('tasks').update({done}).eq('id',t.id)}
    const ls=cur();ls[idx]=l.replace(/^(\s*)\[( |x)\]/,`$1[${done?'x':' '}]`);setLines(ls)
  }
  async function syncTitle(idx:number){
    const l=cur()[idx];if(l==null)return
    const m=l.match(TASK_MARK),t=m&&taskById(m[1]);if(!t)return
    const{title,due}=parseQuickDate(plainText(l.replace(/^\s*\[( |x)\]\s?/,'')).trim(),date)
    const f:any={};if(title&&title!==t.title)f.title=title;if(due&&due!==t.due_date)f.due_date=due
    if(Object.keys(f).length){setTasks((p:any[])=>p.map(x=>x.id===t.id?{...x,...f}:x));await supabase.from('tasks').update(f).eq('id',t.id)}
  }
  // The text after the line's prefix, and how to put it back
  const split=(l:string)=>{
    if(isTaskLine(l)){const m=l.match(/^(\s*\[( |x)\]\s?)/)!;const mark=(l.match(TASK_MARK)||[''])[0];return{pre:m[1],body:l.slice(m[1].length).replace(TASK_MARK,''),post:mark}}
    if(isBullet(l)){const i=l.indexOf('- ');return{pre:l.slice(0,i+2),body:l.slice(i+2),post:''}}
    return{pre:'',body:l,post:''}
  }
  function setBody(idx:number,body:string){
    const ls=cur(),{pre,post}=split(ls[idx])
    let next=pre+body+post
    if(!pre&&/^\[\]\s?/.test(body))next='[ ] '+body.replace(/^\[\]\s?/,'')
    if(!pre&&/^\[ \]\s/.test(body))next=body
    ls[idx]=next;setLines(ls)
  }
  // @ autocomplete over open initiatives, epics and stories/bugs
  const closed=(x:any)=>/^(done|closed|complete(d)?|cancell?ed|resolved|will not implement|won'?t do)$/i.test(String(x?.status||''))
  const suggestions=(q:string)=>{
    const s=q.toLowerCase()
    const all=[...projects.filter((p:any)=>!closed(p)&&!p.sustain_quarter).map((p:any)=>({k:'p',id:p.id,name:p.name,sub:'Initiative'})),
      ...epics.filter((e:any)=>!closed(e)).map((e:any)=>({k:'e',id:e.id,name:e.name,sub:'Epic'})),
      ...items.filter((i:any)=>!closed(i)).map((i:any)=>({k:'i',id:i.id,name:`${i.item_id||''} ${i.name}`.trim(),sub:i.request_type==='Bug'?'Bug':'Story'}))]
    return all.filter(x=>!s||x.name.toLowerCase().includes(s)).slice(0,8)
  }
  function onChange(idx:number,e:any){
    const v=e.target.value,caret=e.target.selectionStart??v.length
    setBody(idx,v)
    const m=v.slice(0,caret).match(/@([^@\[\]()]{0,30})$/)
    setAc(m?{idx,start:caret-m[0].length,q:m[1],sel:0}:null)
  }
  function pick(idx:number,s:any){
    const {body}=split(lines[idx]),a=ac!
    const caretEnd=a.start+1+a.q.length
    const nb=body.slice(0,a.start)+`@[${s.name}](${s.k}:${s.id}) `+body.slice(caretEnd)
    setBody(idx,nb);setAc(null);pending.current={idx,caret:null}
  }
  function onKey(e:any,idx:number){
    if(ac&&ac.idx===idx){const sg=suggestions(ac.q)
      if(e.key==='ArrowDown'){e.preventDefault();setAc({...ac,sel:Math.min(sg.length-1,ac.sel+1)});return}
      if(e.key==='ArrowUp'){e.preventDefault();setAc({...ac,sel:Math.max(0,ac.sel-1)});return}
      if((e.key==='Enter'||e.key==='Tab')&&sg.length){e.preventDefault();pick(idx,sg[ac.sel]);return}
      if(e.key==='Escape'){setAc(null);return}}
    const ls=cur()
    if(e.key==='Enter'){
      e.preventDefault()
      const el=e.currentTarget,caret=el.selectionStart??el.value.length
      const{pre,post}=split(ls[idx]),before=el.value.slice(0,caret),after=el.value.slice(caret)
      const task=isTaskLine(ls[idx]),bullet=isBullet(ls[idx])
      const np=task?'[ ] ':bullet?'- ':(isMeeting(ls[idx])||isSection(ls[idx]))?'- ':''
      if(isMeeting(ls[idx])){ls.splice(idx+1,0,np);setLines(ls);pending.current={idx:idx+1,caret:np.length};setFocus(idx+1);return}
      // a sub-bullet continues at its own level
      const lead=bullet?(ls[idx].match(/^\s*/)||[''])[0]:''
      ls[idx]=pre+before+post;ls.splice(idx+1,0,lead+np+after);setLines(ls)
      pending.current={idx:idx+1,caret:0};setFocus(idx+1)
      if(task)setTimeout(()=>linkTask(idx),0)
    }
    if(e.key==='Backspace'&&e.currentTarget.value===''){
      e.preventDefault()
      if(isTaskLine(ls[idx])||isBullet(ls[idx]))ls[idx]=''
      else if(ls.length>1){ls.splice(idx,1);pending.current={idx:Math.max(0,idx-1),caret:null};setFocus(Math.max(0,idx-1))}
      setLines(ls)
    }
    if(e.key==='Tab'&&isBullet(ls[idx])){
      e.preventDefault()
      ls[idx]=e.shiftKey?ls[idx].replace(/^ {1,2}/,''):(ls[idx].match(/^\s*/)![0].length<6?'  '+ls[idx]:ls[idx])
      setLines(ls);pending.current={idx,caret:null}
    }
    const el=e.currentTarget
    if(e.key==='ArrowUp'&&idx>0&&(el.selectionStart??0)===0){e.preventDefault();pending.current={idx:idx-1,caret:null};setFocus(idx-1)}
    if(e.key==='ArrowDown'&&idx<ls.length-1&&(el.selectionStart??0)>=el.value.length){e.preventDefault();pending.current={idx:idx+1,caret:0};setFocus(idx+1)}
  }
  // Line actions
  // Pasting several lines (a meeting recap): add them as structured lines under this one
  async function onPaste(idx:number,e:any){
    const text=e.clipboardData?.getData('text/plain')||''
    if(!text.includes('\n'))return
    e.preventDefault()
    const{title,lines:add}=parseRecap(text);if(!add.length)return
    const ls=cur(),inMeeting=ls.slice(0,idx+1).some(l=>isMeeting(l))
    const now=new Date(),time=`${pad(now.getHours())}:${pad(now.getMinutes())}`
    const block=[...(title&&!inMeeting?[`## ${title} | ${time}`]:[]),...add]
    const emptyHere=!split(ls[idx]).body.trim()
    ls.splice(emptyHere?idx:idx+1,emptyHere?1:0,...block)
    const start=emptyHere?idx:idx+1
    setLines(ls);setFocus(null)
    const todo=new Set<number>();block.forEach((l,i)=>{if(/^\s*\[ \]/.test(l))todo.add(start+i)})
    if(todo.size){const linked=await linkTodoLines(cur(),todo,date,noteSpace,setTasks);setLines(linked)}
  }
  async function makeItem(idx:number,bug:boolean){
    const l=lines[idx],{body}=split(l),name=plainText(body).trim();if(!name)return
    const ms=mentionsIn(body),pm=ms.find(m=>m.k==='p'),em=ms.find(m=>m.k==='e')
    const proj=pm?projects.find((p:any)=>p.id===pm.id):em?projects.find((p:any)=>p.id===epics.find((e:any)=>e.id===em.id)?.project_id):null
    const nums=items.map((i:any)=>Number(String(i.item_id||'').replace(/\D/g,''))||0)
    const iid=`RTL-${String((nums.length?Math.max(...nums):0)+1).padStart(3,'0')}`
    const row:any={item_id:iid,name,status:noteSpace==='home'?'To Do':'Backlog',priority:'P3',effort:'M',request_type:bug?'Bug':'Enhancement',space:noteSpace,parent_project:proj?.name||null,team:proj?.team||null,epic_id:em?.id||null,flagged:false,sort_order:items.length,description:`From notes on ${fmtDay(date)}`}
    const{data,error}=await supabase.from('items').insert(row).select().single()
    if(error){alert('Failed to create it: '+error.message);return}
    setItems((p:any[])=>[...p,data])
    const ls=cur();const sp=split(ls[idx]);ls[idx]=sp.pre+`${bug?'🐞 ':''}@[${iid} ${name}](i:${data.id})`+sp.post;setLines(ls);setMenu(null)
  }
  async function flagItem(idx:number){
    const im=mentionsIn(lines[idx]).find(m=>m.k==='i');if(!im)return
    setItems((p:any[])=>p.map(x=>x.id===im.id?{...x,flagged:true,flag_audience:x.flag_audience||'dev'}:x))
    await supabase.from('items').update({flagged:true}).eq('id',im.id);setMenu(null)
  }
  // Delete a meeting (its header and every line under it, up to the next meeting), or one line.
  // A deleted to-do's task stays in Tasks (delete it there if it's not needed).
  function deleteMeeting(idx:number,n:number){
    if(n&&!confirm(`Delete this meeting and its ${n} line${n!==1?'s':''} of notes?`))return
    const ls=cur();ls.splice(idx,n+1)
    while(ls.length>1&&ls[ls.length-1].trim()===''&&ls[ls.length-2].trim()==='')ls.pop()
    setLines(ls.length?ls:[''])
  }
  function deleteLine(idx:number){
    const ls=cur();ls.splice(idx,1);setLines(ls.length?ls:['']);setMenu(null)
  }
  const openMention=(k:string,id:string)=>{if(k==='i'){const it=items.find((i:any)=>i.id===id);if(it)onOpenItem?.(it)}else if(k==='p'){const p=projects.find((x:any)=>x.id===id);if(p)onOpenProject?.(p)}else{const e=epics.find((x:any)=>x.id===id);const p=e&&projects.find((x:any)=>x.id===e.project_id);if(p)onOpenProject?.(p)}}
  const lineInput={flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',color:'#F4F6F8',fontSize:14,lineHeight:1.6,fontFamily:'inherit',padding:0}

  // Which lines a collapsed meeting hides
  const hidden=new Set<number>();let meet:string|null=null
  lines.forEach((l,i)=>{if(isMeeting(l)){meet=`${i}`}else if(meet&&collapsed[meet])hidden.add(i)})

  return(
    <div onClick={e=>{if(!readOnly&&e.target===e.currentTarget){pending.current={idx:lines.length-1,caret:null};setFocus(lines.length-1)}}} style={{position:'relative'}}>
      {lines.map((l,idx)=>{
        if(hidden.has(idx))return null
        if(isMeeting(l)){
          const parts=l.trimStart().slice(3).split(' | '),[title,time,who]=[parts[0]||'',parts[1]||'',parts[2]||'']
          const set=(i:number,v:string)=>{const p=[title,time,who];p[i]=v;const ls=cur();ls[idx]='## '+p.join(' | ').replace(/( \| )+$/,'');setLines(ls)}
          const n=(()=>{let k=0;for(let j=idx+1;j<lines.length&&!isMeeting(lines[j]);j++)k++;return k})()
          return(
            <div key={idx} style={{display:'flex',alignItems:'center',gap:8,margin:idx?'14px 0 4px':'0 0 4px',padding:'6px 10px',background:'rgba(93,173,226,0.08)',border:'1px solid rgba(93,173,226,0.3)',borderRadius:8}}>
              <button onClick={()=>setCollapsed(c=>({...c,[`${idx}`]:!c[`${idx}`]}))} title={collapsed[`${idx}`]?`Show ${n} lines`:'Collapse'} style={{background:'none',border:'none',color:'#5DADE2',cursor:'pointer',fontSize:11,padding:0,width:12}}>{collapsed[`${idx}`]?'▸':'▾'}</button>
              <span style={{fontSize:14}}>🗓</span>
              {readOnly?<b style={{color:'#F4F6F8',fontSize:14,flex:1}}><Rendered text={title}/></b>
                :<input ref={el=>{if(el)refs.current[idx]=el}} value={title} onChange={e=>set(0,e.target.value)} onKeyDown={e=>onKey(e,idx)} placeholder="Meeting" style={{...lineInput,fontWeight:800,fontSize:14.5,color:'#E1EEF8'}}/>}
              {readOnly?<span style={{color:'#7A8FA6',fontSize:11}}>{time}</span>:<input value={time} onChange={e=>set(1,e.target.value)} placeholder="time" style={{...lineInput,flex:'0 0 54px',fontSize:11.5,color:'#7A8FA6'}}/>}
              {readOnly?<span style={{color:'#7A8FA6',fontSize:11}}>{who}</span>:<input value={who} onChange={e=>set(2,e.target.value)} placeholder="who was there" style={{...lineInput,flex:'0 1 200px',fontSize:11.5,color:'#7A8FA6'}}/>}
              {collapsed[`${idx}`]&&<span style={{fontSize:10,color:'#5C6E80'}}>{n} line{n!==1?'s':''}</span>}
              {!readOnly&&<button onClick={()=>deleteMeeting(idx,n)} title="Delete this meeting and its notes" style={{background:'none',border:'none',color:'#5C6E80',cursor:'pointer',fontSize:12,padding:'0 2px'}}>🗑</button>}
            </div>)
        }
        if(isSection(l)){
          const sub=/^\s+\S/.test(l)
          return(
            <div key={idx} style={{display:'flex',alignItems:'center',gap:8,padding:'2px 0',marginTop:idx===0?0:(sub?6:14),borderBottom:sub?'1px dashed #243447':'2px solid #2E4258',paddingLeft:sub?14:0}}>
              {readOnly?<b style={{color:sub?'#E8B95A':'#C8973A',fontSize:sub?13:16}}>{l.trim()}</b>:
              <input ref={el=>{if(el)refs.current[idx]=el}} value={l} onChange={e=>{const ls=cur();ls[idx]=e.target.value;setLines(ls)}} onKeyDown={e=>onKey(e,idx)}
                style={{...lineInput,color:sub?'#E8B95A':'#C8973A',fontWeight:800,fontSize:sub?13:16}}/>}
            </div>)
        }
        const task=isTaskLine(l),bullet=isBullet(l),{body}=split(l)
        const m=l.match(TASK_MARK),t=m&&taskById(m[1])
        const done=t?!!t.done:/^\s*\[x\]/.test(l)
        const hasMention=/@\[[^\]]+\]\([pei]:[0-9a-zA-Z-]+\)/.test(body)
        // Lines show wrapped; click one to edit (an empty line is always ready to type in)
        void hasMention
        const editing=!readOnly&&(focus===idx||!body.trim())
        const indent=bullet?Math.min(3,Math.floor(((l.match(/^\s*/)||[''])[0].length)/2)):0
        const im=mentionsIn(body).find(x=>x.k==='i')
        return(
          <div key={idx} className="pg-line" style={{display:'flex',alignItems:'flex-start',gap:8,padding:'2px 0',paddingLeft:((task||bullet)?24:14)+indent*20,position:'relative'}}>
            {task&&<input type="checkbox" checked={done} disabled={readOnly} onChange={()=>toggleLine(idx)} style={{cursor:'pointer',flexShrink:0,marginTop:5}}/>}
            {bullet&&<span style={{color:indent?'#7A8FA6':'#C8973A',fontSize:indent?11:14,lineHeight:'22px',flexShrink:0}}>{indent?'◦':'•'}</span>}
            {editing?<textarea rows={1} ref={el=>{if(el){refs.current[idx]=el;el.style.height='auto';el.style.height=el.scrollHeight+'px'}}} value={body}
                onPaste={e=>onPaste(idx,e)}
                onFocus={()=>setFocus(idx)} onBlur={()=>{setTimeout(()=>{setFocus(f=>f===idx?null:f);setAc(a=>a?.idx===idx?null:a)},150);if(task){if(m)syncTitle(idx);else linkTask(idx)}}}
                onChange={e=>onChange(idx,e)} onKeyDown={e=>onKey(e,idx)}
                placeholder={idx===0&&lines.length===1&&!l?'Today’s notes…  [ ] makes a task · @ mentions work · end a line with : for a section · + Meeting for a meeting':''}
                style={{...lineInput,resize:'none' as const,overflow:'hidden',whiteSpace:'pre-wrap' as const,color:done?'#7A8FA6':'#F4F6F8',textDecoration:done?'line-through':'none'}}/>
              :<div onClick={()=>{if(!readOnly){pending.current={idx,caret:null};setFocus(idx)}}} style={{flex:1,minWidth:0,fontSize:indent?13.5:14,lineHeight:1.6,whiteSpace:'pre-wrap' as const,wordBreak:'break-word' as const,color:done?'#7A8FA6':'#F4F6F8',textDecoration:done?'line-through':'none',cursor:readOnly?'default':'text',minHeight:22}}>
                <Rendered text={body} onMention={openMention} label={bullet}/></div>}
            {t&&<span title={`A task${t.due_date?`, due ${fmtDay(t.due_date)}`:''}: also in Tasks`} style={{fontSize:9.5,fontWeight:700,color:t.due_date&&t.due_date<isoOf(new Date())&&!t.done?'#E74C3C':'#5C6E80',flexShrink:0}}>☑ {t.due_date?(t.due_date===isoOf(new Date())?'today':fmtDay(t.due_date).slice(4)):'task'}</span>}
            {!readOnly&&(body.trim()||lines.length>1)&&<button className="pg-line-act" onClick={e=>{e.stopPropagation();setMenu(menu===idx?null:idx)}} title="Actions" style={{background:'none',border:'none',color:'#5C6E80',cursor:'pointer',fontSize:14,padding:'0 2px',flexShrink:0}}>⋯</button>}
            {menu===idx&&<div onClick={e=>e.stopPropagation()} style={{position:'absolute',right:0,top:24,zIndex:30,background:'#162436',border:'1px solid #3A4A5E',borderRadius:8,padding:4,minWidth:210,boxShadow:'0 8px 20px rgba(0,0,0,0.45)'}}>
              {([body.trim()&&!task&&['☑ Make it a task',()=>{const ls=cur();ls[idx]='[ ] '+body;setLines(ls);setMenu(null);setTimeout(()=>linkTask(idx),50)}],
                body.trim()&&!im&&['▪ New backlog story from this',()=>makeItem(idx,false)],
                body.trim()&&!im&&['🐞 New bug from this',()=>makeItem(idx,true)],
                im&&['🚩 Flag the mentioned item',()=>flagItem(idx)],
                im&&['↗ Open the mentioned item',()=>{openMention('i',im.id);setMenu(null)}],
                ['🗑 Delete line',()=>deleteLine(idx)]].filter(Boolean) as any[]).map(([lbl,fn]:any)=>(
                <button key={lbl} onClick={fn} style={{display:'block',width:'100%',textAlign:'left' as const,background:'none',border:'none',color:'#E1E7EE',fontSize:12,padding:'6px 8px',cursor:'pointer',borderRadius:5}}>{lbl}</button>))}
            </div>}
            {ac&&ac.idx===idx&&(()=>{const sg=suggestions(ac.q);return sg.length?(
              <div style={{position:'absolute',left:(task||bullet)?24:14,top:26,zIndex:30,background:'#162436',border:'1px solid #3A4A5E',borderRadius:8,padding:4,minWidth:300,boxShadow:'0 8px 20px rgba(0,0,0,0.45)'}}>
                {sg.map((s:any,i:number)=>{const c=chip(s.k);return(
                  <div key={s.k+s.id} onMouseDown={e=>{e.preventDefault();pick(idx,s)}} style={{display:'flex',gap:8,alignItems:'center',padding:'5px 8px',borderRadius:5,cursor:'pointer',background:i===ac.sel?'#1E3048':'transparent'}}>
                    <span style={{color:c.c,fontWeight:800}}>{c.i}</span><span style={{color:'#F4F6F8',fontSize:12.5,flex:1}}>{s.name}</span><span style={{color:'#5C6E80',fontSize:10}}>{s.sub}</span>
                  </div>)})}
              </div>):null})()}
          </div>
        )
      })}
      <style>{'.pg-line .pg-line-act{opacity:0}.pg-line:hover .pg-line-act{opacity:1}'}</style>
    </div>
  )
}

// ── Toolbar: meetings, open to-dos from before, search, calendar, week, copy ──
export function NotesToolbar({content,persist,date,setDate,noteSpace,view,setView,setTasks}:any){
  const [tpl,setTpl]=useState(false),[q,setQ]=useState(''),[res,setRes]=useState<any[]|null>(null),[cal,setCal]=useState(false),[dates,setDates]=useState<string[]>([])
  const [prev,setPrev]=useState<any>(null),[copied,setCopied]=useState(false)
  const [pasteOpen,setPasteOpen]=useState(false),[pasteText,setPasteText]=useState(''),[pasting,setPasting]=useState(false)
  async function addRecap(){
    const{title,lines:add}=parseRecap(pasteText);if(!add.length)return
    setPasting(true)
    const now=new Date(),time=`${pad(now.getHours())}:${pad(now.getMinutes())}`
    const base=content.replace(/\s+$/,''),head=base?base.split('\n'):[]
    const block=[`## ${title||'Meeting'} | ${time}`,...add]
    const ls=[...head,...(head.length?['']:[]),...block],start=ls.length-block.length
    const todo=new Set<number>();block.forEach((l,i)=>{if(/^\s*\[ \]/.test(l))todo.add(start+i)})
    const linked=todo.size?await linkTodoLines(ls,todo,date,noteSpace,setTasks):ls
    persist(linked.join('\n'));setPasting(false);setPasteOpen(false);setPasteText('')
  }
  const today=isoOf(new Date())
  useEffect(()=>{supabase.from('daily_notes').select('note_date,space').then(({data})=>setDates([...new Set((data||[]).filter((r:any)=>(r.space||'work')===noteSpace).map((r:any)=>r.note_date))] as string[]))},[noteSpace,date])
  // Open to-dos left in your most recent earlier note (written before tasks were linked)
  useEffect(()=>{if(date!==today)return
    supabase.from('daily_notes').select('*').lt('note_date',date).order('note_date',{ascending:false}).limit(10).then(({data})=>{
      const r=(data||[]).find((x:any)=>(x.space||'work')===noteSpace)
      const open=r?(r.content||'').split('\n').map((l:string,i:number)=>({l,i})).filter(({l}:any)=>/^\s*\[ \]/.test(l)&&!TASK_MARK.test(l)&&plainText(l.replace(/^\s*\[ \]\s?/,'')).trim()):[]
      setPrev(r&&open.length?{row:r,open}:null)})},[date,noteSpace,today])
  async function carry(){
    const ls=(prev.row.content||'').split('\n'),made:any[]=[]
    for(const{l,i}of prev.open){
      const{title,due}=parseQuickDate(plainText(l.replace(/^\s*\[ \]\s?/,'')).trim(),today)
      const{data}=await supabase.from('tasks').insert({title,due_date:due||today,done:false,space:noteSpace,note_date:prev.row.note_date}).select().single()
      if(data){made.push(data);ls[i]=l+` {{t:${data.id}}}`}
    }
    await supabase.from('daily_notes').update({content:ls.join('\n')}).eq('id',prev.row.id)
    setTasks((p:any[])=>[...p,...made]);setPrev(null)
  }
  function addMeeting(k:string){
    const t=TEMPLATES.find(x=>x[0]===k)!,now=new Date(),time=`${pad(now.getHours())}:${pad(now.getMinutes())}`
    const cur=content.replace(/\s+$/,'')
    persist((cur?cur+'\n\n':'')+[`## ${t[1]} | ${time}`,...t[2]].join('\n'));setTpl(false)
  }
  async function search(){
    if(!q.trim()){setRes(null);return}
    const{data}=await supabase.from('daily_notes').select('note_date,content,space').ilike('content',`%${q.trim()}%`).order('note_date',{ascending:false}).limit(40)
    setRes((data||[]).filter((r:any)=>(r.space||'work')===noteSpace).map((r:any)=>({date:r.note_date,lines:plainText(r.content||'').split('\n').filter((l:string)=>l.toLowerCase().includes(q.trim().toLowerCase())).slice(0,3)})))
  }
  async function copy(){
    let text=''
    if(view==='week'){
      const mon=addDays(date,-((new Date(date+'T12:00:00').getDay()+6)%7))
      const{data}=await supabase.from('daily_notes').select('note_date,content,space').gte('note_date',mon).lte('note_date',addDays(mon,6)).order('note_date')
      text=(data||[]).filter((r:any)=>(r.space||'work')===noteSpace&&(r.content||'').trim()).map((r:any)=>`${fmtDay(r.note_date)}\n${toText(r.content)}`).join('\n\n')
    }else text=`${fmtDay(date)}\n${toText(content)}`
    try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{alert(text)}
  }
  const btn={background:'#1E3048',border:'1px solid #243447',borderRadius:6,color:'#C8C8D4',fontSize:11.5,padding:'4px 10px',cursor:'pointer'}
  // Month calendar of the viewed date, days with notes marked
  const md=new Date(date+'T12:00:00'),first=new Date(md.getFullYear(),md.getMonth(),1),lead=(first.getDay()+6)%7,dim=new Date(md.getFullYear(),md.getMonth()+1,0).getDate()
  return(<>
    <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8,flexWrap:'wrap' as const,position:'relative'}}>
      <div style={{position:'relative'}}>
        <button onClick={()=>setTpl(o=>!o)} style={{...btn,color:'#5DADE2',borderColor:'rgba(93,173,226,0.45)',fontWeight:700}}>🗓 + Meeting ▾</button>
        {tpl&&<div style={{position:'absolute',top:30,left:0,zIndex:40,background:'#162436',border:'1px solid #3A4A5E',borderRadius:8,padding:4,minWidth:170,boxShadow:'0 8px 20px rgba(0,0,0,0.45)'}}>
          <button onClick={()=>{setTpl(false);setPasteOpen(true)}} style={{display:'block',width:'100%',textAlign:'left' as const,background:'none',border:'none',color:'#5DADE2',fontSize:12,padding:'6px 8px',cursor:'pointer',fontWeight:700}}>📋 Paste a meeting recap…</button>
          {TEMPLATES.map(([k,l])=><button key={k} onClick={()=>addMeeting(k)} style={{display:'block',width:'100%',textAlign:'left' as const,background:'none',border:'none',color:'#E1E7EE',fontSize:12,padding:'6px 8px',cursor:'pointer'}}>{k==='blank'?'Blank meeting':l}</button>)}
        </div>}
      </div>
      <div style={{display:'flex',border:'1px solid #243447',borderRadius:6,overflow:'hidden'}}>
        {(['day','week'] as const).map(k=><button key={k} onClick={()=>setView(k)} style={{...btn,border:'none',borderRadius:0,background:view===k?'#C8973A':'#1E3048',color:view===k?'#0D1B2A':'#C8C8D4',fontWeight:700}}>{k==='day'?'Day':'Week'}</button>)}
      </div>
      <div style={{position:'relative'}}>
        <button onClick={()=>setCal(o=>!o)} style={btn}>📅 {MONTHS[md.getMonth()]}</button>
        {cal&&<div style={{position:'absolute',top:30,left:0,zIndex:40,background:'#162436',border:'1px solid #3A4A5E',borderRadius:8,padding:8,width:224,boxShadow:'0 8px 20px rgba(0,0,0,0.45)'}}>
          <div style={{display:'flex',alignItems:'center',marginBottom:4}}>
            <button onClick={()=>setDate(isoOf(new Date(md.getFullYear(),md.getMonth()-1,1)))} style={{...btn,padding:'0 6px'}}>‹</button>
            <b style={{flex:1,textAlign:'center' as const,fontSize:12,color:'#F4F6F8'}}>{md.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</b>
            <button onClick={()=>setDate(isoOf(new Date(md.getFullYear(),md.getMonth()+1,1)))} style={{...btn,padding:'0 6px'}}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,fontSize:10.5,textAlign:'center' as const}}>
            {['M','T','W','T','F','S','S'].map((d,i)=><span key={i} style={{color:'#5C6E80'}}>{d}</span>)}
            {Array.from({length:lead}).map((_,i)=><span key={'x'+i}/>)}
            {Array.from({length:dim}).map((_,i)=>{const iso=`${md.getFullYear()}-${pad(md.getMonth()+1)}-${pad(i+1)}`,has=dates.includes(iso);return(
              <button key={iso} onClick={()=>{setDate(iso);setCal(false)}} title={has?'Has notes':''} style={{background:iso===date?'#C8973A':'transparent',border:iso===today?'1px solid #C8973A':'1px solid transparent',borderRadius:4,color:iso===date?'#0D1B2A':has?'#F4F6F8':'#5C6E80',fontWeight:has?800:400,fontSize:10.5,padding:'2px 0',cursor:'pointer',position:'relative'}}>
                {i+1}{has&&iso!==date&&<span style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',width:3,height:3,borderRadius:'50%',background:'#5DADE2'}}/>}</button>)})}
          </div>
        </div>}
      </div>
      <div style={{display:'flex',gap:4,flex:'1 1 200px'}}>
        <input value={q} onChange={e=>{setQ(e.target.value);if(!e.target.value)setRes(null)}} onKeyDown={e=>{if(e.key==='Enter')search();if(e.key==='Escape'){setQ('');setRes(null)}}} placeholder="🔍 Search all notes…"
          style={{flex:1,minWidth:0,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11.5,padding:'4px 8px'}}/>
      </div>
      <button onClick={copy} title={`Copy ${view==='week'?'this week’s':'this day’s'} notes as text`} style={btn}>{copied?'✓ Copied':'⧉ Copy'}</button>
      {res&&<div style={{position:'absolute',top:32,right:0,zIndex:40,width:460,maxWidth:'100%',maxHeight:360,overflowY:'auto',background:'#162436',border:'1px solid #3A4A5E',borderRadius:8,padding:8,boxShadow:'0 8px 20px rgba(0,0,0,0.45)'}}>
        <div style={{display:'flex',fontSize:11,color:'#7A8FA6',marginBottom:4}}><span style={{flex:1}}>{res.length} day{res.length!==1?'s':''} mention “{q}”</span><button onClick={()=>setRes(null)} style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>×</button></div>
        {res.map((r:any)=><div key={r.date} onClick={()=>{setDate(r.date);setRes(null)}} style={{padding:'5px 6px',borderRadius:5,cursor:'pointer',borderBottom:'1px solid #1C2C3F'}}>
          <div style={{fontSize:11.5,fontWeight:800,color:'#C8973A'}}>{fmtDay(r.date)}</div>
          {r.lines.map((l:string,i:number)=><div key={i} style={{fontSize:11.5,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{l.replace(/^\s*\[( |x)\]\s?/,'☐ ').replace(/^##\s/,'🗓 ')}</div>)}
        </div>)}
        {!res.length&&<div style={{fontSize:11.5,color:'#5C6E80',fontStyle:'italic'}}>No notes mention that.</div>}
      </div>}
    </div>
    {pasteOpen&&<div onClick={()=>setPasteOpen(false)} style={{position:'fixed',inset:0,background:'rgba(5,10,18,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:640,maxWidth:'calc(100vw - 32px)',background:'#162436',border:'1px solid #243447',borderRadius:12,padding:'16px 18px'}}>
        <div style={{fontSize:15,fontWeight:800,color:'#F4F6F8'}}>📋 Paste a meeting recap</div>
        <div style={{fontSize:11.5,color:'#7A8FA6',margin:'3px 0 10px'}}>Paste the notes from Teams (Copilot recap), Zoom or anywhere. Bullets and sub-bullets, headings and the recap link are kept; each follow-up becomes a to-do and a task.</div>
        <textarea autoFocus value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder="Paste here…" rows={14}
          style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:8,color:'#F4F6F8',fontSize:12.5,padding:10,fontFamily:'inherit',resize:'vertical' as const}}/>
        {pasteText.trim()&&(()=>{const p=parseRecap(pasteText),n=p.lines.filter(l=>/^\[ \]/.test(l)).length;return(
          <div style={{fontSize:11.5,color:'#7A8FA6',marginTop:6}}>Adds <b style={{color:'#F4F6F8'}}>{p.title||'Meeting'}</b>: {p.lines.length} lines{n?`, ${n} follow-up${n!==1?'s':''} as tasks`:''}.</div>)})()}
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:10}}>
          <button onClick={()=>setPasteOpen(false)} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'6px 14px',cursor:'pointer'}}>Cancel</button>
          <button onClick={addRecap} disabled={!pasteText.trim()||pasting} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:800,padding:'6px 16px',cursor:'pointer',opacity:!pasteText.trim()||pasting?0.5:1}}>{pasting?'Adding…':'Add to today\u2019s notes'}</button>
        </div>
      </div>
    </div>}
    {prev&&date===today&&<div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(232,185,90,0.1)',border:'1px solid rgba(232,185,90,0.45)',borderRadius:8,padding:'6px 10px',marginBottom:8,fontSize:12,color:'#E8B95A'}}>
      ↻ {prev.open.length} open to-do{prev.open.length!==1?'s':''} left in your {fmtDay(prev.row.note_date)} notes
      <button onClick={carry} style={{marginLeft:'auto',background:'#E8B95A',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:11.5,fontWeight:800,padding:'3px 10px',cursor:'pointer'}}>Make them tasks for today</button>
      <button onClick={()=>setPrev(null)} style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>×</button>
    </div>}
  </>)
}

const toText=(c:string)=>(c||'').split('\n').map(l=>{
  if(isMeeting(l)){const p=l.trimStart().slice(3).split(' | ');return `\n${plainText(p[0])}${p[1]?` (${p[1]})`:''}${p[2]?` with ${p[2]}`:''}`}
  return plainText(l).replace(/^(\s*)\[ \]/,'$1☐').replace(/^(\s*)\[x\]/,'$1☑')
}).join('\n').trim()

// The week's notes, read-only, a day at a time
export function WeekNotes({date,setDate,setView,noteSpace,...rest}:any){
  const mon=addDays(date,-((new Date(date+'T12:00:00').getDay()+6)%7))
  const [rows,setRows]=useState<any[]|null>(null)
  useEffect(()=>{supabase.from('daily_notes').select('*').gte('note_date',mon).lte('note_date',addDays(mon,6)).order('note_date').then(({data})=>setRows((data||[]).filter((r:any)=>(r.space||'work')===noteSpace)))},[mon,noteSpace])
  return(
    <div style={{flex:1,overflowY:'auto',background:'#0F1C2B',border:'1px solid #243447',borderRadius:10,padding:'14px 16px'}}>
      <div style={{fontSize:12,color:'#7A8FA6',marginBottom:8}}>Week of {fmtDay(mon)} – {fmtDay(addDays(mon,6))}</div>
      {rows===null?<div style={{color:'#5C6E80',fontSize:12}}>Loading…</div>:!rows.filter(r=>(r.content||'').trim()).length?<div style={{color:'#5C6E80',fontSize:12,fontStyle:'italic'}}>No notes this week.</div>:
        rows.filter(r=>(r.content||'').trim()).map(r=>(
          <div key={r.id} style={{marginBottom:18}}>
            <button onClick={()=>{setDate(r.note_date);setView('day')}} title="Open this day" style={{background:'none',border:'none',padding:0,cursor:'pointer',fontSize:13,fontWeight:800,color:'#C8973A',marginBottom:4}}>{fmtDay(r.note_date)} ›</button>
            <NotesEditor {...rest} content={r.content||''} persist={()=>{}} date={r.note_date} noteSpace={noteSpace} readOnly/>
          </div>))}
    </div>
  )
}

// Where a story, bug, epic or initiative is mentioned in the Desk notes
export function NoteMentions({kind,id}:{kind:'p'|'e'|'i',id:any}){
  const [rows,setRows]=useState<any[]|null>(null)
  useEffect(()=>{if(!id)return;supabase.from('daily_notes').select('note_date,content').ilike('content',`%(${kind}:${id})%`).order('note_date',{ascending:false}).limit(20).then(({data})=>setRows(data||[]))},[kind,id])
  if(!rows||!rows.length)return null
  return(
    <div>
      <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}}>📝 MENTIONED IN NOTES</div>
      {rows.map((r:any)=>{const line=(r.content||'').split('\n').find((l:string)=>l.includes(`(${kind}:${id})`))||'';return(
        <div key={r.note_date} style={{fontSize:11.5,color:'#C8C8D4',padding:'2px 0'}}><b style={{color:'#C8973A'}}>{fmtDay(r.note_date)}</b> · {plainText(line).replace(/^\s*\[( |x)\]\s?/,'').replace(/^-\s/,'').slice(0,90)}</div>)})}
    </div>
  )
}
