'use client'
import { useState } from 'react'

// Strategy staffing and budget.
// Every project has three standard slots (Developer, QA, Product Owner) plus any extra
// people. Allocation isn't entered by hand: on each working day a person's time is split
// evenly across the projects they're on that day, so someone on one project is 100% there,
// and during an overlap with a second project each gets 50%. Cost = that share × 8h × rate.
// Generic (unnamed) roles have no overlap to share and count full-time × headcount.

export const SLOTS=[
  {key:'dev',label:'Developer',match:/^(developer|tech lead)$/i},
  {key:'qa',label:'QA',match:/^(qe|qa|qe automation|qa manager)$/i},
  {key:'po',label:'Product Owner',match:/^product owner$/i},
]
// Retail Program people can be assigned to any team's projects
export const SHARED_TEAM='Retail Program'

const EPIC_ORANGE='#E07B2A'
const fmtUSD=(n:number)=>'$'+Math.round(n).toLocaleString('en-US')
const fmtK=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'k':'$'+Math.round(n)
const pad=(n:number)=>String(n).padStart(2,'0')
const iso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const todayISO=()=>iso(new Date())
const fyOfMonth=(y:number,m:number)=>m>=4?y+1:y // m is 1-12; FY27 = Apr 2026 – Mar 2027
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtMon=(k:string)=>{const[y,m]=k.split('-').map(Number);return `${MONTHS[m-1]} ${String(y).slice(-2)}`}

export const roleName=(id:any,roles:any[])=>roles.find((r:any)=>r.id===id)?.name||''
export function eligiblePeople(people:any[],team:string|null){
  const today=todayISO()
  return people.filter((p:any)=>p.active!==false&&(!p.termination_date||p.termination_date>=today)
    &&(!team||p.team===team||p.team===SHARED_TEAM))
}
// Which slot a roster row fills: its own slot, or (for a project roster without slots) the
// first row whose person's role matches each slot
export function slotted(rows:any[],people:any[],roles:any[]){
  const out=new Map<string,any>()
  for(const r of rows)if(r.slot&&!out.has(r.slot))out.set(r.slot,r)
  for(const sl of SLOTS){
    if(out.has(sl.key))continue
    const r=rows.find((x:any)=>!x.slot&&![...out.values()].includes(x)&&sl.match.test(roleName(x.role_id||people.find((p:any)=>p.id===x.person_id)?.role_id,roles)))
    if(r)out.set(sl.key,r)
  }
  return out
}
export const rateFor=(row:any,people:any[],roles:any[])=>{
  const person=row.person_id?people.find(p=>p.id===row.person_id):null
  if(person){
    if(person.rate_override!=null)return Number(person.rate_override)
    const own=roles.find(r=>r.id===person.role_id)?.hourly_rate
    if(own!=null)return Number(own)
  }
  return Number(roles.find(r=>r.id===row.role_id)?.hourly_rate||0)
}
function split(cost:number,role:any,budgetType:string){
  if(budgetType==='support'||!role?.capex_eligible)return{capex:0,opex:cost}
  const pct=role.capex_pct??80
  return{capex:cost*pct/100,opex:cost*(1-pct/100)}
}

