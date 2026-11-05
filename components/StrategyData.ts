// A strategy's budget and report numbers, worked out for any strategy (not only the one on
// screen), for the PowerPoint export. Mirrors the Strategy tab: each strategy's own placement
// of projects (strategy_items) and its own roster once edited there, the same allocation
// (StrategyBudget.computeAllocation) and the same report tables as StrategyReport.
import { computeAllocation, slotted, roleName, rateFor, capexShare, SLOTS, SHARED_TEAM } from './StrategyBudget'

const PROJECT_TERMINAL=['Complete','Cancelled','Done']
const pad=(n:number)=>String(n).padStart(2,'0')
const daysIn=(y:number,m:number)=>new Date(y,m,0).getDate()
const monthStartISO=(abs:number)=>{const y=Math.floor(abs/12),m=abs-y*12+1;return `${y}-${pad(m)}-01`}
const monthEndISO=(abs:number)=>{const y=Math.floor(abs/12),m=abs-y*12+1;return `${y}-${pad(m)}-${pad(daysIn(y,m))}`}
const workType=(p:any)=>p?.work_type==='sustain'||p?.planning_state==='bau'?'sustain':'new'
const workdays=(key:string)=>{const[y,m]=key.split('-').map(Number);let n=0;const d=new Date(y,m-1,1);while(d.getMonth()===m-1){if(d.getDay()!==0&&d.getDay()!==6)n++;d.setDate(d.getDate()+1)};return n}
const workdaysBetween=(a:string,b:string)=>{let n=0;const d=new Date(a+'T12:00:00'),e=new Date(b+'T12:00:00');while(d<=e){if(d.getDay()!==0&&d.getDay()!==6)n++;d.setDate(d.getDate()+1)};return n}
const Q_HOURS=520

// The strategy's view of every project, as the Strategy tab shows it
export function strategyProjects(strategy:any,projects:any[],strategyItems:any[]){
  const sRows=strategyItems.filter(r=>r.strategy_id===strategy.id&&r.item_type==='project')
  const mainState=(p:any)=>p?.planning_state==='proposed'?'proposed':'planned'
  return projects.filter(p=>(p.space||'work')==='work').map(p=>{
    const r=sRows.find(x=>x.item_id===p.id)
    return r?{...p,track_id:r.track_id,start_date:r.start_date,end_date:r.end_date,planning_state:r.planning_state||mainState(p),team:r.team??p.team,group_name:r.group_name||null,__row:r}
      :{...p,track_id:null,planning_state:mainState(p),group_name:null,__row:null}
  })
}

export function strategyBudget(strategy:any,{projects,strategyItems,tracks,strategyRoles,projectRoles,people,roles}:any){
  const live=strategyProjects(strategy,projects,strategyItems)
  const fys:number[]=[];for(let f=strategy.start_fy;f<=strategy.end_fy;f++)fys.push(f)
  const winStartAbs=(strategy.start_fy-1)*12+3
  const winStart=monthStartISO(winStartAbs),winEnd=monthEndISO(winStartAbs+fys.length*12-1)
  const trackIds=new Set(tracks.filter((t:any)=>t.strategy_id===strategy.id).map((t:any)=>t.id))
  const rosterOf=(p:any)=>p.__row?.roster_custom
    ?strategyRoles.filter((r:any)=>r.strategy_id===strategy.id&&r.project_id===p.id)
    :projectRoles.filter((r:any)=>r.project_id===p.id)
  const entries:any[]=live.filter(p=>!PROJECT_TERMINAL.includes(p.status)).map(p=>{
    const roster=rosterOf(p)
    const filled=slotted(roster,people,roles)
    const s=p.start_date?(p.start_date<winStart?winStart:p.start_date):null
    const e=p.end_date&&!(p.ongoing&&!p.__row?.end_date)?(p.end_date>winEnd?winEnd:p.end_date):winEnd
    return{p,onTrack:trackIds.has(p.track_id),state:p.planning_state==='proposed'?'proposed':'planned',workType:workType(p),roster,
      missing:SLOTS.filter(sl=>!filled.has(sl.key)).map(sl=>sl.label),s,e}
  })
  const allocation=computeAllocation(entries.filter(x=>x.s&&x.roster.length&&x.s<=x.e).map(x=>({p:x.p,s:x.s,e:x.e,rows:x.roster})),people,roles)
  for(const x of entries){
    const c=allocation.costs.get(x.p.id)
    x.cost=c||null
    x.reason=!x.s?'no dates':!x.roster.length?'no people':c&&c.total>0?'':'$0 rates'
  }
  const quarters:any[]=[]
  fys.forEach(fy=>[1,2,3,4].forEach(q=>{
    const first=winStartAbs+(fy-strategy.start_fy)*12+(q-1)*3
    quarters.push({fy,q,keys:[0,1,2].map(i=>monthStartISO(first+i).slice(0,7)),start:monthStartISO(first),end:monthEndISO(first+2)})
  }))
  return{entries,personMonth:allocation.personMonth,fys,quarters}
}

