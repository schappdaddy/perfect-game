'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { MilestoneTypeSelect, useMilestoneTypes, typeColor } from './MilestoneTypes'
import { WT_LABEL, WorkTag, workTypeOfProject, isBug, BugTag, CLOSED_STATUSES } from './WorkTypes'
import { ReadinessPips, ReadinessAudit } from './Readiness'
import { JiraChip } from './JiraLink'

// Monthly releases and quarterly planning of all work (New, Sustain and SaaS deliverable).
// A release is a month ('2026-11'). Each month can have a release date, or be marked as
// having no release (e.g. code freeze). Initiatives, epics and stories carry release_month.
// All epics and stories are planned into a quarter (plan_quarter) and a monthly release; their
// initiative never changes. Tech debt with no initiative is filed under the team's quarterly
// Tech Debt initiative ("FY27 Q4 Tech Debt (CX)") so it's costed as OpEx.

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TERMINAL=CLOSED_STATUSES
const EFFORT_POINTS:any={XS:0.5,S:1,M:2,L:3,XL:5}
const TEAM_SHORT:any={'Consumer Experience':'CX','Operational Efficiency':'OE','Retail Program':'RP'}
const PRI_ORDER:any={P1:1,P2:2,P3:3,P4:4}
// Each kind of work has its own colour on the planning boards, and each team its own tag
const KIND_CLR={initiative:'#C8973A',epic:'#E07B2A',story:'#5DADE2',milestone:'#B07CE0'}
const TEAM_TAG:any={'Consumer Experience':{bg:'#D9E2EC',fg:'#14233A'},'Operational Efficiency':{bg:'#6FA6CB',fg:'#0D1B2A'},'Retail Program':{bg:'#76C7A9',fg:'#0D1B2A'}}
function TeamTag({team}:{team?:string|null}){
  if(!team)return <span title="No team" style={{fontSize:9.5,fontWeight:800,color:'#7A8FA6',border:'1px dashed #3A4A5E',borderRadius:10,padding:'0 6px',flexShrink:0}}>NO TEAM</span>
  const c=TEAM_TAG[team]||{bg:'#3A4A5E',fg:'#F4F6F8'}
  return <span title={team} style={{fontSize:9.5,fontWeight:800,color:c.fg,background:c.bg,borderRadius:10,padding:'1px 7px',flexShrink:0,letterSpacing:0.3}}>{TEAM_SHORT[team]||team}</span>
}
const RT_ICON:any={'Tech Debt':'🔧','Enhancement':'✨','Bug':'🐞'}
const pad=(n:number)=>String(n).padStart(2,'0')