// work: [{p, s, e, rows}] — every project with its dates and roster in this strategy.
// Returns each project's cost by FY, and each person's monthly share per project (for load
// and for showing overlaps).
export function computeAllocation(work:any[],people:any[],roles:any[]){
  const costs=new Map<string,{byFy:Record<number,{cost:number,capex:number,opex:number}>,total:number}>()
  const add=(p:any,role:any,y:number,m:number,cost:number)=>{
    const c=costs.get(p.id)||{byFy:{},total:0}
    const fy=fyOfMonth(y,m),sp=split(cost,role,p.budget_type||'build')
    const b=c.byFy[fy]||(c.byFy[fy]={cost:0,capex:0,opex:0})
    b.cost+=cost;b.capex+=sp.capex;b.opex+=sp.opex;c.total+=cost
    costs.set(p.id,c)
  }
  // person → month → {days: working days in the month, share: projectId → days of that person}
  const personMonth=new Map<string,Map<string,{days:number,share:Map<string,number>}>>()
  const byPerson=new Map<string,{w:any,row:any}[]>()
  for(const w of work){
    for(const row of w.rows){
      if(row.person_id){
        if(!byPerson.has(row.person_id))byPerson.set(row.person_id,[])
        byPerson.get(row.person_id)!.push({w,row})
      }else{
        // generic role: full time × headcount across the project's dates
        const role=roles.find((r:any)=>r.id===row.role_id)
        const rate=rateFor(row,people,roles),heads=Number(row.headcount||1)
        const d=new Date(w.s+'T12:00:00'),end=new Date(w.e+'T12:00:00')
        while(d<=end){if(d.getDay()!==0&&d.getDay()!==6)add(w.p,role,d.getFullYear(),d.getMonth()+1,8*rate*heads);d.setDate(d.getDate()+1)}
      }
    }
  }
  for(const[pid,list]of byPerson){
    const person=people.find((x:any)=>x.id===pid)
    if(!person)continue
    const rate=rateFor({person_id:pid},people,roles)
    const role=roles.find((r:any)=>r.id===person.role_id)
    const projects=new Map<string,{w:any,row:any}>() // a person listed twice on one project counts once
    for(const x of list)if(!projects.has(x.w.p.id))projects.set(x.w.p.id,x)
    const spans=[...projects.values()].map(x=>({p:x.w.p,s:x.w.s,e:person.termination_date&&person.termination_date<x.w.e?person.termination_date:x.w.e}))
    if(!spans.length)continue
    const min=spans.map(x=>x.s).sort()[0],max=spans.map(x=>x.e).sort().slice(-1)[0]
    const pm=personMonth.get(pid)||new Map()
    personMonth.set(pid,pm)
    const d=new Date(min+'T12:00:00'),end=new Date(max+'T12:00:00')
    while(d<=end){
      if(d.getDay()!==0&&d.getDay()!==6){
        const day=iso(d),active=spans.filter(x=>x.s<=day&&x.e>=day)
        if(active.length){
          const y=d.getFullYear(),m=d.getMonth()+1,key=`${y}-${pad(m)}`
          const cell=pm.get(key)||{days:0,share:new Map()}
          pm.set(key,cell)
          for(const a of active){
            add(a.p,role,y,m,8*rate/active.length)
            cell.share.set(a.p.id,(cell.share.get(a.p.id)||0)+1/active.length)
          }
        }
      }
      d.setDate(d.getDate()+1)
    }
  }
  // Fill in each month's working-day count so shares can be turned into %
  for(const pm of personMonth.values())for(const[key,cell]of pm){
    const[y,m]=key.split('-').map(Number)
    let n=0;const d=new Date(y,m-1,1);while(d.getMonth()===m-1){if(d.getDay()!==0&&d.getDay()!==6)n++;d.setDate(d.getDate()+1)}
    cell.days=n
  }
  return{costs,personMonth}
}
// Months where a person is shared on this project with something else, as "Oct 26–Dec 26 (50%)"
export function overlapsFor(personId:string,projectId:string,personMonth:any,projectName:(id:string)=>string){
  const pm=personMonth.get(personId)
  if(!pm)return[]
  const out:string[]=[]
  for(const[key,cell]of [...pm.entries()].sort()){
    const mine=cell.share.get(projectId)
    if(!mine)continue
    const others=[...cell.share.keys()].filter((k:string)=>k!==projectId)
    if(!others.length)continue
    const pct=Math.round(mine/[...cell.share.values()].reduce((a:number,b:number)=>a+b,0)*100)
    out.push(`${fmtMon(key)}: ${pct}% (also ${others.map(projectName).join(', ')})`)
  }
  return out
}

