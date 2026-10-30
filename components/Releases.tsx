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
export function QuarterPlanner({items,setItems,projects,setProjects,releases,setReleases,teams,workTypeOf,onOpenItem}:any){
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const [fq,setFq]=useState<{fy:number,q:number}>(()=>{try{const v=JSON.parse(localStorage.getItem('pg_plan_q')||'null');if(v?.fy)return v}catch{}return cur})
  const [team,setTeamState]=useState<string>(()=>{try{return localStorage.getItem('pg_plan_team')||teams[0]}catch{return teams[0]}})
  const [poolAll,setPoolAll]=useState(false) // include sustain stories that already sit in another initiative
  const [poolTeam,setPoolTeam]=useState(true)
  const [dragId,setDragId]=useState<any>(null)
  const [over,setOver]=useState<string|null>(null)
  const [mgr,setMgr]=useState(false)
  const setQ=(v:any)=>{setFq(v);try{localStorage.setItem('pg_plan_q',JSON.stringify(v))}catch{}}
  const setTeam=(v:string)=>{setTeamState(v);try{localStorage.setItem('pg_plan_team',v)}catch{}}
  const step=(n:number)=>{let{fy,q}=fq;q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}setQ({fy,q})}

  const qk=quarterKey(fq.fy,fq.q),months=quarterMonths(fq.fy,fq.q)
  const qStart=`${months[0]}-01`,qEnd=lastDay(months[2])
  const short=TEAM_SHORT[team]||team
  const bucket=(projects as any[]).find(p=>p.sustain_quarter===qk&&p.team===team)
  const bucketNames=new Set((projects as any[]).filter(p=>p.sustain_quarter).map(p=>p.name))
  const projectNames=new Set((projects as any[]).map(p=>p.name))
  const open=(i:any)=>!TERMINAL.includes(i.status)&&(i.space||'work')==='work'
  const rank=(a:any,b:any)=>(a.manual_rank??1e9)-(b.manual_rank??1e9)||(PRI_ORDER[a.priority]||9)-(PRI_ORDER[b.priority]||9)||(a.created_at||'').localeCompare(b.created_at||'')
  // The pool: open sustain stories not yet in a quarter. By default only ones with no
  // initiative; optionally also those sitting in other (non-quarter) initiatives.
  const pool=(items as any[]).filter(i=>open(i)&&workTypeOf(i)==='sustain'&&!bucketNames.has(i.parent_project)
    &&(poolAll||!i.parent_project||!projectNames.has(i.parent_project))&&(!poolTeam||!i.team||i.team===team)).sort(rank)
  const inBucket=bucket?(items as any[]).filter(i=>i.parent_project===bucket.name&&(i.space||'work')==='work').sort(rank):[]
  const pts=(list:any[])=>list.reduce((s,i)=>s+(EFFORT_POINTS[i.effort]||0),0)
  const cols=[{key:'__q',label:'In the quarter',sub:'Not in a release yet'},...months.map(k=>({key:k,label:`${fmtMonthKey(k)} release`,sub:releaseText(releases,k)}))]
  const colItems=(k:string)=>inBucket.filter(i=>k==='__q'?!months.includes(i.release_month):i.release_month===k)

  async function updItem(id:any,fields:any){
    setItems((prev:any[])=>prev.map(i=>i.id===id?{...i,...fields}:i))
    const{error}=await supabase.from('items').update({...fields,updated_at:new Date().toISOString()}).eq('id',id)
    if(error)alert('Failed to save: '+error.message)
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
  async function dropOn(col:string){
    const it=(items as any[]).find(i=>i.id===dragId)
    setDragId(null);setOver(null)
    if(!it||!bucket)return
    if(col!=='__q'&&releaseOf(releases,col)?.no_release){alert(`${fmtMonthKey(col)} has no release. Pick another month, or change it under 📦 Releases.`);return}
    const from=it.parent_project
    if(from&&from!==bucket.name&&projectNames.has(from)&&!confirm(`"${it.name}" is in "${from}". Move it to "${bucket.name}"?`))return
    // Give it roadmap dates if it has none, or only the ones this planner set: the release's
    // month, or the whole quarter while it waits for a release. Dates set by hand are kept.
    const auto=!it.start_date||(it.release_month&&it.start_date===`${it.release_month}-01`)||(it.start_date===qStart&&it.end_date===qEnd)
    const rel=col==='__q'?null:releaseOf(releases,col)
    const dates=!auto?{}:col==='__q'?{start_date:qStart,end_date:qEnd}:{start_date:`${col}-01`,end_date:rel?.release_date||lastDay(col)}
    await updItem(it.id,{parent_project:bucket.name,epic_id:from===bucket.name?it.epic_id:null,release_month:col==='__q'?null:col,...dates})
  }
  // Drop on the pool: take it out of the quarter, or reorder within the pool
  async function dropOnPool(beforeId:any){
    const it=(items as any[]).find(i=>i.id===dragId)
    setDragId(null);setOver(null)
    if(!it)return
    let list=pool.filter(i=>i.id!==it.id)
    const at=beforeId?list.findIndex(i=>i.id===beforeId):list.length
    list.splice(at<0?list.length:at,0,it)
    if(bucket&&it.parent_project===bucket.name){
      const auto=(it.release_month&&it.start_date===`${it.release_month}-01`)||(it.start_date===qStart&&it.end_date===qEnd)
      await updItem(it.id,{parent_project:null,epic_id:null,release_month:null,...(auto?{start_date:null,end_date:null}:{})})
    }
    const changed=list.map((x,ix)=>({x,r:ix+1})).filter(({x,r})=>x.manual_rank!==r)
    setItems((prev:any[])=>prev.map(i=>{const c=changed.find(({x})=>x.id===i.id);return c?{...i,manual_rank:c.r}:i}))
    for(const{x,r}of changed)await supabase.from('items').update({manual_rank:r}).eq('id',x.id)
  }

  const btn={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:12,padding:'5px 10px',cursor:'pointer'}
  // A plain render function (not a component), so cards aren't remounted mid-drag
  const card=(i:any,showFrom=false,idx:number|null=null)=>(
    <div key={i.id} draggable onDragStart={e=>{setDragId(i.id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragId(null);setOver(null)}}
      onDragOver={idx!=null?e=>{e.preventDefault();e.stopPropagation();setOver('pool:'+i.id)}:undefined}
      onDrop={idx!=null?e=>{e.preventDefault();e.stopPropagation();dropOnPool(i.id)}:undefined}
      onClick={()=>onOpenItem(i)}
      style={{background:'#1E3048',border:'1px solid #2A3D55',borderTop:over==='pool:'+i.id?'2px solid #C8973A':'1px solid #2A3D55',borderRadius:6,padding:'6px 8px',cursor:'grab',opacity:dragId===i.id?0.4:1,display:'flex',flexDirection:'column',gap:3}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        {idx!=null&&<span style={{fontSize:10,fontWeight:800,color:'#C8973A',minWidth:16}}>{idx+1}</span>}
        <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{i.item_id}</span>
        <span title={i.request_type} style={{fontSize:11}}>{RT_ICON[i.request_type]||''}</span>
        <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,color:i.priority==='P1'?'#E74C3C':i.priority==='P2'?'#D4820A':'#7A8FA6'}}>{i.priority}</span>
        {i.effort&&<span style={{fontSize:10,color:'#7A8FA6',border:'1px solid #3A4A5E',borderRadius:3,padding:'0 4px'}}>{i.effort}</span>}
      </div>
      <div style={{fontSize:12,color:'#F4F6F8',lineHeight:1.3}}>{i.name}</div>
      {showFrom&&i.parent_project&&<div style={{fontSize:10,color:'#7A8FA6'}}>In {i.parent_project}</div>}
      {!poolTeam&&i.team&&<div style={{fontSize:10,color:'#7A8FA6'}}>{TEAM_SHORT[i.team]||i.team}</div>}
    </div>
  )

  return(
    <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,minHeight:0}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'1px solid #243447',background:'#162436',flexWrap:'wrap' as const}}>
        <button onClick={()=>step(-1)} style={btn}>‹</button>
        <div style={{fontSize:14,fontWeight:800,color:'#F4F6F8',minWidth:90,textAlign:'center' as const}}>{quarterLabel(fq.fy,fq.q)}</div>
        <button onClick={()=>step(1)} style={btn}>›</button>
        {(fq.fy!==cur.fy||fq.q!==cur.q)&&<button onClick={()=>setQ(cur)} style={{...btn,color:'#7A8FA6'}}>This quarter</button>}
        <select value={team} onChange={e=>setTeam(e.target.value)} style={btn}>{teams.map((t:string)=><option key={t} value={t}>{t}</option>)}</select>
        <span style={{fontSize:11,color:'#7A8FA6'}}>{fmtMonthKey(months[0])} – {fmtMonthKey(months[2])}</span>
        <button onClick={()=>setMgr(true)} style={{...btn,marginLeft:'auto'}}>📦 Releases</button>
      </div>
      <div style={{flex:1,display:'flex',minHeight:0,overflow:'auto'}}>
        {/* Pool */}
        <div onDragOver={e=>{e.preventDefault();if(over!=='pool')setOver(o=>o?.startsWith('pool:')?o:'pool')}} onDrop={e=>{e.preventDefault();dropOnPool(null)}}
          style={{width:300,flexShrink:0,borderRight:'1px solid #243447',display:'flex',flexDirection:'column',background:over==='pool'?'rgba(200,151,58,0.06)':'transparent'}}>
          <div style={{padding:'10px 12px',borderBottom:'1px solid #243447'}}>
            <div style={{fontSize:11,fontWeight:800,color:'#8FA6BC',letterSpacing:1}}>SUSTAIN BACKLOG · {pool.length}</div>
            <div style={{fontSize:10.5,color:'#7A8FA6',margin:'3px 0 6px'}}>Open stories marked Sustain, in priority order. Drag to reorder, or into the quarter.</div>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolTeam} onChange={e=>setPoolTeam(e.target.checked)} style={{accentColor:'#C8973A'}}/>Only {short} and unassigned</label>
            <label style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:'#7A8FA6',cursor:'pointer'}}><input type="checkbox" checked={poolAll} onChange={e=>setPoolAll(e.target.checked)} style={{accentColor:'#C8973A'}}/>Include ones already in other initiatives</label>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:10,display:'flex',flexDirection:'column',gap:6}}>
            {pool.map((i,ix)=>card(i,true,ix))}
            {!pool.length&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic',padding:8}}>Nothing waiting. Mark stories as Sustain (work type) to plan them here.</div>}
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
              <span style={{fontSize:11,color:'#7A8FA6'}}>{inBucket.length} stories · {pts(inBucket)} pts · {inBucket.filter(i=>months.includes(i.release_month)).length} in a release</span>
            </div>
            <div style={{flex:1,display:'grid',gridTemplateColumns:`repeat(${cols.length},minmax(170px,1fr))`,gap:10,padding:12,minHeight:0}}>
              {cols.map(c=>{const list=colItems(c.key),blocked=c.key!=='__q'&&!!releaseOf(releases,c.key)?.no_release;return(
                <div key={c.key} onDragOver={e=>{e.preventDefault();setOver(c.key)}} onDragLeave={()=>setOver(o=>o===c.key?null:o)} onDrop={e=>{e.preventDefault();dropOn(c.key)}}
                  style={{display:'flex',flexDirection:'column',background:blocked?'repeating-linear-gradient(135deg,#0F1C2B,#0F1C2B 8px,#132234 8px,#132234 16px)':'#0F1C2B',border:`1px solid ${over===c.key?'#C8973A':'#243447'}`,borderRadius:8,minHeight:0}}>
                  <div style={{padding:'8px 10px',borderBottom:'1px solid #243447'}}>
                    <div style={{fontSize:12,fontWeight:800,color:blocked?'#7A8FA6':'#F4F6F8'}}>{c.label}</div>
                    <div style={{fontSize:10.5,color:blocked?'#D4820A':c.sub==='Date not set'?'#7A8FA6':'#C8973A'}}>{c.key==='__q'?c.sub:blocked?`No release${releaseOf(releases,c.key)?.notes?' · '+releaseOf(releases,c.key).notes:''}`:c.sub}</div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginTop:2}}>{list.length} · {pts(list)} pts</div>
                  </div>
                  <div style={{flex:1,overflowY:'auto',padding:8,display:'flex',flexDirection:'column',gap:6}}>
                    {list.map(i=>card(i))}
                    {!list.length&&<div style={{fontSize:10.5,color:'#3A4A5E',fontStyle:'italic',padding:4}}>{blocked?'Nothing ships this month.':'Drag stories here.'}</div>}
                  </div>
                </div>
              )})}
            </div>
          </>)}
        </div>
      </div>
      {mgr&&<ReleasesManager releases={releases} setReleases={setReleases} onClose={()=>setMgr(false)}
        counts={(k:string)=>[...items,...projects].filter((x:any)=>x.release_month===k).length}/>}
    </div>
  )
}
