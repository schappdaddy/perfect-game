'use client'
import { useState } from 'react'

// Strategy staffing and budget. Costs are priced like the Budget tab: each roster row costs
// working days × 8h × allocation % × hourly rate (× headcount for a generic role), across the
// dates the project has in this strategy, clipped at a person's termination date. Rows are
// project_roles-shaped: {project_id, role_id, person_id, headcount, allocation_pct}.

const EPIC_ORANGE='#E07B2A'
const fmtUSD=(n:number)=>'$'+Math.round(n).toLocaleString('en-US')
const fmtK=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'k':'$'+Math.round(n)
const pad=(n:number)=>String(n).padStart(2,'0')
const iso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

function workingDays(s:string,e:string){
  if(!s||!e||e<s)return 0
  const d=new Date(s+'T12:00:00'),end=new Date(e+'T12:00:00')
  let n=0
  while(d<=end){const w=d.getDay();if(w!==0&&w!==6)n++;d.setDate(d.getDate()+1)}
  return n
}
const fyOfMonth=(y:number,m:number)=>m>=4?y+1:y // m is 1-12; FY27 = Apr 2026 – Mar 2027

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

// One project's cost by fiscal year for the given date range
export function projectCost(project:any,rows:any[],start:string,end:string,people:any[],roles:any[]){
  const byFy:Record<number,{cost:number,capex:number,opex:number}>={}
  let total=0
  for(const row of rows){
    const person=row.person_id?people.find(p=>p.id===row.person_id):null
    const rate=rateFor(row,people,roles)
    const heads=person?1:Number(row.headcount||1)
    const role=roles.find(r=>r.id===(row.role_id||person?.role_id))
    let e=end
    if(person?.termination_date&&person.termination_date<e)e=person.termination_date
    const cur=new Date(start+'T12:00:00')
    cur.setDate(1)
    while(iso(cur)<=e){
      const y=cur.getFullYear(),m=cur.getMonth()+1
      const ms=iso(new Date(y,m-1,1)),me=iso(new Date(y,m,0))
      const days=workingDays(ms<start?start:ms,me>e?e:me)
      if(days>0){
        const cost=days*8*(Number(row.allocation_pct||0)/100)*heads*rate
        const sp=split(cost,role,project.budget_type||'build')
        const fy=fyOfMonth(y,m)
        const b=byFy[fy]||(byFy[fy]={cost:0,capex:0,opex:0})
        b.cost+=cost;b.capex+=sp.capex;b.opex+=sp.opex;total+=cost
      }
      cur.setMonth(cur.getMonth()+1)
    }
  }
  return{byFy,total}
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
      <div style={{fontSize:10,color:'#7A8FA6',lineHeight:1.5}}>Uses this strategy&apos;s dates, teams and people. Bars that run to the edge (ongoing work) are costed to the end of the strategy.</div>
    </div>
  )
}

// ── Staffing editor for one project in one strategy ─────────────────────────
export function StaffingSection({project,team,teams,rows,custom,people,roles,cost,fys,onTeam,onAdd,onUpdate,onRemove}:any){
  const [who,setWho]=useState('')
  const [alloc,setAlloc]=useState('50')
  const [heads,setHeads]=useState('1')
  const S={padding:'14px 16px',borderBottom:'1px solid #243447',display:'flex',flexDirection:'column' as const,gap:8}
  const H={fontSize:10,fontWeight:700,color:'#7A8FA6',letterSpacing:1}
  const IN={boxSizing:'border-box' as const,background:'#1E3048',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'5px 7px'}
  const sortedPeople=[...people].filter((p:any)=>p.active!==false).sort((a:any,b:any)=>(a.team===team?0:1)-(b.team===team?0:1)||a.name.localeCompare(b.name))
  function add(){
    if(!who)return
    const[kind,id]=who.split(':')
    if(kind==='person'){const person=people.find((p:any)=>p.id===id);onAdd({person_id:id,role_id:person?.role_id||null,headcount:1,allocation_pct:Number(alloc)||0})}
    else onAdd({person_id:null,role_id:id,headcount:Number(heads)||1,allocation_pct:Number(alloc)||0})
    setWho('')
  }
  return(
    <div style={S}>
      <div style={H}>TEAM &amp; PEOPLE <span style={{fontWeight:400,letterSpacing:0}}>· this strategy</span></div>
      <select value={team||''} onChange={e=>onTeam(e.target.value||null)} style={IN}>
        <option value="">No team</option>
        {teams.map((t:string)=><option key={t} value={t}>{t}</option>)}
      </select>
      {!custom&&<div style={{fontSize:10,color:'#7A8FA6'}}>Using the project&apos;s own roster. Any change here gives this strategy its own copy.</div>}
      {rows.length===0&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic'}}>No one assigned, so this project isn&apos;t costed yet.</div>}
      {rows.map((r:any)=>{
        const person=r.person_id?people.find((p:any)=>p.id===r.person_id):null
        const role=roles.find((x:any)=>x.id===(r.role_id||person?.role_id))
        return(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
            <span style={{flex:1,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
              {person?person.name:role?.name||'(role removed)'} <span style={{color:'#7A8FA6'}}>{person?`· ${role?.name||'—'}`:'· generic'}</span>
            </span>
            {!person&&<><input type="number" min={1} value={r.headcount} onChange={e=>onUpdate(r,{headcount:Number(e.target.value)||1})} style={{...IN,width:40,padding:'2px 4px',fontSize:11}}/><span style={{color:'#7A8FA6'}}>×</span></>}
            <input type="number" min={0} max={100} value={r.allocation_pct} onChange={e=>onUpdate(r,{allocation_pct:Number(e.target.value)||0})} style={{...IN,width:46,padding:'2px 4px',fontSize:11}}/>
            <span style={{color:'#7A8FA6'}}>%</span>
            <button onClick={()=>onRemove(r)} title="Remove" style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer'}}>✕</button>
          </div>
        )
      })}
      <div style={{display:'flex',gap:5,alignItems:'center'}}>
        <select value={who} onChange={e=>setWho(e.target.value)} style={{...IN,flex:1,minWidth:0,color:who?'#F4F6F8':'#7A8FA6'}}>
          <option value="">+ Person or role…</option>
          <optgroup label="People">{sortedPeople.map((p:any)=><option key={p.id} value={'person:'+p.id}>{p.name}{p.team?` · ${p.team}`:''}</option>)}</optgroup>
          <optgroup label="Generic role (unstaffed)">{roles.map((r:any)=><option key={r.id} value={'role:'+r.id}>{r.name}</option>)}</optgroup>
        </select>
        {who.startsWith('role:')&&<input type="number" min={1} value={heads} onChange={e=>setHeads(e.target.value)} title="Headcount" style={{...IN,width:38,padding:'4px'}}/>}
        <input type="number" min={0} max={100} value={alloc} onChange={e=>setAlloc(e.target.value)} title="Allocation %" style={{...IN,width:44,padding:'4px'}}/>
        <button onClick={add} disabled={!who} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontWeight:700,fontSize:11,padding:'5px 9px',cursor:'pointer',opacity:who?1:0.5}}>Add</button>
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
