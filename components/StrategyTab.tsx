'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { DependencyLayer, DepHandle, createDependency, deleteDependency, depKey } from './DependencyLayer'
import { StrategyReport } from './StrategyReport'
import { exportStrategiesPptx } from './StrategyPptx'
import { StrategyBudgetPanel, StaffingSection, computeAllocation, slotted, overlapsFor, SLOTS, SHARED_TEAM } from './StrategyBudget'

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
const GROUP='#C8973A'
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

export default function StrategyTab({projects:mainProjects,setProjects,strategies,setStrategies,tracks,setTracks,goals,setGoals,deps:allDeps,setDeps,people,teams,onOpenProject,openAssistant,items=[],epics:mainEpics=[],setEpics,strategyItems=[],setStrategyItems,roles=[],projectRoles=[],setProjectRoles,strategyRoles=[],setStrategyRoles}:any){
  const [stratId,setStratId]=useState<any>(()=>{try{return localStorage.getItem('pg_strategy')}catch{return null}})
  const strategy=(strategies as any[]).find(s=>s.id===stratId)||strategies[0]||null
  // ── Sandbox: this strategy's own placement of projects and epics (track, dates, planning
  // state) and its own dependencies. Anything it hasn't touched shows the main roadmap's
  // values. Nothing here changes the main roadmap until the strategy is promoted.
  const sRows=(strategyItems as any[]).filter(r=>r.strategy_id===strategy?.id)
  const rowOf=(type:string,id:any)=>sRows.find(r=>r.item_type===type&&r.item_id===id)
  const mainState=(p:any)=>p?.planning_state==='proposed'?'proposed':'planned'
  const projects=(mainProjects as any[]).map(p=>{
    const r=rowOf('project',p.id)
    return r?{...p,track_id:r.track_id,start_date:r.start_date,end_date:r.end_date,planning_state:r.planning_state||mainState(p),team:r.team??p.team,group_name:r.group_name||null}:{...p,track_id:null,group_name:null}
  })
  const epics=(mainEpics as any[]).map(e=>{const r=rowOf('epic',e.id);return r?{...e,start_date:r.start_date,end_date:r.end_date}:e})
  const deps=(allDeps as any[]).filter(d=>strategy&&d.strategy_id===strategy.id)
  const SANDBOX_FIELDS=['track_id','start_date','end_date','planning_state','team','group_name']
  // A project's roster in this strategy: its own copy once edited here, else the project's
  const rosterOf=(projectId:any)=>rowOf('project',projectId)?.roster_custom
    ?(strategyRoles as any[]).filter(r=>r.strategy_id===strategy?.id&&r.project_id===projectId)
    :(projectRoles as any[]).filter(r=>r.project_id===projectId)
  async function ensureOwnRoster(projectId:any){
    if(rowOf('project',projectId)?.roster_custom)return
    const copy=(projectRoles as any[]).filter(r=>r.project_id===projectId).map(r=>({strategy_id:strategy.id,project_id:projectId,role_id:r.role_id,person_id:r.person_id,headcount:r.headcount,allocation_pct:r.allocation_pct}))
    if(copy.length){
      const{data,error}=await supabase.from('strategy_roles').insert(copy).select()
      if(error){alert('Failed to copy the roster: '+error.message);return}
      if(data)setStrategyRoles((prev:any[])=>[...prev,...data])
    }
    await upsertRow('project',projectId,{roster_custom:true})
  }
  async function addRosterRow(projectId:any,fields:any){
    await ensureOwnRoster(projectId)
    const{data,error}=await supabase.from('strategy_roles').insert({strategy_id:strategy.id,project_id:projectId,...fields}).select().single()
    if(error){alert('Failed to add: '+error.message);return}
    if(data)setStrategyRoles((prev:any[])=>[...prev,data])
  }
  async function setSlot(projectId:any,slot:string,personId:string|null,current:any){
    const person=personId?(people as any[]).find(p=>p.id===personId):null
    if(current&&!personId){await removeRosterRow(current);return}
    if(!personId)return
    await ensureOwnRoster(projectId)
    // after copying, find this strategy's row for the slot (by slot, or the copied twin)
    const{data:mine}=await supabase.from('strategy_roles').select('*').eq('strategy_id',strategy.id).eq('project_id',projectId)
    const target=(mine||[]).find((r:any)=>r.slot===slot)
      ||(current&&(mine||[]).find((r:any)=>!r.slot&&r.person_id===current.person_id&&r.role_id===current.role_id))
    const fields={person_id:personId,role_id:person?.role_id||null,headcount:1,allocation_pct:100,slot}
    if(target){
      setStrategyRoles((prev:any[])=>prev.map(r=>r.id===target.id?{...r,...fields}:r))
      const{error}=await supabase.from('strategy_roles').update(fields).eq('id',target.id)
      if(error)alert('Failed to save: '+error.message)
    }else{
      const{data,error}=await supabase.from('strategy_roles').insert({strategy_id:strategy.id,project_id:projectId,...fields}).select().single()
      if(error){alert('Failed to add: '+error.message);return}
      if(data)setStrategyRoles((prev:any[])=>[...prev,data])
    }
  }
  async function removeRosterRow(row:any){
    if(!rowOf('project',row.project_id)?.roster_custom){
      await ensureOwnRoster(row.project_id)
      const{data}=await supabase.from('strategy_roles').select('*').eq('strategy_id',strategy.id).eq('project_id',row.project_id)
      const twin=(data||[]).find((r:any)=>r.person_id===row.person_id&&r.role_id===row.role_id)
      if(!twin)return
      row=twin
    }
    setStrategyRoles((prev:any[])=>prev.filter(r=>r.id!==row.id))
    const{error}=await supabase.from('strategy_roles').delete().eq('id',row.id)
    if(error)alert('Failed to remove: '+error.message)
  }
  async function upsertRow(type:string,id:any,fields:any){
    if(!strategy)return
    const cur=rowOf(type,id)
    const main=type==='project'?(mainProjects as any[]).find(p=>p.id===id):(mainEpics as any[]).find(e=>e.id===id)
    const row={strategy_id:strategy.id,item_type:type,item_id:id,
      track_id:cur?cur.track_id:null,
      start_date:cur?cur.start_date:(main?.start_date||null),
      end_date:cur?cur.end_date:(main?.ongoing?null:(main?.end_date||null)),
      planning_state:type==='project'?(cur?.planning_state||mainState(main)):null,
      team:cur?cur.team:null,roster_custom:cur?.roster_custom||false,group_name:cur?.group_name??null,
      ...fields,updated_at:new Date().toISOString()}
    const tempId=cur?.id||`tmp-${type}-${id}`
    setStrategyItems((prev:any[])=>cur?prev.map(r=>r.id===cur.id?{...r,...row}:r):[...prev,{...row,id:tempId}])
    const{data,error}=await supabase.from('strategy_items').upsert(row,{onConflict:'strategy_id,item_type,item_id'}).select().single()
    if(error){alert('Failed to save to this strategy: '+error.message);return}
    if(data)setStrategyItems((prev:any[])=>prev.map(r=>r.id===tempId||r.id===data.id?data:r))
  }
  const [selId,setSelId]=useState<any>(null)
  const [drag,setDrag]=useState<any>(null) // {id,mode:'move'|'start'|'end',x0,dm}
  const [editGoal,setEditGoal]=useState<any>(null) // {track_id,fy,text}
  const pref=(k:string,d:any)=>{try{const v=localStorage.getItem('pg_strat_'+k);return v==null?d:JSON.parse(v)}catch{return d}}
  const [exporting,setExporting]=useState(false)
  const [view,setView]=useState<any>(()=>({sortBy:pref('sortBy','start_date'),sortDir:pref('sortDir','asc'),showLoad:pref('showLoad',false),showEpics:pref('showEpics',true),snap:pref('snap','quarter'),groupBy:pref('groupBy','tracks'),budgetScope:pref('budgetScope','all'),sideTab:pref('sideTab','settings'),mode:pref('mode','map'),collapsed:pref('collapsed',{})}))
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
    const sandbox:any={},own:any={}
    for(const k of Object.keys(fields)){
      if(k==='ongoing')continue // placing work in a strategy never changes the project itself
      ;(SANDBOX_FIELDS.includes(k)?sandbox:own)[k]=fields[k]
    }
    if(Object.keys(own).length){
      setProjects((prev:any[])=>prev.map(p=>p.id===id?{...p,...own}:p))
      const{error}=await supabase.from('projects').update({...own,updated_at:new Date().toISOString()}).eq('id',id)
      if(error)alert('Failed to save project: '+error.message)
    }
    if(Object.keys(sandbox).length)await upsertRow('project',id,sandbox)
  }
  // ── Compare with the main roadmap, promote, duplicate, reset ─────────────
  function changesVsMain(){
    const out:any[]=[]
    for(const r of sRows){
      const main=r.item_type==='project'?(mainProjects as any[]).find(p=>p.id===r.item_id):(mainEpics as any[]).find(e=>e.id===r.item_id)
      if(!main)continue
      const mEnd=main.ongoing?null:(main.end_date||null)
      const diff:string[]=[]
      if((r.start_date||null)!==(main.start_date||null)||(r.end_date||null)!==mEnd)diff.push('dates')
      if(r.item_type==='project'&&r.planning_state&&r.planning_state!==mainState(main))diff.push(r.planning_state==='planned'?'planned':'proposed')
      if(r.item_type==='project'&&r.team&&r.team!==main.team)diff.push('team')
      if(r.item_type==='project'&&r.roster_custom){
        const sig=(x:any)=>`${x.person_id||''}|${x.role_id||''}|${Number(x.headcount)}|${Number(x.allocation_pct)}`
        const mine=(strategyRoles as any[]).filter(x=>x.strategy_id===strategy?.id&&x.project_id===r.item_id).map(sig).sort().join(',')
        const theirs=(projectRoles as any[]).filter(x=>x.project_id===r.item_id).map(sig).sort().join(',')
        if(mine!==theirs)diff.push('people')
      }
      if(diff.length)out.push({row:r,main,diff})
    }
    const mainDeps=(allDeps as any[]).filter(d=>!d.strategy_id&&d.blocker_type!=='item'&&d.blocked_type!=='item')
    const sig=(d:any)=>`${d.blocker_type}:${d.blocker_id}>${d.blocked_type}:${d.blocked_id}`
    const mainSigs=new Set(mainDeps.map(sig)),mySigs=new Set(deps.map(sig))
    return{rows:out,addDeps:deps.filter(d=>!mainSigs.has(sig(d))),dropDeps:mainDeps.filter(d=>!mySigs.has(sig(d)))}
  }
  async function promote(){
    if(!strategy)return
    const ch=changesVsMain()
    const nP=ch.rows.filter(c=>c.row.item_type==='project').length,nE=ch.rows.length-nP
    if(!ch.rows.length&&!ch.addDeps.length&&!ch.dropDeps.length){alert('The main roadmap already matches this strategy.');return}
    const nPeople=ch.rows.filter(c=>c.diff.includes('people')||c.diff.includes('team')).length
    const lines=[nP&&`${nP} project${nP!==1?'s get':' gets'} this strategy's dates, planning state, team or people`,nPeople&&`${nPeople} of them get this strategy's team or people (their roster is replaced)`,nE&&`${nE} epic${nE!==1?'s get':' gets'} this strategy's dates`,
      ch.addDeps.length&&`${ch.addDeps.length} dependenc${ch.addDeps.length!==1?'ies are':'y is'} added`,ch.dropDeps.length&&`${ch.dropDeps.length} dependenc${ch.dropDeps.length!==1?'ies are':'y is'} removed`].filter(Boolean)
    if(!confirm(`Promote "${strategy.name}" to the main roadmap?\n\n• ${lines.join('\n• ')}\n\nThe Roadmap, Projects, Budget and Sprints tabs use the main roadmap. Other strategies are not changed.`))return
    for(const c of ch.rows){
      const fields:any={start_date:c.row.start_date||null}
      if(!(c.main.ongoing&&!c.row.end_date))fields.end_date=c.row.end_date||null
      if(c.row.item_type==='project'&&c.row.planning_state)fields.planning_state=c.row.planning_state
      if(c.row.item_type==='project'&&c.row.team)fields.team=c.row.team
      if(c.diff.includes('people')){
        const pid=c.row.item_id
        const{error:de}=await supabase.from('project_roles').delete().eq('project_id',pid)
        if(de){alert(`Promoting stopped: ${de.message}`);return}
        const mine=(strategyRoles as any[]).filter(x=>x.strategy_id===strategy.id&&x.project_id===pid).map(x=>({project_id:pid,role_id:x.role_id,person_id:x.person_id,headcount:x.headcount,allocation_pct:x.allocation_pct}))
        const{data:nr,error:ie}=mine.length?await supabase.from('project_roles').insert(mine).select():{data:[],error:null}
        if(ie){alert(`Promoting stopped: ${ie.message}`);return}
        setProjectRoles((prev:any[])=>[...prev.filter(x=>x.project_id!==pid),...(nr||[])])
      }
      const table=c.row.item_type==='project'?'projects':'epics'
      const{error}=await supabase.from(table).update(fields).eq('id',c.row.item_id)
      if(error){alert(`Promoting stopped: ${error.message}`);return}
      if(table==='projects')setProjects((prev:any[])=>prev.map(p=>p.id===c.row.item_id?{...p,...fields}:p))
      else setEpics((prev:any[])=>prev.map(e=>e.id===c.row.item_id?{...e,...fields}:e))
    }
    if(ch.dropDeps.length){
      const{error}=await supabase.from('work_dependencies').delete().in('id',ch.dropDeps.map(d=>d.id))
      if(error){alert('Removing dependencies failed: '+error.message);return}
      const gone=new Set(ch.dropDeps.map(d=>d.id))
      setDeps((prev:any[])=>prev.filter(d=>!gone.has(d.id)))
    }
    if(ch.addDeps.length){
      const{data,error}=await supabase.from('work_dependencies').insert(ch.addDeps.map(d=>({blocker_type:d.blocker_type,blocker_id:d.blocker_id,blocked_type:d.blocked_type,blocked_id:d.blocked_id,strategy_id:null}))).select()
      if(error){alert('Adding dependencies failed: '+error.message);return}
      if(data)setDeps((prev:any[])=>[...prev,...data])
    }
    await updStrategy({promoted_at:new Date().toISOString()})
    alert(`"${strategy.name}" is now the main roadmap.`)
  }
  async function duplicateStrategy(){
    if(!strategy)return
    const{data:ns,error}=await supabase.from('strategies').insert({name:`${strategy.name} (copy)`,description:strategy.description,start_fy:strategy.start_fy,end_fy:strategy.end_fy,
      bau_pct:strategy.bau_pct,freeze_months:strategy.freeze_months,sort_order:strategies.length}).select().single()
    if(error||!ns){alert('Failed to duplicate: '+(error?.message||'no row returned'));return}
    const myTracks=tracks.filter((t:any)=>t.strategy_id===strategy.id)
    const trackMap=new Map<string,string>()
    const newTracks:any[]=[],newGoals:any[]=[]
    for(const t of myTracks){
      const{data:nt}=await supabase.from('tracks').insert({strategy_id:ns.id,name:t.name,description:t.description,color:t.color,sort_order:t.sort_order}).select().single()
      if(!nt)continue
      trackMap.set(t.id,nt.id);newTracks.push(nt)
      const gs=goals.filter((g:any)=>g.track_id===t.id).map((g:any)=>({track_id:nt.id,fy:g.fy,goal:g.goal}))
      if(gs.length){const{data:ng}=await supabase.from('track_goals').insert(gs).select();if(ng)newGoals.push(...ng)}
    }
    const rows=sRows.map(r=>({strategy_id:ns.id,item_type:r.item_type,item_id:r.item_id,track_id:r.track_id?trackMap.get(r.track_id)||null:null,start_date:r.start_date,end_date:r.end_date,planning_state:r.planning_state,team:r.team,roster_custom:r.roster_custom,group_name:r.group_name}))
    const roster=(strategyRoles as any[]).filter(x=>x.strategy_id===strategy.id).map(x=>({strategy_id:ns.id,project_id:x.project_id,role_id:x.role_id,person_id:x.person_id,headcount:x.headcount,allocation_pct:x.allocation_pct}))
    if(roster.length){const{data:nrr}=await supabase.from('strategy_roles').insert(roster).select();if(nrr)setStrategyRoles((prev:any[])=>[...prev,...nrr])}
    const{data:nr}=rows.length?await supabase.from('strategy_items').insert(rows).select():{data:[]}
    const nd=deps.map(d=>({strategy_id:ns.id,blocker_type:d.blocker_type,blocker_id:d.blocker_id,blocked_type:d.blocked_type,blocked_id:d.blocked_id}))
    const{data:ndr}=nd.length?await supabase.from('work_dependencies').insert(nd).select():{data:[]}
    setStrategies((prev:any[])=>[...prev,ns]);setTracks((prev:any[])=>[...prev,...newTracks]);setGoals((prev:any[])=>[...prev,...newGoals])
    setStrategyItems((prev:any[])=>[...prev,...(nr||[])]);setDeps((prev:any[])=>[...prev,...(ndr||[])])
    pickStrategy(ns.id)
  }
  async function resetToMain(){
    if(!strategy)return
    if(!confirm(`Reset "${strategy.name}" to the main roadmap?\n\nDates, planning states, teams, people and dependencies go back to the main roadmap's. Tracks, goals, groups and which projects sit on which track stay.`))return
    await supabase.from('strategy_roles').delete().eq('strategy_id',strategy.id)
    setStrategyRoles((prev:any[])=>prev.filter(x=>x.strategy_id!==strategy.id))
    const keep=sRows.filter(r=>r.item_type==='project'&&r.track_id)
    const{error}=await supabase.from('strategy_items').delete().eq('strategy_id',strategy.id)
    if(error){alert('Reset failed: '+error.message);return}
    const fresh=keep.map(r=>{const p=(mainProjects as any[]).find(x=>x.id===r.item_id);return{strategy_id:strategy.id,item_type:'project',item_id:r.item_id,track_id:r.track_id,
      start_date:p?.start_date||null,end_date:p?.ongoing?null:(p?.end_date||null),planning_state:mainState(p),group_name:r.group_name||null}})
    const{data:nr}=fresh.length?await supabase.from('strategy_items').insert(fresh).select():{data:[]}
    await supabase.from('work_dependencies').delete().eq('strategy_id',strategy.id)
    const mainDeps=(allDeps as any[]).filter(d=>!d.strategy_id&&d.blocker_type!=='item'&&d.blocked_type!=='item')
      .map(d=>({strategy_id:strategy.id,blocker_type:d.blocker_type,blocker_id:d.blocker_id,blocked_type:d.blocked_type,blocked_id:d.blocked_id}))
    const{data:nd}=mainDeps.length?await supabase.from('work_dependencies').insert(mainDeps).select():{data:[]}
    setStrategyItems((prev:any[])=>[...prev.filter(r=>r.strategy_id!==strategy.id),...(nr||[])])
    setDeps((prev:any[])=>[...prev.filter(d=>d.strategy_id!==strategy.id),...(nd||[])])
  }
  async function createStrategy(t:any){
    const{data,error}=await supabase.from('strategies').insert({name:t.name,start_fy:t.start_fy,end_fy:t.end_fy,bau_pct:t.bau_pct,freeze_months:t.freeze_months,sort_order:strategies.length}).select().single()
    if(error||!data){alert('Failed to create strategy: '+(error?.message||'no row returned'));return}
    setStrategies((prev:any[])=>[...prev,data])
    const mainDeps=(allDeps as any[]).filter(d=>!d.strategy_id&&d.blocker_type!=='item'&&d.blocked_type!=='item')
      .map(d=>({strategy_id:data.id,blocker_type:d.blocker_type,blocker_id:d.blocker_id,blocked_type:d.blocked_type,blocked_id:d.blocked_id}))
    if(mainDeps.length){const{data:nd}=await supabase.from('work_dependencies').insert(mainDeps).select();if(nd)setDeps((prev:any[])=>[...prev,...nd])}
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
    if(!confirm(`Delete the strategy "${strategy.name}"?\n\nIts tracks, goals, placements and dependencies are deleted. Projects and the main roadmap are not changed.`))return
    const trackIds=tracks.filter((t:any)=>t.strategy_id===strategy.id).map((t:any)=>t.id)
    setStrategies((prev:any[])=>prev.filter(s=>s.id!==strategy.id))
    setTracks((prev:any[])=>prev.filter(t=>t.strategy_id!==strategy.id))
    setGoals((prev:any[])=>prev.filter(g=>!trackIds.includes(g.track_id)))
    setStrategyItems((prev:any[])=>prev.filter(r=>r.strategy_id!==strategy.id))
    setStrategyRoles((prev:any[])=>prev.filter(x=>x.strategy_id!==strategy.id))
    setDeps((prev:any[])=>prev.filter(d=>d.strategy_id!==strategy.id))
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
    setStrategyItems((prev:any[])=>prev.map(r=>r.track_id===track.id?{...r,track_id:null}:r))
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
  const addDep=(blocker:string,blocked:string)=>createDependency(blocker,blocked,deps,setDeps,strategy?.id||null)
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
      sort_order:projects.length,space:'work',planning_state:'proposed',work_type:wt}).select().single()
    if(error){alert('Failed to create project: '+error.message);return}
    if(data){
      setProjects((prev:any[])=>[...prev,data]);setSelId(data.id)
      if(strategy)await supabase.from('strategy_items').insert({strategy_id:strategy.id,item_type:'project',item_id:data.id,track_id:trackId||null,planning_state:'proposed'}).select().single()
        .then(({data:r})=>{if(r)setStrategyItems((prev:any[])=>[...prev,r])})
    }
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
  // Projects in the same group run at the same time: keep them together, where the group's
  // first member falls in the sort
  function groupTogether(list:any[]){
    const out:any[]=[],done=new Set<string>()
    for(const p of list){
      if(!p.group_name){out.push(p);continue}
      if(done.has(p.group_name))continue
      done.add(p.group_name)
      out.push(...list.filter(x=>x.group_name===p.group_name))
    }
    return out
  }
  const onTrack=(t:any)=>groupTogether(sortProjects(live.filter(p=>p.track_id===t.id)))
  const backlog=groupTogether(sortProjects(live.filter(p=>!sTrackIds.has(p.track_id)&&!PROJECT_TERMINAL.includes(p.status))))
  // Staffing & cost: every active, dated project on this roadmap with its roster here. A
  // person's time is split evenly across the projects they overlap on (see StrategyBudget).
  const budgetEntries=[...sTracks.flatMap(onTrack).map((p:any)=>({p,onTrack:true})),...backlog.map((p:any)=>({p,onTrack:false}))]
    .filter(({p})=>!PROJECT_TERMINAL.includes(p.status)).map(({p,onTrack})=>{
      const roster=rosterOf(p.id)
      const filled=slotted(roster,people,roles)
      const missing=SLOTS.filter(sl=>!filled.has(sl.key)).map(sl=>sl.label)
      const s0=p.start_date?(p.start_date<winStart?winStart:p.start_date):null
      const e0=p.end_date&&!(p.ongoing&&!rowOf('project',p.id)?.end_date)?(p.end_date>winEnd?winEnd:p.end_date):winEnd
      return{p,onTrack,state:state(p),workType:workType(p),roster,missing,s:s0,e:e0}
    })
  const allocation=computeAllocation(budgetEntries.filter(x=>x.s&&x.roster.length&&x.s<=x.e).map(x=>({p:x.p,s:x.s,e:x.e,rows:x.roster})),people,roles)
  for(const x of budgetEntries as any[]){
    const c=allocation.costs.get(x.p.id)
    x.cost=c||null
    x.reason=!x.s?'no dates':!x.roster.length?'no people':c&&c.total>0?'':'$0 rates'
  }
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
  const typeById=new Map((projects as any[]).map(p=>[p.id,workType(p)]))
  const split:any={new:0,sustain:0}
  const loads:any[]=[]
  const loadTeams=[...(teams as string[]),...((people as any[]).some(p=>p.team===SHARED_TEAM)?[SHARED_TEAM]:[])]
  loadTeams.forEach(team=>{
    const cells=quarters.map(qt=>{
      const ppl=(people as any[]).filter(p=>p.team===team&&p.active!==false&&(!p.termination_date||p.termination_date>=qt.start))
      if(!ppl.length)return null
      const sum:any={new:0,sustain:0}
      for(const person of ppl){
        const months=allocation.personMonth.get(person.id)
        for(const k of qt.keys){
          const cell=months?.get(k)
          if(!cell||!cell.days)continue
          for(const[pid,daysOn]of cell.share)sum[typeById.get(pid)||'new']+=(daysOn as number)/cell.days*100/3
        }
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
  for(const x of budgetEntries as any[])if(x.onTrack&&x.missing.length)issues.push({kind:'staff',id:x.p.id,text:`${x.p.name} has no ${x.missing.join(', ')} assigned.`})
  const staffLabel=new Map<string,string>()
  for(const x of budgetEntries as any[]){
    const f=slotted(x.roster,people,roles)
    const short:any={dev:'Dev',qa:'QA',po:'PO'}
    const parts=SLOTS.map(sl=>{const r=f.get(sl.key);const n=r?.person_id?(people as any[]).find(p=>p.id===r.person_id)?.name:null;return `${short[sl.key]} ${n||(r?'role':'—')}`})
    const extra=x.roster.length-f.size
    if(x.roster.length)staffLabel.set(x.p.id,parts.join(' · ')+(extra>0?` +${extra}`:''))
  }
  const splitTotal=split.new+split.sustain
  const splitNewPct=splitTotal?Math.round(split.new/splitTotal*100):null

  // ── Rows (fixed heights so the arrow overlay can find each bar) ──────────
  const rows:any[]=[]
  // A list of projects, with a header row above each group (members are already together)
  function pushList(list:any[]){
    let open:string|null=null
    for(const p of list){
      if(p.group_name&&p.group_name!==open){
        const members=list.filter(x=>x.group_name===p.group_name)
        rows.push({kind:'group',name:p.group_name,members,h:18})
      }
      open=p.group_name||null
      pushProject(p,!!p.group_name)
    }
  }
  function pushProject(p:any,inGroup=false){
    const eps=view.showEpics?projectEpics(p):[]
    rows.push({kind:'project',p,epicCount:eps.length,inGroup,h:ROW_H})
    if(eps.length&&!view.collapsed['pe:'+p.id])eps.forEach(e=>rows.push({kind:'epic',e,p,h:20}))
  }
  const teamView=view.groupBy==='teams'
  if(teamView){
    // Every project on this roadmap grouped by its team here, each team followed by its load
    const all=[...sTracks.flatMap(onTrack),...backlog]
    const names=[...teams,...(all.some(p=>!p.team||!teams.includes(p.team))?['__none']:[])]
    names.forEach((tn:string,ti:number)=>{
      const list=groupTogether(sortProjects(all.filter(p=>tn==='__none'?(!p.team||!teams.includes(p.team)):p.team===tn)))
      const key='team:'+tn,closed=!!view.collapsed[key]
      rows.push({kind:'track',track:{id:key,name:tn==='__none'?'No team':tn,color:tn==='Consumer Experience'?'#C9D6E3':tn==='Operational Efficiency'?'#6FA6CB':'#7A8FA6',
        description:`${list.length} project${list.length!==1?'s':''}`},index:ti,count:list.length,closed,teamRow:true,h:24})
      if(closed)return
      pushList(list)
      if(!list.length)rows.push({kind:'hint',text:'No projects for this team yet.',h:ROW_H})
      loads.filter(l=>l.team===tn).forEach(l=>rows.push({kind:'load',load:l,h:ROW_H}))
    })
    if(loads.some(l=>l.team===SHARED_TEAM)){
      rows.push({kind:'band',label:`${SHARED_TEAM.toUpperCase()} · SHARED ACROSS TEAMS`,color:'#3A4A5E',h:22})
      loads.filter(l=>l.team===SHARED_TEAM).forEach(l=>rows.push({kind:'load',load:l,h:ROW_H}))
    }
  }
  if(!teamView)sTracks.forEach((t:any,ti:number)=>{
    const list=onTrack(t),closed=!!view.collapsed[t.id]
    rows.push({kind:'track',track:t,index:ti,count:list.length,closed,h:24})
    if(closed)return
    rows.push({kind:'goals',track:t,h:28})
    pushList(list)
    if(!list.length)rows.push({kind:'hint',text:'No projects yet. Pick a project and set its track.',h:ROW_H})
  })
  if(!teamView&&!sTracks.length)rows.push({kind:'hint',text:'No tracks yet. Add your first one in Strategy settings.',h:ROW_H})
  if(!teamView){
    rows.push({kind:'band',key:'__backlog',label:`BACKLOG · NOT ON A TRACK (${backlog.length})`,closed:!!view.collapsed.__backlog,color:'#3A4A5E',h:22})
    if(!view.collapsed.__backlog)pushList(backlog)
  }
  if(view.showLoad&&!teamView){
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
    const f:any={}
    if('start_date' in fields)f.start_date=fields.start_date
    if('end_date' in fields)f.end_date=fields.end_date
    await upsertRow('epic',id,f)
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
        <div style={{display:'flex',border:'1px solid #243447',borderRadius:6,overflow:'hidden'}}>
          {[['map','Roadmap'],['report','📊 Report']].map(([k,l])=>(
            <button key={k} onClick={()=>setPref('mode',k)} style={{background:view.mode===k?'#C8973A':'#1E3048',color:view.mode===k?'#0D1B2A':'#F4F6F8',border:'none',fontSize:11,fontWeight:700,padding:'5px 10px',cursor:'pointer'}}>{l}</button>
          ))}
        </div>
        <span style={{fontSize:11,color:'#7A8FA6'}}>FY{String(strategy.start_fy).slice(-2)}–FY{String(strategy.end_fy).slice(-2)}</span>
        <div style={{display:'flex',gap:6,fontSize:11}}>
          <Chip color="#D9E2EC" label={`${counts.planned} planned`}/>
          <Chip color={PROPOSED} outline label={`${counts.proposed} proposed`}/>
          <Chip color={SUSTAIN} label={`${counts.sustain} sustain`}/>
          {splitNewPct!=null&&<span title={`Staffed load from this quarter on, split by work type. Target: ${limits.new}% new projects, ${limits.sustain}% sustain.`}
            style={{color:Math.abs(splitNewPct-limits.new)>10?'#D4820A':'#C8C8D4'}}>· split {splitNewPct}/{100-splitNewPct} (target {limits.new}/{limits.sustain})</span>}
          {issues.length>0&&<Chip color="#E74C3C" label={`${issues.length} to check`}/>}
        </div>
        {view.mode!=='report'&&<div style={{display:'flex',alignItems:'center',gap:6}}>
          <select value={view.groupBy} onChange={e=>setPref('groupBy',e.target.value)} title="Group the roadmap by track or by team" style={{background:view.groupBy==='teams'?'#C8973A':'#1E3048',color:view.groupBy==='teams'?'#0D1B2A':'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:11,fontWeight:700,padding:'4px 8px',cursor:'pointer'}}>
            <option value="tracks">Group by tracks</option>
            <option value="teams">Group by teams</option>
          </select>
          <span style={{fontSize:11,color:'#7A8FA6'}}>Sort</span>
          <select value={view.sortBy} onChange={e=>setPref('sortBy',e.target.value)} style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:11,padding:'4px 8px',cursor:'pointer'}}>
            <option value="start_date">Start Date</option>
            <option value="end_date">End Date</option>
            <option value="name">Name</option>
            <option value="rag">RAG Status</option>
          </select>
          <button onClick={()=>setPref('sortDir',view.sortDir==='asc'?'desc':'asc')} title="Sort direction" style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:13,padding:'2px 10px',cursor:'pointer'}}>{view.sortDir==='asc'?'↑':'↓'}</button>
          {!teamView&&<label title="Show each team's planned load per quarter under the roadmap" style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer',whiteSpace:'nowrap' as const}}>
            <input type="checkbox" checked={view.showLoad} onChange={e=>setPref('showLoad',e.target.checked)} style={{accentColor:'#C8973A'}}/>Team load
          </label>}
          <select value={view.snap} onChange={e=>setPref('snap',e.target.value)} title="What dragging snaps to" style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:11,padding:'4px 8px',cursor:'pointer'}}>
            <option value="quarter">Snap to quarters</option>
            <option value="month">Snap to months</option>
          </select>
          <label title="Show each project's epics under it" style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer',whiteSpace:'nowrap' as const}}>
            <input type="checkbox" checked={view.showEpics} onChange={e=>setPref('showEpics',e.target.checked)} style={{accentColor:EPIC}}/>Epics
          </label>
        </div>}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <select value="" disabled={exporting} title="Download as PowerPoint, one slide per strategy" onChange={async e=>{
            const which=e.target.value;if(!which)return
            setExporting(true)
            try{await exportStrategiesPptx({strategies:which==='all'?strategies:[strategy],projects:mainProjects,strategyItems,tracks,goals,deps:allDeps})}
            catch(err:any){alert('Failed to build the PowerPoint: '+(err?.message||err))}
            finally{setExporting(false)}
          }} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,fontWeight:700,padding:'5px 8px',cursor:'pointer'}}>
            <option value="">{exporting?'Building…':'⬇ PowerPoint'}</option>
            <option value="this">This strategy</option>
            <option value="all">All strategies ({strategies.length})</option>
          </select>
          {openAssistant&&<button onClick={()=>openAssistant(`Look at the "${strategy.name}" strategy and draft a Plan A: place the proposed and undated projects by quarter on their tracks, respecting dependencies, the code freeze and team capacity. Keep anything you place as proposed.`)}
            style={{background:'none',border:'1px solid #C8973A',borderRadius:6,color:'#C8973A',fontSize:11,fontWeight:700,padding:'5px 10px',cursor:'pointer'}}>💬 Draft Plan A with the assistant</button>}
          {(()=>{const ch=changesVsMain();const n=ch.rows.length+ch.addDeps.length+ch.dropDeps.length
            return <button onClick={promote} title={n?`${n} difference${n!==1?'s':''} from the main roadmap. Click to copy this strategy onto it.`:'The main roadmap matches this strategy'}
              style={{background:n?'#27AE60':'none',border:'1px solid '+(n?'#27AE60':'#243447'),borderRadius:6,color:n?'#fff':'#7A8FA6',fontSize:11,fontWeight:700,padding:'5px 10px',cursor:'pointer'}}>
              ⇪ Promote to main roadmap{n?` (${n})`:''}</button>})()}
          <button onClick={()=>setSelId(null)} style={{background:!sel&&selId!=='__new'?'#1E3048':'none',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 10px',cursor:'pointer'}}>⚙ Strategy settings</button>
        </div>
      </div>

      {view.mode==='report'?(
        <StrategyReport strategy={strategy} entries={budgetEntries} personMonth={allocation.personMonth} people={people} roles={roles} teams={teams}
          fys={fys} quarters={quarters} scope={view.budgetScope} setScope={(v:string)=>setPref('budgetScope',v)}
          onOpen={(id:any)=>{setPref('mode','map');setSelId(id)}}/>
      ):(
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
                      {!r.teamRow&&<button onClick={()=>moveTrack(r.track.id,-1)} disabled={r.index===0} title="Move track up" style={{...HDR_BTN,opacity:r.index===0?0.3:1}}>▲</button>}
                      {!r.teamRow&&<button onClick={()=>moveTrack(r.track.id,1)} disabled={r.index===sTracks.length-1} title="Move track down" style={{...HDR_BTN,opacity:r.index===sTracks.length-1?0.3:1}}>▼</button>}
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
                if(r.kind==='group'){
                  // A bracket over the group's span: earliest start to latest end of its members
                  const spans=r.members.map((m:any)=>extent(m)).filter(Boolean)
                  const gx0=spans.length?Math.min(...spans.map((x:any)=>x.x0)):null,gx1=spans.length?Math.max(...spans.map((x:any)=>x.x1)):null
                  return(
                    <div key={ri} style={{display:'flex',height:r.h,position:'relative',zIndex:1}}>
                      <div style={{...cellLabel,padding:'0 12px 0 8px',display:'flex',alignItems:'flex-end',gap:5,borderLeft:`3px solid ${GROUP}`}}>
                        <span title={`${r.name}: these run at the same time`} style={{...CLIP,fontSize:9.5,fontWeight:800,color:GROUP,letterSpacing:0.5}}>{r.name.toUpperCase()}</span>
                        <span style={{fontSize:9,color:'#7A8FA6',flexShrink:0}}>· {r.members.length} together</span>
                      </div>
                      <div style={{width:TW,position:'relative'}}>
                        {gx0!=null&&<div title={`${r.name}: ${r.members.map((m:any)=>m.name).join(', ')}`}
                          style={{position:'absolute',left:gx0,width:Math.max(6,gx1!-gx0),bottom:2,height:6,borderTop:`2px solid ${GROUP}`,borderLeft:`2px solid ${GROUP}`,borderRight:`2px solid ${GROUP}`,boxSizing:'border-box' as const,borderRadius:'2px 2px 0 0'}}/>}
                      </div>
                    </div>
                  )
                }
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
                    <div onClick={()=>setSelId(p.id)} style={{...cellLabel,padding:r.epicCount?'0 12px 0 6px':'0 12px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:isSel?'#1E3048':'#0D1B2A',borderLeft:r.inGroup?`3px solid ${GROUP}`:undefined}}>
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
                      {ex&&staffLabel.has(p.id)&&!(drag?.id===p.id)&&(
                        <span title={staffLabel.get(p.id)} style={{position:'absolute',top:7,left:ex.open?ex.x0+8:ex.x1+16,maxWidth:ex.open?Math.max(60,ex.x1-ex.x0-16):undefined,fontSize:9.5,
                          color:ex.open?'#0D1B2A':'#7A8FA6',whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis',pointerEvents:'none',zIndex:2}}>{staffLabel.get(p.id)}</span>
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
            <Legend swatch={{borderTop:`2px solid ${GROUP}`,borderLeft:`2px solid ${GROUP}`,borderRight:`2px solid ${GROUP}`,height:6}} label="Group: runs at the same time"/>
            <Legend swatch={{background:'rgba(255,255,255,0.12)'}} label={`Code freeze (${freeze.map(m=>MONTHS[m-1]).join(', ')||'none'})`}/>
            <span>Drag the dot at a bar&apos;s end onto another bar to add a dependency, and click a line to remove it.</span>
            <span>Drag a bar to move it, or drag its ends to change its start or end. Bars snap to whole {view.snap==='quarter'?'quarters':'months'}.</span>
          </div>
        </div>

        {/* Side panel */}
        <div style={{width:narrow?'100%':(!sel&&!selEpic&&selId!=='__new'&&view.sideTab==='budget'?440:320),maxHeight:narrow?'45%':'none',flexShrink:0,borderLeft:narrow?'none':'1px solid #243447',borderTop:narrow?'1px solid #243447':'none',background:'#0F1C2B',overflowY:'auto'}}>
          {selId==='__new'?(
            <NewStrategy onCreate={async(t:any)=>{await createStrategy(t);setSelId(null)}} onCancel={()=>setSelId(null)}/>
          ):selEpic?(
            <EpicSidePanel key={selEpic.id} epic={selEpic} project={projById(selEpic.project_id)} items={items} base={epicBase(selEpic)} updEpic={updEpic} onClose={()=>setSelId(null)}
              onOpenProject={onOpenProject}/>
          ):sel?(
            <ProjectPanel p={sel} state={state(sel)} tracks={sTracks} groups={[...new Set(live.map(x=>x.group_name).filter(Boolean))].sort()} projects={live} deps={deps} shown={shown} issues={issues.filter(i=>i.id===sel.id)}
              updProject={updProject} addDep={addDep} removeDep={removeDep} keyName={keyName} onClose={()=>setSelId(null)} onOpenProject={onOpenProject}
              staffing={<StaffingSection key={sel.id} project={sel} team={sel.team} teams={teams} rows={rosterOf(sel.id)} custom={!!rowOf('project',sel.id)?.roster_custom}
                people={people} roles={roles} fys={fys} cost={(budgetEntries as any[]).find((x:any)=>x.p.id===sel.id)?.cost}
                overlaps={(personId:string)=>overlapsFor(personId,sel.id,allocation.personMonth,(id:string)=>projById(id)?.name||'another project')}
                onTeam={(t:any)=>updProject(sel.id,{team:t})} onSetSlot={(slot:string,pid:any,cur:any)=>setSlot(sel.id,slot,pid,cur)}
                onAdd={(f:any)=>addRosterRow(sel.id,f)} onRemove={removeRosterRow}/>}/>
          ):(<>
            <div style={{display:'flex',borderBottom:'1px solid #243447',background:'#162436',position:'sticky',top:0,zIndex:2}}>
              {[['settings','⚙ Settings'],['budget','$ Budget']].map(([k,l])=>(
                <button key={k} onClick={()=>setPref('sideTab',k)} style={{flex:1,background:view.sideTab===k?'#0F1C2B':'transparent',color:view.sideTab===k?'#F4F6F8':'#7A8FA6',border:'none',borderBottom:view.sideTab===k?'2px solid #C8973A':'2px solid transparent',padding:'9px 0',fontSize:12,fontWeight:700,cursor:'pointer'}}>{l}</button>
              ))}
            </div>
            {view.sideTab==='budget'?<StrategyBudgetPanel entries={budgetEntries} fys={fys} scope={view.budgetScope} setScope={(v:string)=>setPref('budgetScope',v)} onOpen={(id:any)=>setSelId(id)}/>:
            <SettingsPanel strategy={strategy} tracks={sTracks} projects={live} teams={teams} issues={issues} setSelId={setSelId} duplicateStrategy={duplicateStrategy} resetToMain={resetToMain}
              updStrategy={updStrategy} deleteStrategy={deleteStrategy} addTrack={addTrack} updTrack={updTrack} moveTrack={moveTrack} deleteTrack={deleteTrack}
              updProject={updProject} createProject={createProject}/>}
          </>)}
        </div>
      </div>
      )}
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

// Group: projects that run at the same time, shown together under one bracket
function GroupField({p,groups,projects,updProject}:any){
  const [text,setText]=useState(p.group_name||'')
  const save=()=>{const v=text.trim()||null;if(v!==(p.group_name||null))updProject(p.id,{group_name:v})}
  const others=p.group_name?projects.filter((x:any)=>x.id!==p.id&&x.group_name===p.group_name):[]
  return(
    <div style={SECTION}>
      <div style={H}>GROUP · RUNS AT THE SAME TIME AS</div>
      <div style={{display:'flex',gap:6}}>
        <input list="strategy-groups" value={text} placeholder="No group. Type or pick a name…" onChange={e=>setText(e.target.value)} onBlur={save}
          onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}} style={{...INPUT,flex:1}}/>
        {p.group_name&&<button onClick={()=>{setText('');updProject(p.id,{group_name:null})}} title="Take it out of the group" style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'0 8px',cursor:'pointer'}}>Remove</button>}
        <datalist id="strategy-groups">{groups.map((g:string)=><option key={g} value={g}/>)}</datalist>
      </div>
      {others.length>0&&<div style={{fontSize:10.5,color:'#7A8FA6'}}>With {others.map((x:any)=>x.name).join(', ')}</div>}
      <div style={{fontSize:10,color:'#7A8FA6'}}>Use a group for work that runs side by side, and a dependency only when one really waits on another.</div>
    </div>
  )
}

function ProjectPanel({p,state,tracks,groups=[],projects,deps,shown,issues,updProject,addDep,removeDep,keyName,onClose,onOpenProject,staffing}:any){
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
      {staffing}
      <div style={SECTION}>
        <div style={H}>TRACK</div>
        <select value={tracks.some((t:any)=>t.id===p.track_id)?p.track_id:''} onChange={e=>updProject(p.id,{track_id:e.target.value||null})} style={INPUT}>
          <option value="">Not on a track</option>
          {tracks.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <GroupField key={'g'+p.id} p={p} groups={groups} projects={projects} updProject={updProject}/>
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

function SettingsPanel({strategy,tracks,projects,teams,issues,setSelId,updStrategy,deleteStrategy,addTrack,updTrack,moveTrack,deleteTrack,updProject,createProject,duplicateStrategy,resetToMain}:any){
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
              {i.kind==='dep'?'⛓':i.kind==='freeze'?'❄':i.kind==='staff'?'🧑':'👥'} {i.text}
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
        <div style={{fontSize:10,color:'#7A8FA6',lineHeight:1.5}}>Changes in this strategy stay here until you promote it.{strategy.promoted_at?` Last promoted ${new Date(strategy.promoted_at).toLocaleDateString()}.`:''}</div>
        <button onClick={duplicateStrategy} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#C8C8D4',fontSize:11,padding:'6px 0',cursor:'pointer'}}>⧉ Duplicate to compare options</button>
        <button onClick={resetToMain} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#C8C8D4',fontSize:11,padding:'6px 0',cursor:'pointer'}}>↺ Reset dates to the main roadmap</button>
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
