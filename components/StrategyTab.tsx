'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { DependencyLayer, DepHandle, createDependency, deleteDependency, depKey } from './DependencyLayer'

// ── Strategy roadmap ─────────────────────────────────────────────────────────
// A strategy spans whole fiscal years (FY runs Apr–Mar; FY27 = Apr 2026–Mar 2027) and
// holds tracks (Foundation, Revenue…), each with one goal per FY. Projects are the bars:
// a project joins a track, carries a planning state (planned / proposed) and a work type
// (new project work vs. sustain: tech debt, stabilization & enhancements), and can
// depend on other projects (the arrows). Everything here is editable by hand; the
// assistant writes the same fields, and anything it drafts lands as "proposed".

const PROJECT_TERMINAL=['Complete','Cancelled','Done']
const ITEM_TERMINAL=['Done','Will Not Implement',"Won't Do"]
const EPIC='#E07B2A'
const MONTH_W=34          // px per month; a quarter is 3× this
const LABEL_W_DESKTOP=250
const ROW_H=26
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TEAM_COLORS:any={'Consumer Experience':'#D9E2EC','Operational Efficiency':'#6FA6CB'}
const PROPOSED='#E07B2A'
const STATE_LABEL:any={planned:'Planned',proposed:'Proposed'}
const WORK_LABEL:any={new:'New project',sustain:'Sustain'}
const SUSTAIN='#4A5D72'
// 'bau' was the earlier way to mark sustain work; it still reads as planned + sustain
const workType=(p:any)=>p?.work_type==='sustain'||p?.planning_state==='bau'?'sustain':'new'
const TRACK_COLORS=['#5B7A99','#E07B2A','#27AE60','#8E44AD','#C8973A','#2E86AB']

