'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Monthly releases and quarterly sustain planning.
// A release is a month ('2026-11'). Each month can have a release date, or be marked as
// having no release (e.g. code freeze). Initiatives, epics and stories carry release_month.
// Tech debt / OpEx is planned per quarter and team as a sustain initiative ("FY27 Q4 Tech
// Debt (CX)"); sustain stories are ranked in a pool, pulled into that quarter's initiative,
// then slotted into the quarter's monthly releases.

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TERMINAL=['Done','Will Not Implement',"Won't Do"]
const EFFORT_POINTS:any={XS:0.5,S:1,M:2,L:3,XL:5}
const TEAM_SHORT:any={'Consumer Experience':'CX','Operational Efficiency':'OE','Retail Program':'RP'}
const PRI_ORDER:any={P1:1,P2:2,P3:3,P4:4}
const RT_ICON:any={'Bug':'🐞','Tech Debt':'🔧','Enhancement':'✨','Strategic Initiative':'🎯','Business Request':'💼','Testing':'🧪'}
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

// Pick a monthly release for an initiative, epic or story
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

// ── Quarter planning for tech debt / OpEx ─────────────────────────────────────
// Quarter info from a quarter key ('FY27-Q3') or {fy,q}
const qInfo=(fy:number,q:number)=>{const months=quarterMonths(fy,q);return{fy,q,qk:quarterKey(fy,q),label:quarterLabel(fy,q),months,qStart:`${months[0]}-01`,qEnd:lastDay(months[2])}}
const qFromKey=(k:string|null|undefined)=>{const m=/^FY(\d{2})-Q([1-4])$/.exec(k||'');return m?qInfo(2000+Number(m[1]),Number(m[2])):null}
const nextQ=(fy:number,q:number,n:number)=>{q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}return{fy,q}}