export const monthKeyOf=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`
export const addMonths=(k:string,n:number)=>{const[y,m]=k.split('-').map(Number);const a=y*12+m-1+n;return `${Math.floor(a/12)}-${pad(a%12+1)}`}
export const fmtMonthKey=(k:string)=>{const[y,m]=k.split('-').map(Number);return `${MONTHS[m-1]} ${y}`}
const fmtDay=(iso:string)=>{const[,m,d]=iso.split('-').map(Number);return `${MONTHS[m-1]} ${d}`}
// Fiscal year runs April–March: FY27 = Apr 2026 – Mar 2027
export const fyQuarterOf=(k:string)=>{const[y,m]=k.split('-').map(Number);return m>=4?{fy:y+1,q:Math.floor((m-4)/3)+1}:{fy:y,q:4}}
export const quarterKey=(fy:number,q:number)=>`FY${String(fy).slice(-2)}-Q${q}`
export const quarterLabel=(fy:number,q:number)=>`FY${String(fy).slice(-2)} Q${q}`
export const quarterMonths=(fy:number,q:number)=>{const first=`${fy-1}-04`;return [0,1,2].map(i=>addMonths(first,(q-1)*3+i))}
const lastDay=(k:string)=>{const[y,m]=k.split('-').map(Number);return `${k}-${pad(new Date(y,m,0).getDate())}`}

export const releaseOf=(releases:any[],k:string|null|undefined)=>k?releases.find(r=>r.month===k)||null:null
export function releaseText(releases:any[],k:string){
  const r=releaseOf(releases,k)
  return r?.no_release?'No release':r?.release_date?fmtDay(r.release_date):'Date not set'
}

export async function saveRelease(releases:any[],setReleases:any,month:string,fields:any){
  const cur=releaseOf(releases,month)
  const row={month,release_date:cur?.release_date??null,no_release:cur?.no_release??false,notes:cur?.notes??null,...fields}
  setReleases((prev:any[])=>cur?prev.map(r=>r.month===month?{...r,...row}:r):[...prev,{...row,id:'tmp-'+month}])
  const{data,error}=await supabase.from('releases').upsert(row,{onConflict:'month'}).select().single()
  if(error){alert('Failed to save the release: '+error.message);return}
  if(data)setReleases((prev:any[])=>prev.map(r=>r.month===month?data:r))
}

// Release choices as options: none, then three months back to eighteen ahead
export function releaseOptions(releases:any[],value?:string|null){
  const now=monthKeyOf(new Date())
  const keys:string[]=[];for(let i=-3;i<=18;i++)keys.push(addMonths(now,i))
  if(value&&!keys.includes(value))keys.unshift(value)
  return[{value:'',label:'No release'},...keys.map(k=>({value:k,label:`${fmtMonthKey(k)} · ${releaseText(releases,k)}`,disabled:!!releaseOf(releases,k)?.no_release&&k!==value}))]
}
// Pick a monthly release for an initiative, epic or story
// A quarter picker for epics and stories (plan_quarter): last quarter through two years on
export function QuarterSelect({value,onChange,style}:any){
  const c=fyQuarterOf(monthKeyOf(new Date()))
  const opts:any[]=[];for(let n=-1;n<8;n++){const{fy,q}=nextQ(c.fy,c.q,n);opts.push(quarterKey(fy,q))}
  if(value&&!opts.includes(value))opts.unshift(value)
  const lbl=(k:string)=>k.replace('-',' ')
  return <select value={value||''} onChange={e=>onChange(e.target.value||null)} style={style}>
    <option value="">Not planned</option>{opts.map(k=><option key={k} value={k}>{lbl(k)}</option>)}
  </select>
}
export function ReleaseSelect({value,onChange,releases,style}:any){
  const now=monthKeyOf(new Date())
  const keys:string[]=[];for(let i=-3;i<=18;i++)keys.push(addMonths(now,i))
  if(value&&!keys.includes(value))keys.unshift(value)
  return(
    <select value={value||''} onChange={e=>onChange(e.target.value||null)} style={style}>
      <option value="">No release</option>
      {keys.map(k=>{const r=releaseOf(releases,k);return(
        <option key={k} value={k} disabled={!!r?.no_release&&k!==value}>{fmtMonthKey(k)} · {releaseText(releases,k)}</option>
      )})}
    </select>
  )
}

// Set each month's release date, or mark it as having no release
export function ReleasesManager({releases,setReleases,counts,onClose}:any){
  const now=monthKeyOf(new Date())
  const keys:string[]=[];for(let i=-1;i<=17;i++)keys.push(addMonths(now,i))
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#162436',border:'1px solid #243447',borderRadius:10,width:'min(640px,100%)',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',padding:'14px 18px',borderBottom:'1px solid #243447'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:'#F4F6F8'}}>📦 Monthly releases</div>
            <div style={{fontSize:11,color:'#7A8FA6'}}>One release a month. Set its date, or mark the month as having no release (e.g. code freeze).</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:22,cursor:'pointer'}}>×</button>
        </div>
        <div style={{overflowY:'auto',padding:'6px 18px 14px'}}>
          {keys.map(k=>{const r=releaseOf(releases,k);const{fy,q}=fyQuarterOf(k);const n=counts?.(k)||0;return(
            <div key={k} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'1px solid #1C2C3F',opacity:r?.no_release?0.7:1}}>
              <div style={{width:96}}>
                <div style={{fontSize:13,fontWeight:700,color:'#F4F6F8'}}>{fmtMonthKey(k)}</div>
                <div style={{fontSize:10,color:'#7A8FA6'}}>{quarterLabel(fy,q)}{n?` · ${n} tagged`:''}</div>
              </div>
              <input type="date" value={r?.release_date||''} disabled={!!r?.no_release} min={`${k}-01`} max={lastDay(k)}
                onChange={e=>saveRelease(releases,setReleases,k,{release_date:e.target.value||null})}
                style={{background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'5px 7px',opacity:r?.no_release?0.4:1}}/>
              <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:r?.no_release?'#D4820A':'#7A8FA6',cursor:'pointer',whiteSpace:'nowrap' as const}}>
                <input type="checkbox" checked={!!r?.no_release} onChange={e=>saveRelease(releases,setReleases,k,{no_release:e.target.checked})} style={{accentColor:'#D4820A'}}/>No release
              </label>
              <input defaultValue={r?.notes||''} key={k+(r?.id||'')} placeholder={r?.no_release?'Why (e.g. code freeze)':'Notes'} onBlur={e=>{if((e.target.value||null)!==(r?.notes||null))saveRelease(releases,setReleases,k,{notes:e.target.value||null})}}
                style={{flex:1,minWidth:0,background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'5px 7px'}}/>
            </div>
          )})}
        </div>
      </div>
    </div>
  )
}

// ── Quarter planning for all work ─────────────────────────────────────
// Quarter info from a quarter key ('FY27-Q3') or {fy,q}
const qInfo=(fy:number,q:number)=>{const months=quarterMonths(fy,q);return{fy,q,qk:quarterKey(fy,q),label:quarterLabel(fy,q),months,qStart:`${months[0]}-01`,qEnd:lastDay(months[2])}}
const qFromKey=(k:string|null|undefined)=>{const m=/^FY(\d{2})-Q([1-4])$/.exec(k||'');return m?qInfo(2000+Number(m[1]),Number(m[2])):null}
const nextQ=(fy:number,q:number,n:number)=>{q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}return{fy,q}}

// Two plans for the same work: which quarter it's worked in (plan_quarter), and which
// monthly release it ships in (which can be after the quarter).
export function QuarterPlanner({items,setItems,projects,setProjects,epics=[],setEpics,releases,setReleases,teams,workTypeOf,epicWorkTypeOf,onOpenItem,onOpenEpic,milestones=[],setMilestones,workType='all'}:any){
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const pref=(k:string,d:any)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}}
  const save=(k:string,v:any)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
  const [fq,setFqS]=useState<{fy:number,q:number}>(()=>{const v=pref('pg_plan_q',null);return v?.fy?v:cur})
  const [team,setTeamS]=useState<string>(()=>pref('pg_plan_team2',teams[0]))
  const [mode,setModeS]=useState<'quarters'|'releases'>(()=>pref('pg_plan_mode','quarters'))
  const [hideNoRel,setHideNoRelS]=useState<boolean>(()=>pref('pg_plan_hide_norel2',false))
  const [noInitOnly,setNoInitOnly]=useState(false) // only work with no initiative
  const [poolGroup,setPoolGroupS]=useState<boolean>(()=>pref('pg_plan_poolgroup',true)) // backlog by initiative, or in rank order
  const setPoolGroup=(v:boolean)=>{setPoolGroupS(v);save('pg_plan_poolgroup',v)}
  const wtF:string=workType // the Backlog's work type tab: 'all' | 'new' | 'sustain' | 'saas'
  const [poolTeam,setPoolTeam]=useState(true)
  const [src,setSrcS]=useState<'td'|'init'>(()=>pref('pg_plan_src','td')) // what the left panel lists
  const [msForm,setMsForm]=useState<any>(null) // {col, project_id, name, type, date, min, max}
  const mTypes=useMilestoneTypes()
  const setSrc=(v:any)=>{setSrcS(v);save('pg_plan_src',v)}
  const [dragId,setDragId]=useState<string|null>(null) // 'item:<id>' | 'epic:<id>'
  const [over,setOver]=useState<string|null>(null)
  const [mgr,setMgr]=useState(false)
  const [audit,setAudit]=useState(false)
  // Merge saved readiness fields into local state (ReadinessPips saves them)
  const applyLocal=(kind:string,id:any,f:any)=>kind==='project'?setProjects((p:any[])=>p.map(r=>r.id===id?{...r,...f}:r)):kind==='epic'?setEpics((p:any[])=>p.map(r=>r.id===id?{...r,...f}:r)):setItems((p:any[])=>p.map(r=>r.id===id?{...r,...f}:r))
  const setFq=(v:any)=>{setFqS(v);save('pg_plan_q',v)}
  const setTeam=(v:string)=>{setTeamS(v);save('pg_plan_team2',v)}
  const setMode=(v:any)=>{setModeS(v);save('pg_plan_mode',v)}
  const setHideNoRel=(v:boolean)=>{setHideNoRelS(v);save('pg_plan_hide_norel2',v)}

  // team '__all' shows every team: each quarter then has one Tech Debt initiative per team
  const ALL=team==='__all'||!teams.includes(team)
  const short=ALL?'all teams':TEAM_SHORT[team]||team
  const shortOf=(t:string)=>TEAM_SHORT[t]||t
  const quarters=[0,1,2,3].map(n=>{const{fy,q}=nextQ(fq.fy,fq.q,n);return qInfo(fy,q)})
  const allBuckets=(projects as any[]).filter(p=>p.sustain_quarter)
  const bucketFor=(qk:string,t:string)=>allBuckets.find(p=>p.sustain_quarter===qk&&p.team===t)
  const shownTeams:string[]=ALL?teams:[team]
  const bucketByName=(n:any)=>n?allBuckets.find(p=>p.name===n)||null:null
  const bucketById=(id:any)=>id?allBuckets.find(p=>p.id===id)||null:null
  const open=(x:any)=>!TERMINAL.includes(x.status)&&(x.space||'work')==='work'
  const storiesOf=(e:any)=>(items as any[]).filter(i=>i.epic_id===e.id)
  const epicById=(id:any)=>(epics as any[]).find(e=>e.id===id)

  // Planning says when work is done (its quarter) and when it ships (its release). It never
  // moves work out of its initiative. Only tech debt with no initiative of its own is filed
  // into the quarter's Tech Debt initiative, so it's costed with the team's OpEx.
  type Entry={kind:'item'|'epic'|'project',x:any,key:string,qk:string|null}
  const bucketOf=(kind:string,x:any)=>kind==='epic'?bucketById(x.project_id):kind==='item'?bucketByName(x.parent_project):null
  const qkOf=(kind:string,x:any):string|null=>kind==='project'?(x.plan_quarter||null):(x.plan_quarter||bucketOf(kind,x)?.sustain_quarter||null)
  const ent=(kind:'item'|'epic'|'project',x:any):Entry=>({kind,x,key:`${kind}:${x.id}`,qk:qkOf(kind,x)})
  // The initiative work belongs to (a Tech Debt initiative doesn't count as one)
  const homeOf=(kind:string,x:any)=>{
    const p=kind==='epic'?(projects as any[]).find(p=>p.id===x.project_id):kind==='item'?(projects as any[]).find(p=>p.name===x.parent_project):null
    return p&&!p.sustain_quarter?p:null
  }
  const isTechDebt=(kind:string,x:any)=>!!bucketOf(kind,x)||(!homeOf(kind,x)&&(x.request_type==='Tech Debt'||x.work_type==='sustain'))
  const teamOf=(kind:string,x:any)=>bucketOf(kind,x)?.team||x.team||homeOf(kind,x)?.team||null
  const rank=(a:Entry,b:Entry)=>(a.x.manual_rank??1e9)-(b.x.manual_rank??1e9)||(PRI_ORDER[a.x.priority]||9)-(PRI_ORDER[b.x.priority]||9)||(a.x.created_at||'').localeCompare(b.x.created_at||'')
  const teamOk=(kind:string,x:any)=>{if(ALL)return true;const t=teamOf(kind,x);return !t||t===team}
  // The Backlog's work type tab (All, New, Sustain, SaaS deliverable) applies to the whole board
  const wtOf=(kind:string,x:any)=>kind==='project'?workTypeOfProject(x):kind==='epic'?epicWorkTypeOf(x):workTypeOf(x)
  const wtOk=(kind:string,x:any)=>wtF==='all'||wtOf(kind,x)===wtF
  // A story is planned with its epic (same quarter), so it isn't listed on its own
  const withItsEpic=(i:any)=>{const e=i.epic_id&&epicById(i.epic_id);return !!e&&(e.space||'work')==='work'&&(qkOf('item',i)||null)===(qkOf('epic',e)||null)&&(open(e)||!open(i))}
  const shown=(kind:string,x:any)=>teamOk(kind,x)&&wtOk(kind,x)&&(!noInitOnly||!homeOf(kind,x))
  // The backlog: all open epics and stories with no quarter yet
  const pool:Entry[]=[...(epics as any[]).filter(e=>open(e)&&!qkOf('epic',e)&&(poolTeam||ALL?teamOk('epic',e):true)&&wtOk('epic',e)&&(!noInitOnly||!homeOf('epic',e))).map(e=>ent('epic',e)),
    ...(items as any[]).filter(i=>open(i)&&!qkOf('item',i)&&!withItsEpic(i)&&(poolTeam||ALL?teamOk('item',i):true)&&wtOk('item',i)&&(!noInitOnly||!homeOf('item',i))).map(i=>ent('item',i))].sort(rank)
  // Everything with a quarter
  // Closed work drops off the board (it's on the Done tab)
  const planned:Entry[]=[...(epics as any[]).filter(e=>open(e)&&qkOf('epic',e)&&shown('epic',e)).map(e=>ent('epic',e)),
    ...(items as any[]).filter(i=>open(i)&&qkOf('item',i)&&!withItsEpic(i)&&shown('item',i)).map(i=>ent('item',i))].sort(rank)
  // Initiatives go live in a release
  const INIT_DONE=CLOSED_STATUSES
  const inits=(projects as any[]).filter(p=>!p.sustain_quarter&&(p.space||'work')==='work'&&!INIT_DONE.includes(p.status)&&(ALL||!poolTeam||!p.team||p.team===team)&&wtOk('project',p))
    .sort((a,b)=>(a.start_date||'9999').localeCompare(b.start_date||'9999')||a.name.localeCompare(b.name))
  const initEntries:Entry[]=inits.map(p=>ent('project',p))
  const ptsOf=(en:Entry):number=>en.kind==='item'?(EFFORT_POINTS[en.x.effort]||0)
    :en.kind==='project'?(items as any[]).filter(i=>i.parent_project===en.x.name&&open(i)).reduce((s,i)=>s+(EFFORT_POINTS[i.effort]||0),0)
    :(EFFORT_POINTS[en.x.effort]||storiesOf(en.x).filter(open).reduce((s,i)=>s+(EFFORT_POINTS[i.effort]||0),0))
  const pts=(list:Entry[])=>list.reduce((s,en)=>s+ptsOf(en),0)
  const isBlocked=(k:string)=>!!releaseOf(releases,k)?.no_release

  // Roadmap dates the planner gives work with no initiative of its own: from its quarter's
  // start to its release (or to the end of the quarter while it has none). Dates set by hand,
  // and the dates of initiative work, are kept.
  const datesFor=(qi:any,release:string|null)=>({start_date:qi.qStart,end_date:release?(releaseOf(releases,release)?.release_date||lastDay(release)):qi.qEnd})
  const plannerDated=(x:any,qi:any)=>!x.start_date||(qi&&(x.start_date===qi.qStart||x.start_date===`${qi.months[2]}-01`))||(x.release_month&&x.start_date===`${x.release_month}-01`)

  async function updItem(id:any,fields:any){
    setItems((prev:any[])=>prev.map(i=>i.id===id?{...i,...fields}:i))
    const{error}=await supabase.from('items').update({...fields,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)alert('Failed to save: '+error.message)
  }
  async function updEpic(id:any,fields:any){
    setEpics((prev:any[])=>prev.map(e=>e.id===id?{...e,...fields}:e))
    const{error}=await supabase.from('epics').update(fields).eq('id',id)
    if(error)alert('Failed to save the epic: '+error.message)
  }
  async function updProject(id:any,fields:any){
    setProjects((prev:any[])=>prev.map(p=>p.id===id?{...p,...fields}:p))
    const{error}=await supabase.from('projects').update({...fields,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)alert('Failed to save the initiative: '+error.message)
  }
  // The first month with a release (not a code freeze) from a month on
  const firstOpenFrom=(k:string)=>{for(let n=0;n<18;n++){const m=addMonths(k,n);if(!isBlocked(m))return m}return null}
  // An initiative: the quarter it's worked in, and its go-live release. Planning it into a
  // quarter keeps its release, unless the release is before that quarter: then it moves to
  // the first open release from the quarter on. A release drop sets the go-live and, if it
  // has no quarter yet (or a later one), the quarter of that release.
  async function setInitPlan(en:Entry,{qi,release}:{qi?:any,release?:string|null}){
    const x=en.x,f:any={}
    if(qi===null){f.plan_quarter=null;f.release_month=null}
    else if(qi){
      f.plan_quarter=qi.qk
      if(x.release_month&&x.release_month<qi.months[0])f.release_month=firstOpenFrom(qi.months[0])
    }else if(release!==undefined){
      if(release&&isBlocked(release)){alert(`${fmtMonthKey(release)} has no release. Pick another month, or change it under 📦 Release dates.`);return}
      f.release_month=release
      if(release){const rq=fyQuarterOf(release),rqi=qInfo(rq.fy,rq.q),pq=qFromKey(x.plan_quarter);if(!pq||pq.months[0]>release)f.plan_quarter=rqi.qk}
    }
    if(Object.keys(f).every(k=>(x[k]||null)===(f[k]||null)))return
    await updProject(x.id,f)
  }
  async function createBucket(qi:any,t:string){
    const name=`${qi.label} Tech Debt (${shortOf(t)})`
    const ex=(projects as any[]).find(p=>p.name.toLowerCase()===name.toLowerCase())
    if(ex){alert(`An initiative called "${name}" already exists.`);return null}
    const{data,error}=await supabase.from('projects').insert({name,team:t,status:'Planning',priority:'P2',rag:'Green',color:'#4A5D72',
      description:`Tech debt for ${t}, ${qi.label}. Planned for the quarter, deployed in monthly releases.`,
      start_date:qi.qStart,end_date:qi.qEnd,work_type:'sustain',planning_state:'planned',budget_type:'support',sustain_quarter:qi.qk,space:'work',sort_order:projects.length}).select().single()
    if(error){alert('Failed to create the initiative: '+error.message);return null}
    if(data)setProjects((prev:any[])=>[...prev,data])
    return data
  }
  const findEntry=(key:string|null):Entry|null=>{
    if(!key)return null
    return [...pool,...planned,...initEntries].find(e=>e.key===key)||null
  }
  // Put work in a quarter (null = back to the backlog) and/or a release (undefined = keep).
  async function setPlan(en:Entry,{qi,release}:{qi?:any,release?:string|null}){
    const x=en.x,kind=en.kind
    const fromQ=qFromKey(en.qk)
    let toQ=qi===undefined?fromQ:qi
    // Its quarter follows a new release, except one in the quarter right after (worked this
    // quarter, ships next)
    if(qi===undefined&&release&&fromQ){
      const rq=fyQuarterOf(release),nx=nextQ(fromQ.fy,fromQ.q,1),rk=quarterKey(rq.fy,rq.q)
      if(rk!==fromQ.qk&&rk!==quarterKey(nx.fy,nx.q))toQ=qInfo(rq.fy,rq.q)
    }
    let rel=toQ===null?null:release===undefined?(x.release_month||null):release
    // A release before the quarter it's now worked in moves to the first open one from then on
    if(rel&&toQ&&rel<toQ.months[0])rel=firstOpenFrom(toQ.months[0])
    if(rel&&isBlocked(rel)){alert(`${fmtMonthKey(rel)} has no release. Pick another month, or change it under 📦 Releases.`);return}
    const home=homeOf(kind,x),td=isTechDebt(kind,x)
    // Tech debt with no initiative goes in its team's Tech Debt initiative for the quarter
    let bucket:any=null
    if(td&&toQ){
      const t=bucketOf(kind,x)?.team||x.team||(ALL?null:team)
      if(!t){alert(`"${x.name}" is tech debt with no team. Give it a team, or pick a team at the top, so it goes in that team's Tech Debt initiative.`);return}
      bucket=bucketFor(toQ.qk,t)
      if(!bucket){bucket=await createBucket(toQ,t);if(!bucket)return}
    }
    const dates=(y:any)=>!home&&open(y)&&plannerDated(y,fromQ)?(toQ?datesFor(toQ,rel):{start_date:null,end_date:null}):{}
    const qk=toQ?toQ.qk:null
    let end:string|null=null
    if(kind==='item'){
      const f:any={plan_quarter:qk,release_month:rel,...dates(x)}
      if(td){
        const to=bucket?bucket.name:null
        if(to!==(x.parent_project||null)){f.parent_project=to;f.epic_id=null}
        if(bucket&&!x.work_type)f.work_type=workTypeOf(x)
      }
      await updItem(x.id,f);end=f.end_date||x.end_date
    }else{
      const f:any={plan_quarter:qk,release_month:rel,...dates(x)}
      if(td){f.project_id=bucket?bucket.id:null;if(bucket&&!x.work_type)f.work_type=epicWorkTypeOf(x)}
      await updEpic(x.id,f);end=f.end_date||x.end_date
      // Its stories follow: same quarter; the epic's release unless they had their own
      for(const st of storiesOf(x)){
        if(!open(st)&&!toQ)continue
        const stRel=!st.release_month||st.release_month===x.release_month?rel:st.release_month
        const sf:any={plan_quarter:qk,release_month:toQ?stRel:null}
        if(td){sf.parent_project=bucket?bucket.name:null;if(bucket&&!st.work_type)sf.work_type=workTypeOf(st)}
        if(!home&&open(st)&&plannerDated(st,fromQ))Object.assign(sf,toQ?datesFor(toQ,stRel):{start_date:null,end_date:null})
        await updItem(st.id,sf)
      }
    }
    // A Tech Debt initiative runs until its last release, so a later release extends it
    if(bucket&&end&&bucket.end_date&&end>bucket.end_date){
      setProjects((prev:any[])=>prev.map(p=>p.id===bucket.id?{...p,end_date:end}:p))
      const{error}=await supabase.from('projects').update({end_date:end,updated_at:new Date().toISOString()}).eq('id',bucket.id)
      if(error)alert('Failed to extend the initiative: '+error.message)
    }
  }
  async function reorderPool(en:Entry,beforeKey:string|null){
    const list=pool.filter(p=>p.key!==en.key)
    const at=beforeKey?list.findIndex(p=>p.key===beforeKey):list.length
    list.splice(at<0?list.length:at,0,en)
    const changed=list.map((p,ix)=>({p,r:ix+1})).filter(({p,r})=>p.x.manual_rank!==r)
    setItems((prev:any[])=>prev.map(i=>{const c=changed.find(({p})=>p.kind==='item'&&p.x.id===i.id);return c?{...i,manual_rank:c.r}:i}))
    setEpics((prev:any[])=>prev.map(e=>{const c=changed.find(({p})=>p.kind==='epic'&&p.x.id===e.id);return c?{...e,manual_rank:c.r}:e}))
    for(const{p,r}of changed)await supabase.from(p.kind==='epic'?'epics':'items').update({manual_rank:r}).eq('id',p.x.id)
  }
  // Drops
  const take=()=>{const en=findEntry(dragId);setDragId(null);setOver(null);return en}
  async function dropOnPool(beforeKey:string|null){
    const en=take();if(!en)return
    if(en.kind==='project'){await setInitPlan(en,{qi:null});return}
    if(en.qk)await setPlan(en,{qi:null})
    await reorderPool({...en,qk:null},beforeKey)
  }
  async function dropOnQuarter(qi:any){
    const en=take();if(!en)return
    if(en.kind==='project'){await setInitPlan(en,{qi});return}
    if(en.qk!==qi.qk)await setPlan(en,{qi})
  }
  // Milestones of the initiatives in view, by date
  const msTeamOk=(m:any)=>{if(ALL)return true;const p=(projects as any[]).find(x=>x.id===m.project_id);return !p?.team||p.team===team}
  const msIn=(a:string,b:string)=>(milestones as any[]).filter(m=>m.date&&m.date>=a&&m.date<=b&&(m.space||'work')==='work'&&msTeamOk(m)).sort((x,y)=>x.date.localeCompare(y.date))
  async function addMilestone(){
    const f=msForm
    if(!f?.project_id||!f.name?.trim()||!f.date){alert('Pick an initiative, a name and a date.');return}
    const{data,error}=await supabase.from('milestones').insert({project_id:f.project_id,name:f.name.trim(),date:f.date,type:f.type||'Milestone',completed:false,
      sort_order:(milestones as any[]).filter(m=>m.project_id===f.project_id).length,space:'work'}).select().single()
    if(error){alert('Failed to add the milestone: '+error.message);return}
    if(data)setMilestones?.((prev:any[])=>[...prev,data])
    setMsForm(null)
  }
  async function setMilestoneType(m:any,type:string){
    setMilestones?.((prev:any[])=>prev.map(x=>x.id===m.id?{...x,type}:x))
    const{error}=await supabase.from('milestones').update({type}).eq('id',m.id)
    if(error)alert('Failed to update the milestone: '+error.message)
  }
  async function toggleMilestone(m:any){
    setMilestones?.((prev:any[])=>prev.map(x=>x.id===m.id?{...x,completed:!m.completed}:x))
    const{error}=await supabase.from('milestones').update({completed:!m.completed}).eq('id',m.id)
    if(error)alert('Failed to update the milestone: '+error.message)
  }
  // The milestones block at the top of a quarter or release column, with "+ Milestone"
  const msOptions=(projects as any[]).filter(p=>(p.space||'work')==='work'&&!['Complete','Cancelled','Done'].includes(p.status)&&(ALL||!p.team||p.team===team)).sort((a,b)=>a.name.localeCompare(b.name))
  const msBlock=(col:string,a:string,b:string)=>{
    const list=msIn(a,b),f=msForm?.col===col?msForm:null
    return(
      <div style={{display:'flex',flexDirection:'column',gap:4,margin:'8px 8px 0',padding:'6px 8px',borderRadius:6,background:'rgba(176,124,224,0.10)',border:`1px solid rgba(176,124,224,0.45)`,borderLeft:`3px solid ${KIND_CLR.milestone}`}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:9.5,fontWeight:800,color:KIND_CLR.milestone,letterSpacing:1,whiteSpace:'nowrap' as const}}>◇ MILESTONES{list.length?` · ${list.length}`:''}</span>
          {!f&&setMilestones&&<button onClick={()=>setMsForm({col,project_id:'',name:'',type:'Milestone',date:a,min:a,max:b})} style={{marginLeft:'auto',background:'none',border:`1px solid rgba(176,124,224,0.5)`,borderRadius:4,color:KIND_CLR.milestone,fontSize:10,fontWeight:700,padding:'0 6px',cursor:'pointer',whiteSpace:'nowrap' as const}}>+ Add</button>}
        </div>
        {!list.length&&!f&&<div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic'}}>None in this {col.startsWith('q:')?'quarter':'month'}.</div>}
        {list.map(m=>{const p=(projects as any[]).find(x=>x.id===m.project_id);const[,mm,dd]=m.date.split('-').map(Number);return(
          <div key={m.id} title={`${m.name} · ${m.date}${p?' · '+p.name:''}${m.notes?'\n'+m.notes:''}\nClick to mark ${m.completed?'not done':'done'}`} onClick={()=>toggleMilestone(m)}
            style={{display:'flex',alignItems:'center',gap:5,fontSize:10.5,color:m.completed?'#7A8FA6':'#F4F6F8',cursor:'pointer',textDecoration:m.completed?'line-through':'none'}}>
            <span style={{width:8,height:8,transform:'rotate(45deg)',background:m.completed?'#27AE60':typeColor(mTypes,m.type),flexShrink:0}}/>
            <span style={{fontWeight:700,color:KIND_CLR.milestone,flexShrink:0}}>{MONTHS[mm-1]} {dd}</span>
            <MilestoneTypeSelect value={m.type} onChange={v=>setMilestoneType(m,v)}
              style={{flexShrink:0,background:'transparent',color:typeColor(mTypes,m.type),border:`1px solid ${typeColor(mTypes,m.type)}`,borderRadius:10,fontSize:9.5,fontWeight:800,padding:'0 4px',cursor:'pointer',maxWidth:96}}/>
            {(()=>{const t=(projects as any[]).find(x=>x.id===m.project_id)?.team;return t?<TeamTag team={t}/>:null})()}
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{m.name}{p?<span style={{color:'#7A8FA6'}}> · {p.name}</span>:''}</span>
          </div>
        )})}
        {f?(
          <div onClick={e=>e.stopPropagation()} style={{display:'flex',flexDirection:'column',gap:4,padding:6,border:'1px solid #3A4A5E',borderRadius:5,background:'#162436'}}>
            <select value={f.project_id||''} onChange={e=>setMsForm({...f,project_id:e.target.value})} style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 4px'}}>
              <option value="">Initiative…</option>
              {msOptions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <MilestoneTypeSelect value={f.type||'Milestone'} onChange={v=>setMsForm({...f,type:v})} style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 4px'}}/>
            <input autoFocus value={f.name||''} placeholder="Milestone name" onChange={e=>setMsForm({...f,name:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')addMilestone();if(e.key==='Escape')setMsForm(null)}}
              style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 5px'}}/>
            <input type="date" value={f.date||''} min={f.min} max={f.max} onChange={e=>setMsForm({...f,date:e.target.value})} style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 5px'}}/>
            <div style={{display:'flex',gap:4}}>
              <button onClick={addMilestone} style={{flex:1,background:'#C8973A',border:'none',borderRadius:4,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'3px 0',cursor:'pointer'}}>Add</button>
              <button onClick={()=>setMsForm(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:11,padding:'3px 8px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        ):null}
      </div>
    )
  }
  async function dropOnRelease(month:string|null){
    const en=take();if(!en)return
    if(en.kind==='project'){await setInitPlan(en,{release:month});return}
    if(!en.qk){
      // From the backlog straight to a release: it's worked in the quarter the release is in
      const{fy,q}=month?fyQuarterOf(month):fq
      await setPlan(en,{qi:qInfo(fy,q),release:month});return
    }
    if((en.x.release_month||null)!==month)await setPlan(en,{release:month})
  }

  const btn={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:12,padding:'5px 10px',cursor:'pointer'}
  const seg=(on:boolean)=>({...btn,border:'none',borderRadius:0,fontWeight:700,background:on?'#C8973A':'#1E3048',color:on?'#0D1B2A':'#F4F6F8'})
  // Release choices for a card: the months from its quarter's start through the next quarter
  const releaseChoices=(qi:any)=>{const out:string[]=[];for(let n=0;n<6;n++)out.push(addMonths(qi.months[0],n));return out}
  // A plain render function (not a component), so cards aren't remounted mid-drag
  const card=(en:Entry,o:{idx?:number,relPicker?:boolean,showQuarter?:boolean,grouped?:boolean}={})=>{
    const x=en.x,isEpic=en.kind==='epic'
    if(en.kind==='project')return initCard(en,o)
    const sts=isEpic?storiesOf(x):[],done=sts.filter(i=>!open(i)).length
    const home=homeOf(en.kind,x),bk=bucketOf(en.kind,x)
    const ep=!isEpic&&x.epic_id?epicById(x.epic_id):null
    const qi=qFromKey(en.qk)
    const later=qi&&x.release_month&&x.release_month>qi.months[2]
    const clr=isEpic?KIND_CLR.epic:KIND_CLR.story
    return(
    <div key={en.key} draggable onDragStart={e=>{setDragId(en.key);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setOver(null)}}
      onDragOver={o.idx!=null?e=>{e.preventDefault();e.stopPropagation();setOver('pool:'+en.key)}:undefined}
      onDrop={o.idx!=null?e=>{e.preventDefault();e.stopPropagation();dropOnPool(en.key)}:undefined}
      onClick={()=>isEpic?onOpenEpic?.(x):onOpenItem(x)}
      style={{background:isEpic?'rgba(224,123,42,0.10)':isBug(x)?'rgba(231,76,60,0.08)':'rgba(93,173,226,0.07)',border:`1px solid ${isEpic?'rgba(224,123,42,0.45)':isBug(x)?'rgba(231,76,60,0.45)':'rgba(93,173,226,0.35)'}`,borderLeft:`3px solid ${isBug(x)?'#E74C3C':clr}`,borderTop:over==='pool:'+en.key?'2px solid #C8973A':undefined,borderRadius:6,padding:'6px 8px',cursor:'grab',opacity:dragId===en.key?0.4:1,display:'flex',flexDirection:'column',gap:3}}>
      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const,whiteSpace:'nowrap' as const}}>
        {o.idx!=null&&<span style={{fontSize:10,fontWeight:800,color:'#C8973A',minWidth:16}}>{o.idx+1}</span>}
        {isEpic?<span style={{fontSize:9,fontWeight:800,color:KIND_CLR.epic,letterSpacing:1}}>◆ EPIC</span>
          :isBug(x)?<><BugTag item={x}/><span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{x.item_id}</span></>
          :<><span style={{fontSize:9,fontWeight:800,color:KIND_CLR.story,letterSpacing:1}}>▪ STORY</span><span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{x.item_id}</span><span title={x.request_type} style={{fontSize:11}}>{RT_ICON[x.request_type]||''}</span></>}
        <span style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center'}}><ReadinessPips kind={en.kind==='epic'?'epic':'item'} x={x} apply={f=>applyLocal(en.kind==='epic'?'epic':'item',x.id,f)} size={12}/><JiraChip kind={en.kind==='epic'?'epic':'item'} x={x} apply={f=>applyLocal(en.kind==='epic'?'epic':'item',x.id,f)} size={10}/>{wtF==='all'&&<WorkTag compact wt={wtOf(en.kind,x)}/>}<TeamTag team={teamOf(en.kind,x)}/></span>
        <span style={{fontSize:10,fontWeight:700,color:x.priority==='P1'?'#E74C3C':x.priority==='P2'?'#D4820A':'#7A8FA6'}}>{x.priority}</span>
        {(isEpic?ptsOf(en)>0:!!x.effort)&&<span title={isEpic&&!x.effort?'Effort points of its open stories':undefined} style={{fontSize:10,color:'#7A8FA6',border:'1px solid #3A4A5E',borderRadius:3,padding:'0 4px'}}>{isEpic&&!x.effort?ptsOf(en)+' pts':x.effort}</span>}
      </div>
      <div style={{fontSize:12,color:'#F4F6F8',lineHeight:1.3,fontWeight:isEpic?700:400}}>{x.name}</div>
      {o.showQuarter&&qi&&<div style={{fontSize:10,color:'#C8D4E0'}}>🗓 Worked in <b>{qi.label}</b>{later?<span style={{color:'#5DADE2'}}> · ships after</span>:''}</div>}
      {isEpic&&(()=>{
        // The stories that travel with this epic (same quarter), listed inside it
        const inside=sts.filter(st=>withItsEpic(st)&&open(st)),shownSt=inside.slice(0,6)
        return <div style={{display:'flex',flexDirection:'column',gap:1}}>
          <div style={{fontSize:10,color:'#7A8FA6'}}>{sts.length} stor{sts.length===1?'y':'ies'}{sts.length?` · ${done} done`:''}</div>
          {shownSt.map(st=>(
            <div key={st.id} onClick={e=>{e.stopPropagation();onOpenItem(st)}} title={`${st.item_id||''} ${st.name} · ${st.status}`}
              style={{display:'flex',alignItems:'center',gap:5,fontSize:10.5,padding:'2px 5px',borderLeft:`2px solid ${KIND_CLR.story}`,background:'rgba(93,173,226,0.06)',borderRadius:3,cursor:'pointer',opacity:open(st)?1:0.55}}>
              <span style={{color:isBug(st)?'#E74C3C':KIND_CLR.story,fontWeight:800,fontSize:isBug(st)?9:8.5}}>{isBug(st)?'🐞':'▪'}</span>
              <span style={{color:'#7A8FA6',fontFamily:'monospace',fontSize:9.5,flexShrink:0}}>{st.item_id}</span>
              <span style={{color:'#E1E7EE',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,textDecoration:open(st)?undefined:'line-through'}}>{st.name}</span>
              <span style={{color:'#7A8FA6',fontSize:9,flexShrink:0}}>{st.status}</span>
            </div>
          ))}
          {inside.length>shownSt.length&&<div style={{fontSize:9.5,color:'#7A8FA6',paddingLeft:7}}>+ {inside.length-shownSt.length} more</div>}
        </div>
      })()}
      {o.grouped?(ep&&!isEpic?<div style={{fontSize:10,color:KIND_CLR.epic}}>◆ in epic {ep.name}</div>:null):home?<div style={{fontSize:10,color:'#C8973A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>◈ {home.name}{ep?` › ${ep.name}`:''}</div>
        :bk?<div style={{fontSize:10,color:'#8FA6BC'}}>🔧 {bk.name}</div>
        :isTechDebt(en.kind,x)?<div title="Tech debt with no initiative: planning it into a quarter files it under that quarter's Tech Debt initiative" style={{fontSize:10,color:'#8FA6BC'}}>🔧 Tech debt · no initiative</div>:null}
      {o.relPicker&&qi&&(
        <div onClick={e=>e.stopPropagation()} style={{display:'flex',alignItems:'center',gap:5}}>
          <span style={{fontSize:11}}>📦</span>
          <select value={x.release_month||''} onChange={e=>setPlan(en,{release:e.target.value||null})}
            style={{flex:1,minWidth:0,background:'#0F1C2B',border:`1px solid ${x.release_month?(later?'#2E5A78':'#3A4A5E'):'#243447'}`,borderRadius:4,color:x.release_month?'#5DADE2':'#7A8FA6',fontSize:10.5,padding:'2px 4px',cursor:'pointer'}}>
            <option value="">No release yet</option>
            {[...new Set([...releaseChoices(qi),...(x.release_month?[x.release_month]:[])])].sort().map(k=>(
              <option key={k} value={k} disabled={isBlocked(k)&&k!==x.release_month}>{fmtMonthKey(k)} · {releaseText(releases,k)}{k>qi.months[2]?' (after the quarter)':''}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )}
  // Cards grouped by the initiative they belong to (then Tech debt, then no initiative):
  // an initiative header, its epics (with their stories inside), then its other stories
  const groupsOf=(list:Entry[])=>{
    const m=new Map<string,{key:string,label:string,kind:'init'|'td'|'none',team:any,list:Entry[]}>()
    for(const en of list){
      const h=homeOf(en.kind,en.x),bk=!h&&bucketOf(en.kind,en.x)
      const key=h?'p:'+h.id:bk||isTechDebt(en.kind,en.x)?'td':'none'
      if(!m.has(key))m.set(key,{key,label:h?h.name:key==='td'?'Tech debt':'No initiative',kind:h?'init':key==='td'?'td':'none',team:h?.team||null,list:[]})
      m.get(key)!.list.push(en)
    }
    const order=(g:any)=>g.kind==='init'?0:g.kind==='td'?1:2
    return[...m.values()].sort((a,b)=>order(a)-order(b)||a.label.localeCompare(b.label)).map(g=>({...g,list:[...g.list.filter(e=>e.kind==='epic'),...g.list.filter(e=>e.kind!=='epic')]}))
  }
  const grouped=(list:Entry[],o:any={},idxOf?:(en:Entry)=>number)=>groupsOf(list).map(g=>(
    <div key={g.key} style={{display:'flex',flexDirection:'column',gap:5,borderLeft:`2px solid ${g.kind==='init'?'rgba(200,151,58,0.55)':'#3A4A5E'}`,paddingLeft:6}}>
      <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
        <span style={{fontSize:10.5,fontWeight:800,color:g.kind==='init'?KIND_CLR.initiative:'#8FA6BC',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,flex:1,minWidth:0}}
          title={g.kind==='init'?`Initiative: ${g.label}`:g.kind==='td'?'Tech debt: in a quarterly Tech Debt initiative, or tech debt with no initiative':'Work with no initiative'}>
          {g.kind==='init'?'◈ ':g.kind==='td'?'🔧 ':'○ '}{g.label}</span>
        {g.team&&<TeamTag team={g.team}/>}
        <span style={{fontSize:9.5,color:'#7A8FA6',flexShrink:0}}>{g.list.length}</span>
      </div>
      {g.list.map(en=>card(en,{...o,grouped:true,idx:idxOf?idxOf(en):o.idx}))}
    </div>
  ))
  // An initiative card: releasing the initiative means its go-live is in that release
  function initCard(en:Entry,o:any){
    const p=en.x,eps=(epics as any[]).filter(e=>e.project_id===p.id&&open(e)),sts=(items as any[]).filter(i=>i.parent_project===p.name&&open(i))
    const fmtD=(d:string)=>fmtMonthKey(d.slice(0,7))
    return(
      <div key={en.key} draggable onDragStart={e=>{setDragId(en.key);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setOver(null)}}
        title="Drag onto a quarter to plan when it's worked, or onto a release for its go-live"
        style={{background:'rgba(200,151,58,0.10)',border:'1px solid rgba(200,151,58,0.5)',borderLeft:'3px solid #C8973A',borderRadius:6,padding:'6px 8px',cursor:'grab',opacity:dragId===en.key?0.4:1,display:'flex',flexDirection:'column',gap:3}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:9,fontWeight:800,color:KIND_CLR.initiative,letterSpacing:1,whiteSpace:'nowrap' as const}}>◈ INITIATIVE{o.goLive?' GO-LIVE':''}</span>
          {workTypeOfProject(p)!=='new'&&<WorkTag compact wt={workTypeOfProject(p)}/>}
          <span style={{marginLeft:'auto',display:'flex',gap:5,alignItems:'center'}}>
            <ReadinessPips kind="project" x={p} apply={f=>applyLocal('project',p.id,f)} size={12}/><JiraChip kind="project" x={p} apply={f=>applyLocal('project',p.id,f)} size={10}/>
            {p.release_month&&(!o.goLive||o.relBadge)&&<span style={{fontSize:9.5,fontWeight:700,color:'#5DADE2'}}>📦 {fmtMonthKey(p.release_month)}</span>}
            <TeamTag team={p.team}/>
          </span>
        </div>
        <div style={{fontSize:12,fontWeight:800,color:'#F4F6F8',lineHeight:1.3}}>{p.name}</div>
        <div style={{fontSize:10,color:'#7A8FA6'}}>{p.start_date?`${fmtD(p.start_date)} – ${p.ongoing||!p.end_date?'ongoing':fmtD(p.end_date)}`:'No dates'} · {eps.length} epic{eps.length!==1?'s':''} · {sts.length} stor{sts.length===1?'y':'ies'}</div>
      </div>
    )
  }
  const colBox=(key:string,active:boolean,blocked=false,later=false)=>({display:'flex',flexDirection:'column' as const,minHeight:0,borderRadius:8,
    background:blocked?'repeating-linear-gradient(135deg,#0F1C2B,#0F1C2B 8px,#132234 8px,#132234 16px)':'#0F1C2B',
    border:`1px solid ${over===key?'#C8973A':later?'#2E5A78':active?'#3A4A5E':'#243447'}`})
  const colHead={padding:'8px 10px',borderBottom:'1px solid #243447'}
  const colBody={flex:1,overflowY:'auto' as const,padding:8,display:'flex',flexDirection:'column' as const,gap:6}
  const empty=(t:string)=><div style={{fontSize:10.5,color:'#3A4A5E',fontStyle:'italic',padding:4}}>{t}</div>

  // Releases view: the months from the first quarter shown through the quarter after the last
  const relMonths=(()=>{const out:string[]=[];for(let n=0;n<15;n++)out.push(addMonths(quarters[0].months[0],n));return out})()
  const relCols=relMonths.filter(k=>!(hideNoRel&&isBlocked(k)&&![...planned,...initEntries].some(en=>en.x.release_month===k)))
  const shownQks=new Set(quarters.map(q=>q.qk))
  const inView=(en:Entry)=>shownQks.has(en.qk as string)||relMonths.includes(en.x.release_month)

  // ── PowerPoint: both views as the board shows them (team, work type tab, quarters) ──
  const [exporting,setExporting]=useState(false)
  async function exportPpt(){
    setExporting(true)
    try{
      const[{exportPlanningPptx},{planModel}]=await Promise.all([import('./PlanningPptx'),import('./PlanDeck')])
      const m=planModel({items,epics,projects,releases,milestones,mTypes,start:fq,team:ALL?'__all':team,wt:wtF,teams,workTypeOf,epicWorkTypeOf,hideNoRel})
      const range=`${quarters[0].label} - ${quarters[3].label}`
      const who=ALL?'All teams':team,wtl=wtF==='all'?'All work':(WT_LABEL as any)[wtF]
      await exportPlanningPptx({title:`Planning · ${range}`,subtitle:`${who} · ${wtl} · exported ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`,
        quarters:m.quarterCols,releaseSlides:m.releaseSlides,fileName:`Planning ${range}${ALL?'':' '+shortOf(team)}`})
    }catch(e:any){alert('Failed to export: '+(e?.message||e))}
    setExporting(false)
  }

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,minHeight:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 16px',borderBottom:'1px solid #243447',background:'#162436',flexWrap:'wrap' as const}}>
        <div style={{display:'flex',border:'1px solid #243447',borderRadius:6,overflow:'hidden'}}>
          <button onClick={()=>setMode('quarters')} style={seg(mode==='quarters')} title="Which quarter the work is done in">🗓 Quarters</button>
          <button onClick={()=>setMode('releases')} style={seg(mode==='releases')} title="Which monthly release the work ships in">📦 Releases</button>
        </div>
        <button onClick={()=>setFq(nextQ(fq.fy,fq.q,-1))} style={btn}>‹</button>
        <div style={{fontSize:13,fontWeight:800,color:'#F4F6F8',textAlign:'center' as const}}>{quarters[0].label} – {quarters[3].label}</div>
        <button onClick={()=>setFq(nextQ(fq.fy,fq.q,1))} style={btn}>›</button>
        {(fq.fy!==cur.fy||fq.q!==cur.q)&&<button onClick={()=>setFq(cur)} style={{...btn,color:'#7A8FA6'}}>From this quarter</button>}
        <select value={ALL?'__all':team} onChange={e=>setTeam(e.target.value)} style={btn}><option value="__all">All teams</option>{teams.map((t:string)=><option key={t} value={t}>{t}</option>)}</select>
        {mode==='releases'&&<label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer'}} title="Hide months marked as having no release (e.g. code freeze)">
          <input type="checkbox" checked={hideNoRel} onChange={e=>setHideNoRel(e.target.checked)} style={{accentColor:'#C8973A'}}/>Hide months with no release
        </label>}
        <span style={{display:'flex',gap:10,alignItems:'center',fontSize:10.5,fontWeight:700,marginLeft:mode==='releases'?0:'auto'}}>
          <span style={{color:KIND_CLR.initiative}}>◈ Initiative</span><span style={{color:KIND_CLR.epic}}>◆ Epic</span>
          <span style={{color:KIND_CLR.story}}>▪ Story</span><span style={{color:'#E74C3C'}}>🐞 Bug</span><span style={{color:KIND_CLR.milestone}}>◇ Milestone</span>
        </span>
        <button onClick={()=>setAudit(true)} title="PRD and Design approvals of the work planned in view: the gaps, and every change" style={{...btn,color:'#27AE60',border:'1px solid rgba(39,174,96,0.5)',fontWeight:700}}>✓ Readiness</button>
        <button onClick={()=>setMgr(true)} style={btn}>📦 Release dates</button>
        <button onClick={exportPpt} disabled={exporting} title="Download both views (quarters and releases) as PowerPoint, as shown: same team, work type and quarters"
          style={{...btn,color:'#E07B2A',border:'1px solid rgba(224,123,42,0.5)',fontWeight:700,opacity:exporting?0.6:1}}>{exporting?'Exporting…':'⬇ PPT'}</button>
      </div>
      <div style={{flex:1,display:'flex',minHeight:0,overflow:'auto'}}>
        {/* Sustain backlog */}
        <div onDragOver={e=>{e.preventDefault();if(over!=='pool')setOver(o=>o?.startsWith('pool:')?o:'pool')}} onDrop={e=>{e.preventDefault();dropOnPool(null)}}
          style={{width:280,flexShrink:0,borderRight:'1px solid #243447',display:'flex',flexDirection:'column',background:over==='pool'?'rgba(200,151,58,0.06)':'transparent'}}>
          {<div style={{display:'flex',borderBottom:'1px solid #243447'}}>
            {([['td','Backlog · not planned'],['init','Initiatives']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setSrc(k)} style={{flex:1,background:src===k?'#0F1C2B':'#162436',color:src===k?'#F4F6F8':'#7A8FA6',border:'none',borderBottom:`2px solid ${src===k?'#C8973A':'transparent'}`,fontSize:11,fontWeight:700,padding:'8px 0',cursor:'pointer'}}>{l}</button>
            ))}
          </div>}
          {src==='init'?(<>
            <div style={{padding:'7px 12px',borderBottom:'1px solid #243447'}}>
              <div title="Drag an initiative onto a quarter to plan when it's worked (its go-live release stays, unless it's before that quarter), or onto a release to set its go-live. Its epics and stories are planned from the Backlog tab."
                style={{fontSize:11,fontWeight:800,color:'#C8973A',letterSpacing:1,cursor:'help'}}>INITIATIVES · {inits.length} <span style={{color:'#7A8FA6'}}>ⓘ</span></div>
              <div style={{fontSize:10.5,color:'#7A8FA6',margin:'2px 0 4px'}}>Drag onto a quarter, or a release for its go-live.</div>
              {!ALL&&<label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolTeam} onChange={e=>setPoolTeam(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only {short} and unassigned</label>}
            </div>
            <div style={colBody}>
              {inits.map(p=>initCard(ent('project',p),{}))}
              {!inits.length&&empty('No open initiatives for this team.')}
            </div>
          </>):(<>
          <div style={{padding:'7px 12px',borderBottom:'1px solid #243447'}}>
            <div style={{fontSize:11,fontWeight:800,color:'#8FA6BC',letterSpacing:1}}>NOT PLANNED YET{wtF!=='all'?` · ${(WT_LABEL as any)[wtF].toUpperCase()}`:''} · {(n=>`${n} epic${n!==1?'s':''}`)(pool.filter(en=>en.kind==='epic').length)} · {(n=>`${n} stor${n===1?'y':'ies'}`)(pool.filter(en=>en.kind==='item').length)}</div>
            <div title="All open epics and stories with no quarter yet, in priority order. Drag to reorder, into a quarter, or straight into a release; drag back here to unplan. Planning never moves work out of its initiative. Tech debt with no initiative is filed under the quarter's Tech Debt initiative."
              style={{fontSize:10.5,color:'#7A8FA6',margin:'2px 0 4px',cursor:'help'}}>In priority order. Drag to reorder or plan. <span>ⓘ</span></div>
            {!ALL&&<label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolTeam} onChange={e=>setPoolTeam(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only {short} and unassigned</label>}
            <div style={{display:'flex',border:'1px solid #243447',borderRadius:5,overflow:'hidden',margin:'2px 0 4px',width:'fit-content'}}>
              {([[true,'By initiative'],[false,'Rank order']] as const).map(([v,l])=>(
                <button key={l} onClick={()=>setPoolGroup(v)} title={v?'Grouped under the initiative each item belongs to':'One ranked list: drag to reorder priority'}
                  style={{background:poolGroup===v?'#C8973A':'#1E3048',color:poolGroup===v?'#0D1B2A':'#C8C8D4',border:'none',fontSize:10.5,fontWeight:700,padding:'3px 9px',cursor:'pointer'}}>{l}</button>
              ))}
            </div>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={noInitOnly} onChange={e=>setNoInitOnly(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only work with no initiative</label>
          </div>
          <div style={colBody}>
            {poolGroup?grouped(pool,{},en=>pool.indexOf(en)):pool.map((en,ix)=>card(en,{idx:ix}))}
            {!pool.length&&empty('Nothing waiting to be planned.')}
          </div>
          </>)}
        </div>

        {mode==='quarters'?(
          <div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(4,minmax(220px,1fr))',gap:10,padding:12,minWidth:900,minHeight:0}}>
            {quarters.map(qi=>{
              const list=planned.filter(en=>en.qk===qi.qk),noRel=list.filter(en=>!en.x.release_month).length
              const nTd=list.filter(en=>bucketOf(en.kind,en.x)).length
              // Initiatives going live in this quarter
              // Initiatives worked in this quarter (or, with no quarter, going live in it)
              const ini=initEntries.filter(en=>en.qk===qi.qk||(!en.qk&&qi.months.includes(en.x.release_month)))
              return(
                <div key={qi.qk} onDragOver={e=>{e.preventDefault();setOver('q:'+qi.qk)}} onDragLeave={()=>setOver(o=>o==='q:'+qi.qk?null:o)} onDrop={e=>{e.preventDefault();dropOnQuarter(qi)}}
                  style={colBox('q:'+qi.qk,qi.qk===quarterKey(cur.fy,cur.q))}>
                  <div style={colHead}>
                    <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                      <span style={{fontSize:13,fontWeight:800,color:'#F4F6F8'}}>{qi.label}</span>
                      <span style={{fontSize:10.5,color:'#7A8FA6'}}>{fmtMonthKey(qi.months[0]).slice(0,3)}–{fmtMonthKey(qi.months[2])}</span>
                      {qi.qk===quarterKey(cur.fy,cur.q)&&<span style={{fontSize:9,fontWeight:800,color:'#C8973A',marginLeft:'auto'}}>NOW</span>}
                    </div>
                    {shownTeams.map(t=>{const b=bucketFor(qi.qk,t);return b?<div key={t} title="Tech debt with no initiative planned this quarter is filed here" style={{fontSize:10.5,color:'#8FA6BC',marginTop:2}}>🔧 {b.name}</div>:null})}
                    <div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{list.length} planned{nTd?<span style={{color:'#8FA6BC'}}> · {nTd} tech debt</span>:''}{ini.length?<span style={{color:'#C8973A'}}> · {ini.length} go-live{ini.length!==1?'s':''}</span>:''} · {pts(list)} pts{noRel?<span style={{color:'#D4820A'}}> · {noRel} without a release</span>:''}</div>
                  </div>
                  {msBlock('q:'+qi.qk,qi.qStart,qi.qEnd)}
                  <div style={colBody}>
                    {ini.map(en=>initCard(en,{goLive:qi.months.includes(en.x.release_month),relBadge:true}))}
                    {list.length>0&&ini.length>0&&<div style={{fontSize:9.5,fontWeight:800,color:'#8FA6BC',letterSpacing:0.8,marginTop:2}}>EPICS & STORIES, BY INITIATIVE</div>}
                    {grouped(list,{relPicker:true})}
                    {!list.length&&!ini.length&&empty('Drag work here.')}
                  </div>
                </div>
              )
            })}
          </div>
        ):(
          <div style={{flex:1,display:'grid',gridTemplateColumns:`minmax(200px,1fr) ${relCols.map(k=>isBlocked(k)&&![...planned,...initEntries].some(en=>en.x.release_month===k)?'84px':'minmax(210px,1fr)').join(' ')}`,gap:8,padding:12,minHeight:0,overflowX:'auto'}}>
            {(()=>{const list=planned.filter(en=>!en.x.release_month&&shownQks.has(en.qk as string));return(
              <div onDragOver={e=>{e.preventDefault();setOver('r:none')}} onDragLeave={()=>setOver(o=>o==='r:none'?null:o)} onDrop={e=>{e.preventDefault();dropOnRelease(null)}} style={colBox('r:none',false)}>
                <div style={colHead}>
                  <div style={{fontSize:12,fontWeight:800,color:'#F4F6F8'}}>Planned, not in a release yet</div>
                  <div style={{fontSize:10.5,color:'#7A8FA6'}}>Planned in {quarters[0].label}–{quarters[3].label}</div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{list.length} · {pts(list)} pts</div>
                </div>
                <div style={colBody}>{grouped(list,{showQuarter:true})}{!list.length&&empty('Everything planned has a release.')}</div>
              </div>
            )})()}
            {relCols.map(k=>{
              const td=planned.filter(en=>en.x.release_month===k&&inView(en))
              const ini=initEntries.filter(en=>en.x.release_month===k)
              const list=[...ini,...td],blocked=isBlocked(k),slim=blocked&&!list.length
              const r=releaseOf(releases,k),{fy,q}=fyQuarterOf(k)
              return(
                <div key={k} onDragOver={e=>{e.preventDefault();setOver('r:'+k)}} onDragLeave={()=>setOver(o=>o==='r:'+k?null:o)} onDrop={e=>{e.preventDefault();dropOnRelease(k)}} style={colBox('r:'+k,false,blocked)}>
                  <div style={colHead}>
                    <div style={{fontSize:9,fontWeight:800,color:'#7A8FA6',letterSpacing:0.6}}>{quarterLabel(fy,q)}</div>
                    <div style={{fontSize:12,fontWeight:800,color:blocked?'#7A8FA6':'#F4F6F8'}}>{slim?fmtMonthKey(k):`${fmtMonthKey(k)} release`}</div>
                    <div style={{fontSize:10.5,color:blocked?'#D4820A':r?.release_date?'#C8973A':'#7A8FA6'}}>{blocked?`No release${r?.notes&&!slim?' · '+r.notes:''}`:releaseText(releases,k)}</div>
                    {!slim&&<div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{ini.length?<span style={{color:'#C8973A'}}>{ini.length} go-live{ini.length!==1?'s':''} · </span>:''}{td.length} planned · {pts(list)} pts</div>}
                  </div>
                  {!slim&&msBlock('r:'+k,`${k}-01`,lastDay(k))}
                  <div style={colBody}>{ini.map(en=>initCard(en,{goLive:true}))}{grouped(td,{showQuarter:true})}{!list.length&&!slim&&empty('Drag planned work here.')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {audit&&<ReadinessAudit onClose={()=>setAudit(false)}
        onOpen={(k:any,x:any)=>{setAudit(false);if(k==='epic')onOpenEpic?.(x);else if(k==='item')onOpenItem(x)}}
        rows={[...quarters.flatMap(qi=>initEntries.filter(en=>en.qk===qi.qk||(!en.qk&&qi.months.includes(en.x.release_month))).map(en=>({kind:'project' as const,x:en.x,where:qi.label,team:en.x.team}))),
          ...planned.filter(en=>shownQks.has(en.qk as string)&&open(en.x)).map(en=>({kind:(en.kind==='epic'?'epic':'item') as any,x:en.x,where:`${qFromKey(en.qk)?.label}${homeOf(en.kind,en.x)?` · ${homeOf(en.kind,en.x).name}`:''}`,team:teamOf(en.kind,en.x)}))]}/>}
      {mgr&&<ReleasesManager releases={releases} setReleases={setReleases} onClose={()=>setMgr(false)}
        counts={(k:string)=>[...items,...projects,...epics].filter((x:any)=>x.release_month===k).length}/>}
    </div>
  )
}

// ── Release calendar (Roadmap) ───────────────────────────────────────────────
// A fiscal year as quarter rows of monthly releases, each listing what ships in it, grouped
// by initiative: go-lives, epics and stories (tech debt initiatives shown as such).
export function ReleaseCalendar({releases,projects,epics=[],items,team='All',onOpenProject,onSetDates,onSetRelease}:any){
  // Move work to another release: drag a go-live, epic or story onto another month, or use ↔
  const [drag,setDrag]=useState<any>(null),[over,setOver]=useState<string|null>(null)
  const movable=!!onSetRelease
  const dragProps=(kind:string,x:any)=>movable?{draggable:true,onDragStart:(e:any)=>{e.stopPropagation();setDrag({kind,x});e.dataTransfer.effectAllowed='move'},onDragEnd:()=>{setDrag(null);setOver(null)}}:{}
  const mover=(kind:string,x:any)=>movable?(
    <span onClick={e=>e.stopPropagation()} title="Move to another release" style={{position:'relative',display:'inline-flex',marginLeft:4,color:'#5B6B7E',fontSize:10,cursor:'pointer'}}>↔
      <select value={x.release_month||''} onChange={e=>onSetRelease(kind,x,e.target.value||null)} style={{position:'absolute',inset:0,opacity:0,cursor:'pointer',width:'100%'}}>
        {releaseOptions(releases,x.release_month).map((o:any)=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select></span>):null
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const now=monthKeyOf(new Date())
  const [fy,setFyS]=useState<number>(()=>{try{return Number(localStorage.getItem('pg_rc_fy'))||cur.fy}catch{return cur.fy}})
  const [hideNoRel,setHideS]=useState<boolean>(()=>{try{return localStorage.getItem('pg_rc_hide')==='1'}catch{return false}})
  const setFy=(v:number)=>{setFyS(v);try{localStorage.setItem('pg_rc_fy',String(v))}catch{}}
  const setHide=(v:boolean)=>{setHideS(v);try{localStorage.setItem('pg_rc_hide',v?'1':'0')}catch{}}
  const inTeam=(x:any)=>team==='All'||x.team===team
  const work=(x:any)=>(x.space||'work')==='work'
  const projById=(id:any)=>(projects as any[]).find(p=>p.id===id)
  const projByName=(n:any)=>(projects as any[]).find(p=>p.name===n)
  const epicById=(id:any)=>(epics as any[]).find(e=>e.id===id)

  function monthPlan(k:string){
    const groups=new Map<string,{p:any,goLive:boolean,epics:any[],stories:any[]}>()
    const g=(p:any)=>{const key=p?.id||'__none';if(!groups.has(key))groups.set(key,{p,goLive:false,epics:[],stories:[]});return groups.get(key)!}
    // Closed work and finished initiatives are left out (they're on the Done tab)
    for(const p of projects as any[])if(p.release_month===k&&work(p)&&!TERMINAL.includes(p.status)&&inTeam(p))g(p).goLive=true
    for(const e of epics as any[])if(e.release_month===k&&work(e)&&!TERMINAL.includes(e.status)&&inTeam({team:e.team||projById(e.project_id)?.team}))g(projById(e.project_id)).epics.push(e)
    for(const i of items as any[]){
      if(i.release_month!==k||!work(i)||TERMINAL.includes(i.status)||!inTeam(i))continue
      const ep=i.epic_id&&epicById(i.epic_id)
      if(ep&&ep.release_month===k)continue // goes out with its epic
      g(projByName(i.parent_project)).stories.push(i)
    }
    // Go-lives first, then initiatives, then tech debt, then work with no initiative
    return[...groups.values()].sort((a,b)=>(Number(b.goLive)-Number(a.goLive))||(Number(!!a.p?.sustain_quarter)-Number(!!b.p?.sustain_quarter))||(Number(!a.p)-Number(!b.p))||(a.p?.name||'').localeCompare(b.p?.name||''))
  }
  const storiesOf=(e:any)=>(items as any[]).filter(i=>i.epic_id===e.id)
  const btn={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:12,padding:'5px 10px',cursor:'pointer'}

  return(
    <div style={{flex:1,overflow:'auto',padding:'14px 18px 30px',background:'#0D1B2A'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
        <button onClick={()=>setFy(fy-1)} style={btn}>‹</button>
        <div style={{fontSize:15,fontWeight:800,color:'#F4F6F8',minWidth:60,textAlign:'center' as const}}>FY{String(fy).slice(-2)}</div>
        <button onClick={()=>setFy(fy+1)} style={btn}>›</button>
        {fy!==cur.fy&&<button onClick={()=>setFy(cur.fy)} style={{...btn,color:'#7A8FA6'}}>This year</button>}
        <span style={{fontSize:11,color:'#7A8FA6'}}>Apr {fy-1} – Mar {fy}{team!=='All'?` · ${team}`:''}</span>
        <label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer'}}>
          <input type="checkbox" checked={hideNoRel} onChange={e=>setHide(e.target.checked)} style={{accentColor:'#C8973A'}}/>Hide months with no release
        </label>
        {onSetDates&&<button onClick={onSetDates} style={btn}>📦 Set dates</button>}
      </div>
      <div style={{display:'flex',gap:14,fontSize:10.5,color:'#7A8FA6',marginBottom:12,flexWrap:'wrap' as const}}>
        <span><b style={{color:'#C8973A'}}>◈ GO-LIVE</b> initiative goes live</span>
        <span><b style={{color:'#E07B2A'}}>◆</b> epic</span>
        <span><b style={{color:'#8FA6BC'}}>⟳ Tech debt</b> quarterly tech debt initiative</span>
        <span>Stories going out with their epic are counted under it.</span>
        {movable&&<span style={{color:'#5DADE2'}}>Drag a go-live, epic or story to another month (or use ↔) to change its release.</span>}
      </div>
      {[1,2,3,4].map(q=>{
        const months=quarterMonths(fy,q).filter(k=>!(hideNoRel&&releaseOf(releases,k)?.no_release))
        if(!months.length)return null
        return(
          <div key={q} style={{display:'flex',gap:10,marginBottom:12}}>
            <div style={{width:34,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#162436',border:'1px solid #243447',borderRadius:8,writingMode:'vertical-rl' as const,transform:'rotate(180deg)',fontSize:11,fontWeight:800,color:'#7A8FA6',letterSpacing:1}}>Q{q} FY{String(fy).slice(-2)}</div>
            <div style={{flex:1,display:'grid',gridTemplateColumns:`repeat(${months.length},minmax(240px,1fr))`,gap:10}}>
              {months.map(k=>{
                const r=releaseOf(releases,k),blocked=!!r?.no_release,plan=blocked?[]:monthPlan(k)
                const nIni=plan.filter(x=>x.goLive).length,nEp=plan.reduce((s,x)=>s+x.epics.length,0),nSt=plan.reduce((s,x)=>s+x.stories.length,0)
                return(
                  <div key={k} onDragOver={e=>{if(drag&&!blocked){e.preventDefault();setOver(k)}}} onDragLeave={()=>setOver(o=>o===k?null:o)}
                    onDrop={e=>{e.preventDefault();const d=drag;setDrag(null);setOver(null);if(d&&!blocked&&d.x.release_month!==k)onSetRelease(d.kind,d.x,k)}}
                    style={{background:blocked?'repeating-linear-gradient(135deg,#0F1C2B,#0F1C2B 8px,#132234 8px,#132234 16px)':over===k?'rgba(93,173,226,0.08)':'#0F1C2B',border:`1px solid ${over===k?'#5DADE2':k===now?'#C8973A':'#243447'}`,borderRadius:8,display:'flex',flexDirection:'column',minHeight:150}}>
                    <div style={{padding:'9px 12px',borderBottom:'1px solid #243447',display:'flex',alignItems:'baseline',gap:8}}>
                      <span style={{fontSize:14,fontWeight:800,color:blocked?'#7A8FA6':'#F4F6F8'}}>{fmtMonthKey(k)}</span>
                      {k===now&&<span style={{fontSize:9,fontWeight:800,color:'#C8973A'}}>NOW</span>}
                      <span style={{marginLeft:'auto',fontSize:11,fontWeight:700,color:blocked?'#D4820A':r?.release_date?'#5DADE2':'#7A8FA6',background:r?.release_date&&!blocked?'rgba(93,173,226,0.12)':'transparent',borderRadius:10,padding:'1px 8px'}}>
                        {blocked?'No release':r?.release_date?`📦 ${releaseText(releases,k)}`:'Date not set'}
                      </span>
                    </div>
                    {blocked?<div style={{padding:12,fontSize:11,color:'#7A8FA6'}}>{r?.notes||'Nothing ships this month.'}</div>:(
                      <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:8,flex:1}}>
                        {plan.length>0&&<div style={{fontSize:10,color:'#7A8FA6'}}>{nIni?`${nIni} go-live${nIni!==1?'s':''} · `:''}{nEp} epic{nEp!==1?'s':''} · {nSt} stor{nSt===1?'y':'ies'}</div>}
                        {plan.map(x=>{
                          const td=!!x.p?.sustain_quarter
                          return(
                            <div key={x.p?.id||'__none'} style={{borderLeft:`3px solid ${x.goLive?'#C8973A':td?'#4A5D72':x.p?'#3A4A5E':'#243447'}`,paddingLeft:8,display:'flex',flexDirection:'column',gap:2}}>
                              <div style={{display:'flex',alignItems:'center',gap:6,cursor:movable&&x.goLive&&x.p?'grab':undefined}} {...(x.goLive&&x.p?dragProps('project',x.p):{})}>
                                {x.goLive&&<span style={{fontSize:9,fontWeight:800,color:'#0D1B2A',background:'#C8973A',borderRadius:3,padding:'0 5px'}}>◈ GO-LIVE</span>}
                                {td&&<span style={{fontSize:9,fontWeight:800,color:'#C8D4E0',background:'#4A5D72',borderRadius:3,padding:'0 5px'}}>⟳ TECH DEBT</span>}
                                <span onClick={()=>x.p&&onOpenProject?.(x.p)} title={x.p?'Open this initiative':undefined}
                                  style={{fontSize:12,fontWeight:700,color:x.p?'#F4F6F8':'#7A8FA6',cursor:x.p&&onOpenProject?'pointer':'default'}}>{x.p?.name||'No initiative'}</span>
                                {x.goLive&&x.p&&mover('project',x.p)}
                              </div>
                              {x.epics.map((e:any)=>{const n=storiesOf(e).length;return(
                                <div key={e.id} {...dragProps('epic',e)} style={{fontSize:11,color:'#C8C8D4',cursor:movable?'grab':undefined}}><span style={{color:'#E07B2A'}}>◆</span> {e.name}{n?<span style={{color:'#7A8FA6'}}> · {n} stor{n===1?'y':'ies'}</span>:''}{mover('epic',e)}</div>
                              )})}
                              {x.stories.map((i:any)=>(
                                <div key={i.id} {...dragProps('item',i)} style={{fontSize:11,color:'#A9B8C9',cursor:movable?'grab':undefined}}><span style={{color:'#7A8FA6',fontFamily:'monospace',fontSize:10}}>{i.item_id}</span> {i.name}{mover('item',i)}</div>
                              ))}
                            </div>
                          )
                        })}
                        {!plan.length&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic'}}>Nothing tagged to this release yet.</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