// ── Budget panel ────────────────────────────────────────────────────────────
export function StrategyBudgetPanel({entries,fys,scope,setScope,onOpen}:any){
  // entries: [{p, state:'planned'|'proposed', workType, onTrack, cost:{byFy,total}|null, reason?}]
  const [open,setOpen]=useState<any>({})
  const inScope=entries.filter((x:any)=>scope==='all'||x.onTrack)
  const costed=inScope.filter((x:any)=>x.cost&&x.cost.total>0)
  const uncosted=inScope.filter((x:any)=>!x.cost||x.cost.total<=0)
  const sum=(list:any[],fy?:number,key='cost')=>list.reduce((s:number,x:any)=>s+(fy==null?Object.values(x.cost.byFy).reduce((a:number,b:any)=>a+b[key],0):(x.cost.byFy[fy]?.[key]||0)),0)
  const groups=[{k:'planned',label:'Planned'},{k:'proposed',label:'Proposed'}].map(g=>({...g,list:costed.filter((x:any)=>x.state===g.k).sort((a:any,b:any)=>b.cost.total-a.cost.total)}))
  const th={padding:'6px 6px',fontSize:9.5,fontWeight:700,color:'#7A8FA6',letterSpacing:0.5,textAlign:'right' as const,borderBottom:'1px solid #243447',whiteSpace:'nowrap' as const}
  const td={padding:'6px 6px',fontSize:11,textAlign:'right' as const,fontVariantNumeric:'tabular-nums' as const,borderBottom:'1px solid #1C2C3F',whiteSpace:'nowrap' as const}
  const label={...td,textAlign:'left' as const}
  return(
    <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <div style={{fontSize:10,fontWeight:700,color:'#7A8FA6',letterSpacing:1,flex:1}}>PROPOSED BUDGET</div>
        <select value={scope} onChange={e=>setScope(e.target.value)} style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,fontSize:10.5,padding:'3px 6px'}}>
          <option value="all">Everything on this roadmap</option>
          <option value="tracks">Projects on tracks only</option>
        </select>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%'}}>
          <thead><tr><th style={{...th,textAlign:'left'}}/>{fys.map((fy:number)=><th key={fy} style={th}>FY{String(fy).slice(-2)}</th>)}<th style={th}>TOTAL</th></tr></thead>
          <tbody>
            {groups.map(g=>(
              <tr key={g.k} onClick={()=>setOpen((o:any)=>({...o,[g.k]:!o[g.k]}))} style={{cursor:'pointer'}}>
                <td style={{...label,fontWeight:700,color:g.k==='proposed'?EPIC_ORANGE:'#F4F6F8'}}>{open[g.k]?'▾':'▸'} {g.label} <span style={{fontWeight:400,color:'#7A8FA6'}}>({g.list.length})</span></td>
                {fys.map((fy:number)=><td key={fy} style={td}>{fmtK(sum(g.list,fy))}</td>)}
                <td style={{...td,fontWeight:700}}>{fmtK(sum(g.list))}</td>
              </tr>
            ))}
            <tr>
              <td style={{...label,fontWeight:800,color:'#C8973A'}}>Total</td>
              {fys.map((fy:number)=><td key={fy} style={{...td,fontWeight:800,color:'#C8973A'}}>{fmtK(sum(costed,fy))}</td>)}
              <td style={{...td,fontWeight:800,color:'#C8973A'}}>{fmtK(sum(costed))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:11}}>
        {[['New projects',costed.filter((x:any)=>x.workType!=='sustain')],['Sustain',costed.filter((x:any)=>x.workType==='sustain')]].map(([l,list]:any)=>(
          <div key={l} style={{background:'#162436',border:'1px solid #243447',borderRadius:6,padding:'7px 9px'}}>
            <div style={{color:'#7A8FA6',fontSize:10}}>{l}</div>
            <div style={{fontWeight:700,color:'#F4F6F8',fontSize:13}}>{fmtUSD(sum(list))}</div>
            <div style={{color:'#7A8FA6',fontSize:10}}>{sum(costed)?Math.round(sum(list)/sum(costed)*100):0}% of total</div>
          </div>
        ))}
        <div style={{gridColumn:'1 / -1',color:'#7A8FA6',fontSize:10.5}}>CapEx <b style={{color:'#F4F6F8'}}>{fmtUSD(sum(costed,undefined,'capex'))}</b> · OpEx <b style={{color:'#F4F6F8'}}>{fmtUSD(sum(costed,undefined,'opex'))}</b></div>
      </div>
      {groups.map(g=>open[g.k]&&g.list.length>0&&(
        <div key={g.k}>
          <div style={{fontSize:10,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:4}}>{g.label.toUpperCase()} PROJECTS</div>
          {g.list.map((x:any)=>(
            <div key={x.p.id} onClick={()=>onOpen(x.p.id)} style={{display:'flex',gap:6,fontSize:11,padding:'3px 0',cursor:'pointer',borderBottom:'1px solid #1C2C3F'}}>
              <span style={{flex:1,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{x.p.name}</span>
              <span style={{color:'#F4F6F8',fontVariantNumeric:'tabular-nums'}}>{fmtUSD(x.cost.total)}</span>
            </div>
          ))}
        </div>
      ))}
      {inScope.some((x:any)=>x.missing?.length)&&(
        <div style={{background:'rgba(231,76,60,0.06)',border:'1px solid rgba(231,76,60,0.3)',borderRadius:6,padding:'8px 10px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#E74C3C',letterSpacing:1,marginBottom:4}}>MISSING STANDARD ROLES</div>
          {inScope.filter((x:any)=>x.missing?.length).map((x:any)=>(
            <div key={x.p.id} onClick={()=>onOpen(x.p.id)} style={{display:'flex',gap:6,fontSize:11,padding:'2px 0',cursor:'pointer'}}>
              <span style={{flex:1,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{x.p.name}</span>
              <span style={{color:'#7A8FA6',fontSize:10}}>{x.missing.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
      {uncosted.length>0&&(
        <div style={{background:'rgba(212,130,10,0.08)',border:'1px solid rgba(212,130,10,0.35)',borderRadius:6,padding:'8px 10px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#D4820A',letterSpacing:1,marginBottom:4}}>NOT COSTED YET ({uncosted.length})</div>
          {uncosted.map((x:any)=>(
            <div key={x.p.id} onClick={()=>onOpen(x.p.id)} style={{display:'flex',gap:6,fontSize:11,padding:'2px 0',cursor:'pointer'}}>
              <span style={{flex:1,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{x.p.name}</span>
              <span style={{color:'#7A8FA6',fontSize:10}}>{x.reason}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:10,color:'#7A8FA6',lineHeight:1.5}}>Uses this strategy&apos;s dates, teams and people. A person&apos;s time is split evenly across their overlapping projects. Bars that run to the edge (ongoing work) are costed to the end of the strategy.</div>
    </div>
  )
}

// ── Staffing editor for one project in one strategy ─────────────────────────
export function StaffingSection({project,team,teams,rows,custom,people,roles,cost,fys,overlaps,onTeam,onSetSlot,onAdd,onRemove}:any){
  const [extra,setExtra]=useState('')
  const S={padding:'14px 16px',borderBottom:'1px solid #243447',display:'flex',flexDirection:'column' as const,gap:8}
  const H={fontSize:10,fontWeight:700,color:'#7A8FA6',letterSpacing:1}
  const IN={boxSizing:'border-box' as const,background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'5px 7px'}
  const pool=eligiblePeople(people,team).sort((a:any,b:any)=>a.name.localeCompare(b.name))
  const slots=slotted(rows,people,roles)
  const slotRows=new Set([...slots.values()])
  const extras=rows.filter((r:any)=>!slotRows.has(r))
  const nameOf=(r:any)=>r.person_id?people.find((p:any)=>p.id===r.person_id)?.name||'(removed)':(roles.find((x:any)=>x.id===r.role_id)?.name||'Role')+(Number(r.headcount)>1?` × ${r.headcount}`:'')
  const options=(match?:RegExp)=>{
    const fit=match?pool.filter((p:any)=>match.test(roleName(p.role_id,roles))):pool
    const rest=match?pool.filter((p:any)=>!fit.includes(p)):[]
    const label=(p:any)=>`${p.name} · ${roleName(p.role_id,roles)||'no role'}${p.team&&p.team!==team?` · ${p.team}`:''}`
    return(<>
      {fit.map((p:any)=><option key={p.id} value={p.id}>{label(p)}</option>)}
      {rest.length>0&&<optgroup label="Other roles">{rest.map((p:any)=><option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>}
    </>)
  }
  const Overlap=({r}:{r:any})=>{
    const o=r.person_id?overlaps(r.person_id):[]
    return o.length?<div title={o.join('\n')} style={{fontSize:9.5,color:'#D4820A',marginTop:1}}>Shared during {o.length} month{o.length!==1?'s':''}: {o[0]}{o.length>1?'…':''}</div>:null
  }
  return(
    <div style={S}>
      <div style={H}>TEAM &amp; PEOPLE <span style={{fontWeight:400,letterSpacing:0}}>· this strategy</span></div>
      <select value={team||''} onChange={e=>onTeam(e.target.value||null)} style={IN}>
        <option value="">No team</option>
        {teams.map((t:string)=><option key={t} value={t}>{t}</option>)}
      </select>
      {!custom&&rows.length>0&&<div style={{fontSize:10,color:'#7A8FA6'}}>Using the project&apos;s own roster. Any change here gives this strategy its own copy.</div>}
      {SLOTS.map(sl=>{
        const r=slots.get(sl.key)
        return(
          <div key={sl.key}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{width:92,flexShrink:0,fontSize:11,color:r?'#C8C8D4':'#D4820A',fontWeight:600}}>{sl.label}{!r&&' *'}</span>
              <select value={r?.person_id||''} onChange={e=>onSetSlot(sl.key,e.target.value||null,r)} style={{...IN,flex:1,minWidth:0,color:r?'#F4F6F8':'#7A8FA6'}}>
                <option value="">{r&&!r.person_id?nameOf(r)+' (unnamed)':'Choose…'}</option>
                {options(sl.match)}
              </select>
            </div>
            {r&&<div style={{marginLeft:98}}><Overlap r={r}/></div>}
          </div>
        )
      })}
      {extras.map((r:any)=>(
        <div key={r.id}>
          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
            <span style={{width:92,flexShrink:0,color:'#7A8FA6'}}>{roleName(r.role_id||people.find((p:any)=>p.id===r.person_id)?.role_id,roles)||'Extra'}</span>
            <span style={{flex:1,color:'#F4F6F8'}}>{nameOf(r)}</span>
            <button onClick={()=>onRemove(r)} title="Remove" style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>✕</button>
          </div>
          <div style={{marginLeft:98}}><Overlap r={r}/></div>
        </div>
      ))}
      <div style={{display:'flex',gap:5}}>
        <select value={extra} onChange={e=>setExtra(e.target.value)} style={{...IN,flex:1,minWidth:0,color:extra?'#F4F6F8':'#7A8FA6'}}>
          <option value="">+ Add another person…</option>
          {options()}
        </select>
        <button onClick={()=>{if(extra){const person=people.find((p:any)=>p.id===extra);onAdd({person_id:extra,role_id:person?.role_id||null,headcount:1,allocation_pct:100,slot:null});setExtra('')}}}
          disabled={!extra} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontWeight:700,fontSize:11,padding:'5px 10px',cursor:'pointer',opacity:extra?1:0.5}}>Add</button>
      </div>
      <div style={{fontSize:10,color:'#7A8FA6',lineHeight:1.5}}>
        Lists {team?`${team} and ${SHARED_TEAM}`:'everyone'} (excluding anyone past their termination date). Each person&apos;s time is split evenly across projects that overlap; otherwise they&apos;re 100% on this one.
      </div>
      {cost&&cost.total>0&&(
        <div style={{display:'flex',flexWrap:'wrap' as const,gap:8,fontSize:10.5,color:'#7A8FA6'}}>
          <span>Cost in this strategy: <b style={{color:'#F4F6F8'}}>{fmtUSD(cost.total)}</b></span>
          {fys.filter((fy:number)=>cost.byFy[fy]?.cost>0).map((fy:number)=><span key={fy}>FY{String(fy).slice(-2)} {fmtK(cost.byFy[fy].cost)}</span>)}
        </div>
      )}
      {project.ongoing&&<div style={{fontSize:10,color:'#7A8FA6'}}>Ongoing: costed to the end of the strategy unless it has an end date here.</div>}
    </div>
  )
}
