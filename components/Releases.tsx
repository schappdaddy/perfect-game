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
export function QuarterPlanner({items,setItems,projects,setProjects,epics=[],setEpics,releases,setReleases,teams,workTypeOf,epicWorkTypeOf,onOpenItem,onOpenEpic}:any){
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const [fq,setFq]=useState<{fy:number,q:number}>(()=>{try{const v=JSON.parse(localStorage.getItem('pg_plan_q')||'null');if(v?.fy)return v}catch{}return cur})
  const [team,setTeamState]=useState<string>(()=>{try{return localStorage.getItem('pg_plan_team')||teams[0]}catch{return teams[0]}})
  const [poolAll,setPoolAll]=useState(false) // include sustain work that already sits in another initiative
  const [poolTeam,setPoolTeam]=useState(true)
  const [hideNoRel,setHideNoRelState]=useState<boolean>(()=>{try{return localStorage.getItem('pg_plan_hide_norel')==='1'}catch{return false}})
  const [dragId,setDragId]=useState<string|null>(null) // 'item:<id>' | 'epic:<id>'
  const [over,setOver]=useState<string|null>(null)
  const [mgr,setMgr]=useState(false)
  const setQ=(v:any)=>{setFq(v);try{localStorage.setItem('pg_plan_q',JSON.stringify(v))}catch{}}
  const setTeam=(v:string)=>{setTeamState(v);try{localStorage.setItem('pg_plan_team',v)}catch{}}
  const setHideNoRel=(v:boolean)=>{setHideNoRelState(v);try{localStorage.setItem('pg_plan_hide_norel',v?'1':'0')}catch{}}
  const step=(n:number)=>{let{fy,q}=fq;q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}setQ({fy,q})}

  const qk=quarterKey(fq.fy,fq.q),months=quarterMonths(fq.fy,fq.q)
  const qStart=`${months[0]}-01`,qEnd=lastDay(months[2])
  const short=TEAM_SHORT[team]||team
  const bucket=(projects as any[]).find(p=>p.sustain_quarter===qk&&p.team===team)
  const bucketNames=new Set((projects as any[]).filter(p=>p.sustain_quarter).map(p=>p.name))
  const bucketIds=new Set((projects as any[]).filter(p=>p.sustain_quarter).map(p=>p.id))
  const projectNames=new Set((projects as any[]).map(p=>p.name))
  const projectIds=new Set((projects as any[]).map(p=>p.id))
  const open=(x:any)=>!TERMINAL.includes(x.status)&&(x.space||'work')==='work'
  const storiesOf=(e:any)=>(items as any[]).filter(i=>i.epic_id===e.id)
  // Work is planned as epics or stories. A story that belongs to an epic moves with it, so it
  // isn't listed on its own wherever its epic is.
  type Entry={kind:'item'|'epic',x:any,key:string}
  const ent=(kind:'item'|'epic',x:any):Entry=>({kind,x,key:`${kind}:${x.id}`})
  const rank=(a:Entry,b:Entry)=>(a.x.manual_rank??1e9)-(b.x.manual_rank??1e9)||(PRI_ORDER[a.x.priority]||9)-(PRI_ORDER[b.x.priority]||9)||(a.x.created_at||'').localeCompare(b.x.created_at||'')
  const teamOk=(x:any)=>!poolTeam||!x.team||x.team===team
  const poolEpics=(epics as any[]).filter(e=>open(e)&&epicWorkTypeOf(e)==='sustain'&&!bucketIds.has(e.project_id)
    &&(poolAll||!e.project_id||!projectIds.has(e.project_id))&&teamOk(e))
  const bucketEpics=bucket?(epics as any[]).filter(e=>e.project_id===bucket.id&&(e.space||'work')==='work'):[]
  const coveredByEpic=new Set([...poolEpics,...bucketEpics,...(epics as any[]).filter(e=>bucketIds.has(e.project_id))].map(e=>e.id))
  const poolItems=(items as any[]).filter(i=>open(i)&&workTypeOf(i)==='sustain'&&!bucketNames.has(i.parent_project)&&!coveredByEpic.has(i.epic_id)
    &&(poolAll||!i.parent_project||!projectNames.has(i.parent_project))&&teamOk(i))
  const pool:Entry[]=[...poolEpics.map(e=>ent('epic',e)),...poolItems.map(i=>ent('item',i))].sort(rank)
  const inBucket:Entry[]=bucket?[...bucketEpics.map(e=>ent('epic',e)),
    ...(items as any[]).filter(i=>i.parent_project===bucket.name&&(i.space||'work')==='work'&&!bucketEpics.some(e=>e.id===i.epic_id)).map(i=>ent('item',i))].sort(rank):[]
  const ptsOf=(en:Entry)=>en.kind==='item'?(EFFORT_POINTS[en.x.effort]||0)
    :(EFFORT_POINTS[en.x.effort]||storiesOf(en.x).filter(open).reduce((s,i)=>s+(EFFORT_POINTS[i.effort]||0),0))
  const pts=(list:Entry[])=>list.reduce((s,en)=>s+ptsOf(en),0)
  // Work planned in a quarter often ships later (worked in Nov–Dec, released in Jan), so the
  // release columns run through the following quarter too, plus any later release already used
  const relMonths=[...new Set([...months,...[1,2,3].map(n=>addMonths(months[2],n)),...inBucket.map(en=>en.x.release_month).filter((k:any)=>k&&k>months[0])])].sort()
  const isBlocked=(k:string)=>k!=='__q'&&!!releaseOf(releases,k)?.no_release
  const colItems=(k:string)=>inBucket.filter(en=>k==='__q'?!relMonths.includes(en.x.release_month):en.x.release_month===k)
  const cols=[{key:'__q',label:'In the quarter',sub:'Not in a release yet',later:false},...relMonths.map(k=>({key:k,label:`${fmtMonthKey(k)} release`,sub:releaseText(releases,k),later:!months.includes(k)}))]
    .filter(c=>!(hideNoRel&&isBlocked(c.key)&&!colItems(c.key).length))
  const hiddenCount=relMonths.filter(k=>isBlocked(k)&&!colItems(k).length).length
  // Roadmap dates the planner gives work in each column: the whole quarter while it waits;
  // the release's month for a release in the quarter; for a later release, from the quarter's
  // last month (when the work is done) to the release
  const autoDates=(col:string|null)=>{
    if(!col||col==='__q')return{start_date:qStart,end_date:qEnd}
    const end=releaseOf(releases,col)?.release_date||lastDay(col)
    return{start_date:months.includes(col)?`${col}-01`:`${months[2]}-01`,end_date:end}
  }
  // Dates set by hand are kept; dates this planner set follow the work to its new column
  const plannerDated=(x:any,inThisBucket:boolean)=>!!x.start_date&&((x.release_month&&x.start_date===`${x.release_month}-01`)||(inThisBucket&&x.start_date===autoDates(x.release_month).start_date))

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
  async function createBucket(){
    const name=`${quarterLabel(fq.fy,fq.q)} Tech Debt (${short})`
    if((projects as any[]).some(p=>p.name.toLowerCase()===name.toLowerCase())){alert(`An initiative called "${name}" already exists.`);return}
    const{data,error}=await supabase.from('projects').insert({name,team,status:'Planning',priority:'P2',rag:'Green',color:'#4A5D72',
      description:`Tech debt and OpEx for ${team}, ${quarterLabel(fq.fy,fq.q)}. Planned for the quarter, deployed in its monthly releases.`,
      start_date:qStart,end_date:qEnd,work_type:'sustain',planning_state:'planned',budget_type:'support',sustain_quarter:qk,space:'work',sort_order:projects.length}).select().single()
    if(error){alert('Failed to create the initiative: '+error.message);return}
    if(data)setProjects((prev:any[])=>[...prev,data])
  }
  const findEntry=(key:string|null):Entry|null=>{
    if(!key)return null
    const[kind,id]=key.split(':')
    const x=kind==='epic'?(epics as any[]).find(e=>e.id===id):(items as any[]).find(i=>i.id===id)
    return x?ent(kind as any,x):null
  }
  // A story's move into a column (or out to the pool when col is null)
  function storyFields(it:any,col:string|null,inThisBucket:boolean,prevRelease?:string|null){
    const release=col===null||col==='__q'?null:col
    const fields:any={parent_project:col===null?null:bucket.name}
    if(prevRelease===undefined||!it.release_month||it.release_month===prevRelease)fields.release_month=release
    if(open(it)&&(!it.start_date||plannerDated(it,inThisBucket)))Object.assign(fields,col===null?{start_date:null,end_date:null}:autoDates(col))
    return fields
  }
  async function dropOn(col:string){
    const en=findEntry(dragId)
    setDragId(null);setOver(null)
    if(!en||!bucket)return
    if(col!=='__q'&&releaseOf(releases,col)?.no_release){alert(`${fmtMonthKey(col)} has no release. Pick another month, or change it under 📦 Releases.`);return}
    let end:string|null=null
    if(en.kind==='item'){
      const it=en.x,from=it.parent_project
      if(from&&from!==bucket.name&&projectNames.has(from)&&!confirm(`"${it.name}" is in "${from}". Move it to "${bucket.name}"?`))return
      const fields={...storyFields(it,col,from===bucket.name),epic_id:from===bucket.name?it.epic_id:null}
      await updItem(it.id,fields)
      end=fields.end_date||it.end_date
    }else{
      const e=en.x,fromName=(projects as any[]).find(p=>p.id===e.project_id)?.name
      if(e.project_id&&e.project_id!==bucket.id&&fromName&&!confirm(`Epic "${e.name}" is in "${fromName}". Move it and its stories to "${bucket.name}"?`))return
      const mine=e.project_id===bucket.id
      const fields:any={project_id:bucket.id,release_month:col==='__q'?null:col}
      if(!e.start_date||plannerDated(e,mine))Object.assign(fields,autoDates(col))
      await updEpic(e.id,fields)
      for(const st of storiesOf(e))await updItem(st.id,storyFields(st,col,st.parent_project===bucket.name,e.release_month||null))
      end=fields.end_date||e.end_date
    }
    // The initiative runs until its last release, so a later release extends its end date
    if(end&&bucket.end_date&&end>bucket.end_date){
      setProjects((prev:any[])=>prev.map(p=>p.id===bucket.id?{...p,end_date:end}:p))
      const{error}=await supabase.from('projects').update({end_date:end,updated_at:new Date().toISOString()}).eq('id',bucket.id)
      if(error)alert('Failed to extend the initiative: '+error.message)
    }
  }
  // Drop on the pool: take it out of the quarter, or reorder within the pool
  async function dropOnPool(beforeKey:string|null){
    const en=findEntry(dragId)
    setDragId(null);setOver(null)
    if(!en)return
    const list=pool.filter(p=>p.key!==en.key)
    const at=beforeKey?list.findIndex(p=>p.key===beforeKey):list.length
    list.splice(at<0?list.length:at,0,en)
    if(bucket&&en.kind==='item'&&en.x.parent_project===bucket.name)
      await updItem(en.x.id,{...storyFields(en.x,null,true),epic_id:null})
    if(bucket&&en.kind==='epic'&&en.x.project_id===bucket.id){
      const e=en.x
      await updEpic(e.id,{project_id:null,release_month:null,...(plannerDated(e,true)?{start_date:null,end_date:null}:{})})
      for(const st of storiesOf(e))await updItem(st.id,storyFields(st,null,st.parent_project===bucket.name,e.release_month||null))
    }
    const changed=list.map((p,ix)=>({p,r:ix+1})).filter(({p,r})=>p.x.manual_rank!==r)
    setItems((prev:any[])=>prev.map(i=>{const c=changed.find(({p})=>p.kind==='item'&&p.x.id===i.id);return c?{...i,manual_rank:c.r}:i}))
    setEpics((prev:any[])=>prev.map(e=>{const c=changed.find(({p})=>p.kind==='epic'&&p.x.id===e.id);return c?{...e,manual_rank:c.r}:e}))
    for(const{p,r}of changed)await supabase.from(p.kind==='epic'?'epics':'items').update({manual_rank:r}).eq('id',p.x.id)
  }

  const btn={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:12,padding:'5px 10px',cursor:'pointer'}
  // A plain render function (not a component), so cards aren't remounted mid-drag
  const card=(en:Entry,showFrom=false,idx:number|null=null)=>{
    const x=en.x,isEpic=en.kind==='epic'
    const sts=isEpic?storiesOf(x):[],done=sts.filter(i=>!open(i)).length
    const from=isEpic?(projects as any[]).find(p=>p.id===x.project_id)?.name:x.parent_project
    return(
    <div key={en.key} draggable onDragStart={e=>{setDragId(en.key);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setOver(null)}}
      onDragOver={idx!=null?e=>{e.preventDefault();e.stopPropagation();setOver('pool:'+en.key)}:undefined}
      onDrop={idx!=null?e=>{e.preventDefault();e.stopPropagation();dropOnPool(en.key)}:undefined}
      onClick={()=>isEpic?onOpenEpic?.(x):onOpenItem(x)}
      style={{background:isEpic?'rgba(224,123,42,0.10)':'#1E3048',border:`1px solid ${isEpic?'rgba(224,123,42,0.45)':'#2A3D55'}`,borderLeft:isEpic?'3px solid #E07B2A':undefined,borderTop:over==='pool:'+en.key?'2px solid #C8973A':undefined,borderRadius:6,padding:'6px 8px',cursor:'grab',opacity:dragId===en.key?0.4:1,display:'flex',flexDirection:'column',gap:3}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        {idx!=null&&<span style={{fontSize:10,fontWeight:800,color:'#C8973A',minWidth:16}}>{idx+1}</span>}
        {isEpic?<span style={{fontSize:9,fontWeight:800,color:'#E07B2A',letterSpacing:1}}>◆ EPIC</span>
          :<><span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{x.item_id}</span><span title={x.request_type} style={{fontSize:11}}>{RT_ICON[x.request_type]||''}</span></>}
        <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,color:x.priority==='P1'?'#E74C3C':x.priority==='P2'?'#D4820A':'#7A8FA6'}}>{x.priority}</span>
        {(isEpic?ptsOf(en)>0:!!x.effort)&&<span title={isEpic&&!x.effort?'Effort points of its open stories':undefined} style={{fontSize:10,color:'#7A8FA6',border:'1px solid #3A4A5E',borderRadius:3,padding:'0 4px'}}>{isEpic&&!x.effort?ptsOf(en)+' pts':x.effort}</span>}
      </div>
      <div style={{fontSize:12,color:'#F4F6F8',lineHeight:1.3,fontWeight:isEpic?700:400}}>{x.name}</div>
      {isEpic&&<div style={{fontSize:10,color:'#7A8FA6'}}>{sts.length} stor{sts.length===1?'y':'ies'}{sts.length?` · ${done} done`:''}</div>}
      {showFrom&&from&&<div style={{fontSize:10,color:'#7A8FA6'}}>In {from}</div>}
      {!poolTeam&&x.team&&<div style={{fontSize:10,color:'#7A8FA6'}}>{TEAM_SHORT[x.team]||x.team}</div>}
    </div>
  )}

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,minHeight:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'1px solid #243447',background:'#162436',flexWrap:'wrap' as const}}>
        <button onClick={()=>step(-1)} style={btn}>‹</button>
        <div style={{fontSize:14,fontWeight:800,color:'#F4F6F8',minWidth:90,textAlign:'center' as const}}>{quarterLabel(fq.fy,fq.q)}</div>
        <button onClick={()=>step(1)} style={btn}>›</button>
        {(fq.fy!==cur.fy||fq.q!==cur.q)&&<button onClick={()=>setQ(cur)} style={{...btn,color:'#7A8FA6'}}>This quarter</button>}
        <select value={team} onChange={e=>setTeam(e.target.value)} style={btn}>{teams.map((t:string)=><option key={t} value={t}>{t}</option>)}</select>
        <span style={{fontSize:11,color:'#7A8FA6'}}>{fmtMonthKey(months[0])} – {fmtMonthKey(months[2])}</span>
        <label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer'}} title="Hide months marked as having no release (e.g. code freeze)">
          <input type="checkbox" checked={hideNoRel} onChange={e=>setHideNoRel(e.target.checked)} style={{accentColor:'#C8973A'}}/>Hide months with no release{hideNoRel&&hiddenCount?` (${hiddenCount})`:''}
        </label>
        <button onClick={()=>setMgr(true)} style={btn}>📦 Releases</button>
      </div>
      <div style={{flex:1,display:'flex',minHeight:0,overflow:'auto'}}>
        {/* Pool */}
        <div onDragOver={e=>{e.preventDefault();if(over!=='pool')setOver(o=>o?.startsWith('pool:')?o:'pool')}} onDrop={e=>{e.preventDefault();dropOnPool(null)}}
          style={{width:300,flexShrink:0,borderRight:'1px solid #243447',display:'flex',flexDirection:'column',background:over==='pool'?'rgba(200,151,58,0.06)':'transparent'}}>
          <div style={{padding:'10px 12px',borderBottom:'1px solid #243447'}}>
            <div style={{fontSize:11,fontWeight:800,color:'#8FA6BC',letterSpacing:1}}>SUSTAIN BACKLOG · {poolEpics.length} epic{poolEpics.length!==1?'s':''} · {poolItems.length} stor{poolItems.length===1?'y':'ies'}</div>
            <div style={{fontSize:10.5,color:'#7A8FA6',margin:'3px 0 6px'}}>Open Sustain epics and stories, in priority order. Drag to reorder, or into the quarter. An epic brings its stories with it.</div>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolTeam} onChange={e=>setPoolTeam(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only {short} and unassigned</label>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolAll} onChange={e=>setPoolAll(e.target.checked)} style={{accentColor:'#C8973A'}}/>Include ones already in other initiatives</label>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:10,display:'flex',flexDirection:'column',gap:6}}>
            {pool.map((en,ix)=>card(en,true,ix))}
            {!pool.length&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic',padding:8}}>Nothing waiting. Mark epics or stories as Sustain (work type) to plan them here.</div>}
          </div>
        </div>
        {/* The quarter's initiative and its monthly releases */}
        <div style={{flex:1,minWidth:640,display:'flex',flexDirection:'column'}}>
          {!bucket?(
            <div style={{margin:24,padding:20,border:'1px dashed #3A4A5E',borderRadius:8,textAlign:'center' as const}}>
              <div style={{fontSize:13,color:'#C8C8D4',marginBottom:6}}>No tech debt initiative for {team} in {quarterLabel(fq.fy,fq.q)} yet.</div>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:12}}>It&apos;s a sustain initiative dated {fmtMonthKey(months[0])} to {fmtMonthKey(months[2])}, shown on the roadmap like any other.</div>
              <button onClick={createBucket} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,fontSize:12,fontWeight:800,padding:'8px 16px',cursor:'pointer'}}>+ Create &ldquo;{quarterLabel(fq.fy,fq.q)} Tech Debt ({short})&rdquo;</button>
            </div>
          ):(<>
            <div style={{padding:'10px 16px',borderBottom:'1px solid #243447',display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap' as const}}>
              <span style={{fontSize:14,fontWeight:800,color:'#F4F6F8'}}>{bucket.name}</span>
              <span style={{fontSize:11,color:'#7A8FA6'}}>{bucketEpics.length} epic{bucketEpics.length!==1?'s':''} · {(n=>`${n} stor${n===1?'y':'ies'}`)(inBucket.filter(en=>en.kind==='item').length)} · {pts(inBucket)} pts · {inBucket.filter(en=>en.x.release_month).length} in a release</span>
              <span style={{fontSize:10.5,color:'#7A8FA6',marginLeft:'auto'}}>Work is planned in the quarter; it can ship in a later release</span>
            </div>
            <div style={{flex:1,display:'grid',gridTemplateColumns:cols.map(c=>isBlocked(c.key)&&!colItems(c.key).length?'92px':'minmax(165px,1fr)').join(' '),gap:8,padding:12,minHeight:0,overflowX:'auto'}}>
              {cols.map((c,ci)=>{const list=colItems(c.key),blocked=isBlocked(c.key),slim=blocked&&!list.length,firstLater=c.later&&!cols[ci-1]?.later;return(
                <div key={c.key} onDragOver={e=>{e.preventDefault();setOver(c.key)}} onDragLeave={()=>setOver(o=>o===c.key?null:o)} onDrop={e=>{e.preventDefault();dropOn(c.key)}}
                  style={{display:'flex',flexDirection:'column',background:blocked?'repeating-linear-gradient(135deg,#0F1C2B,#0F1C2B 8px,#132234 8px,#132234 16px)':'#0F1C2B',border:`1px solid ${over===c.key?'#C8973A':c.later&&!blocked?'#2E5A78':'#243447'}`,borderRadius:8,minHeight:0,position:'relative' as const,marginLeft:firstLater?8:0}}>
                  {firstLater&&<div style={{position:'absolute',left:-13,top:0,bottom:0,borderLeft:'2px dashed #3A4A5E'}}/>}
                  <div style={{padding:'8px 10px',borderBottom:'1px solid #243447'}}>
                    {c.later&&<div style={{fontSize:9,fontWeight:800,color:'#5DADE2',letterSpacing:0.8,marginBottom:2}}>{slim?'AFTER':'AFTER THE QUARTER'}</div>}
                    <div style={{fontSize:12,fontWeight:800,color:blocked?'#7A8FA6':'#F4F6F8'}}>{slim?fmtMonthKey(c.key):c.label}</div>
                    <div style={{fontSize:10.5,color:blocked?'#D4820A':c.sub==='Date not set'?'#7A8FA6':'#C8973A'}}>{c.key==='__q'?c.sub:blocked?`No release${releaseOf(releases,c.key)?.notes?' · '+releaseOf(releases,c.key).notes:''}`:c.sub}</div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{list.length} · {pts(list)} pts</div>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:8,display:'flex',flexDirection:'column',gap:6}}>
                    {list.map(en=>card(en))}
                    {!list.length&&<div style={{fontSize:10.5,color:'#3A4A5E',fontStyle:'italic',padding:4}}>{blocked?(slim?'':'Nothing ships this month.'):'Drag epics or stories here.'}</div>}
                  </div>
                </div>
              )})}
            </div>
          </>)}
        </div>
      </div>
      {mgr&&<ReleasesManager releases={releases} setReleases={setReleases} onClose={()=>setMgr(false)}
        counts={(k:string)=>[...items,...projects,...epics].filter((x:any)=>x.release_month===k).length}/>}
    </div>
  )
}