const pad=(n:number)=>String(n).padStart(2,'0')
const CLIP={overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',minWidth:0}
const HANDLE={position:'absolute' as const,top:-2,bottom:-2,width:12,cursor:'ew-resize',zIndex:1}
function DragLabel({s,e}:{s:string,e:string|null}){
  return <span style={{position:'absolute',left:0,bottom:'calc(100% + 4px)',whiteSpace:'nowrap',background:'#C8973A',color:'#0D1B2A',fontSize:10,fontWeight:700,borderRadius:4,padding:'2px 6px',pointerEvents:'none',zIndex:6}}>
    {fmtDate(s)} → {e?fmtDate(e):'ongoing'}
  </span>
}
const HDR_BTN={background:'none',border:'none',padding:'0 2px',cursor:'pointer',color:'#0D1B2A',fontSize:10,lineHeight:1,flexShrink:0}
const daysIn=(y:number,m:number)=>new Date(y,m,0).getDate() // m is 1-12
function parts(iso:string){const[y,m,d]=iso.split('-').map(Number);return{y,m,d}}
const monthStartISO=(abs:number)=>{const y=Math.floor(abs/12),m=abs-y*12+1;return `${y}-${pad(m)}-01`}
const monthEndISO=(abs:number)=>{const y=Math.floor(abs/12),m=abs-y*12+1;return `${y}-${pad(m)}-${pad(daysIn(y,m))}`}
const fmtDate=(iso:string)=>{const{y,m,d}=parts(iso);return `${MONTHS[m-1]} ${d}, ${y}`}
const fmtMonth=(iso:string)=>{const{y,m}=parts(iso);return `${MONTHS[m-1]} ${y}`}
const todayISO=()=>{const t=new Date();return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`}
const teamShort=(t:string)=>t?t.split(/\s+/).map(w=>w[0]).join('').toUpperCase():''

// The FY27–FY30 example the user brought in: two tracks, a goal for each year.
const TEMPLATE={
  name:'Foundation and revenue run in parallel',start_fy:2027,end_fy:2030,bau_pct:30,freeze_months:[10,11,12],
  tracks:[
    {name:'Foundation',description:'Runs all four years',color:'#5B7A99',goals:['Identity and inventory start','Inventory, promos, one customer live','Platform and product data live','One price everywhere']},
    {name:'Revenue',description:'Starts when its foundation is ready',color:'#E07B2A',goals:['Prepare','Clienteling','Scale','Omni']},
  ],
}

export default function StrategyTab({projects,setProjects,strategies,setStrategies,tracks,setTracks,goals,setGoals,deps,setDeps,people,capacity,teams,onOpenProject,openAssistant,items=[],epics=[],setEpics}:any){
  const [stratId,setStratId]=useState<any>(()=>{try{return localStorage.getItem('pg_strategy')}catch{return null}})
  const strategy=(strategies as any[]).find(s=>s.id===stratId)||strategies[0]||null
  const [selId,setSelId]=useState<any>(null)
  const [drag,setDrag]=useState<any>(null) // {id,mode:'move'|'start'|'end',x0,dm}
  const [editGoal,setEditGoal]=useState<any>(null) // {track_id,fy,text}
  const pref=(k:string,d:any)=>{try{const v=localStorage.getItem('pg_strat_'+k);return v==null?d:JSON.parse(v)}catch{return d}}
  const [view,setView]=useState<any>(()=>({sortBy:pref('sortBy','start_date'),sortDir:pref('sortDir','asc'),showLoad:pref('showLoad',false),showEpics:pref('showEpics',true),snap:pref('snap','quarter'),collapsed:pref('collapsed',{})}))
  function setPref(k:string,v:any){setView((cur:any)=>({...cur,[k]:v}));try{localStorage.setItem('pg_strat_'+k,JSON.stringify(v))}catch{}}
  const toggleCollapsed=(key:string)=>setPref('collapsed',{...view.collapsed,[key]:!view.collapsed[key]})
  const [narrow,setNarrow]=useState(false)
  useEffect(()=>{
    const q=window.matchMedia('(max-width: 820px)')
    const f=()=>setNarrow(q.matches)
    f();q.addEventListener('change',f)
    return()=>q.removeEventListener('change',f)
  },[])
  const LABEL_W=narrow?150:LABEL_W_DESKTOP

  function pickStrategy(id:any){setStratId(id);setSelId(null);try{localStorage.setItem('pg_strategy',id)}catch{}}

  // ── Writes ────────────────────────────────────────────────────────────────
  async function updProject(id:any,fields:any){
    setProjects((prev:any[])=>prev.map(p=>p.id===id?{...p,...fields}:p))
    const{error}=await supabase.from('projects').update({...fields,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)alert('Failed to save project: '+error.message)
  }
  async function createStrategy(t:any){
    const{data,error}=await supabase.from('strategies').insert({name:t.name,start_fy:t.start_fy,end_fy:t.end_fy,bau_pct:t.bau_pct,freeze_months:t.freeze_months,sort_order:strategies.length}).select().single()
    if(error||!data){alert('Failed to create strategy: '+(error?.message||'no row returned'));return}
    setStrategies((prev:any[])=>[...prev,data])
    for(const [i,tr] of (t.tracks||[]).entries()){
      const{data:trow,error:te}=await supabase.from('tracks').insert({strategy_id:data.id,name:tr.name,description:tr.description||null,color:tr.color,sort_order:i}).select().single()
      if(te||!trow){alert('Failed to add track: '+(te?.message||''));continue}
      setTracks((prev:any[])=>[...prev,trow])
      const rows=(tr.goals||[]).map((g:string,gi:number)=>({track_id:trow.id,fy:t.start_fy+gi,goal:g})).filter((r:any)=>r.goal&&r.fy<=t.end_fy)
      if(rows.length){
        const{data:grows,error:ge}=await supabase.from('track_goals').insert(rows).select()
        if(ge)alert('Failed to add goals: '+ge.message)
        if(grows)setGoals((prev:any[])=>[...prev,...grows])
      }
    }
    pickStrategy(data.id)
  }
  async function updStrategy(fields:any){
    if(!strategy)return
    setStrategies((prev:any[])=>prev.map(s=>s.id===strategy.id?{...s,...fields}:s))
    const{error}=await supabase.from('strategies').update(fields).eq('id',strategy.id)
    if(error)alert('Failed to save strategy: '+error.message)
  }
  async function deleteStrategy(){
    if(!strategy)return
    if(!confirm(`Delete the strategy "${strategy.name}"?\n\nIts tracks and goals are deleted. Projects stay, they just leave this roadmap.`))return
    const trackIds=tracks.filter((t:any)=>t.strategy_id===strategy.id).map((t:any)=>t.id)
    setStrategies((prev:any[])=>prev.filter(s=>s.id!==strategy.id))
    setTracks((prev:any[])=>prev.filter(t=>t.strategy_id!==strategy.id))
    setGoals((prev:any[])=>prev.filter(g=>!trackIds.includes(g.track_id)))
    setProjects((prev:any[])=>prev.map(p=>trackIds.includes(p.track_id)?{...p,track_id:null}:p))
    setSelId(null)
    const{error}=await supabase.from('strategies').delete().eq('id',strategy.id)
    if(error)alert('Failed to delete strategy: '+error.message)
  }
  async function addTrack(name:string){
    if(!strategy||!name.trim())return
    const n=tracks.filter((t:any)=>t.strategy_id===strategy.id).length
    const{data,error}=await supabase.from('tracks').insert({strategy_id:strategy.id,name:name.trim(),color:TRACK_COLORS[n%TRACK_COLORS.length],sort_order:n}).select().single()
    if(error){alert('Failed to add track: '+error.message);return}
    if(data)setTracks((prev:any[])=>[...prev,data])
  }
  async function updTrack(id:any,fields:any){
    setTracks((prev:any[])=>prev.map(t=>t.id===id?{...t,...fields}:t))
    const{error}=await supabase.from('tracks').update(fields).eq('id',id)
    if(error)alert('Failed to save track: '+error.message)
  }
  async function moveTrack(id:any,dir:number){
    const list=tracks.filter((t:any)=>t.strategy_id===strategy.id).sort((a:any,b:any)=>a.sort_order-b.sort_order)
    const i=list.findIndex((t:any)=>t.id===id),j=i+dir
    if(i<0||j<0||j>=list.length)return
    ;[list[i],list[j]]=[list[j],list[i]]
    // Renumber the whole list so tracks that share a sort_order still move
    await Promise.all(list.map((t:any,ix:number)=>t.sort_order===ix?null:updTrack(t.id,{sort_order:ix})))
  }
  async function deleteTrack(track:any){
    const n=projects.filter((p:any)=>p.track_id===track.id).length
    if(!confirm(`Delete the track "${track.name}"?${n?`\n\nIts ${n} project${n!==1?'s':''} stay, they just leave this track.`:''}`))return
    setTracks((prev:any[])=>prev.filter(t=>t.id!==track.id))
    setGoals((prev:any[])=>prev.filter(g=>g.track_id!==track.id))
    setProjects((prev:any[])=>prev.map(p=>p.track_id===track.id?{...p,track_id:null}:p))
    const{error}=await supabase.from('tracks').delete().eq('id',track.id)
    if(error)alert('Failed to delete track: '+error.message)
  }
  async function saveGoal(){
    if(!editGoal)return
    const{track_id,fy,text}=editGoal
    setEditGoal(null)
    const existing=goals.find((g:any)=>g.track_id===track_id&&g.fy===fy)
    if((existing?.goal||'')===text.trim())return
    if(!text.trim()){
      if(!existing)return
      setGoals((prev:any[])=>prev.filter(g=>g.id!==existing.id))
      const{error}=await supabase.from('track_goals').delete().eq('id',existing.id)
      if(error)alert('Failed to clear goal: '+error.message)
      return
    }
    const{data,error}=await supabase.from('track_goals').upsert({track_id,fy,goal:text.trim()},{onConflict:'track_id,fy'}).select().single()
    if(error){alert('Failed to save goal: '+error.message);return}
    if(data)setGoals((prev:any[])=>[...prev.filter(g=>!(g.track_id===track_id&&g.fy===fy)),data])
  }
  const addDep=(blocker:string,blocked:string)=>createDependency(blocker,blocked,deps,setDeps)
  const removeDep=(d:any)=>{if(confirm(`Remove the dependency ${keyName(depKey(d.blocker_type,d.blocker_id))} → ${keyName(depKey(d.blocked_type,d.blocked_id))}?`))deleteDependency(d,setDeps)}
  // Names and dates for anything a dependency can point at
  function keyName(key:string){
    const[t,id]=key.split(':')
    if(t==='project')return projById(id)?.name||'(deleted project)'
    if(t==='epic')return '◆ '+((epics as any[]).find(e=>e.id===id)?.name||'(deleted epic)')
    const it=(items as any[]).find(i=>i.id===id)
    return it?`${it.item_id} ${it.name}`:'(deleted item)'
  }
  function keyDates(key:string):{s:string|null,e:string|null,open?:boolean}|null{
    const[t,id]=key.split(':')
    if(t==='project'){const p=projById(id);return p?{s:p.start_date,e:p.ongoing?null:p.end_date,open:!!p.ongoing}:null}
    if(t==='epic'){const ep=(epics as any[]).find(e=>e.id===id);const b=ep&&epicBase(ep);return b?{s:b.s,e:b.e}:null}
    const it=(items as any[]).find(i=>i.id===id);return it?{s:it.start_date,e:it.end_date}:null
  }
  const depBad=(d:any)=>{
    const a=keyDates(depKey(d.blocker_type,d.blocker_id)),b=keyDates(depKey(d.blocked_type,d.blocked_id))
    return !!(a?.e&&b?.s&&b.s<=a.e)
  }
  const gridRef=useRef<HTMLDivElement>(null)
  async function createProject(name:string,team:string,trackId:any,wt:string='new'){
    const n=name.trim()
    if(!n)return
    if(projects.some((p:any)=>p.name.toLowerCase()===n.toLowerCase())){alert(`A project called "${n}" already exists. Add it to a track from its row instead.`);return}
    const{data,error}=await supabase.from('projects').insert({name:n,team:team||null,status:'Planning',priority:'P3',rag:'Green',color:PROPOSED,description:'',
      sort_order:projects.length,space:'work',planning_state:'proposed',work_type:wt,track_id:trackId||null}).select().single()
    if(error){alert('Failed to create project: '+error.message);return}
    if(data){setProjects((prev:any[])=>[...prev,data]);setSelId(data.id)}
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if(!strategy) return <NewStrategy onCreate={createStrategy} first/>

  // ── Layout ────────────────────────────────────────────────────────────────
  const fys:number[]=[];for(let f=strategy.start_fy;f<=strategy.end_fy;f++)fys.push(f)
  const winStartAbs=(strategy.start_fy-1)*12+3 // April before the first FY's number
  const nMonths=fys.length*12
  const TW=nMonths*MONTH_W
  const winStart=monthStartISO(winStartAbs),winEnd=monthEndISO(winStartAbs+nMonths-1)
  const freeze:number[]=strategy.freeze_months||[]
  const posStart=(iso:string)=>{const{y,m,d}=parts(iso);return (y*12+m-1-winStartAbs+(d-1)/daysIn(y,m))*MONTH_W}
  const posEnd=(iso:string)=>{const{y,m,d}=parts(iso);return (y*12+m-1-winStartAbs+d/daysIn(y,m))*MONTH_W}
  const clampX=(x:number)=>Math.max(0,Math.min(TW,x))

  const sTracks=tracks.filter((t:any)=>t.strategy_id===strategy.id).sort((a:any,b:any)=>a.sort_order-b.sort_order)
  const sTrackIds=new Set(sTracks.map((t:any)=>t.id))
  const live=(projects as any[]).filter(p=>(p.space||'work')==='work')
  const state=(p:any)=>p.planning_state==='proposed'?'proposed':'planned'
  // Same ordering as the Roadmap tab: start date, end date, name or RAG, either direction,
  // with ongoing (∞) projects pinned to the bottom. Undated projects sit below dated ones.
  function sortProjects(list:any[]){
    const{sortBy,sortDir}=view
    const key=(p:any)=>sortBy==='end_date'?(p.ongoing?(p.end_date||'9999-12-31'):p.end_date)
      :sortBy==='name'?p.name.toLowerCase()
      :sortBy==='rag'?['Red','Amber','Green'].indexOf(p.rag)
      :p.start_date
    return[...list].sort((a,b)=>{
      if(!!a.ongoing!==!!b.ongoing)return a.ongoing?1:-1
      if(!a.start_date!==!b.start_date)return a.start_date?-1:1
      const av=key(a),bv=key(b)
      if(av==null&&bv!=null)return 1
      if(bv==null&&av!=null)return -1
      if(av<bv)return sortDir==='asc'?-1:1
      if(av>bv)return sortDir==='asc'?1:-1
      return a.name.localeCompare(b.name)
    })
  }
  // Every project sits on one of your tracks, or in the backlog. Completed and cancelled
  // projects only show if they're on a track.
  const onTrack=(t:any)=>sortProjects(live.filter(p=>p.track_id===t.id))
  const backlog=sortProjects(live.filter(p=>!sTrackIds.has(p.track_id)&&!PROJECT_TERMINAL.includes(p.status)))
  const shown=new Map<string,any>()
  ;[...sTracks.flatMap(onTrack),...backlog].forEach(p=>shown.set(p.id,p))
  const projById=(id:any)=>(projects as any[]).find(p=>p.id===id)

  // Dates after a drag of `d.dxm` months (fractional, straight from the pointer). The result
  // snaps to the nearest boundary of a whole period, month or quarter, like a grid:
  // starts land on the 1st, ends on the last day, and a moved bar keeps its length rounded
  // to whole periods. Fiscal quarters (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) line up with
  // calendar quarters, so quarter boundaries are month indexes divisible by 3.
  function shiftDates(s0:string,e0:string|null,d:any){
    const step=d.unit==='quarter'?3:1
    const snap=(x:number)=>Math.round(x/step)*step
    const sPos=(iso:string)=>{const{y,m,d:dd}=parts(iso);return y*12+m-1+(dd-1)/daysIn(y,m)}
    const ePos=(iso:string)=>{const{y,m,d:dd}=parts(iso);return y*12+m-1+dd/daysIn(y,m)} // exclusive end
    const s1=sPos(s0),e1=e0?ePos(e0):null
    let ns=snap(s1),ne=e1!=null?snap(e1):null
    if(d.mode==='move'){
      ns=snap(s1+d.dxm)
      if(e1!=null)ne=ns+Math.max(step,snap(e1-s1))
    }
    if(d.mode==='start'&&e1!=null){ns=Math.min(snap(s1+d.dxm),Math.max(step,snap(e1))-step);ne=null}
    if(d.mode==='start'&&e1==null)ns=snap(s1+d.dxm)
    if(d.mode==='end'&&e1!=null){ne=Math.max(snap(e1+d.dxm),Math.floor(s1/step)*step+step);ns=NaN}
    return{s:Number.isNaN(ns)?s0:monthStartISO(ns),e:ne==null?e0:monthEndISO(ne-1)}
  }
  // Bar extent for a project, with any in-progress drag applied
  function extent(p:any){
    let s=p.start_date,e=p.end_date
    if(!s)return null
    if(drag?.id===p.id&&drag.moved)({s,e}=shiftDates(s,e,drag))
    const open=!e||p.ongoing
    return{s,e:open?null:e,x0:clampX(posStart(s)),x1:clampX(open?TW:posEnd(e)),open}
  }

  // ── Checks: dependencies, code freeze, team capacity ─────────────────────
  const issues:any[]=[]
  const shownKeys=new Set<string>()
  shown.forEach(p=>{shownKeys.add(depKey('project',p.id));if(view.showEpics)projectEpics(p).forEach(e=>shownKeys.add(depKey('epic',e.id)))})
  for(const d of deps as any[]){
    const from=depKey(d.blocker_type,d.blocker_id),to=depKey(d.blocked_type,d.blocked_id)
    if(!shownKeys.has(from)&&!shownKeys.has(to))continue
    const a=keyDates(from),b=keyDates(to)
    const sel=d.blocked_type==='project'?d.blocked_id:d.blocked_type==='epic'?'epic:'+d.blocked_id:null
    if(a?.e&&b?.s&&b.s<=a.e)issues.push({kind:'dep',id:sel,text:`${keyName(to)} starts ${fmtDate(b.s)}, before ${keyName(from)} finishes ${fmtDate(a.e)}.`})
    else if(a?.open&&b?.s)issues.push({kind:'dep',id:sel,text:`${keyName(to)} depends on ${keyName(from)}, which has no end date.`})
  }
  for(const p of shown.values()){
    if(p.ongoing||!p.end_date)continue
    if(freeze.includes(parts(p.end_date).m))issues.push({kind:'freeze',id:p.id,text:`${p.name} goes live ${fmtMonth(p.end_date)}, inside the code freeze.`})
  }
  // Team load per quarter, split by work type: the average planned allocation across the
  // team's active people on new-project work (against 100% minus the sustain share) and on
  // sustain work (against the sustain share). Only staffed projects count (Budget roster).
  const quarters:any[]=[]
  fys.forEach(fy=>[1,2,3,4].forEach(q=>{
    const first=winStartAbs+(fy-strategy.start_fy)*12+(q-1)*3
    quarters.push({fy,q,keys:[0,1,2].map(i=>monthStartISO(first+i).slice(0,7)),start:monthStartISO(first),end:monthEndISO(first+2)})
  }))
  const sustainPct=Number(strategy.bau_pct)||0
  const limits:any={new:100-sustainPct,sustain:sustainPct}
  const typeByName=new Map((projects as any[]).map(p=>[p.name,workType(p)]))
  const split:any={new:0,sustain:0}
  const loads:any[]=[]
  ;(teams as string[]).forEach(team=>{
    const cells=quarters.map(qt=>{
      const ppl=(people as any[]).filter(p=>p.team===team&&p.active!==false&&(!p.termination_date||p.termination_date>=qt.start))
      if(!ppl.length)return null
      const sum:any={new:0,sustain:0}
      for(const person of ppl){
        const months=capacity?.byProject?.get(person.id)
        for(const k of qt.keys)for(const c of months?.get(k)||[])sum[typeByName.get(c.project)||'new']+=c.pct/3
      }
      if(qt.end>=todayISO()){split.new+=sum.new;split.sustain+=sum.sustain}
      return{new:sum.new/ppl.length,sustain:sum.sustain/ppl.length}
    })
    for(const wt of ['new','sustain']){
      const row=cells.map((c:any)=>c?{v:c[wt]}:{v:null})
      row.forEach((c:any,i:number)=>{if(c.v!=null&&c.v>limits[wt]&&quarters[i].end>=todayISO())issues.push({kind:'capacity',id:null,
        text:`${team} ${wt==='new'?'new-project':'sustain'} work is planned at ${Math.round(c.v)}% in FY${String(quarters[i].fy).slice(-2)} Q${quarters[i].q}. The target is ${limits[wt]}%.`})})
      loads.push({team,wt,cells:row})
    }
  })
  const splitTotal=split.new+split.sustain
  const splitNewPct=splitTotal?Math.round(split.new/splitTotal*100):null

  // ── Rows (fixed heights so the arrow overlay can find each bar) ──────────
  const rows:any[]=[]
  function pushProject(p:any){
    const eps=view.showEpics?projectEpics(p):[]
    rows.push({kind:'project',p,epicCount:eps.length,h:ROW_H})
    if(eps.length&&!view.collapsed['pe:'+p.id])eps.forEach(e=>rows.push({kind:'epic',e,p,h:20}))
  }
  sTracks.forEach((t:any,ti:number)=>{
    const list=onTrack(t),closed=!!view.collapsed[t.id]
    rows.push({kind:'track',track:t,index:ti,count:list.length,closed,h:24})
    if(closed)return
    rows.push({kind:'goals',track:t,h:28})
    list.forEach(pushProject)
    if(!list.length)rows.push({kind:'hint',text:'No projects yet. Pick a project and set its track.',h:ROW_H})
  })
  if(!sTracks.length)rows.push({kind:'hint',text:'No tracks yet. Add your first one in Strategy settings.',h:ROW_H})
  rows.push({kind:'band',key:'__backlog',label:`BACKLOG · NOT ON A TRACK (${backlog.length})`,closed:!!view.collapsed.__backlog,color:'#3A4A5E',h:22})
  if(!view.collapsed.__backlog)backlog.forEach(pushProject)
  if(view.showLoad){
    rows.push({kind:'band',label:`TEAM LOAD · NEW ${limits.new}% / SUSTAIN ${limits.sustain}%`,color:'#243447',h:22})
    loads.forEach(l=>rows.push({kind:'load',load:l,h:ROW_H}))
  }
  let yAcc=0
  rows.forEach(r=>{r.y=yAcc;yAcc+=r.h})
  const bodyH=yAcc

  // ── Drag & place ──────────────────────────────────────────────────────────
  function onBarDown(e:any,p:any,mode:string){
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({id:p.id,mode,unit:view.snap,x0:e.clientX,dxm:0,moved:false})
  }
  function onBarMove(e:any){
    if(!drag)return
    const dx=e.clientX-drag.x0
    const dxm=Math.round(dx/MONTH_W*10)/10 // tenths of a month is plenty for snapping
    if(dxm!==drag.dxm||(!drag.moved&&Math.abs(dx)>3))setDrag({...drag,dxm,moved:drag.moved||Math.abs(dx)>3})
  }
  async function onBarUp(p:any){
    const d=drag
    setDrag(null)
    if(!d)return
    if(!d.moved){setSelId(p.id);return}
    const{s,e}=shiftDates(p.start_date,p.end_date,d)
    const fields:any=d.mode==='end'?{end_date:e}:d.mode==='start'?{start_date:s}:{start_date:s,...(p.end_date?{end_date:e}:{})}
    if(Object.keys(fields).every(k=>fields[k]===p[k]))return
    await updProject(p.id,fields)
  }

  // ── Epics: sub-rows under their project. An epic uses its own dates, or else the span of
  // its stories' dates (drawn dashed). Dragging a story-dated epic gives it its own dates.
  async function updEpic(id:any,fields:any){
    setEpics((prev:any[])=>prev.map(e=>e.id===id?{...e,...fields}:e))
    const{error}=await supabase.from('epics').update(fields).eq('id',id)
    if(error)alert('Failed to save epic: '+error.message)
  }
  function epicBase(ep:any){
    if(ep.start_date)return{s:ep.start_date,e:ep.end_date||ep.start_date,derived:false}
    const pr=projById(ep.project_id)
    const its=(items as any[]).filter(i=>i.epic_id===ep.id&&(!pr||i.parent_project===pr.name)&&i.start_date)
    if(!its.length)return null
    const s=its.map(i=>i.start_date).sort()[0]
    const e=its.map(i=>i.end_date||i.start_date).sort().slice(-1)[0]
    return{s,e,derived:true}
  }
  function epicExtent(ep:any){
    const b=epicBase(ep)
    if(!b)return null
    let{s,e}=b as any
    if(drag?.id===ep.id&&drag.moved)({s,e}=shiftDates(s,e,drag))
    return{s,e,derived:b.derived&&!(drag?.id===ep.id&&drag.moved),x0:clampX(posStart(s)),x1:clampX(posEnd(e))}
  }
  async function onEpicUp(ep:any){
    const d=drag
    setDrag(null)
    if(!d)return
    if(!d.moved){setSelId('epic:'+ep.id);return}
    const b=epicBase(ep)
    if(!b)return
    const{s,e}=shiftDates(b.s,b.e,d)
    if(!b.derived&&s===ep.start_date&&e===ep.end_date)return
    await updEpic(ep.id,{start_date:s,end_date:e})
  }
  function projectEpics(p:any){
    return(epics as any[]).filter(e=>e.project_id===p.id)
      .sort((a,b)=>(epicBase(a)?.s||'9999').localeCompare(epicBase(b)?.s||'9999')||a.name.localeCompare(b.name))
  }
  // Clicking an empty row places an undated project into the clicked quarter
  // Clicking an empty row places undated work into the clicked quarter (or month, when
  // snapping to months)
  function clickedPeriod(e:any){
    const rect=e.currentTarget.getBoundingClientRect()
    const month=Math.floor((e.clientX-rect.left)/MONTH_W)
    const step=view.snap==='month'?1:3
    const first=winStartAbs+Math.floor(month/step)*step
    return{start_date:monthStartISO(first),end_date:monthEndISO(first+step-1)}
  }
  async function onRowClick(e:any,p:any){
    if(p.start_date){setSelId(p.id);return}
    setSelId(p.id)
    await updProject(p.id,{...clickedPeriod(e),ongoing:false})
  }
  async function onEpicRowClick(e:any,ep:any){
    setSelId('epic:'+ep.id)
    if(epicBase(ep))return
    await updEpic(ep.id,clickedPeriod(e))
  }

  const sel=selId?projById(selId):null
  const selEpic=typeof selId==='string'&&selId.startsWith('epic:')?(epics as any[]).find(e=>'epic:'+e.id===selId)||null:null
  const counts={planned:0,proposed:0,sustain:0} as any
  shown.forEach(p=>{counts[state(p)]++;if(workType(p)==='sustain')counts.sustain++})
  const today=todayISO()
  const todayX=today>=winStart&&today<=winEnd?posStart(today):null

  // ── Render ────────────────────────────────────────────────────────────────
  const cellLabel={position:'sticky' as const,left:0,zIndex:3,width:LABEL_W,minWidth:LABEL_W,flexShrink:0,background:'#0D1B2A',borderRight:'1px solid #243447',boxSizing:'border-box' as const}
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid #243447',background:'#162436',flexWrap:'wrap' as const,flexShrink:0}}>
        <select value={strategy.id} onChange={e=>{if(e.target.value==='__new'){setSelId('__new');return}pickStrategy(e.target.value)}}
          style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'5px 10px',fontSize:13,fontWeight:700,cursor:'pointer',maxWidth:360}}>
          {strategies.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="__new">+ New strategy…</option>
        </select>
        <span style={{fontSize:11,color:'#7A8FA6'}}>FY{String(strategy.start_fy).slice(-2)}–FY{String(strategy.end_fy).slice(-2)}</span>
        <div style={{display:'flex',gap:6,fontSize:11}}>
          <Chip color="#D9E2EC" label={`${counts.planned} planned`}/>
          <Chip color={PROPOSED} outline label={`${counts.proposed} proposed`}/>
          <Chip color={SUSTAIN} label={`${counts.sustain} sustain`}/>
          {splitNewPct!=null&&<span title={`Staffed load from this quarter on, split by work type. Target: ${limits.new}% new projects, ${limits.sustain}% sustain.`}
            style={{color:Math.abs(splitNewPct-limits.new)>10?'#D4820A':'#C8C8D4'}}>· split {splitNewPct}/{100-splitNewPct} (target {limits.new}/{limits.sustain})</span>}
          {issues.length>0&&<Chip color="#E74C3C" label={`${issues.length} to check`}/>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:11,color:'#7A8FA6'}}>Sort</span>
          <select value={view.sortBy} onChange={e=>setPref('sortBy',e.target.value)} style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:11,padding:'4px 8px',cursor:'pointer'}}>
            <option value="start_date">Start Date</option>
            <option value="end_date">End Date</option>
            <option value="name">Name</option>
            <option value="rag">RAG Status</option>
          </select>
          <button onClick={()=>setPref('sortDir',view.sortDir==='asc'?'desc':'asc')} title="Sort direction" style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:13,padding:'2px 10px',cursor:'pointer'}}>{view.sortDir==='asc'?'↑':'↓'}</button>
          <label title="Show each team's planned load per quarter under the roadmap" style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer',whiteSpace:'nowrap' as const}}>
            <input type="checkbox" checked={view.showLoad} onChange={e=>setPref('showLoad',e.target.checked)} style={{accentColor:'#C8973A'}}/>Team load
          </label>
          <select value={view.snap} onChange={e=>setPref('snap',e.target.value)} title="What dragging snaps to" style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:11,padding:'4px 8px',cursor:'pointer'}}>
            <option value="quarter">Snap to quarters</option>
            <option value="month">Snap to months</option>
          </select>
          <label title="Show each project's epics under it" style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer',whiteSpace:'nowrap' as const}}>
            <input type="checkbox" checked={view.showEpics} onChange={e=>setPref('showEpics',e.target.checked)} style={{accentColor:EPIC}}/>Epics
          </label>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {openAssistant&&<button onClick={()=>openAssistant(`Look at the "${strategy.name}" strategy and draft a Plan A: place the proposed and undated projects by quarter on their tracks, respecting dependencies, the code freeze and team capacity. Keep anything you place as proposed.`)}
            style={{background:'none',border:'1px solid #C8973A',borderRadius:6,color:'#C8973A',fontSize:11,fontWeight:700,padding:'5px 10px',cursor:'pointer'}}>💬 Draft Plan A with the assistant</button>}
          <button onClick={()=>setSelId(null)} style={{background:!sel&&selId!=='__new'?'#1E3048':'none',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 10px',cursor:'pointer'}}>⚙ Strategy settings</button>
        </div>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:narrow?'column':'row',minHeight:0}}>
        {/* Roadmap grid */}
        <div style={{flex:1,overflow:'auto',minWidth:0,position:'relative'}}>
          <div ref={gridRef} style={{width:LABEL_W+TW,position:'relative'}}>
            {/* Header: fiscal years and quarters */}
            <div style={{position:'sticky',top:0,zIndex:5,background:'#162436',borderBottom:'1px solid #243447'}}>
              <div style={{display:'flex'}}>
                <div style={{...cellLabel,background:'#162436',zIndex:6,padding:'6px 12px',fontSize:10,color:'#7A8FA6',letterSpacing:1,display:'flex',alignItems:'center'}}><span title="Fiscal year runs April to March" style={CLIP}>FISCAL YEAR (APR–MAR)</span></div>
                {fys.map(fy=><div key={fy} style={{width:12*MONTH_W,flexShrink:0,textAlign:'center' as const,padding:'5px 0',fontSize:12,fontWeight:800,color:'#F4F6F8',borderRight:'1px solid #3A4A5E',background:'#1E3048'}}>FY{String(fy).slice(-2)}</div>)}
              </div>
              <div style={{display:'flex'}}>
                <div style={{...cellLabel,background:'#162436',zIndex:6}}/>
                {quarters.map((qt:any)=>{
                  const frozen=qt.keys.some((k:string)=>freeze.includes(Number(k.slice(5))))
                  return <div key={qt.fy+'-'+qt.q} style={{width:3*MONTH_W,flexShrink:0,textAlign:'center' as const,padding:'3px 0',fontSize:10,color:'#7A8FA6',borderRight:'1px solid '+(qt.q===4?'#3A4A5E':'#243447'),background:frozen?'rgba(255,255,255,0.05)':'transparent'}}>Q{qt.q}</div>
                })}
              </div>
            </div>

            {/* Body */}
            <div style={{position:'relative'}}>
              {/* Code freeze shading and quarter lines */}
              <div style={{position:'absolute',left:LABEL_W,top:0,width:TW,height:bodyH,pointerEvents:'none',zIndex:0}}>
                {Array.from({length:nMonths}).map((_,i)=>{
                  const m=parts(monthStartISO(winStartAbs+i)).m
                  return(
                    <Fragment key={i}>
                      {freeze.includes(m)&&<div style={{position:'absolute',left:i*MONTH_W,width:MONTH_W,top:0,bottom:0,background:'rgba(255,255,255,0.045)'}}/>}
                      {i%3===0&&<div style={{position:'absolute',left:i*MONTH_W,top:0,bottom:0,width:1,background:i%12===0?'#3A4A5E':'#1C2C3F'}}/>}
                    </Fragment>
                  )
                })}
                {todayX!=null&&<div title={`Today, ${fmtDate(today)}`} style={{position:'absolute',left:todayX,top:0,bottom:0,width:2,background:'#C8973A',opacity:0.7}}/>}
              </div>

              {rows.map((r,ri)=>{
                if(r.kind==='track')return(
                  <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:4}}>
                    {/* The name and subtitle run across the band rather than being clipped to the label column */}
                    <div style={{...cellLabel,overflow:'visible',background:r.track.color,borderRight:'none',padding:'0 6px 0 8px',display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:800,color:'#0D1B2A',letterSpacing:1,whiteSpace:'nowrap' as const}}>
                      <button onClick={()=>toggleCollapsed(r.track.id)} title={r.closed?'Expand':'Collapse'} style={HDR_BTN}>{r.closed?'▸':'▾'}</button>
                      <button onClick={()=>moveTrack(r.track.id,-1)} disabled={r.index===0} title="Move track up" style={{...HDR_BTN,opacity:r.index===0?0.3:1}}>▲</button>
                      <button onClick={()=>moveTrack(r.track.id,1)} disabled={r.index===sTracks.length-1} title="Move track down" style={{...HDR_BTN,opacity:r.index===sTracks.length-1?0.3:1}}>▼</button>
                      <span onClick={()=>toggleCollapsed(r.track.id)} title={`${r.track.name} track`} style={{cursor:'pointer',marginLeft:4}}>{r.track.name.toUpperCase()}</span>
                      {r.closed&&<span style={{fontSize:10,fontWeight:700,opacity:0.7}}>· {r.count} project{r.count!==1?'s':''}</span>}
                      {r.track.description&&<span style={{fontSize:11,fontWeight:600,letterSpacing:0,marginLeft:14,opacity:0.85}}>{r.track.description}</span>}
                    </div>
                    <div style={{width:TW,background:r.track.color}}/>
                  </div>
                )
                if(r.kind==='goals')return(
                  <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1,borderBottom:'1px solid #243447'}}>
                    <div style={{...cellLabel,padding:'0 12px',display:'flex',alignItems:'center',fontSize:10,fontWeight:700,color:r.track.color}}><span title={`${r.track.name}: goal for each fiscal year`} style={CLIP}>Goal for each FY</span></div>
                    {fys.map(fy=>{
                      const g=goals.find((x:any)=>x.track_id===r.track.id&&x.fy===fy)
                      const editing=editGoal&&editGoal.track_id===r.track.id&&editGoal.fy===fy
                      return(
                        <div key={fy} onClick={()=>!editing&&setEditGoal({track_id:r.track.id,fy,text:g?.goal||''})} title="Click to edit this year's goal"
                          style={{width:12*MONTH_W,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 6px',boxSizing:'border-box' as const,cursor:'text',background:'rgba(224,123,42,0.06)',borderRight:'1px solid #3A4A5E'}}>
                          {editing?(
                            <input autoFocus value={editGoal.text} onChange={e=>setEditGoal({...editGoal,text:e.target.value})} onBlur={saveGoal}
                              onKeyDown={e=>{if(e.key==='Enter')saveGoal();if(e.key==='Escape')setEditGoal(null)}}
                              style={{width:'100%',background:'#0F1C2B',border:'1px solid '+r.track.color,borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 6px',textAlign:'center' as const}}/>
                          ):(
                            <span style={{fontSize:11,fontWeight:700,color:g?'#F4F6F8':'#3A4A5E',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{g?.goal||'+ Add goal'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
                if(r.kind==='band')return(
                  <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1}}>
                    <div onClick={()=>r.key&&toggleCollapsed(r.key)} style={{...cellLabel,background:r.color,borderRight:'none',padding:'0 12px 0 8px',display:'flex',alignItems:'center',gap:4,fontSize:10,fontWeight:800,color:'#F4F6F8',letterSpacing:1,cursor:r.key?'pointer':'default'}}>
                      {r.key&&<span style={{...HDR_BTN,color:'#F4F6F8'}}>{r.closed?'▸':'▾'}</span>}
                      <span title={r.label} style={CLIP}>{r.label}</span>
                    </div>
                    <div style={{width:TW,background:r.color}}/>
                  </div>
                )
                if(r.kind==='hint')return(
                  <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1}}>
                    <div style={{...cellLabel,padding:'0 12px',display:'flex',alignItems:'center',fontSize:10,color:'#3A4A5E',fontStyle:'italic'}}><span title={r.text} style={CLIP}>{r.text}</span></div>
                  </div>
                )
                if(r.kind==='load')return(
                  <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1}}>
                    <div style={{...cellLabel,padding:'0 12px',display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#C8C8D4'}}>
                      <span style={{...CLIP,flex:1}} title={r.load.team}>{teamShort(r.load.team)} · {r.load.wt==='new'?'New projects':'Sustain'}</span>
                      <span style={{fontSize:9,color:'#7A8FA6'}}>of {limits[r.load.wt]}%</span>
                    </div>
                    {r.load.cells.map((c:any,i:number)=>{
                      const lim=limits[r.load.wt]
                      const clr=c.v==null?'#3A4A5E':c.v>lim?'#E74C3C':c.v>lim*0.9?'#D4820A':'#27AE60'
                      return <div key={i} title={c.v==null?'No one on this team in the roster':`${Math.round(c.v)}% planned of a ${lim}% target`}
                        style={{width:3*MONTH_W,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:clr,fontVariantNumeric:'tabular-nums'}}>{c.v==null?'–':Math.round(c.v)+'%'}</div>
                    })}
                  </div>
                )
                if(r.kind==='epic'){
                  const ep=r.e,ex=epicExtent(ep),isSelE=selId==='epic:'+ep.id,done=ITEM_TERMINAL.includes(ep.status)
                  return(
                    <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1}}>
                      <div onClick={()=>setSelId('epic:'+ep.id)} style={{...cellLabel,padding:'0 12px 0 28px',display:'flex',alignItems:'center',gap:5,cursor:'pointer',background:isSelE?'#2A2418':'#0D1B2A'}}>
                        <span style={{fontSize:9,color:EPIC}}>◆</span>
                        <span title={ep.name} style={{...CLIP,fontSize:10.5,color:done?'#7A8FA6':'#C8C8D4',textDecoration:done?'line-through':'none'}}>{ep.name}</span>
                      </div>
                      <div onClick={e=>onEpicRowClick(e,ep)} style={{width:TW,position:'relative',cursor:ex?'default':'copy'}}>
                        {!ex&&<span style={{position:'absolute',left:8,top:3,fontSize:9.5,color:'#3A4A5E',fontStyle:'italic',pointerEvents:'none'}}>No dates. Click a {view.snap==='month'?'month':'quarter'} to place it there.</span>}
                        {ex&&(
                          <div data-dep-key={depKey('epic',ep.id)} title={`◆ ${ep.name}\n${fmtDate(ex.s)} → ${fmtDate(ex.e)}${ex.derived?'\nDates from its stories. Drag to give the epic its own dates.':''}`}
                            onPointerDown={e=>onBarDown(e,ep,'move')} onPointerMove={onBarMove} onPointerUp={()=>onEpicUp(ep)} onClick={e=>e.stopPropagation()}
                            style={{position:'absolute',left:ex.x0,width:Math.max(6,ex.x1-ex.x0),top:6,height:8,boxSizing:'border-box' as const,borderRadius:4,cursor:drag?.id===ep.id?'grabbing':'grab',touchAction:'none',
                              background:ex.derived?'transparent':'rgba(224,123,42,0.65)',border:ex.derived?`1px dashed ${EPIC}`:'none',
                              outline:isSelE?'2px solid #C8973A':'none',outlineOffset:1,opacity:done?0.45:1}}>
                            <div onPointerDown={e=>onBarDown(e,ep,'start')} title="Drag to change the start" style={{...HANDLE,left:-4,top:-5,bottom:-5}}/>
                            <div onPointerDown={e=>onBarDown(e,ep,'end')} title="Drag to change the end" style={{...HANDLE,right:-4,top:-5,bottom:-5}}/>
                            {drag?.id===ep.id&&drag.moved&&<DragLabel s={ex.s} e={ex.e}/>}
                            {!drag&&<DepHandle k={depKey('epic',ep.id)} size={8}/>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                // Project row
                const p=r.p,ex=extent(p),st=state(p)
                const isSel=sel?.id===p.id
                const color=st==='proposed'?PROPOSED:workType(p)==='sustain'?SUSTAIN:(TEAM_COLORS[p.team]||'#7A8FA6')
                const done=PROJECT_TERMINAL.includes(p.status)
                return(
                  <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1}}>
                    <div onClick={()=>setSelId(p.id)} style={{...cellLabel,padding:r.epicCount?'0 12px 0 6px':'0 12px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:isSel?'#1E3048':'#0D1B2A'}}>
                      {r.epicCount>0&&<button onClick={e=>{e.stopPropagation();toggleCollapsed('pe:'+p.id)}} title={`${view.collapsed['pe:'+p.id]?'Show':'Hide'} ${r.epicCount} epic${r.epicCount!==1?'s':''}`}
                        style={{...HDR_BTN,color:EPIC,fontSize:9}}>{view.collapsed['pe:'+p.id]?'▸':'▾'}</button>}
                      <span style={{fontSize:11,color:done?'#7A8FA6':'#F4F6F8',fontWeight:isSel?700:400,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',flex:1,textDecoration:done?'line-through':'none'}}>{p.name}</span>
                      {p.team&&<span style={{fontSize:9,color:'#7A8FA6'}}>{teamShort(p.team)}</span>}
                    </div>
                    <div onClick={e=>onRowClick(e,p)} style={{width:TW,position:'relative',cursor:p.start_date?'default':'copy'}}>
                      {!ex&&<span style={{position:'absolute',left:8,top:6,fontSize:10,color:'#3A4A5E',fontStyle:'italic',pointerEvents:'none'}}>No dates. Click a {view.snap==='month'?'month':'quarter'} to place it there.</span>}
                      {ex&&(
                        <div data-dep-key={depKey('project',p.id)} title={`${p.name}\n${STATE_LABEL[st]} · ${WORK_LABEL[workType(p)]} · ${fmtDate(ex.s)} → ${ex.e?fmtDate(ex.e):'ongoing'}`}
                          onPointerDown={e=>onBarDown(e,p,'move')} onPointerMove={onBarMove} onPointerUp={()=>onBarUp(p)} onClick={e=>e.stopPropagation()}
                          style={{position:'absolute',left:ex.x0,width:Math.max(6,ex.x1-ex.x0),top:6,height:r.h-12,boxSizing:'border-box' as const,borderRadius:3,cursor:drag?.id===p.id?'grabbing':'grab',touchAction:'none',
                            background:st==='proposed'?'rgba(224,123,42,0.28)':color,border:st==='proposed'?`1.5px solid ${PROPOSED}`:'none',
                            outline:isSel?'2px solid #C8973A':'none',outlineOffset:1,opacity:done?0.45:1,
                            maskImage:ex.open?'linear-gradient(90deg,#000 85%,transparent)':'none',WebkitMaskImage:ex.open?'linear-gradient(90deg,#000 85%,transparent)':'none'}}>
                          <div onPointerDown={e=>onBarDown(e,p,'start')} title="Drag to change the start" style={{...HANDLE,left:-4}}/>
                          {!ex.open&&<div onPointerDown={e=>onBarDown(e,p,'end')} title="Drag to change the end" style={{...HANDLE,right:-4}}/>}
                          {drag?.id===p.id&&drag.moved&&<DragLabel s={ex.s} e={ex.e}/>}
                          {!drag&&<DepHandle k={depKey('project',p.id)}/>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <DependencyLayer containerRef={gridRef} deps={(deps as any[]).filter(d=>shownKeys.has(depKey(d.blocker_type,d.blocker_id))&&shownKeys.has(depKey(d.blocked_type,d.blocked_id)))}
                isBad={depBad} label={keyName} onCreate={addDep} onDelete={removeDep}/>
            </div>
          </div>
          {/* Legend */}
          <div style={{display:'flex',gap:16,flexWrap:'wrap' as const,padding:'12px 16px',fontSize:11,color:'#7A8FA6',position:'sticky',left:0}}>
            <Legend swatch={{background:TEAM_COLORS['Consumer Experience']}} label="Consumer Experience (planned)"/>
            <Legend swatch={{background:TEAM_COLORS['Operational Efficiency']}} label="Operational Efficiency (planned)"/>
            <Legend swatch={{background:'rgba(224,123,42,0.28)',border:`1.5px solid ${PROPOSED}`}} label="Proposed, not yet planned"/>
            <Legend swatch={{background:SUSTAIN}} label="Sustain: tech debt, stabilization & enhancements"/>
            {view.showEpics&&<Legend swatch={{background:'rgba(224,123,42,0.65)',height:8,borderRadius:4}} label="Epic"/>}
            {view.showEpics&&<Legend swatch={{border:`1px dashed ${EPIC}`,height:8,borderRadius:4}} label="Epic dated by its stories"/>}
            <Legend swatch={{background:'rgba(255,255,255,0.12)'}} label={`Code freeze (${freeze.map(m=>MONTHS[m-1]).join(', ')||'none'})`}/>
            <span>Drag the dot at a bar&apos;s end onto another bar to add a dependency, and click a line to remove it.</span>
            <span>Drag a bar to move it, or drag its ends to change its start or end. Bars snap to whole {view.snap==='quarter'?'quarters':'months'}.</span>
          </div>
        </div>

        {/* Side panel */}
        <div style={{width:narrow?'100%':320,maxHeight:narrow?'45%':'none',flexShrink:0,borderLeft:narrow?'none':'1px solid #243447',borderTop:narrow?'1px solid #243447':'none',background:'#0F1C2B',overflowY:'auto'}}>
          {selId==='__new'?(
            <NewStrategy onCreate={async(t:any)=>{await createStrategy(t);setSelId(null)}} onCancel={()=>setSelId(null)}/>
          ):selEpic?(
            <EpicSidePanel key={selEpic.id} epic={selEpic} project={projById(selEpic.project_id)} items={items} base={epicBase(selEpic)} updEpic={updEpic} onClose={()=>setSelId(null)}
              onOpenProject={onOpenProject}/>
          ):sel?(
            <ProjectPanel p={sel} state={state(sel)} tracks={sTracks} projects={live} deps={deps} shown={shown} issues={issues.filter(i=>i.id===sel.id)}
              updProject={updProject} addDep={addDep} removeDep={removeDep} keyName={keyName} onClose={()=>setSelId(null)} onOpenProject={onOpenProject}/>
          ):(
            <SettingsPanel strategy={strategy} tracks={sTracks} projects={live} teams={teams} issues={issues} setSelId={setSelId}
              updStrategy={updStrategy} deleteStrategy={deleteStrategy} addTrack={addTrack} updTrack={updTrack} moveTrack={moveTrack} deleteTrack={deleteTrack}
              updProject={updProject} createProject={createProject}/>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({color,label,outline}:{color:string,label:string,outline?:boolean}){
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,color:'#C8C8D4'}}>
    <i style={{width:9,height:9,borderRadius:2,background:outline?'transparent':color,border:outline?`1.5px solid ${color}`:'none',display:'inline-block'}}/>{label}
  </span>
}
function Legend({swatch,label}:{swatch:any,label:string}){
  return <span style={{display:'inline-flex',alignItems:'center',gap:6}}><i style={{width:22,height:10,borderRadius:2,display:'inline-block',boxSizing:'border-box',...swatch}}/>{label}</span>
}
const H={fontSize:10,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:6}
const INPUT={width:'100%',boxSizing:'border-box' as const,background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'6px 8px'}
const SECTION={padding:'14px 16px',borderBottom:'1px solid #243447',display:'flex',flexDirection:'column' as const,gap:8}

function ProjectPanel({p,state,tracks,projects,deps,shown,issues,updProject,addDep,removeDep,keyName,onClose,onOpenProject}:any){
  const me='project:'+p.id
  const waitsOn=deps.filter((d:any)=>`${d.blocked_type}:${d.blocked_id}`===me)
  const blocks=deps.filter((d:any)=>`${d.blocker_type}:${d.blocker_id}`===me)
  const candidates=projects.filter((x:any)=>x.id!==p.id&&shown.has(x.id)&&!waitsOn.some((d:any)=>d.blocker_type==='project'&&d.blocker_id===x.id)).sort((a:any,b:any)=>a.name.localeCompare(b.name))
  return(
    <div>
      <div style={{...SECTION,flexDirection:'row',alignItems:'center',background:'#162436'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:'#F4F6F8'}}>{p.name}</div>
          <div style={{fontSize:11,color:'#7A8FA6'}}>{[p.team,p.status].filter(Boolean).join(' · ')}</div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:20,cursor:'pointer'}}>×</button>
      </div>
      {issues.length>0&&<div style={{...SECTION,background:'rgba(231,76,60,0.08)'}}>{issues.map((i:any,ix:number)=><div key={ix} style={{fontSize:11,color:'#E74C3C'}}>⚠ {i.text}</div>)}</div>}
      <div style={SECTION}>
        <div style={H}>PLANNING STATE</div>
        <div style={{display:'flex',gap:4}}>
          {['planned','proposed'].map(k=>(
            <button key={k} onClick={()=>updProject(p.id,{planning_state:k})}
              style={{flex:1,background:state===k?(k==='proposed'?PROPOSED:'#C8973A'):'transparent',color:state===k?'#0D1B2A':'#C8C8D4',border:'1px solid '+(state===k?'transparent':'#243447'),borderRadius:5,fontSize:11,fontWeight:700,padding:'5px 0',cursor:'pointer'}}>{STATE_LABEL[k]}</button>
          ))}
        </div>
        {state==='proposed'&&<button onClick={()=>updProject(p.id,{planning_state:'planned'})} disabled={!p.start_date}
          title={p.start_date?'Mark this as planned':'Give it dates first'}
          style={{background:'#27AE60',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,padding:'7px 0',cursor:p.start_date?'pointer':'not-allowed',opacity:p.start_date?1:0.5}}>✓ Accept proposal</button>}
      </div>
      <div style={SECTION}>
        <div style={H}>WORK TYPE</div>
        <div style={{display:'flex',gap:4}}>
          {['new','sustain'].map(k=>(
            <button key={k} onClick={()=>updProject(p.id,{work_type:k,...(p.planning_state==='bau'?{planning_state:'planned'}:{})})}
              style={{flex:1,background:workType(p)===k?(k==='sustain'?SUSTAIN:'#C8973A'):'transparent',color:workType(p)===k?(k==='sustain'?'#F4F6F8':'#0D1B2A'):'#C8C8D4',border:'1px solid '+(workType(p)===k?'transparent':'#243447'),borderRadius:5,fontSize:11,fontWeight:700,padding:'5px 0',cursor:'pointer'}}>{WORK_LABEL[k]}</button>
          ))}
        </div>
        <div style={{fontSize:10,color:'#7A8FA6'}}>Sustain is tech debt, system stabilization and enhancements to existing things. It counts toward the sustain share.</div>
      </div>
      <div style={SECTION}>
        <div style={H}>TRACK</div>
        <select value={tracks.some((t:any)=>t.id===p.track_id)?p.track_id:''} onChange={e=>updProject(p.id,{track_id:e.target.value||null})} style={INPUT}>
          <option value="">Not on a track</option>
          {tracks.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div style={SECTION}>
        <div style={H}>DATES</div>
        <div style={{display:'flex',gap:6}}>
          <label style={{flex:1,fontSize:10,color:'#7A8FA6'}}>Start<input type="date" value={p.start_date||''} onChange={e=>updProject(p.id,{start_date:e.target.value||null})} style={{...INPUT,marginTop:3}}/></label>
          <label style={{flex:1,fontSize:10,color:'#7A8FA6'}}>End{p.ongoing?<div style={{...INPUT,marginTop:3,color:'#7A8FA6'}}>Ongoing</div>:<input type="date" value={p.end_date||''} onChange={e=>updProject(p.id,{end_date:e.target.value||null})} style={{...INPUT,marginTop:3}}/>}</label>
        </div>
      </div>
      <div style={SECTION}>
        <div style={H}>CAN&apos;T START UNTIL THESE FINISH</div>
        {waitsOn.length===0&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic'}}>Nothing</div>}
        {waitsOn.map((d:any)=>(
          <div key={d.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#F4F6F8'}}>
            <span style={{color:PROPOSED}}>←</span><span style={{flex:1}}>{keyName(`${d.blocker_type}:${d.blocker_id}`)}</span>
            <button onClick={()=>removeDep(d)} title="Remove dependency" style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>✕</button>
          </div>
        ))}
        {candidates.length>0&&<select value="" onChange={e=>e.target.value&&addDep('project:'+e.target.value,me)} style={{...INPUT,color:'#7A8FA6',borderStyle:'dashed'}}>
          <option value="">+ Add a project it depends on…</option>
          {candidates.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>}
        {blocks.length>0&&<>
          <div style={{...H,marginTop:8}}>WAITING ON THIS PROJECT</div>
          {blocks.map((d:any)=>(
            <div key={d.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#F4F6F8'}}>
              <span style={{color:PROPOSED}}>→</span><span style={{flex:1}}>{keyName(`${d.blocked_type}:${d.blocked_id}`)}</span>
              <button onClick={()=>removeDep(d)} title="Remove dependency" style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>✕</button>
            </div>
          ))}
        </>}
      </div>
      {onOpenProject&&<div style={SECTION}>
        <button onClick={()=>onOpenProject(p)} style={{background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'7px 0',cursor:'pointer'}}>Open project, epics and items →</button>
      </div>}
    </div>
  )
}

function EpicSidePanel({epic,project,items,base,updEpic,onClose,onOpenProject}:any){
  const its=(items as any[]).filter(i=>i.epic_id===epic.id&&(!project||i.parent_project===project.name))
  const done=its.filter(i=>ITEM_TERMINAL.includes(i.status)).length
  return(
    <div>
      <div style={{...SECTION,flexDirection:'row',alignItems:'center',background:'#162436',borderTop:`3px solid ${EPIC}`}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:800,color:EPIC,letterSpacing:1}}>◆ EPIC</div>
          <div style={{fontSize:14,fontWeight:700,color:'#F4F6F8'}}>{epic.name}</div>
          <div style={{fontSize:11,color:'#7A8FA6'}}>{[project?.name,epic.status].filter(Boolean).join(' · ')}</div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:20,cursor:'pointer'}}>×</button>
      </div>
      <div style={SECTION}>
        <div style={H}>DATES</div>
        <div style={{display:'flex',gap:6}}>
          <label style={{flex:1,fontSize:10,color:'#7A8FA6'}}>Start<input type="date" value={epic.start_date||''} onChange={e=>updEpic(epic.id,{start_date:e.target.value||null})} style={{...INPUT,marginTop:3}}/></label>
          <label style={{flex:1,fontSize:10,color:'#7A8FA6'}}>End<input type="date" value={epic.end_date||''} onChange={e=>updEpic(epic.id,{end_date:e.target.value||null})} style={{...INPUT,marginTop:3}}/></label>
        </div>
        {epic.start_date
          ?<button onClick={()=>updEpic(epic.id,{start_date:null,end_date:null})} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'5px 0',cursor:'pointer'}}>Use its stories&apos; dates instead</button>
          :<div style={{fontSize:11,color:'#7A8FA6'}}>{base?`Using its stories' dates: ${fmtDate(base.s)} → ${fmtDate(base.e)}.`:'No dates yet. Set them here, or commit its stories.'}</div>}
      </div>
      <div style={SECTION}>
        <div style={H}>STORIES ({done}/{its.length} DONE)</div>
        {its.length===0&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic'}}>No stories in this epic yet</div>}
        {its.map((i:any)=>(
          <div key={i.id} style={{display:'flex',gap:6,fontSize:11}}>
            <span style={{fontFamily:'monospace',fontSize:10,color:'#7A8FA6'}}>{i.item_id}</span>
            <span style={{flex:1,color:ITEM_TERMINAL.includes(i.status)?'#7A8FA6':'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{i.name}</span>
            <span style={{fontSize:9,color:'#7A8FA6'}}>{i.status}</span>
          </div>
        ))}
        <div style={{fontSize:10,color:'#7A8FA6'}}>Edit the epic and its stories in the Backlog tab.</div>
      </div>
      {onOpenProject&&project&&<div style={SECTION}>
        <button onClick={()=>onOpenProject(project)} style={{background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'7px 0',cursor:'pointer'}}>Open {project.name} →</button>
      </div>}
    </div>
  )
}

function SettingsPanel({strategy,tracks,projects,teams,issues,setSelId,updStrategy,deleteStrategy,addTrack,updTrack,moveTrack,deleteTrack,updProject,createProject}:any){
  const [name,setName]=useState(strategy.name)
  const [newTrack,setNewTrack]=useState('')
  const [addPid,setAddPid]=useState('')
  const [addTid,setAddTid]=useState('')
  const [np,setNp]=useState({name:'',team:teams[0]||'',track:'',wt:'new'})
  const trackIds=new Set(tracks.map((t:any)=>t.id))
  const addable=projects.filter((p:any)=>!trackIds.has(p.track_id)&&!PROJECT_TERMINAL.includes(p.status)).sort((a:any,b:any)=>a.name.localeCompare(b.name))
  const fyOpts:number[]=[];for(let f=2024;f<=2040;f++)fyOpts.push(f)
  return(
    <div>
      {issues.length>0&&(
        <div style={SECTION}>
          <div style={{...H,color:'#E74C3C'}}>TO CHECK ({issues.length})</div>
          {issues.map((i:any,ix:number)=>(
            <div key={ix} onClick={()=>i.id&&setSelId(i.id)} style={{fontSize:11,color:'#E8A79E',cursor:i.id?'pointer':'default',lineHeight:1.4}}>
              {i.kind==='dep'?'⛓':i.kind==='freeze'?'❄':'👥'} {i.text}
            </div>
          ))}
        </div>
      )}
      <div style={SECTION}>
        <div style={H}>STRATEGY</div>
        <input value={name} onChange={e=>setName(e.target.value)} onBlur={()=>name.trim()&&name!==strategy.name&&updStrategy({name:name.trim()})} style={INPUT}/>
        <div style={{display:'flex',gap:6,alignItems:'center',fontSize:11,color:'#7A8FA6'}}>
          <select value={strategy.start_fy} onChange={e=>{const v=Number(e.target.value);updStrategy({start_fy:v,end_fy:Math.max(v,strategy.end_fy)})}} style={INPUT}>{fyOpts.map(f=><option key={f} value={f}>FY{String(f).slice(-2)}</option>)}</select>
          to
          <select value={strategy.end_fy} onChange={e=>updStrategy({end_fy:Math.max(Number(e.target.value),strategy.start_fy)})} style={INPUT}>{fyOpts.filter(f=>f>=strategy.start_fy).map(f=><option key={f} value={f}>FY{String(f).slice(-2)}</option>)}</select>
        </div>
        <label title="Share of capacity for tech debt, stabilization and enhancements. New projects get the rest." style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#7A8FA6'}}>Sustain share
          <input type="number" min={0} max={100} value={strategy.bau_pct} onChange={e=>updStrategy({bau_pct:Math.max(0,Math.min(100,Number(e.target.value)||0))})} style={{...INPUT,width:70}}/>%
        </label>
        <div style={{fontSize:11,color:'#7A8FA6'}}>Code-freeze months</div>
        <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
          {MONTHS.map((m,i)=>{
            const on=(strategy.freeze_months||[]).includes(i+1)
            return <button key={m} onClick={()=>updStrategy({freeze_months:on?strategy.freeze_months.filter((x:number)=>x!==i+1):[...(strategy.freeze_months||[]),i+1].sort((a,b)=>a-b)})}
              style={{background:on?'#3A4A5E':'transparent',color:on?'#F4F6F8':'#7A8FA6',border:'1px solid #243447',borderRadius:4,fontSize:10,padding:'3px 6px',cursor:'pointer'}}>{m}</button>
          })}
        </div>
      </div>
      <div style={SECTION}>
        <div style={H}>TRACKS</div>
        {tracks.map((t:any,i:number)=>(
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:5}}>
            <input type="color" value={t.color} onChange={e=>updTrack(t.id,{color:e.target.value})} style={{width:22,height:22,padding:0,border:'none',background:'none',cursor:'pointer'}}/>
            <input defaultValue={t.name} onBlur={e=>e.target.value.trim()&&e.target.value!==t.name&&updTrack(t.id,{name:e.target.value.trim()})} style={{...INPUT,flex:1}}/>
            <button onClick={()=>moveTrack(t.id,-1)} disabled={i===0} style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer',opacity:i===0?0.3:1}}>↑</button>
            <button onClick={()=>moveTrack(t.id,1)} disabled={i===tracks.length-1} style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer',opacity:i===tracks.length-1?0.3:1}}>↓</button>
            <button onClick={()=>deleteTrack(t)} title="Delete track" style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>✕</button>
          </div>
        ))}
        {tracks.map((t:any)=>(
          <input key={'d'+t.id} placeholder={`${t.name} subtitle, e.g. "Runs all four years"`} defaultValue={t.description||''} onBlur={e=>e.target.value!==(t.description||'')&&updTrack(t.id,{description:e.target.value||null})} style={{...INPUT,fontSize:11}}/>
        ))}
        <div style={{display:'flex',gap:6}}>
          <input placeholder="New track…" value={newTrack} onChange={e=>setNewTrack(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){addTrack(newTrack);setNewTrack('')}}} style={{...INPUT,flex:1}}/>
          <button onClick={()=>{addTrack(newTrack);setNewTrack('')}} disabled={!newTrack.trim()} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontWeight:700,fontSize:11,padding:'0 12px',cursor:'pointer',opacity:newTrack.trim()?1:0.5}}>Add</button>
        </div>
        <div style={{fontSize:10,color:'#7A8FA6'}}>Click a goal cell on the roadmap to set that year&apos;s goal.</div>
      </div>
      {tracks.length>0&&<div style={SECTION}>
        <div style={H}>PUT AN EXISTING PROJECT ON A TRACK</div>
        <select value={addPid} onChange={e=>setAddPid(e.target.value)} style={INPUT}>
          <option value="">Choose a project…</option>
          {addable.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{display:'flex',gap:6}}>
          <select value={addTid} onChange={e=>setAddTid(e.target.value)} style={{...INPUT,flex:1}}>
            <option value="">Choose a track…</option>
            {tracks.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button disabled={!addPid||!addTid} onClick={async()=>{await updProject(addPid,{track_id:addTid});setAddPid('')}}
            style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontWeight:700,fontSize:11,padding:'0 12px',cursor:'pointer',opacity:addPid&&addTid?1:0.5}}>Add</button>
        </div>
      </div>}
      <div style={SECTION}>
        <div style={H}>NEW PROPOSED PROJECT</div>
        <input placeholder="Project name, e.g. Clienteling launch" value={np.name} onChange={e=>setNp({...np,name:e.target.value})} style={INPUT}/>
        <div style={{display:'flex',gap:6}}>
          <select value={np.team} onChange={e=>setNp({...np,team:e.target.value})} style={{...INPUT,flex:1}}>{teams.map((t:string)=><option key={t} value={t}>{t}</option>)}</select>
          <select value={np.track} onChange={e=>setNp({...np,track:e.target.value})} style={{...INPUT,flex:1}}>
            <option value="">No track</option>
            {tracks.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <select value={np.wt} onChange={e=>setNp({...np,wt:e.target.value})} style={INPUT}>
          <option value="new">New project</option>
          <option value="sustain">Sustain (tech debt, stabilization & enhancements)</option>
        </select>
        <button disabled={!np.name.trim()} onClick={async()=>{await createProject(np.name,np.team,np.track,np.wt);setNp({...np,name:''})}}
          style={{background:PROPOSED,border:'none',borderRadius:5,color:'#0D1B2A',fontWeight:700,fontSize:12,padding:'7px 0',cursor:'pointer',opacity:np.name.trim()?1:0.5}}>+ Add as proposed</button>
        <div style={{fontSize:10,color:'#7A8FA6'}}>It appears on the roadmap without dates. Click a quarter in its row to place it.</div>
      </div>
      <div style={SECTION}>
        <button onClick={deleteStrategy} style={{background:'none',border:'1px solid #5C2B2B',borderRadius:5,color:'#E74C3C',fontSize:11,padding:'6px 0',cursor:'pointer'}}>Delete this strategy</button>
      </div>
    </div>
  )
}

