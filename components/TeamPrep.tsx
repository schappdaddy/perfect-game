'use client'
import { useState } from 'react'
import { useMilestoneTypes } from './MilestoneTypes'
import { fyQuarterOf, monthKeyOf, quarterLabel, fmtMonthKey, releaseOf } from './Releases'
import { planModel } from './PlanDeck'
import { FullPlanDialog } from './FullPlanExport'
import { workTypeOfProject, WT_LABEL } from './WorkTypes'

// The Teams tab: a briefing page to prep for each team, top to bottom: the team at a glance,
// its roadmap, the quarter plan, releases, sprints, milestones, people, and what's not planned
// yet. It reads the plan the same way as the PowerPoint (PlanDeck.planModel), and '⬇ Team
// plan' exports the full plan for just this team.

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const INIT_DONE=['Complete','Cancelled','Done']
const KIND:any={initiative:{c:'#C8973A',bg:'rgba(200,151,58,0.12)',l:'INITIATIVE'},epic:{c:'#E07B2A',bg:'rgba(224,123,42,0.10)',l:'EPIC'},story:{c:'#5DADE2',bg:'rgba(93,173,226,0.08)',l:'STORY'}}
const nextQ=(fy:number,q:number,n:number)=>{q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}return{fy,q}}
const pad=(n:number)=>String(n).padStart(2,'0')
const fmtDay=(iso:string)=>{const[,m,d]=iso.split('-').map(Number);return `${MONTHS[m-1]} ${d}`}