// Two plans for the same work: which quarter it's worked in (the quarter's tech debt
// initiative), and which monthly release it ships in (which can be after the quarter).
export function QuarterPlanner({items,setItems,projects,setProjects,epics=[],setEpics,releases,setReleases,teams,workTypeOf,epicWorkTypeOf,onOpenItem,onOpenEpic}:any){
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const pref=(k:string,d:any)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}}
  const save=(k:string,v:any)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
  const [fq,setFqS]=useState<{fy:number,q:number}>(()=>{const v=pref('pg_plan_q',null);return v?.fy?v:cur})
  const [team,setTeamS]=useState<string>(()=>pref('pg_plan_team2',teams[0]))
  const [mode,setModeS]=useState<'quarters'|'releases'>(()=>pref('pg_plan_mode','quarters'))
  const [hideNoRel,setHideNoRelS]=useState<boolean>(()=>pref('pg_plan_hide_norel2',false))
  const [poolAll,setPoolAll]=useState(false) // include sustain work that already sits in another initiative
  const [poolTeam,setPoolTeam]=useState(true)
  const [src,setSrcS]=useState<'td'|'init'>(()=>pref('pg_plan_src','td')) // Releases view: what the left panel lists
  const [openInits,setOpenInits]=useState<Record<string,boolean>>({})
  const setSrc=(v:any)=>{setSrcS(v);save('pg_plan_src',v)}
  const [dragId,setDragId]=useState<string|null>(null) // 'item:<id>' | 'epic:<id>'
  const [over,setOver]=useState<string|null>(null)
  const [mgr,setMgr]=useState(false)
  const setFq=(v:any)=>{setFqS(v);save('pg_plan_q',v)}
  const setTeam=(v:string)=>{setTeamS(v);save('pg_plan_team2',v)}
  const setMode=(v:any)=>{setModeS(v);save('pg_plan_mode',v)}
  const setHideNoRel=(v:boolean)=>{setHideNoRelS(v);save('pg_plan_hide_norel2',v)}

  const short=TEAM_SHORT[team]||team
  const quarters=[0,1,2,3].map(n=>{const{fy,q}=nextQ(fq.fy,fq.q,n);return qInfo(fy,q)})
  const teamBuckets=(projects as any[]).filter(p=>p.sustain_quarter&&p.team===team)
  const bucketFor=(qk:string)=>teamBuckets.find(p=>p.sustain_quarter===qk)
  const bucketNames=new Set((projects as any[]).filter(p=>p.sustain_quarter).map(p=>p.name))
  const bucketIds=new Set((projects as any[]).filter(p=>p.sustain_quarter).map(p=>p.id))
  const projectNames=new Set((projects as any[]).map(p=>p.name))
  const projectIds=new Set((projects as any[]).map(p=>p.id))
  const open=(x:any)=>!TERMINAL.includes(x.status)&&(x.space||'work')==='work'
  const storiesOf=(e:any)=>(items as any[]).filter(i=>i.epic_id===e.id)

  // Work is planned as epics or stories. A story that belongs to an epic moves with it, so it
  // isn't listed on its own wherever its epic is.
  type Entry={kind:'item'|'epic'|'project',x:any,key:string,bucket:any}
  const ent=(kind:'item'|'epic'|'project',x:any,bucket:any=null):Entry=>({kind,x,key:`${kind}:${x.id}`,bucket})
  const rank=(a:Entry,b:Entry)=>(a.x.manual_rank??1e9)-(b.x.manual_rank??1e9)||(PRI_ORDER[a.x.priority]||9)-(PRI_ORDER[b.x.priority]||9)||(a.x.created_at||'').localeCompare(b.x.created_at||'')
  const teamOk=(x:any)=>!poolTeam||!x.team||x.team===team
  const poolEpics=(epics as any[]).filter(e=>open(e)&&epicWorkTypeOf(e)==='sustain'&&!bucketIds.has(e.project_id)
    &&(poolAll||!e.project_id||!projectIds.has(e.project_id))&&teamOk(e))
  const plannedEpics=(epics as any[]).filter(e=>teamBuckets.some(b=>b.id===e.project_id)&&(e.space||'work')==='work')
  const coveredByEpic=new Set([...poolEpics,...(epics as any[]).filter(e=>bucketIds.has(e.project_id))].map(e=>e.id))
  const poolItems=(items as any[]).filter(i=>open(i)&&workTypeOf(i)==='sustain'&&!bucketNames.has(i.parent_project)&&!coveredByEpic.has(i.epic_id)
    &&(poolAll||!i.parent_project||!projectNames.has(i.parent_project))&&teamOk(i))
  const pool:Entry[]=[...poolEpics.map(e=>ent('epic',e)),...poolItems.map(i=>ent('item',i))].sort(rank)
  // Everything planned into this team's quarters, wherever it ships
  const planned:Entry[]=[...plannedEpics.map(e=>ent('epic',e,teamBuckets.find(b=>b.id===e.project_id))),
    ...(items as any[]).filter(i=>(i.space||'work')==='work'&&!coveredByEpic.has(i.epic_id)).map(i=>({i,b:teamBuckets.find(b=>b.name===i.parent_project)})).filter(({b})=>b).map(({i,b})=>ent('item',i,b))].sort(rank)
  // Initiative work released in the same monthly releases (its initiative and dates are its own)
  const INIT_DONE=['Complete','Cancelled','Done']
  const inits=(projects as any[]).filter(p=>!p.sustain_quarter&&(p.space||'work')==='work'&&!INIT_DONE.includes(p.status)&&(!poolTeam||!p.team||p.team===team))
    .sort((a,b)=>(a.start_date||'9999').localeCompare(b.start_date||'9999')||a.name.localeCompare(b.name))
  const initIds=new Set(inits.map(p=>p.id)),initNames=new Set(inits.map(p=>p.name))
  const initEpics=(epics as any[]).filter(e=>initIds.has(e.project_id)&&open(e))
  const initItems=(items as any[]).filter(i=>initNames.has(i.parent_project)&&open(i))
  const epicById=(id:any)=>(epics as any[]).find(e=>e.id===id)
  const initEntries:Entry[]=[...inits.map(p=>ent('project',p)),...initEpics.map(e=>ent('epic',e)),...initItems.map(i=>ent('item',i))]
  const initKeys=new Set(initEntries.map(e=>e.key))
  // A story going out with its epic isn't listed again under the same release
  const withEpic=(i:any)=>{const e=i.epic_id&&epicById(i.epic_id);return !!e&&initIds.has(e.project_id)&&(e.release_month||null)===(i.release_month||null)}
  const ptsOf=(en:Entry):number=>en.kind==='item'?(EFFORT_POINTS[en.x.effort]||0)
    :en.kind==='project'?initItems.filter(i=>i.parent_project===en.x.name).reduce((s,i)=>s+(EFFORT_POINTS[i.effort]||0),0)
    :(EFFORT_POINTS[en.x.effort]||storiesOf(en.x).filter(open).reduce((s,i)=>s+(EFFORT_POINTS[i.effort]||0),0))
  const pts=(list:Entry[])=>list.reduce((s,en)=>s+ptsOf(en),0)
  const isBlocked=(k:string)=>!!releaseOf(releases,k)?.no_release

  // Roadmap dates the planner gives work: from its quarter's start to its release (or to the
  // end of the quarter while it has none). Dates set by hand are kept.
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
  // Initiative work only gets a release; its initiative and dates stay as planned
  async function setRelease(en:Entry,month:string|null){
    if(month&&isBlocked(month)){alert(`${fmtMonthKey(month)} has no release. Pick another month, or change it under 📦 Release dates.`);return}
    const x=en.x
    if((x.release_month||null)===month)return
    if(en.kind==='project')await updProject(x.id,{release_month:month})
    else if(en.kind==='item')await updItem(x.id,{release_month:month})
    else{
      await updEpic(x.id,{release_month:month})
      for(const st of storiesOf(x))if(open(st)&&(!st.release_month||st.release_month===x.release_month))await updItem(st.id,{release_month:month})
    }
  }
  async function createBucket(qi:any){
    const name=`${qi.label} Tech Debt (${short})`
    const ex=(projects as any[]).find(p=>p.name.toLowerCase()===name.toLowerCase())
    if(ex){alert(`An initiative called "${name}" already exists.`);return null}
    const{data,error}=await supabase.from('projects').insert({name,team,status:'Planning',priority:'P2',rag:'Green',color:'#4A5D72',
      description:`Tech debt and OpEx for ${team}, ${qi.label}. Planned for the quarter, deployed in monthly releases.`,
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
    const x=en.x
    const fromQ=en.bucket?qFromKey(en.bucket.sustain_quarter):null
    const toQ=qi===undefined?fromQ:qi
    const rel=toQ===null?null:release===undefined?(x.release_month||null):release
    if(rel&&isBlocked(rel)){alert(`${fmtMonthKey(rel)} has no release. Pick another month, or change it under 📦 Releases.`);return}
    if(rel&&toQ&&rel<toQ.months[0]&&!confirm(`${fmtMonthKey(rel)} is before ${toQ.label} starts. Ship it then anyway?`))return
    let bucket=toQ?bucketFor(toQ.qk):null
    if(toQ&&!bucket){bucket=await createBucket(toQ);if(!bucket)return}
    const fromName=en.kind==='epic'?(projects as any[]).find(p=>p.id===x.project_id)?.name:x.parent_project
    if(bucket&&!en.bucket&&fromName&&projectNames.has(fromName)&&!confirm(`"${x.name}" is in "${fromName}". Move it to "${bucket.name}"?`))return
    const dates=(y:any)=>open(y)&&plannerDated(y,fromQ)?(toQ?datesFor(toQ,rel):{start_date:null,end_date:null}):{}
    let end:string|null=null
    if(en.kind==='item'){
      const f:any={parent_project:bucket?bucket.name:null,release_month:rel,...dates(x)}
      if(bucket?.name!==x.parent_project)f.epic_id=null
      await updItem(x.id,f);end=f.end_date||x.end_date
    }else{
      const f:any={project_id:bucket?bucket.id:null,release_month:rel,...dates(x)}
      await updEpic(x.id,f);end=f.end_date||x.end_date
      // Its stories follow: same initiative; the epic's release unless they had their own
      for(const st of storiesOf(x)){
        const stRel=!st.release_month||st.release_month===x.release_month?rel:st.release_month
        const sf:any={parent_project:bucket?bucket.name:null,release_month:toQ?stRel:(open(st)?null:st.release_month)}
        if(open(st)&&plannerDated(st,fromQ))Object.assign(sf,toQ?datesFor(toQ,stRel):{start_date:null,end_date:null})
        await updItem(st.id,sf)
      }
    }
    // A quarter's initiative runs until its last release, so a later release extends it
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
    if(initKeys.has(en.key)){await setRelease(en,null);return}
    if(en.bucket)await setPlan(en,{qi:null})
    await reorderPool({...en,bucket:null},beforeKey)
  }
  async function dropOnQuarter(qi:any){const en=take();if(en&&!initKeys.has(en.key)&&en.bucket?.sustain_quarter!==qi.qk)await setPlan(en,{qi})}
  async function dropOnRelease(month:string|null){
    const en=take();if(!en)return
    if(initKeys.has(en.key)){await setRelease(en,month);return}
    if(!en.bucket){
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
  const card=(en:Entry,o:{idx?:number,showFrom?:boolean,relPicker?:boolean,showQuarter?:boolean}={})=>{
    const x=en.x,isEpic=en.kind==='epic'
    if(en.kind==='project')return initCard(en,o)
    const isInit=initKeys.has(en.key)
    const sts=isEpic?storiesOf(x):[],done=sts.filter(i=>!open(i)).length
    const from=isEpic?(projects as any[]).find(p=>p.id===x.project_id)?.name:x.parent_project
    const ep=!isEpic&&x.epic_id?epicById(x.epic_id):null
    const qi=en.bucket?qFromKey(en.bucket.sustain_quarter):null
    const later=qi&&x.release_month&&x.release_month>qi.months[2]
    return(
    <div key={en.key} draggable onDragStart={e=>{setDragId(en.key);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setOver(null)}}
      onDragOver={o.idx!=null?e=>{e.preventDefault();e.stopPropagation();setOver('pool:'+en.key)}:undefined}
      onDrop={o.idx!=null?e=>{e.preventDefault();e.stopPropagation();dropOnPool(en.key)}:undefined}
      onClick={()=>isEpic?onOpenEpic?.(x):onOpenItem(x)}
      style={{background:isEpic?'rgba(224,123,42,0.10)':'#1E3048',border:`1px solid ${isEpic?'rgba(224,123,42,0.45)':'#2A3D55'}`,borderLeft:isEpic?'3px solid #E07B2A':isInit?'3px solid #C8973A':undefined,borderTop:over==='pool:'+en.key?'2px solid #C8973A':undefined,borderRadius:6,padding:'6px 8px',cursor:'grab',opacity:dragId===en.key?0.4:1,display:'flex',flexDirection:'column',gap:3}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        {o.idx!=null&&<span style={{fontSize:10,fontWeight:800,color:'#C8973A',minWidth:16}}>{o.idx+1}</span>}
        {isEpic?<span style={{fontSize:9,fontWeight:800,color:'#E07B2A',letterSpacing:1}}>◆ EPIC</span>
          :<><span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{x.item_id}</span><span title={x.request_type} style={{fontSize:11}}>{RT_ICON[x.request_type]||''}</span></>}
        <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,color:x.priority==='P1'?'#E74C3C':x.priority==='P2'?'#D4820A':'#7A8FA6'}}>{x.priority}</span>
        {(isEpic?ptsOf(en)>0:!!x.effort)&&<span title={isEpic&&!x.effort?'Effort points of its open stories':undefined} style={{fontSize:10,color:'#7A8FA6',border:'1px solid #3A4A5E',borderRadius:3,padding:'0 4px'}}>{isEpic&&!x.effort?ptsOf(en)+' pts':x.effort}</span>}
      </div>
      <div style={{fontSize:12,color:'#F4F6F8',lineHeight:1.3,fontWeight:isEpic?700:400}}>{x.name}</div>
      {o.showQuarter&&qi&&<div style={{fontSize:10,color:'#C8D4E0'}}>🗓 Worked in <b>{qi.label}</b>{later?<span style={{color:'#5DADE2'}}> · ships after</span>:''}</div>}
      {isEpic&&<div style={{fontSize:10,color:'#7A8FA6'}}>{sts.length} stor{sts.length===1?'y':'ies'}{sts.length?` · ${done} done`:''}</div>}
      {(o.showFrom||isInit)&&from&&<div style={{fontSize:10,color:isInit?'#C8973A':'#7A8FA6'}}>{isInit?'◈ ':'In '}{from}{ep?` › ${ep.name}`:''}</div>}
      {!poolTeam&&o.idx!=null&&x.team&&<div style={{fontSize:10,color:'#7A8FA6'}}>{TEAM_SHORT[x.team]||x.team}</div>}
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
  // An initiative card: releasing the initiative means its go-live is in that release
  function initCard(en:Entry,o:any){
    const p=en.x,eps=initEpics.filter(e=>e.project_id===p.id),sts=initItems.filter(i=>i.parent_project===p.name)
    const fmtD=(d:string)=>fmtMonthKey(d.slice(0,7))
    return(
      <div key={en.key} draggable onDragStart={e=>{setDragId(en.key);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setOver(null)}}
        title="Drag onto a release: the initiative goes live in it"
        style={{background:'rgba(200,151,58,0.10)',border:'1px solid rgba(200,151,58,0.5)',borderLeft:'3px solid #C8973A',borderRadius:6,padding:'6px 8px',cursor:'grab',opacity:dragId===en.key?0.4:1,display:'flex',flexDirection:'column',gap:3}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:9,fontWeight:800,color:'#C8973A',letterSpacing:1}}>◈ INITIATIVE{o.goLive?' GO-LIVE':''}</span>
          {p.work_type==='sustain'&&<span style={{fontSize:9,color:'#C8D4E0',background:'#4A5D72',borderRadius:3,padding:'0 4px'}}>SUSTAIN</span>}
          {p.release_month&&!o.goLive&&<span style={{marginLeft:'auto',fontSize:9.5,fontWeight:700,color:'#5DADE2'}}>📦 {fmtMonthKey(p.release_month)}</span>}
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
  const inView=(en:Entry)=>shownQks.has(en.bucket?.sustain_quarter)||relMonths.includes(en.x.release_month)

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,minHeight:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'1px solid #243447',background:'#162436',flexWrap:'wrap' as const}}>
        <div style={{display:'flex',border:'1px solid #243447',borderRadius:6,overflow:'hidden'}}>
          <button onClick={()=>setMode('quarters')} style={seg(mode==='quarters')} title="Which quarter the work is done in">🗓 Quarters</button>
          <button onClick={()=>setMode('releases')} style={seg(mode==='releases')} title="Which monthly release the work ships in">📦 Releases</button>
        </div>
        <button onClick={()=>setFq(nextQ(fq.fy,fq.q,-1))} style={btn}>‹</button>
        <div style={{fontSize:13,fontWeight:800,color:'#F4F6F8',textAlign:'center' as const}}>{quarters[0].label} – {quarters[3].label}</div>
        <button onClick={()=>setFq(nextQ(fq.fy,fq.q,1))} style={btn}>›</button>
        {(fq.fy!==cur.fy||fq.q!==cur.q)&&<button onClick={()=>setFq(cur)} style={{...btn,color:'#7A8FA6'}}>From this quarter</button>}
        <select value={team} onChange={e=>setTeam(e.target.value)} style={btn}>{teams.map((t:string)=><option key={t} value={t}>{t}</option>)}</select>
        {mode==='releases'&&<label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer'}} title="Hide months marked as having no release (e.g. code freeze)">
          <input type="checkbox" checked={hideNoRel} onChange={e=>setHideNoRel(e.target.checked)} style={{accentColor:'#C8973A'}}/>Hide months with no release
        </label>}
        <button onClick={()=>setMgr(true)} style={{...btn,marginLeft:mode==='releases'?0:'auto'}}>📦 Release dates</button>
      </div>
      <div style={{flex:1,display:'flex',minHeight:0,overflow:'auto'}}>
        {/* Sustain backlog */}
        <div onDragOver={e=>{e.preventDefault();if(over!=='pool')setOver(o=>o?.startsWith('pool:')?o:'pool')}} onDrop={e=>{e.preventDefault();dropOnPool(null)}}
          style={{width:280,flexShrink:0,borderRight:'1px solid #243447',display:'flex',flexDirection:'column',background:over==='pool'?'rgba(200,151,58,0.06)':'transparent'}}>
          {mode==='releases'&&<div style={{display:'flex',borderBottom:'1px solid #243447'}}>
            {([['td','Tech debt backlog'],['init','Initiative work']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setSrc(k)} style={{flex:1,background:src===k?'#0F1C2B':'#162436',color:src===k?'#F4F6F8':'#7A8FA6',border:'none',borderBottom:`2px solid ${src===k?'#C8973A':'transparent'}`,fontSize:11,fontWeight:700,padding:'8px 0',cursor:'pointer'}}>{l}</button>
            ))}
          </div>}
          {mode==='releases'&&src==='init'?(<>
            <div style={{padding:'10px 12px',borderBottom:'1px solid #243447'}}>
              <div style={{fontSize:11,fontWeight:800,color:'#C8973A',letterSpacing:1}}>INITIATIVE WORK · {inits.length}</div>
              <div style={{fontSize:10.5,color:'#7A8FA6',margin:'3px 0 6px'}}>Open initiatives and their epics and stories not in a release yet. Drag an initiative (its go-live), an epic or a story onto a release. Only the release changes; dates stay with the initiative. Drag back here to take it out.</div>
              <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolTeam} onChange={e=>setPoolTeam(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only {short} and unassigned</label>
            </div>
            <div style={colBody}>
              {inits.map(p=>{
                const eps=initEpics.filter(e=>e.project_id===p.id&&!e.release_month)
                const sts=initItems.filter(i=>i.parent_project===p.name&&!i.release_month&&!(i.epic_id&&eps.some(e=>e.id===i.epic_id)))
                const n=eps.length+sts.length,isOpen=!!openInits[p.id]
                return(
                  <div key={p.id} style={{display:'flex',flexDirection:'column',gap:5}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <button onClick={()=>setOpenInits(s=>({...s,[p.id]:!s[p.id]}))} disabled={!n} title={n?`${isOpen?'Hide':'Show'} ${n} epic${n!==1?'s':''} or stor${n===1?'y':'ies'} without a release`:'Everything here has a release'}
                        style={{background:'none',border:'none',color:n?'#C8973A':'#3A4A5E',cursor:n?'pointer':'default',fontSize:11,width:16,padding:0}}>{isOpen?'▾':'▸'}</button>
                      <div style={{flex:1,minWidth:0}}>{initCard(ent('project',p),{})}</div>
                    </div>
                    {isOpen&&<div style={{display:'flex',flexDirection:'column',gap:5,paddingLeft:20}}>
                      {eps.map(e=>card(ent('epic',e)))}
                      {sts.map(i=>card(ent('item',i)))}
                    </div>}
                    {!isOpen&&n>0&&<div style={{fontSize:10,color:'#7A8FA6',paddingLeft:22,marginTop:-2}}>{n} to place</div>}
                  </div>
                )
              })}
              {!inits.length&&empty('No open initiatives for this team.')}
            </div>
          </>):(<>
          <div style={{padding:'10px 12px',borderBottom:'1px solid #243447'}}>
            <div style={{fontSize:11,fontWeight:800,color:'#8FA6BC',letterSpacing:1}}>SUSTAIN BACKLOG · {poolEpics.length} epic{poolEpics.length!==1?'s':''} · {poolItems.length} stor{poolItems.length===1?'y':'ies'}</div>
            <div style={{fontSize:10.5,color:'#7A8FA6',margin:'3px 0 6px'}}>Open Sustain epics and stories, in priority order. Drag to reorder, into a quarter, or straight into a release. Drag back here to unplan.</div>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolTeam} onChange={e=>setPoolTeam(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only {short} and unassigned</label>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolAll} onChange={e=>setPoolAll(e.target.checked)} style={{accentColor:'#C8973A'}}/>Include ones already in other initiatives</label>
          </div>
          <div style={colBody}>
            {pool.map((en,ix)=>card(en,{idx:ix,showFrom:true}))}
            {!pool.length&&empty('Nothing waiting. Mark epics or stories as Sustain (work type) to plan them here.')}
          </div>
          </>)}
        </div>

        {mode==='quarters'?(
          <div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(4,minmax(220px,1fr))',gap:10,padding:12,minWidth:900,minHeight:0}}>
            {quarters.map(qi=>{
              const b=bucketFor(qi.qk),list=planned.filter(en=>en.bucket?.sustain_quarter===qi.qk),noRel=list.filter(en=>!en.x.release_month).length
              return(
                <div key={qi.qk} onDragOver={e=>{e.preventDefault();setOver('q:'+qi.qk)}} onDragLeave={()=>setOver(o=>o==='q:'+qi.qk?null:o)} onDrop={e=>{e.preventDefault();dropOnQuarter(qi)}}
                  style={colBox('q:'+qi.qk,qi.qk===quarterKey(cur.fy,cur.q))}>
                  <div style={colHead}>
                    <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                      <span style={{fontSize:13,fontWeight:800,color:'#F4F6F8'}}>{qi.label}</span>
                      <span style={{fontSize:10.5,color:'#7A8FA6'}}>{fmtMonthKey(qi.months[0]).slice(0,3)}–{fmtMonthKey(qi.months[2])}</span>
                      {qi.qk===quarterKey(cur.fy,cur.q)&&<span style={{fontSize:9,fontWeight:800,color:'#C8973A',marginLeft:'auto'}}>NOW</span>}
                    </div>
                    {b?<div style={{fontSize:10.5,color:'#C8973A',marginTop:2}}>{b.name}</div>
                      :<button onClick={()=>createBucket(qi)} style={{marginTop:4,background:'none',border:'1px dashed #3A4A5E',borderRadius:5,color:'#7A8FA6',fontSize:10.5,padding:'2px 8px',cursor:'pointer'}}>+ Create {qi.label} Tech Debt ({short})</button>}
                    <div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{list.length} planned · {pts(list)} pts{noRel?<span style={{color:'#D4820A'}}> · {noRel} without a release</span>:''}</div>
                  </div>
                  <div style={colBody}>
                    {list.map(en=>card(en,{relPicker:true}))}
                    {!list.length&&empty(b?'Drag epics or stories here.':'Drag work here; the initiative is created for you.')}
                  </div>
                </div>
              )
            })}
          </div>
        ):(
          <div style={{flex:1,display:'grid',gridTemplateColumns:`minmax(200px,1fr) ${relCols.map(k=>isBlocked(k)&&![...planned,...initEntries].some(en=>en.x.release_month===k)?'84px':'minmax(170px,1fr)').join(' ')}`,gap:8,padding:12,minHeight:0,overflowX:'auto'}}>
            {(()=>{const list=planned.filter(en=>!en.x.release_month&&shownQks.has(en.bucket?.sustain_quarter));return(
              <div onDragOver={e=>{e.preventDefault();setOver('r:none')}} onDragLeave={()=>setOver(o=>o==='r:none'?null:o)} onDrop={e=>{e.preventDefault();dropOnRelease(null)}} style={colBox('r:none',false)}>
                <div style={colHead}>
                  <div style={{fontSize:12,fontWeight:800,color:'#F4F6F8'}}>Tech debt not in a release yet</div>
                  <div style={{fontSize:10.5,color:'#7A8FA6'}}>Planned in {quarters[0].label}–{quarters[3].label}</div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{list.length} · {pts(list)} pts</div>
                </div>
                <div style={colBody}>{list.map(en=>card(en,{showQuarter:true}))}{!list.length&&empty('Everything planned has a release.')}</div>
              </div>
            )})()}
            {relCols.map(k=>{
              const td=planned.filter(en=>en.x.release_month===k&&inView(en))
              const ini=initEntries.filter(en=>en.x.release_month===k&&!(en.kind==='item'&&withEpic(en.x)))
              const list=[...ini.filter(en=>en.kind==='project'),...ini.filter(en=>en.kind!=='project'),...td],blocked=isBlocked(k),slim=blocked&&!list.length
              const r=releaseOf(releases,k),{fy,q}=fyQuarterOf(k)
              return(
                <div key={k} onDragOver={e=>{e.preventDefault();setOver('r:'+k)}} onDragLeave={()=>setOver(o=>o==='r:'+k?null:o)} onDrop={e=>{e.preventDefault();dropOnRelease(k)}} style={colBox('r:'+k,false,blocked)}>
                  <div style={colHead}>
                    <div style={{fontSize:9,fontWeight:800,color:'#7A8FA6',letterSpacing:0.6}}>{quarterLabel(fy,q)}</div>
                    <div style={{fontSize:12,fontWeight:800,color:blocked?'#7A8FA6':'#F4F6F8'}}>{slim?fmtMonthKey(k):`${fmtMonthKey(k)} release`}</div>
                    <div style={{fontSize:10.5,color:blocked?'#D4820A':r?.release_date?'#C8973A':'#7A8FA6'}}>{blocked?`No release${r?.notes&&!slim?' · '+r.notes:''}`:releaseText(releases,k)}</div>
                    {!slim&&<div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{ini.length?<span style={{color:'#C8973A'}}>{ini.length} from initiatives · </span>:''}{td.length} tech debt · {pts(list)} pts</div>}
                  </div>
                  <div style={colBody}>{list.map(en=>en.kind==='project'?initCard(en,{goLive:true}):card(en,{showQuarter:true}))}{!list.length&&!slim&&empty('Drag planned work here.')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {mgr&&<ReleasesManager releases={releases} setReleases={setReleases} onClose={()=>setMgr(false)}
        counts={(k:string)=>[...items,...projects,...epics].filter((x:any)=>x.release_month===k).length}/>}
    </div>
  )
}
