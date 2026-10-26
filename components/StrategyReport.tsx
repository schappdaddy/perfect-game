'use client'
import { useState, Fragment } from 'react'
import { slotted, roleName, rateFor, SLOTS, SHARED_TEAM } from './StrategyBudget'

// Full-page report for one strategy, read before promoting it: what each project costs by
// FY, the same rolled up by team, and each person's load per quarter with the projects
// behind it. Uses the allocation already worked out for the roadmap (see StrategyBudget).

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PROPOSED='#E07B2A'
const fmtUSD=(n:number)=>'$'+Math.round(n).toLocaleString('en-US')
const fmtK=(n:number)=>!n?'—':n>=1e6?'$'+(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'k':'$'+Math.round(n)
const fyLabel=(fy:number)=>'FY'+String(fy).slice(-2)
const fmtD=(iso:string)=>{const[y,m]=iso.split('-').map(Number);return `${MONTHS[m-1]} ${String(y).slice(-2)}`}
const monthsBetween=(s:string,e:string)=>{const[a,b]=s.split('-').map(Number),[c,d]=e.split('-').map(Number);return (c*12+d)-(a*12+b)+1}
const workdays=(key:string)=>{const[y,m]=key.split('-').map(Number);let n=0;const d=new Date(y,m-1,1);while(d.getMonth()===m-1){if(d.getDay()!==0&&d.getDay()!==6)n++;d.setDate(d.getDate()+1)};return n}
const csvCell=(v:any)=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function download(name:string,rows:any[][]){
  const blob=new Blob([rows.map(r=>r.map(csvCell).join(',')).join('\n')],{type:'text/csv'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click()
  setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

const TH={padding:'7px 8px',fontSize:10,fontWeight:700,color:'#7A8FA6',letterSpacing:0.5,textAlign:'right' as const,borderBottom:'1px solid #243447',whiteSpace:'nowrap' as const,background:'#162436',position:'sticky' as const,top:0,zIndex:1}
const TD={padding:'6px 8px',fontSize:12,textAlign:'right' as const,fontVariantNumeric:'tabular-nums' as const,borderBottom:'1px solid #1C2C3F',whiteSpace:'nowrap' as const,color:'#C8C8D4'}
const LTD={...TD,textAlign:'left' as const}
const SECTION={fontSize:11,fontWeight:800,color:'#C8973A',letterSpacing:1.2,margin:'0 0 8px'}
const CARD={background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'10px 12px'}
const BTN={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:11,padding:'4px 10px',cursor:'pointer'}

export function StrategyReport({strategy,entries,personMonth,people,roles,teams,fys,quarters,scope,setScope,onOpen}:any){
  const [hideIdle,setHideIdle]=useState(false)
  const [showProjects,setShowProjects]=useState(true)
  const [teamFilter,setTeamFilter]=useState('all')
  const inScope=(entries as any[]).filter(x=>scope==='all'||x.onTrack)
  const costed=inScope.filter(x=>x.cost&&x.cost.total>0)
  const fyCost=(x:any,fy:number)=>x.cost?.byFy[fy]?.cost||0
  const sumFy=(list:any[],fy:number)=>list.reduce((s,x)=>s+fyCost(x,fy),0)
  const sumAll=(list:any[])=>list.reduce((s,x)=>s+(x.cost?.total||0),0)
  const total=sumAll(costed)
  const personName=(id:any)=>(people as any[]).find(p=>p.id===id)?.name
  const projName=(id:any)=>(entries as any[]).find(x=>x.p.id===id)?.p.name||'Another project'

  // ── Projects grouped by team ───────────────────────────────────────────────
  const teamNames=[...(teams as string[]),...(inScope.some(x=>!x.p.team||!teams.includes(x.p.team))?['No team']:[])]
  const byTeam=teamNames.map(t=>({team:t,list:inScope.filter(x=>t==='No team'?(!x.p.team||!teams.includes(x.p.team)):x.p.team===t)
    .sort((a,b)=>(b.cost?.total||0)-(a.cost?.total||0)||a.p.name.localeCompare(b.p.name))})).filter(g=>g.list.length)
  const slotNames=(x:any)=>{const f=slotted(x.roster,people,roles);return SLOTS.map(sl=>{const r=f.get(sl.key);return r?(personName(r.person_id)||roleName(r.role_id,roles)||'role'):null})}

  // ── People: load per quarter, and per project ─────────────────────────────
  const qPct=(pm:any,qt:any,pid?:string)=>{
    let on=0,days=0
    for(const k of qt.keys){
      days+=workdays(k)
      const cell=pm?.get(k)
      if(!cell)continue
      if(pid)on+=cell.share.get(pid)||0
      else for(const v of cell.share.values())on+=v as number
    }
    return days?on/days*100:0
  }
  const winStart=quarters[0]?.start,winEnd=quarters[quarters.length-1]?.end
  const personTeams=[...(teams as string[]),...((people as any[]).some(p=>p.team===SHARED_TEAM)?[SHARED_TEAM]:[])]
  const staff=personTeams.map(team=>{
    const list=(people as any[]).filter(p=>p.team===team&&p.active!==false&&(!p.termination_date||p.termination_date>=winStart))
      .map(person=>{
        const pm=personMonth.get(person.id)
        const projects=new Map<string,number>() // project → days
        if(pm)for(const cell of pm.values())for(const[pid,v]of cell.share)projects.set(pid,(projects.get(pid)||0)+(v as number))
        const rate=rateFor({person_id:person.id},people,roles)
        const cost=[...projects.values()].reduce((s,d)=>s+d*8*rate,0)
        const cells=quarters.map((qt:any)=>qPct(pm,qt))
        let maxAtOnce=0
        if(pm)for(const cell of pm.values())maxAtOnce=Math.max(maxAtOnce,cell.share.size)
        return{person,role:roleName(person.role_id,roles),projects:[...projects.keys()],cost,cells,maxAtOnce}
      })
      .filter(x=>!hideIdle||x.projects.length)
      .sort((a,b)=>a.person.name.localeCompare(b.person.name))
    return{team,list}
  }).filter(g=>g.list.length&&(teamFilter==='all'||g.team===teamFilter))
  const allStaff=staff.flatMap(g=>g.list)
  const idleNow=allStaff.filter(x=>!x.projects.length).length
  const stretched=allStaff.filter(x=>x.maxAtOnce>=3).length

  // ── CSV exports ────────────────────────────────────────────────────────────
  function exportBudget(){
    const rows:any[][]=[['Team','Project','State','Work type','Start','End','Months','Developer','QA','Product Owner',...fys.map(fyLabel),'Total','Not costed because']]
    for(const g of byTeam)for(const x of g.list){
      rows.push([g.team,x.p.name,x.state,x.workType,x.s||'',x.s?x.e:'',x.s&&x.e?monthsBetween(x.s,x.e):'',...slotNames(x).map(n=>n||''),...fys.map((fy:number)=>Math.round(fyCost(x,fy))),Math.round(x.cost?.total||0),x.reason||''])
    }
    rows.push(['All teams','Total','','','','','','','','',...fys.map((fy:number)=>Math.round(sumFy(costed,fy))),Math.round(total),''])
    download(`${strategy.name} - budget.csv`,rows)
  }
  function exportCapacity(){
    const qh=quarters.map((qt:any)=>`${fyLabel(qt.fy)} Q${qt.q}`)
    const rows:any[][]=[['Team','Person','Role','Project',...qh,'Cost']]
    for(const g of staff)for(const x of g.list){
      rows.push([g.team,x.person.name,x.role,'All work',...x.cells.map((v:number)=>Math.round(v)+'%'),Math.round(x.cost)])
      const pm=personMonth.get(x.person.id)
      for(const pid of x.projects)rows.push([g.team,x.person.name,x.role,projName(pid),...quarters.map((qt:any)=>Math.round(qPct(pm,qt,pid))+'%'),''])
    }
    download(`${strategy.name} - capacity.csv`,rows)
  }

  const loadColor=(v:number)=>v<1?'transparent':v<60?'rgba(200,151,58,0.25)':v<99.5?'rgba(200,151,58,0.45)':'rgba(39,174,96,0.35)'
  const planned=costed.filter(x=>x.state==='planned'),proposed=costed.filter(x=>x.state==='proposed')
  const nw=costed.filter(x=>x.workType!=='sustain'),su=costed.filter(x=>x.workType==='sustain')
  const curFy=(()=>{const t=new Date();return t.getMonth()>=3?t.getFullYear()+1:t.getFullYear()})()

  return(
    <div style={{flex:1,overflow:'auto',padding:'16px 20px 40px',background:'#0D1B2A'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const,marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:800,color:'#F4F6F8'}}>{strategy.name}</div>
        <span style={{fontSize:11,color:'#7A8FA6'}}>Report for this strategy only. Nothing here touches the main roadmap until you promote it.</span>
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          <select value={scope} onChange={e=>setScope(e.target.value)} style={BTN}>
            <option value="all">Everything on this roadmap</option>
            <option value="tracks">Projects on tracks only</option>
          </select>
          <button onClick={exportBudget} style={BTN}>⬇ Budget CSV</button>
          <button onClick={exportCapacity} style={BTN}>⬇ Capacity CSV</button>
        </div>
      </div>

      {/* Headline numbers */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:22}}>
        <Stat label="Total budget" value={fmtUSD(total)} sub={`${costed.length} costed project${costed.length!==1?'s':''}`} gold/>
        {fys.map((fy:number)=><Stat key={fy} label={fyLabel(fy)+(fy===curFy?' (this FY)':'')} value={fmtUSD(sumFy(costed,fy))} sub={total?Math.round(sumFy(costed,fy)/total*100)+'% of total':''}/>)}
        <Stat label="Planned · Proposed" value={`${fmtK(sumAll(planned))} · ${fmtK(sumAll(proposed))}`} sub={`${planned.length} planned, ${proposed.length} proposed`}/>
        <Stat label="New · Sustain" value={`${total?Math.round(sumAll(nw)/total*100):0}% · ${total?Math.round(sumAll(su)/total*100):0}%`} sub={`target ${100-(Number(strategy.bau_pct)||0)}/${Number(strategy.bau_pct)||0}`}/>
      </div>

      {/* Budget by team */}
      <div style={SECTION}>BUDGET BY TEAM</div>
      <div style={{...CARD,padding:0,overflowX:'auto',marginBottom:22}}>
        <table style={{borderCollapse:'collapse',width:'100%'}}>
          <thead><tr><th style={{...TH,textAlign:'left'}}>Team</th><th style={TH}>Projects</th>{fys.map((fy:number)=><th key={fy} style={TH}>{fyLabel(fy)}</th>)}<th style={TH}>Total</th><th style={TH}>Share</th></tr></thead>
          <tbody>
            {byTeam.map(g=>{const c=g.list.filter(x=>x.cost?.total>0);const t=sumAll(c);return(
              <tr key={g.team}>
                <td style={{...LTD,fontWeight:700,color:'#F4F6F8'}}>{g.team}</td>
                <td style={TD}>{c.length}/{g.list.length} costed</td>
                {fys.map((fy:number)=><td key={fy} style={TD}>{fmtK(sumFy(c,fy))}</td>)}
                <td style={{...TD,fontWeight:700,color:'#F4F6F8'}}>{fmtUSD(t)}</td>
                <td style={TD}>{total?Math.round(t/total*100):0}%</td>
              </tr>)})}
            <tr>
              <td style={{...LTD,fontWeight:800,color:'#C8973A'}}>Total</td><td style={TD}/>
              {fys.map((fy:number)=><td key={fy} style={{...TD,fontWeight:800,color:'#C8973A'}}>{fmtK(sumFy(costed,fy))}</td>)}
              <td style={{...TD,fontWeight:800,color:'#C8973A'}}>{fmtUSD(total)}</td><td style={TD}/>
            </tr>
          </tbody>
        </table>
        <div style={{padding:'6px 10px',fontSize:10.5,color:'#7A8FA6'}}>A project&apos;s cost counts toward the team that owns it, including Retail Program people working on it.</div>
      </div>

      {/* Budget by project */}
      <div style={SECTION}>BUDGET BY PROJECT</div>
      <div style={{...CARD,padding:0,overflowX:'auto',marginBottom:22}}>
        <table style={{borderCollapse:'collapse',width:'100%'}}>
          <thead><tr>
            <th style={{...TH,textAlign:'left'}}>Project</th><th style={{...TH,textAlign:'left'}}>Dates</th><th style={{...TH,textAlign:'left'}}>Dev · QA · PO</th>
            {fys.map((fy:number)=><th key={fy} style={TH}>{fyLabel(fy)}</th>)}<th style={TH}>Total</th>
          </tr></thead>
          <tbody>
            {byTeam.map(g=>(
              <Fragment key={g.team}>
                <tr><td colSpan={4+fys.length} style={{...LTD,background:'#1E3048',fontWeight:800,color:'#F4F6F8',fontSize:11,letterSpacing:0.5}}>{g.team.toUpperCase()}</td></tr>
                {g.list.map(x=>{const names=slotNames(x);return(
                  <tr key={x.p.id} onClick={()=>onOpen(x.p.id)} style={{cursor:'pointer'}} title="Open on the roadmap">
                    <td style={{...LTD,maxWidth:280,overflow:'hidden',textOverflow:'ellipsis'}}>
                      <span style={{color:'#F4F6F8',fontWeight:600}}>{x.p.name}</span>
                      {x.state==='proposed'&&<span style={{marginLeft:6,fontSize:9.5,fontWeight:700,color:PROPOSED,border:`1px solid ${PROPOSED}`,borderRadius:3,padding:'0 4px'}}>PROPOSED</span>}
                      {x.workType==='sustain'&&<span style={{marginLeft:6,fontSize:9.5,color:'#7A8FA6',border:'1px solid #4A5D72',borderRadius:3,padding:'0 4px'}}>SUSTAIN</span>}
                      {!x.onTrack&&<span style={{marginLeft:6,fontSize:9.5,color:'#7A8FA6'}}>backlog</span>}
                    </td>
                    <td style={LTD}>{x.s&&x.e?`${fmtD(x.s)} – ${fmtD(x.e)} · ${monthsBetween(x.s,x.e)} mo`:<span style={{color:'#D4820A'}}>No dates</span>}</td>
                    <td style={{...LTD,fontSize:11}}>{names.map((n,i)=><span key={i} style={{color:n?'#C8C8D4':'#E74C3C'}}>{i?' · ':''}{n||'—'}</span>)}{x.roster.length>names.filter(Boolean).length&&<span style={{color:'#7A8FA6'}}> +{x.roster.length-names.filter(Boolean).length}</span>}</td>
                    {x.cost?.total>0?<>
                      {fys.map((fy:number)=><td key={fy} style={TD}>{fmtK(fyCost(x,fy))}</td>)}
                      <td style={{...TD,fontWeight:700,color:'#F4F6F8'}}>{fmtUSD(x.cost.total)}</td>
                    </>:<td colSpan={fys.length+1} style={{...TD,color:'#D4820A',textAlign:'center'}}>Not costed: {x.reason||'no cost'}</td>}
                  </tr>)})}
                <tr>
                  <td colSpan={3} style={{...LTD,color:'#7A8FA6',fontWeight:700}}>{g.team} subtotal</td>
                  {fys.map((fy:number)=><td key={fy} style={{...TD,fontWeight:700}}>{fmtK(sumFy(g.list,fy))}</td>)}
                  <td style={{...TD,fontWeight:800,color:'#F4F6F8'}}>{fmtUSD(sumAll(g.list))}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        <div style={{padding:'6px 10px',fontSize:10.5,color:'#7A8FA6'}}>Ongoing projects are costed to the end of the strategy ({fmtD(winEnd)}). Click a project to open it on the roadmap.</div>
      </div>

      {/* Capacity by person */}
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' as const,marginBottom:8}}>
        <div style={{...SECTION,margin:0}}>CAPACITY BY PERSON</div>
        <span style={{fontSize:11,color:'#7A8FA6'}}>{allStaff.length} people · {idleNow} with no work in this strategy{stretched?` · ${stretched} on 3+ projects at once`:''}</span>
        <div style={{marginLeft:'auto',display:'flex',gap:10,alignItems:'center',fontSize:11,color:'#7A8FA6'}}>
          <select value={teamFilter} onChange={e=>setTeamFilter(e.target.value)} style={BTN}>
            <option value="all">All teams</option>
            {personTeams.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <label style={{display:'flex',gap:5,alignItems:'center',cursor:'pointer'}}><input type="checkbox" checked={showProjects} onChange={e=>setShowProjects(e.target.checked)} style={{accentColor:'#C8973A'}}/>Show projects</label>
          <label style={{display:'flex',gap:5,alignItems:'center',cursor:'pointer'}}><input type="checkbox" checked={hideIdle} onChange={e=>setHideIdle(e.target.checked)} style={{accentColor:'#C8973A'}}/>Hide people with no work</label>
        </div>
      </div>
      <div style={{...CARD,padding:0,overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%'}}>
          <thead>
            <tr><th style={{...TH,textAlign:'left'}}/>{fys.map((fy:number)=><th key={fy} colSpan={4} style={{...TH,textAlign:'center',borderLeft:'1px solid #243447'}}>{fyLabel(fy)}</th>)}<th style={TH}/></tr>
            <tr><th style={{...TH,textAlign:'left',top:29}}>Person · project</th>{quarters.map((qt:any,i:number)=><th key={i} style={{...TH,top:29,textAlign:'center',minWidth:44,borderLeft:qt.q===1?'1px solid #243447':undefined}}>Q{qt.q}</th>)}<th style={{...TH,top:29}}>Cost</th></tr>
          </thead>
          <tbody>
            {staff.map(g=>(
              <Fragment key={g.team}>
                <tr><td colSpan={quarters.length+2} style={{...LTD,background:'#1E3048',fontWeight:800,color:'#F4F6F8',fontSize:11,letterSpacing:0.5}}>{g.team.toUpperCase()}{g.team===SHARED_TEAM?' · SHARED ACROSS TEAMS':''}</td></tr>
                {g.list.map(x=>{const pm=personMonth.get(x.person.id);return(
                  <Fragment key={x.person.id}>
                    <tr>
                      <td style={{...LTD,minWidth:240}}>
                        <span style={{color:'#F4F6F8',fontWeight:700}}>{x.person.name}</span>
                        <span style={{color:'#7A8FA6',fontSize:11}}> · {x.role||'No role'}</span>
                        {x.person.termination_date&&x.person.termination_date<=winEnd&&<span style={{color:'#D4820A',fontSize:10.5}}> · leaves {fmtD(x.person.termination_date)}</span>}
                        {!x.projects.length&&<span style={{color:'#7A8FA6',fontSize:10.5,fontStyle:'italic'}}> · available</span>}
                      </td>
                      {x.cells.map((v:number,i:number)=><td key={i} title={`${Math.round(v)}% of working days assigned`} style={{...TD,textAlign:'center',fontWeight:700,color:v<1?'#3A4A5E':'#F4F6F8',background:loadColor(v),borderLeft:quarters[i].q===1?'1px solid #243447':undefined}}>{v<1?'·':Math.round(v)+'%'}</td>)}
                      <td style={{...TD,fontWeight:700,color:'#F4F6F8'}}>{x.cost?fmtUSD(x.cost):'—'}</td>
                    </tr>
                    {showProjects&&x.projects.map(pid=>(
                      <tr key={pid} onClick={()=>onOpen(pid)} style={{cursor:'pointer'}}>
                        <td style={{...LTD,paddingLeft:24,fontSize:11,color:'#A9B8C9',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis'}}>↳ {projName(pid)}</td>
                        {quarters.map((qt:any,i:number)=>{const v=qPct(pm,qt,pid),all=x.cells[i];const shared=v>=1&&all-v>=1;return(
                          <td key={i} title={shared?'Shared with other projects this quarter':''} style={{...TD,fontSize:11,textAlign:'center',color:v<1?'#2A3A4E':shared?'#C8973A':'#A9B8C9',borderLeft:qt.q===1?'1px solid #243447':undefined}}>{v<1?'':Math.round(v)+'%'}</td>)})}
                        <td style={TD}/>
                      </tr>
                    ))}
                  </Fragment>)})}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div style={{padding:'6px 10px',fontSize:10.5,color:'#7A8FA6',lineHeight:1.5}}>
          Each cell is the share of that quarter&apos;s working days the person is assigned. A person on two overlapping projects is 50% on each for that time; gold project figures mark quarters they&apos;re shared.
          Unnamed roles (no person picked) aren&apos;t listed here but are included in project costs.
        </div>
      </div>
    </div>
  )
}

function Stat({label,value,sub,gold}:{label:string,value:string,sub?:string,gold?:boolean}){
  return <div style={CARD}>
    <div style={{fontSize:10,color:'#7A8FA6',fontWeight:700,letterSpacing:0.5}}>{label.toUpperCase()}</div>
    <div style={{fontSize:17,fontWeight:800,color:gold?'#C8973A':'#F4F6F8',margin:'2px 0',fontVariantNumeric:'tabular-nums'}}>{value}</div>
    {sub&&<div style={{fontSize:10.5,color:'#7A8FA6'}}>{sub}</div>}
  </div>
}