function NewStrategy({onCreate,onCancel,first}:any){
  const [f,setF]=useState({name:'',start_fy:2027,end_fy:2030,bau_pct:30})
  const fyOpts:number[]=[];for(let y=2024;y<=2040;y++)fyOpts.push(y)
  const body=(
    <div style={{display:'flex',flexDirection:'column',gap:10,padding:first?0:16}}>
      {!first&&<div style={H}>NEW STRATEGY</div>}
      <input placeholder="Strategy name" value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={INPUT}/>
      <div style={{display:'flex',gap:6,alignItems:'center',fontSize:11,color:'#7A8FA6'}}>
        <select value={f.start_fy} onChange={e=>setF({...f,start_fy:Number(e.target.value),end_fy:Math.max(Number(e.target.value),f.end_fy)})} style={INPUT}>{fyOpts.map(y=><option key={y} value={y}>FY{String(y).slice(-2)}</option>)}</select>
        to
        <select value={f.end_fy} onChange={e=>setF({...f,end_fy:Number(e.target.value)})} style={INPUT}>{fyOpts.filter(y=>y>=f.start_fy).map(y=><option key={y} value={y}>FY{String(y).slice(-2)}</option>)}</select>
      </div>
      <div style={{display:'flex',gap:6}}>
        <button disabled={!f.name.trim()} onClick={()=>onCreate({...f,name:f.name.trim(),freeze_months:[10,11,12],tracks:[]})}
          style={{flex:1,background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontWeight:700,fontSize:12,padding:'8px 0',cursor:'pointer',opacity:f.name.trim()?1:0.5}}>Create blank strategy</button>
        {onCancel&&<button onClick={onCancel} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:12,padding:'8px 12px',cursor:'pointer'}}>Cancel</button>}
      </div>
      <div style={{fontSize:11,color:'#7A8FA6',textAlign:'center' as const}}>or</div>
      <button onClick={()=>onCreate(TEMPLATE)} style={{background:'none',border:`1px solid ${PROPOSED}`,borderRadius:5,color:PROPOSED,fontWeight:700,fontSize:12,padding:'8px 0',cursor:'pointer'}}>
        Start from your FY27–FY30 roadmap
      </button>
      <div style={{fontSize:10,color:'#7A8FA6',lineHeight:1.5}}>Creates &ldquo;{TEMPLATE.name}&rdquo; with Foundation and Revenue tracks and their yearly goals. You then put projects on the tracks.</div>
    </div>
  )
  if(!first)return body
  return(
    <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{width:'100%',maxWidth:420,background:'#162436',border:'1px solid #243447',borderRadius:10,padding:24,display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontSize:18,fontWeight:800,color:'#F4F6F8'}}>Build a strategy roadmap</div>
        <div style={{fontSize:12,color:'#7A8FA6',lineHeight:1.6}}>A strategy spans fiscal years and has tracks, like Foundation and Revenue, each with a goal per year. Your projects become the bars, and dependencies become the arrows.</div>
        {body}
      </div>
    </div>
  )
}
