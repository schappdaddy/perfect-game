'use client'
import { useState } from 'react'
import { useMilestoneTypes } from './MilestoneTypes'
import { fyQuarterOf, monthKeyOf, quarterLabel } from './Releases'

// "⬇ Full plan" in the top bar: one PowerPoint of the whole plan, top to bottom. Pick the
// strategy, the four quarters, the team and work type, and which sections to include.
const nextQ=(fy:number,q:number,n:number)=>{q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}return{fy,q}}
const SECTIONS:[string,string,string][]=[
  ['roadmap','Strategy roadmap','By track and by team'],
  ['budget','Budget & capacity','Summary, by team, by initiative, by person'],
  ['quarters','Quarter plan','Four quarters on one slide'],
  ['releases','Release plan','One slide per quarter'],
  ['calendar','Release calendar','The fiscal year month by month: what ships in each release'],
  ['epics','Epics','Each epic and what\'s in it: in the plan, later, or not planned'],
  ['sprints','Sprints','One slide per release: each team\'s sprints'],
  ['unplanned','Not planned yet','Initiatives with no dates; work with no quarter'],
  ['readiness','Readiness','PRD and Design approvals: by quarter, and what\'s not ready'],
]

export function FullPlanButton(props:any){
  const [open,setOpen]=useState(false)
  return(<>
    <button onClick={()=>setOpen(true)} title="Download the whole plan as one PowerPoint: strategy, quarters, releases, sprints and what's not planned yet"
      style={{background:'none',border:'1px solid rgba(224,123,42,0.55)',borderRadius:14,color:'#E07B2A',fontSize:11,fontWeight:700,padding:'4px 11px',cursor:'pointer',whiteSpace:'nowrap' as const}}>⬇ Full plan</button>
    {open&&<FullPlanDialog {...props} onClose={()=>setOpen(false)}/>}
  </>)
}

// lockTeam: a team's own plan (the Teams page); startN0: which four quarters to start on
export function FullPlanDialog({onClose,strategies=[],projects,items,epics,releases,milestones,sprints,strategyItems,tracks,goals,deps,strategyRoles,projectRoles,people,roles,teams,workTypeOf,epicWorkTypeOf,lockTeam,startN0=0}:any){
  const mTypes=useMilestoneTypes()
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const [startN,setStartN]=useState(startN0)
  const [team,setTeam]=useState(lockTeam||'__all')
  const [wt,setWt]=useState('all')
  const [sec,setSec]=useState<any>({roadmap:true,budget:true,quarters:true,releases:true,calendar:true,epics:true,sprints:true,unplanned:true,readiness:true})
  const [busy,setBusy]=useState(false)
  // The deck is the agreed plan: only the promoted strategy goes in (the most recently promoted).
  // Other strategies are what-ifs that stay on the Strategy tab.
  const strategy=(strategies as any[]).filter((s:any)=>s.promoted_at).sort((a:any,b:any)=>String(b.promoted_at).localeCompare(String(a.promoted_at)))[0]||null
  const start=nextQ(cur.fy,cur.q,startN),end=nextQ(start.fy,start.q,3)
  const any=Object.entries(sec).some(([k,v])=>v&&(strategy||(k!=='roadmap'&&k!=='budget')))
  async function go(){
    setBusy(true)
    try{
      const{exportFullPlanPptx}=await import('./PlanDeck')
      await exportFullPlanPptx({strategy,strategyCtx:{projects,strategyItems,tracks,goals,deps,strategyRoles,projectRoles,people,roles,teams},
        plan:{items,epics,projects,releases,milestones,mTypes,sprints,start,team,wt,teams,workTypeOf,epicWorkTypeOf},sections:sec,
        fileName:`${team!=='__all'?`${team} plan`:'Full plan'} ${quarterLabel(start.fy,start.q)} - ${quarterLabel(end.fy,end.q)}`})
      onClose()
    }catch(e:any){alert('Failed to build the PowerPoint: '+(e?.message||e))}
    setBusy(false)
  }
  const lab={fontSize:10.5,fontWeight:700,color:'#7A8FA6',letterSpacing:0.6,marginBottom:4}
  const inp={width:'100%',background:'#0F1C2B',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:12,padding:'6px 8px'}
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(5,10,18,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:520,maxWidth:'calc(100vw - 32px)',background:'#162436',border:'1px solid #243447',borderRadius:12,padding:'18px 20px',boxShadow:'0 20px 50px rgba(0,0,0,0.5)'}}>
        <div style={{display:'flex',alignItems:'center',marginBottom:4}}>
          <span style={{fontSize:16,fontWeight:800,color:'#F4F6F8',flex:1}}>⬇ {lockTeam?`${lockTeam} plan`:'Full plan'} PowerPoint</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer'}}>×</button>
        </div>
        <div style={{fontSize:11.5,color:'#7A8FA6',marginBottom:14}}>Strategy → quarters → releases → sprints → what&apos;s not planned yet, in one deck.{team!=='__all'?` Only ${team}: its initiatives, people, work and sprints.`:''}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          <div style={{gridColumn:'1 / -1'}}><div style={lab}>STRATEGY</div>
            <div title="The deck shows the plan as promoted. To include a different strategy, promote it on the Strategy tab." style={{...inp,boxSizing:'border-box' as const,color:strategy?'#F4F6F8':'#7A8FA6'}}>
              {strategy?<>{strategy.name} <span style={{color:'#7A8FA6'}}>· promoted {new Date(strategy.promoted_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></>
                :'No strategy promoted yet: the strategy slides are left out'}
            </div></div>
          <div><div style={lab}>QUARTERS</div>
            <select value={startN} onChange={e=>setStartN(Number(e.target.value))} style={inp}>
              {[-1,0,1,2].map(n=>{const a=nextQ(cur.fy,cur.q,n),b=nextQ(a.fy,a.q,3);return <option key={n} value={n}>{quarterLabel(a.fy,a.q)} – {quarterLabel(b.fy,b.q)}{n===0?' (from now)':''}</option>})}
            </select></div>
          <div><div style={lab}>TEAM</div>
            <select value={team} disabled={!!lockTeam} onChange={e=>setTeam(e.target.value)} style={{...inp,opacity:lockTeam?0.7:1}}><option value="__all">All teams</option>{teams.map((t:string)=><option key={t} value={t}>{t}</option>)}</select></div>
          <div><div style={lab}>WORK TYPE</div>
            <select value={wt} onChange={e=>setWt(e.target.value)} style={inp}><option value="all">All work</option><option value="new">New</option><option value="sustain">Sustain</option><option value="saas">SaaS deliverable</option></select></div>
        </div>
        <div style={lab}>INCLUDE</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
          {SECTIONS.map(([k,l,d])=>{const off=(k==='roadmap'||k==='budget')&&!strategy;return(
            <label key={k} style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,color:off?'#3A4A5E':'#F4F6F8',cursor:off?'default':'pointer'}}>
              <input type="checkbox" disabled={off} checked={!!sec[k]&&!off} onChange={e=>setSec((s:any)=>({...s,[k]:e.target.checked}))} style={{accentColor:'#C8973A'}}/>
              <span style={{fontWeight:700}}>{l}</span><span style={{color:'#7A8FA6',fontSize:11}}>{d}</span>
            </label>)})}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={onClose} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'7px 14px',cursor:'pointer'}}>Cancel</button>
          <button onClick={go} disabled={busy||!any} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:800,padding:'7px 16px',cursor:'pointer',opacity:busy||!any?0.6:1}}>{busy?'Building…':'⬇ Download'}</button>
        </div>
      </div>
    </div>
  )
}