// The report's tables, for the full budget (as StrategyReport shows with "Full budget")
export function reportData({entries,personMonth,people,roles,teams,fys,quarters}:any){
  const costed=entries.filter((x:any)=>x.cost&&x.cost.total>0)
  const fyOf=(x:any,fy:number,key:string)=>x.cost?.byFy[fy]?.[key]||0
  const sumFy=(list:any[],fy:number,key='cost')=>list.reduce((s,x)=>s+fyOf(x,fy,key),0)
  const sumAll=(list:any[],key='cost')=>fys.reduce((s:number,fy:number)=>s+sumFy(list,fy,key),0)
  const personName=(id:any)=>people.find((p:any)=>p.id===id)?.name
  const slotNames=(x:any)=>{const f=slotted(x.roster,people,roles);return SLOTS.map(sl=>{const r=f.get(sl.key);return r?(personName(r.person_id)||roleName(r.role_id,roles)||'role'):null})}
  // Contractor cost by vendor
  const vendors=new Map<string,Record<number,number>>()
  for(const x of costed)for(const[v,byFy]of Object.entries(x.cost.vendors||{})){
    const acc=vendors.get(v)||{};for(const[fy,c]of Object.entries(byFy as any))acc[Number(fy)]=(acc[Number(fy)]||0)+(c as number);vendors.set(v,acc)
  }
  const vendorRows=[...vendors.entries()].map(([v,byFy])=>({v,byFy,total:Object.values(byFy).reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total)
  // Initiatives by team
  const teamNames=[...teams,...(entries.some((x:any)=>!x.p.team||!teams.includes(x.p.team))?['No team']:[])]
  const byTeam=teamNames.map((t:string)=>({team:t,list:entries.filter((x:any)=>t==='No team'?(!x.p.team||!teams.includes(x.p.team)):x.p.team===t)
    .sort((a:any,b:any)=>(b.cost?.total||0)-(a.cost?.total||0)||a.p.name.localeCompare(b.p.name))})).filter((g:any)=>g.list.length)
  // People: share of each quarter assigned, and per project
  const qPct=(pm:any,qt:any,pid?:string)=>{
    let on=0,days=0
    for(const k of qt.keys){days+=workdays(k);const cell=pm?.get(k);if(!cell)continue;if(pid)on+=cell.share.get(pid)||0;else for(const v of cell.share.values())on+=v as number}
    return days?on/days*100:0
  }
  const winStart=quarters[0]?.start
  const personTeams=[...teams,...(people.some((p:any)=>p.team===SHARED_TEAM)?[SHARED_TEAM]:[])]
  const projOf=(id:string)=>entries.find((x:any)=>x.p.id===id)?.p
  const staff=personTeams.map((team:string)=>({team,list:people.filter((p:any)=>p.team===team&&p.active!==false&&(!p.termination_date||p.termination_date>=winStart))
    .map((person:any)=>{
      const pm=personMonth.get(person.id)
      const projects=new Map<string,number>()
      if(pm)for(const cell of pm.values())for(const[pid,v]of cell.share)projects.set(pid,(projects.get(pid)||0)+(v as number))
      const rate=rateFor({person_id:person.id},people,roles)
      return{person,role:roleName(person.role_id,roles),projects:[...projects.keys()].map(id=>projOf(id)?.name||'Another initiative'),
        cost:[...projects.values()].reduce((s,d)=>s+d*8*rate,0),cells:quarters.map((qt:any)=>qPct(pm,qt))}
    }).sort((a:any,b:any)=>a.person.name.localeCompare(b.person.name))})).filter((g:any)=>g.list.length)
  // Team cost vs assigned, per quarter
  const teamCap=personTeams.map((team:string)=>{
    const ppl=people.filter((p:any)=>p.team===team&&p.active!==false&&(!p.termination_date||p.termination_date>=winStart))
    const cells=quarters.map((qt:any)=>{
      let full=0,assigned=0,capex=0
      for(const p of ppl){
        if(p.termination_date&&p.termination_date<qt.start)continue
        const rate=rateFor({person_id:p.id},people,roles)
        const avail=p.termination_date&&p.termination_date<qt.end?workdaysBetween(qt.start,p.termination_date)/workdaysBetween(qt.start,qt.end):1
        full+=Q_HOURS*rate*avail
        const pm=personMonth.get(p.id)
        assigned+=Q_HOURS*rate*qPct(pm,qt)/100
        const role=roles.find((r:any)=>r.id===p.role_id)
        const pids=new Set<string>();for(const k of qt.keys)for(const pid of pm?.get(k)?.share.keys()||[])pids.add(pid)
        for(const pid of pids)capex+=Q_HOURS*rate*qPct(pm,qt,pid)/100*capexShare(role,projOf(pid)?.budget_type||'build')
      }
      return{full,assigned,capex}
    })
    return{team,heads:ppl.length,cells}
  }).filter((t:any)=>t.heads)
  return{costed,fyOf,sumFy,sumAll,vendorRows,byTeam,slotNames,staff,teamCap}
}