export default function TeamPrep(props:any){
  const{items,epics,projects,releases,milestones,sprints,people,roles,projectRoles,teams,workTypeOf,epicWorkTypeOf,onOpenProject}=props
  const mTypes=useMilestoneTypes()
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const [team,setTeamS]=useState<string>(()=>{try{const v=localStorage.getItem('pg_team_prep');if(v&&teams.includes(v))return v}catch{};return teams[0]})
  const setTeam=(v:string)=>{setTeamS(v);try{localStorage.setItem('pg_team_prep',v)}catch{}}
  const [startN,setStartN]=useState(0)
  const [exportOpen,setExportOpen]=useState(false)
  const start=nextQ(cur.fy,cur.q,startN)
  const m=planModel({items,epics,projects,releases,milestones,mTypes,sprints,start,team,wt:'all',teams,workTypeOf,epicWorkTypeOf})
  const months=m.quarters.flatMap((q:any)=>q.months)
  const winStart=`${months[0]}-01`,winEnd=(()=>{const[y,mm]=months[11].split('-').map(Number);return `${months[11]}-${pad(new Date(y,mm,0).getDate())}`})()

  // At a glance
  const inits=projects.filter((p:any)=>p.team===team&&!p.sustain_quarter&&(p.space||'work')==='work'&&!INIT_DONE.includes(p.status))
    .sort((a:any,b:any)=>(a.start_date||'9999').localeCompare(b.start_date||'9999')||a.name.localeCompare(b.name))
  const goLives=inits.filter((p:any)=>p.release_month&&months.includes(p.release_month))
  const thisQ=m.quarterCols[0].cards.filter((c:any)=>c.kind!=='initiative').length
  const crew=people.filter((p:any)=>p.team===team&&p.active!==false)
  const today=new Date().toISOString().slice(0,10)
  const nextRel=months.map((k:string)=>({k,r:releaseOf(releases,k)})).find((x:any)=>!x.r?.no_release&&(x.r?.release_date||`${x.k}-28`)>=today)
  const nextRelCount=nextRel?items.filter((i:any)=>i.release_month===nextRel.k&&i.team===team).length+epics.filter((e:any)=>e.release_month===nextRel.k&&(e.team===team||projects.find((p:any)=>p.id===e.project_id)?.team===team)).length:0
  const teamSprints=sprints.filter((s:any)=>s.team===team).sort((a:any,b:any)=>a.start_date<b.start_date?-1:1)
  const curSprint=teamSprints.find((s:any)=>s.start_date<=today&&s.end_date>=today)

  const box={background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'14px 16px',marginBottom:16}
  const H=(t:string,sub?:string)=><div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:10}}><span style={{fontSize:12,fontWeight:800,color:'#C8973A',letterSpacing:1}}>{t}</span>{sub&&<span style={{fontSize:11,color:'#7A8FA6'}}>{sub}</span>}</div>
  const tile=(label:string,value:any,sub?:string,clr='#F4F6F8')=>(
    <div style={{flex:'1 1 150px',background:'#162436',border:'1px solid #243447',borderRadius:10,padding:'12px 14px'}}>
      <div style={{fontSize:10.5,fontWeight:700,color:'#7A8FA6',letterSpacing:0.6}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:clr,marginTop:2}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:'#7A8FA6',marginTop:2}}>{sub}</div>}
    </div>)

  // ── Roadmap: the team's initiatives across the twelve months ──
  const pos=(iso:string)=>{const[y,mm,d]=iso.split('-').map(Number);const ix=months.indexOf(`${y}-${pad(mm)}`);if(ix<0)return iso<winStart?0:100;return(ix+(d-1)/new Date(y,mm,0).getDate())/12*100}
  const relDate=(k:string)=>releaseOf(releases,k)?.release_date||`${k}-28`
  const roadmap=(
    <div style={box}>
      {H('ROADMAP',`${inits.length} initiative${inits.length!==1?'s':''} · ${quarterLabel(m.quarters[0].fy,m.quarters[0].q)} – ${quarterLabel(m.quarters[3].fy,m.quarters[3].q)}`)}
      <div style={{display:'grid',gridTemplateColumns:'220px 1fr',fontSize:11}}>
        <div/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(12,1fr)',borderBottom:'1px solid #243447',marginBottom:4}}>
          {months.map((k:string,i:number)=>{const fr=releaseOf(releases,k)?.no_release;return(
            <div key={k} style={{textAlign:'center' as const,padding:'3px 0',color:fr?'#D4820A':'#7A8FA6',fontWeight:700,fontSize:10,borderLeft:i%3===0?'1px solid #3A4A5E':'1px solid #1C2C3F',background:k===monthKeyOf(new Date())?'rgba(200,151,58,0.1)':undefined}}>
              {MONTHS[Number(k.split('-')[1])-1]}{fr?' ❄':''}</div>)})}
        </div>
        {inits.map((p:any)=>{
          const s=p.start_date,e=p.ongoing?winEnd:p.end_date,on=s&&e&&e>=winStart&&s<=winEnd
          const ships=[p.release_month,...epics.filter((x:any)=>x.project_id===p.id).map((x:any)=>x.release_month),...items.filter((x:any)=>x.parent_project===p.name).map((x:any)=>x.release_month)].filter((k:any)=>k&&months.includes(k)).sort()
          const thr=ships[ships.length-1]
          const wt=workTypeOfProject(p)
          return(<div key={p.id} style={{display:'contents'}}>
            <div onClick={()=>onOpenProject?.(p)} title="Open this initiative" style={{padding:'6px 8px 6px 0',cursor:'pointer',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',color:'#F4F6F8',fontWeight:700,borderBottom:'1px solid #1C2C3F'}}>
              <span style={{color:'#C8973A'}}>◈</span> {p.name} <span style={{color:'#7A8FA6',fontWeight:400,fontSize:10}}>{wt!=='new'?(WT_LABEL as any)[wt]:''}</span></div>
            <div style={{position:'relative',height:30,borderBottom:'1px solid #1C2C3F',background:'repeating-linear-gradient(90deg,transparent 0,transparent calc(25% - 1px),#243447 calc(25% - 1px),#243447 25%)'}}>
              {on&&<div title={`${s} → ${p.ongoing?'ongoing':p.end_date}`} style={{position:'absolute',top:7,height:16,left:`${pos(s<winStart?winStart:s)}%`,width:`${Math.max(1,pos(e>winEnd?winEnd:e)-pos(s<winStart?winStart:s))}%`,background:p.planning_state==='proposed'?'rgba(224,123,42,0.35)':'rgba(39,174,96,0.75)',border:p.ongoing?'1px dashed rgba(255,255,255,0.4)':undefined,borderRadius:5}}/>}
              {!s&&<span style={{position:'absolute',left:6,top:8,fontSize:10,color:'#5B6B7E',fontStyle:'italic'}}>No dates yet</span>}
              {thr&&thr!==p.release_month&&<span title={`Its work ships through the ${fmtMonthKey(thr)} release`} style={{position:'absolute',top:4,left:`${pos(relDate(thr))}%`,transform:'translateX(-50%)',fontSize:9,fontWeight:800,color:'#5DADE2',border:'1px dashed #5DADE2',background:'#0D1B2A',borderRadius:8,padding:'0 5px',whiteSpace:'nowrap' as const}}>📦 through {MONTHS[Number(thr.split('-')[1])-1]}</span>}
              {p.release_month&&months.includes(p.release_month)&&<span title={`Goes live in the ${fmtMonthKey(p.release_month)} release`} style={{position:'absolute',top:4,left:`${pos(relDate(p.release_month))}%`,transform:'translateX(-50%)',fontSize:9,fontWeight:800,color:'#0D1B2A',background:'#C8973A',borderRadius:8,padding:'0 5px',whiteSpace:'nowrap' as const}}>◈ go-live {MONTHS[Number(p.release_month.split('-')[1])-1]}</span>}
            </div>
          </div>)
        })}
        {!inits.length&&<div style={{gridColumn:'1 / -1',fontSize:11,color:'#7A8FA6',fontStyle:'italic',padding:6}}>No open initiatives for {team}.</div>}
      </div>
    </div>
  )

  // ── A board of columns (quarters, months or sprints), cards grouped by initiative ──
  const board=(cols:any[],empty='Nothing here.')=>(
    <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:4}}>
      {cols.map((c:any,ix:number)=>{
        const groups=new Map<string,any[]>()
        for(const cd of c.cards){const g=cd.kind==='initiative'?'◈ Initiatives':cd.home||'No initiative';if(!groups.has(g))groups.set(g,[]);groups.get(g)!.push(cd)}
        const slim=c.blocked&&!c.cards.length&&!c.milestones.length
        return(
          <div key={ix} style={{flex:slim?'0 0 70px':'1 0 240px',minWidth:slim?70:240,background:c.blocked?'repeating-linear-gradient(135deg,#0F1C2B,#0F1C2B 8px,#132234 8px,#132234 16px)':'#0F1C2B',border:`1px solid ${c.now?'#C8973A':'#243447'}`,borderRadius:8}}>
            <div style={{padding:'8px 10px',borderBottom:'1px solid #243447'}}>
              <div style={{fontSize:13,fontWeight:800,color:c.blocked?'#7A8FA6':'#F4F6F8'}}>{c.title}{c.now&&<span style={{fontSize:9,color:'#C8973A',marginLeft:6}}>NOW</span>}</div>
              {c.sub&&<div style={{fontSize:10.5,color:c.blocked?'#D4820A':'#E8B95A'}}>{c.sub}</div>}
              {!slim&&(c.meta||[]).map((t:string,i:number)=><div key={i} style={{fontSize:10,color:'#7A8FA6'}}>{t}</div>)}
            </div>
            {!slim&&<div style={{padding:8,display:'flex',flexDirection:'column',gap:6}}>
              {c.milestones.length>0&&<div style={{border:'1px solid rgba(176,124,224,0.5)',background:'rgba(176,124,224,0.07)',borderRadius:6,padding:'5px 7px'}}>
                {c.milestones.map((ms:any,i:number)=><div key={i} style={{display:'flex',gap:5,alignItems:'center',fontSize:10.5,color:ms.done?'#7A8FA6':'#E1E7EE',textDecoration:ms.done?'line-through':undefined}}>
                  <span style={{width:7,height:7,transform:'rotate(45deg)',background:ms.done?'#27AE60':ms.color||'#B07CE0',flexShrink:0}}/><b>{ms.date}</b><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{ms.type} · {ms.name}</span></div>)}
              </div>}
              {[...groups.entries()].map(([g,cards])=>(
                <div key={g} style={{display:'flex',flexDirection:'column',gap:4,borderLeft:`2px solid ${g.startsWith('◈')?'rgba(200,151,58,0.55)':'#3A4A5E'}`,paddingLeft:6}}>
                  {g!=='◈ Initiatives'&&<div style={{fontSize:10,fontWeight:800,color:g.startsWith('◈')?'#C8973A':'#8FA6BC',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{g.startsWith('Tech debt')?'🔧 ':''}{g}</div>}
                  {cards.map((cd:any,i:number)=>{const K=KIND[cd.kind];return(
                    <div key={i} style={{background:K.bg,borderLeft:`3px solid ${K.c}`,borderRadius:5,padding:'4px 7px'}}>
                      <div style={{display:'flex',gap:5,alignItems:'center',fontSize:9,fontWeight:800,color:K.c,flexWrap:'wrap' as const}}>
                        <span>{K.l}</span>{cd.ref&&<span style={{color:'#7A8FA6',fontFamily:'monospace'}}>{cd.ref}</span>}
                        <span style={{marginLeft:'auto',color:'#7A8FA6',fontWeight:700}}>{[cd.priority,cd.status,cd.release?`📦 ${cd.release}`:null,cd.quarter].filter(Boolean).join(' · ')}</span>
                      </div>
                      <div style={{fontSize:11.5,color:'#F4F6F8',fontWeight:cd.kind==='story'?400:700,lineHeight:1.3}}>{cd.name}</div>
                      {cd.flag&&<div style={{fontSize:9.5,fontWeight:700,color:'#E74C3C'}}>⚠ {cd.flag}</div>}
                    </div>)})}
                </div>
              ))}
              {!c.cards.length&&!c.milestones.length&&<div style={{fontSize:10.5,color:'#3A4A5E',fontStyle:'italic'}}>{c.blocked?'No release this month.':'Nothing planned.'}</div>}
            </div>}
          </div>
        )
      })}
      {!cols.length&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>{empty}</div>}
    </div>
  )

  // ── Milestones of the team's initiatives in the window ──
  const ms=milestones.filter((x:any)=>x.date&&x.date>=winStart&&x.date<=winEnd&&(x.space||'work')==='work'&&projects.find((p:any)=>p.id===x.project_id)?.team===team).sort((a:any,b:any)=>a.date.localeCompare(b.date))
  const mtype=(t:any)=>mTypes.find((x:any)=>x.name.toLowerCase()===String(t||'Milestone').toLowerCase())

  return(
    <div style={{height:'100%',overflowY:'auto',background:'#0D1B2A'}}>
      {/* Sticky header */}
      <div style={{position:'sticky',top:0,zIndex:20,background:'#162436',borderBottom:'1px solid #243447',padding:'10px 24px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
        <span style={{fontSize:18,fontWeight:800,color:'#F4F6F8'}}>⬡ Team prep</span>
        <div style={{display:'flex',border:'1px solid #243447',borderRadius:6,overflow:'hidden'}}>
          {teams.map((t:string)=><button key={t} onClick={()=>setTeam(t)} style={{background:t===team?'#C8973A':'#1E3048',color:t===team?'#0D1B2A':'#C8C8D4',border:'none',fontSize:12,fontWeight:700,padding:'6px 12px',cursor:'pointer'}}>{t}</button>)}
        </div>
        <select value={startN} onChange={e=>setStartN(Number(e.target.value))} style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,fontSize:12,padding:'5px 8px'}}>
          {[-1,0,1,2].map(n=>{const a=nextQ(cur.fy,cur.q,n),b=nextQ(a.fy,a.q,3);return <option key={n} value={n}>{quarterLabel(a.fy,a.q)} – {quarterLabel(b.fy,b.q)}{n===0?' (from now)':''}</option>})}
        </select>
        <button onClick={()=>setExportOpen(true)} style={{marginLeft:'auto',background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:800,padding:'7px 14px',cursor:'pointer'}}>⬇ {team} plan</button>
      </div>
      <div style={{padding:'16px 24px 40px',maxWidth:1600}}>
        {/* At a glance */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap' as const,marginBottom:16}}>
          {tile('ACTIVE INITIATIVES',inits.length,`${inits.filter((p:any)=>p.planning_state==='proposed').length} proposed`)}
          {tile('GO-LIVES',goLives.length,goLives.slice(0,3).map((p:any)=>`${MONTHS[Number(p.release_month.split('-')[1])-1]}: ${p.name}`).join(' · ')||'none in these quarters','#C8973A')}
          {tile(`PLANNED ${m.quarterCols[0].title}`,thisQ,'epics and stories this quarter','#5DADE2')}
          {tile('NEXT RELEASE',nextRel?fmtDay(nextRel.r?.release_date||`${nextRel.k}-01`):'—',nextRel?`${fmtMonthKey(nextRel.k)} · ${nextRelCount} item${nextRelCount!==1?'s':''} for ${team}${nextRel.r?.release_date?'':' · date not set'}`:'no release ahead')}
          {tile('SPRINT',curSprint?`S${teamSprints.indexOf(curSprint)+1}`:'—',curSprint?`${fmtDay(curSprint.start_date)} – ${fmtDay(curSprint.end_date)} · ${items.filter((i:any)=>i.sprint_id===curSprint.id).length} items`:'no sprint running')}
          {tile('NOT PLANNED',m.unplannedRows.length+m.undatedInits.length,`${m.unplannedRows.length} epics/stories · ${m.undatedInits.length} initiatives`,m.unplannedRows.length?'#E8B95A':'#F4F6F8')}
          {tile('PEOPLE',crew.length,[...new Set(crew.map((p:any)=>roles.find((r:any)=>r.id===p.role_id)?.name).filter(Boolean))].slice(0,3).join(' · '))}
        </div>

        {roadmap}

        <div style={box}>{H('QUARTER PLAN','What the team works on each quarter, by initiative')}{board(m.quarterCols)}</div>

        <div style={box}>{H('RELEASES','What ships in each monthly release')}
          {m.releaseSlides.length?m.releaseSlides.map((r:any,i:number)=>(
            <div key={i} style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,color:'#8FA6BC',marginBottom:6}}>{r.label}</div>{board(r.cols)}</div>
          )):<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No releases planned for {team} in these quarters.</div>}
        </div>

        <div style={box}>{H('SPRINTS','Each release’s sprints, and what’s planned for it but not in a sprint yet')}
          {m.sprintSlides.length?m.sprintSlides.map((r:any,i:number)=>(
            <div key={i} style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,color:'#8FA6BC',marginBottom:6}}>{r.label}</div>{board(r.cols)}</div>
          )):<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No {team} sprints in these quarters yet.</div>}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:16}}>
          <div style={{...box,marginBottom:0}}>{H('MILESTONES',`${ms.length} in these quarters`)}
            {ms.map((x:any)=>{const p=projects.find((pp:any)=>pp.id===x.project_id),t=mtype(x.type);return(
              <div key={x.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:11.5,padding:'5px 0',borderBottom:'1px solid #1C2C3F',opacity:x.completed?0.55:1}}>
                <span style={{width:9,height:9,transform:'rotate(45deg)',background:x.completed?'#27AE60':t?.color||'#B07CE0',flexShrink:0}}/>
                <b style={{color:'#F4F6F8',width:52,flexShrink:0}}>{fmtDay(x.date)}</b>
                <span style={{fontSize:9.5,fontWeight:800,color:t?.color||'#B07CE0',border:`1px solid ${t?.color||'#B07CE0'}`,borderRadius:8,padding:'0 5px',flexShrink:0}}>{t?.name||x.type||'Milestone'}</span>
                <span style={{color:'#E1E7EE',flex:1,textDecoration:x.completed?'line-through':undefined}}>{x.name}</span>
                <span style={{color:'#C8973A',fontSize:10.5}}>{p?.name}</span>
              </div>)})}
            {!ms.length&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No milestones in these quarters.</div>}
          </div>
          <div style={{...box,marginBottom:0}}>{H('PEOPLE',`${crew.length} on ${team}`)}
            {crew.map((p:any)=>{
              const its=[...new Set(projectRoles.filter((r:any)=>r.person_id===p.id).map((r:any)=>projects.find((pp:any)=>pp.id===r.project_id)).filter((pp:any)=>pp&&!INIT_DONE.includes(pp.status)).map((pp:any)=>pp.name))] as string[]
              return(
                <div key={p.id} style={{display:'flex',alignItems:'flex-start',gap:8,fontSize:11.5,padding:'5px 0',borderBottom:'1px solid #1C2C3F'}}>
                  <b style={{color:'#F4F6F8',width:140,flexShrink:0}}>{p.name}</b>
                  <span style={{color:'#7A8FA6',width:150,flexShrink:0}}>{roles.find((r:any)=>r.id===p.role_id)?.name||'—'}</span>
                  <span style={{display:'flex',gap:4,flexWrap:'wrap' as const}}>{its.length?its.map(n=><span key={n} style={{fontSize:10,color:'#C8973A',border:'1px solid rgba(200,151,58,0.4)',borderRadius:8,padding:'0 6px'}}>{n}</span>):<span style={{color:'#3A4A5E',fontStyle:'italic'}}>not on an initiative</span>}</span>
                </div>)
            })}
            {!crew.length&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No people on {team} yet (add them on the Budget tab).</div>}
          </div>
        </div>

        <div style={{...box,marginTop:16}}>{H('NOT PLANNED YET',`${m.undatedInits.length} initiatives with no dates · ${m.unplannedRows.length} epics and stories with no quarter, by initiative and priority`)}
          {m.undatedInits.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:10}}>
            {m.undatedInits.map((p:any)=><span key={p.id} onClick={()=>onOpenProject?.(p)} style={{cursor:'pointer',fontSize:11,color:'#C8973A',border:'1px dashed rgba(200,151,58,0.6)',borderRadius:10,padding:'2px 9px'}}>◈ {p.name} · no dates</span>)}
          </div>}
          {(()=>m.unplannedRows.map((r:any,i:number)=>{const head=i===0||r.group!==m.unplannedRows[i-1].group;return(
            <div key={i}>
              {head&&<div style={{fontSize:10.5,fontWeight:800,color:r.group==='No initiative'?'#8FA6BC':'#C8973A',margin:'8px 0 3px'}}>{r.group==='No initiative'?'○':'◈'} {r.group}</div>}
              <div style={{display:'grid',gridTemplateColumns:'54px 80px 1fr 70px 40px 120px',gap:8,alignItems:'center',fontSize:11.5,padding:'4px 0 4px 10px',borderBottom:'1px solid #1C2C3F'}}>
                <span style={{fontSize:9,fontWeight:800,color:r.kind==='Epic'?'#E07B2A':'#5DADE2'}}>{r.kind.toUpperCase()}</span>
                <span style={{color:'#7A8FA6',fontFamily:'monospace',fontSize:10.5}}>{r.ref}</span>
                <span style={{color:'#F4F6F8'}}>{r.name}{r.stories?<span style={{color:'#7A8FA6'}}> · {r.stories} open stor{r.stories===1?'y':'ies'}</span>:''}</span>
                <span style={{color:'#7A8FA6'}}>{r.wt}</span>
                <span style={{fontWeight:700,color:r.priority==='P1'?'#E74C3C':r.priority==='P2'?'#D4820A':'#7A8FA6'}}>{r.priority}</span>
                <span style={{color:'#7A8FA6'}}>{r.status}</span>
              </div>
            </div>)}))()}
          {!m.unplannedRows.length&&!m.undatedInits.length&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>Everything for {team} is planned.</div>}
        </div>
      </div>
      {exportOpen&&<FullPlanDialog {...props} lockTeam={team} startN0={startN} onClose={()=>setExportOpen(false)}/>}
    </div>
  )
}
