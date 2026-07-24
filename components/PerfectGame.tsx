'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const T = {
  navy:'#0D1B2A',navyMid:'#162436',navyLt:'#1E3048',
  gold:'#C8973A',goldLt:'#E8B95A',white:'#F4F6F8',
  muted:'#7A8FA6',border:'#243447',
  p1:'#C00000',p1Bg:'#2D1515',p2:'#D4820A',p2Bg:'#2D1E0A',
  p3:'#2E86AB',green:'#27AE60',purple:'#8E44AD',
}

const PRIORITIES=['P1','P2','P3','P4','Backlog']
const STATUSES=['New','Need Requirements','Under Review','Accepted','Ready','In Progress','Testing','Ready for Deployment','Blocked','Done','Awaiting Vendor Deliverable','Will Not Implement']
const HOME_STATUSES=['To Do','In Progress','Waiting','Done',"Won't Do"]
const HOME_PROJECT_STATUSES=['Planning','In Progress','Waiting','Done','Cancelled']
const spaceOf=(x:any)=>(x?.space||'work')
const statusesFor=(space:string)=>space==='home'?HOME_STATUSES:STATUSES
const projectStatusesFor=(space:string)=>space==='home'?HOME_PROJECT_STATUSES:PROJECT_STATUSES
const PROJECT_STATUSES=['Queued','Planning','In Progress','Testing','On Hold','Complete','Cancelled']
const TEAMS=['Consumer Experience','Operational Efficiency']
const EFFORTS=['S','M','L','XL']
const EFFORT_ALLOC:any={S:25,M:50,L:75,XL:100} // default per-person allocation % this project's size implies
const REQUEST_TYPES=['Bug','Tech Debt','Enhancement','Strategic Initiative','Business Request','Testing']
const MILESTONE_TYPES_G=['Milestone','Go-Live','Deadline','Review','Release','Code Freeze','UAT','Kickoff']
const SWIMLANES=['POS','Pricing','Tax','Loyalty','WFM','Inventory','Reporting','SafeSize','Product','Clienteling','Integrations']
const PRIORITY_ORDER={P1:0,P2:1,P3:2,P4:3,Backlog:4}
const RAG_COLORS={Green:'#27AE60',Amber:'#D4820A',Red:'#C0392B'}

function pc(p) {
  if(p==='P1') return {bg:'#C00000',text:'#fff'}
  if(p==='P2') return {bg:'#D4820A',text:'#fff'}
  if(p==='P3') return {bg:'#2E86AB',text:'#fff'}
  return {bg:'#1E3048',text:'#7A8FA6'}
}
// Terminal statuses — these move records to the Done tab and out of working views
const ITEM_TERMINAL=['Done','Will Not Implement',"Won't Do"]
const PROJECT_TERMINAL=['Complete','Cancelled','Done'] // 'Done' is the home-space project terminal
const isItemDone=(i:any)=>ITEM_TERMINAL.includes(i?.status)
const isProjectDone=(p:any)=>PROJECT_TERMINAL.includes(p?.status)
// Set an item's status; if terminal, retire its rank and compact remaining ranks
async function applyItemStatus(items:any[],setItems:any,id:any,v:string){
  const target=items.find(i=>i.id===id)
  if(!target) return
  if(!ITEM_TERMINAL.includes(v)){
    setItems((prev:any[])=>prev.map(i=>i.id===id?{...i,status:v}:i))
    await supabase.from('items').update({status:v}).eq('id',id)
    return
  }
  const active=items.filter(i=>i.id!==id&&!ITEM_TERMINAL.includes(i.status)&&i.priority!=='P1'&&i.priority!=='P2')
    .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
  const changed=active.map((i,idx)=>({id:i.id,committed_priority:idx})).filter(r=>{
    const o=items.find(i=>i.id===r.id);return o&&o.committed_priority!==r.committed_priority
  })
  setItems((prev:any[])=>prev.map(i=>{
    if(i.id===id) return {...i,status:v,committed_priority:null}
    const u=changed.find(c=>c.id===i.id);return u?{...i,committed_priority:u.committed_priority}:i
  }))
  await supabase.from('items').update({status:v,committed_priority:null}).eq('id',id)
  await Promise.all(changed.map(c=>supabase.from('items').update({committed_priority:c.committed_priority}).eq('id',c.id)))
}

// Bulk-close a project's open items (Complete → Done, Cancelled → Will Not Implement), compacting ranks once
async function closeItemsForProject(items:any[],setItems:any,projectName:string,newStatus:string){
  const targets=items.filter(i=>i.parent_project===projectName&&!ITEM_TERMINAL.includes(i.status))
  if(!targets.length) return 0
  const tIds=new Set(targets.map(t=>t.id))
  const active=items.filter(i=>!tIds.has(i.id)&&!ITEM_TERMINAL.includes(i.status)&&i.priority!=='P1'&&i.priority!=='P2')
    .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
  const changed=active.map((i,idx)=>({id:i.id,committed_priority:idx})).filter(r=>{
    const o=items.find(i=>i.id===r.id);return o&&o.committed_priority!==r.committed_priority
  })
  setItems((prev:any[])=>prev.map(i=>{
    if(tIds.has(i.id)) return {...i,status:newStatus,committed_priority:null}
    const u=changed.find(c=>c.id===i.id);return u?{...i,committed_priority:u.committed_priority}:i
  }))
  await Promise.all([
    ...targets.map(t=>supabase.from('items').update({status:newStatus,committed_priority:null}).eq('id',t.id)),
    ...changed.map(c=>supabase.from('items').update({committed_priority:c.committed_priority}).eq('id',c.id)),
  ])
  return targets.length
}

// Flag audiences — legacy flags with no audience count as both
function flagDev(i:any){return i.flagged&&(i.flag_audience==='dev'||i.flag_audience==='both'||!i.flag_audience)}
function flagStk(i:any){return i.flagged&&(i.flag_audience==='stakeholder'||i.flag_audience==='both'||!i.flag_audience)}
function flagLabel(i:any){return !i.flagged?'':i.flag_audience==='dev'?'D':i.flag_audience==='stakeholder'?'S':'DS'}
// Project tasks — personal operational reminders attached to projects (never shown to teams/stakeholders)
async function addProjectTask(setTasks:any,projectId:any,title:string,dueDate:string|null,space:string='work'){
  // Optimistic: show the task immediately, reconcile with the server row after
  const temp={id:'tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),project_id:projectId,title:title.trim(),due_date:dueDate||null,done:false,space,created_at:new Date().toISOString()}
  setTasks((prev:any[])=>[...prev,temp])
  const{data,error}=await supabase.from('tasks').insert({project_id:projectId,title:temp.title,due_date:temp.due_date,done:false,space}).select().single()
  if(error){
    setTasks((prev:any[])=>prev.filter(x=>x.id!==temp.id))
    alert('Failed to add task: '+error.message)
    return null
  }
  if(data){
    setTasks((prev:any[])=>prev.map(x=>x.id===temp.id?data:x))
    return data
  }
  // Insert succeeded but no row returned — refetch to swap the temp row for the real one
  const{data:all}=await supabase.from('tasks').select('*').order('due_date',{ascending:true})
  if(all)setTasks(all)
  return temp
}
async function toggleProjectTask(setTasks:any,t:any){
  const v=!t.done
  setTasks((prev:any[])=>prev.map(x=>x.id===t.id?{...x,done:v}:x))
  await supabase.from('tasks').update({done:v}).eq('id',t.id)
}
async function deleteProjectTask(setTasks:any,t:any){
  setTasks((prev:any[])=>prev.filter(x=>x.id!==t.id))
  await supabase.from('tasks').delete().eq('id',t.id)
}

// Mobile detection — single breakpoint drives layout switches
function useIsMobile(){
  const [m,setM]=useState(false)
  useEffect(()=>{
    const q=window.matchMedia('(max-width: 820px)')
    const f=()=>setM(q.matches)
    f()
    q.addEventListener('change',f)
    return()=>q.removeEventListener('change',f)
  },[])
  return m
}

// Request-type glyphs — instant visual ID on item lines
function rt(t:any){const m:any={'Bug':'🐞','Tech Debt':'🔧','Enhancement':'✨','Strategic Initiative':'🎯','Business Request':'💼','Testing':'🧪'};return m[t]||''}
function sc(s) {
  const m={'New':'#5DADE2','Need Requirements':'#E67E22','Under Review':'#E8B95A','Accepted':'#2E86AB','Ready':'#8E44AD','In Progress':'#27AE60','Testing':'#C8973A','Ready for Deployment':'#2ECC71','Blocked':'#E74C3C','Done':'#16A085','Awaiting Vendor Deliverable':'#7F8FA6','Will Not Implement':'#5C6E80','To Do':'#5DADE2','Waiting':'#E8B95A',"Won't Do":'#5C6E80'}
  return m[s]||'#7A8FA6'
}
// Sequential item IDs — max existing RTL number + 1. Random IDs collided with real data.
const localISO=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
// Weekday count between two YYYY-MM-DD dates, inclusive — the basis for all budget math.
// Weekends only excluded (offshore devs work through US holidays and vice versa, per Casey).
function workingDays(startISO:string,endISO:string):number{
  if(!startISO||!endISO)return 0
  const start=new Date(startISO+'T12:00:00'),end=new Date(endISO+'T12:00:00')
  if(end<start)return 0
  let n=0
  const d=new Date(start)
  while(d<=end){const dow=d.getDay();if(dow!==0&&dow!==6)n++;d.setDate(d.getDate()+1)}
  return n
}
const rateOf=(person:any,roles:any[])=>{
  if(person?.rate_override!=null)return person.rate_override
  const r=roles.find((x:any)=>x.id===person?.role_id)
  return r?.hourly_rate||0
}
const fmtUSD=(n:number)=>'$'+Math.round(n).toLocaleString('en-US')

// Deckers fiscal year: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
function fyOf(isoDate:string){
  const d=new Date(isoDate+'T12:00:00')
  const m=d.getMonth() // 0=Jan
  const fy=m>=3?d.getFullYear()+1:d.getFullYear() // Apr(3) starts the next FY number
  const q=m>=3&&m<=5?1:m>=6&&m<=8?2:m>=9&&m<=11?3:4
  return{fy,quarter:q,label:`FY${fy} Q${q}`}
}
// Calendar months (YYYY-MM) a date range touches, each with its own start/end clipped to the range.
function monthSlices(startISO:string,endISO:string){
  const slices:{key:string,start:string,end:string}[]=[]
  if(!startISO||!endISO)return slices
  let cur=new Date(startISO+'T12:00:00')
  const end=new Date(endISO+'T12:00:00')
  while(cur<=end){
    const y=cur.getFullYear(),m=cur.getMonth()
    const monthStart=new Date(y,m,1),monthEnd=new Date(y,m+1,0)
    const sliceStart=cur>monthStart?cur:monthStart
    const sliceEnd=end<monthEnd?end:monthEnd
    slices.push({key:`${y}-${String(m+1).padStart(2,'0')}`,start:localISO(sliceStart),end:localISO(sliceEnd)})
    cur=new Date(y,m+1,1)
  }
  return slices
}
// Builds the list of month keys for a chosen window, anchored on the current month.
function buildMonthKeys(window:string):string[]{
  const now=new Date()
  const keys=(startY:number,startM:number,count:number)=>{
    const out:string[]=[]
    for(let i=0;i<count;i++){const d=new Date(startY,startM+i,1);out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
    return out
  }
  if(window==='fy'){
    // All 12 months of the CURRENT fiscal year (Apr–Mar), not just from today forward
    const calYear=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1 // FY starts in April
    return keys(calYear,3,12)
  }
  const n=window==='1'?1:window==='3'?3:window==='9'?9:window==='year'?12:6 // default/'6'
  return keys(now.getFullYear(),now.getMonth(),n)
}
function monthLabel(key:string){
  const[y,m]=key.split('-').map(Number)
  return new Date(y,m-1,1).toLocaleDateString('default',{month:'short',year:'2-digit'})
}
// One row's cost/allocation, split across every calendar month its project spans —
// the basis for both capacity (%) and monthly $ reporting.
function monthlyRowCost(alloc:number,rate:number,projStart:string,projEnd:string){
  const out:{key:string,cost:number,days:number}[]=[]
  for(const sl of monthSlices(projStart,projEnd)){
    const days=workingDays(sl.start,sl.end)
    if(days>0)out.push({key:sl.key,cost:days*8*(alloc/100)*rate,days})
  }
  return out
}

// Layer 1: forecast — generic roster rows × the project's own timeline. Static until
// the project's dates change or a roster row is edited (never auto-drifts otherwise).
function projectForecast(project:any,projectRoles:any[],roles:any[]){
  if(!project?.start_date||!project?.end_date)return{total:0,byRole:[] as any[],days:0,unset:true}
  const days=workingDays(project.start_date,project.end_date)
  const rows=projectRoles.filter(r=>r.project_id===project.id)
  const byRole=rows.map(r=>{
    const role=roles.find((x:any)=>x.id===r.role_id)
    const cost=days*8*(r.allocation_pct/100)*(r.headcount||1)*(role?.hourly_rate||0)
    return{role_id:r.role_id,role:role?.name||'(deleted role)',headcount:r.headcount,allocation_pct:r.allocation_pct,rate:role?.hourly_rate||0,cost}
  })
  return{total:byRole.reduce((a,r)=>a+r.cost,0),byRole,days,unset:false}
}
// Layer 2: actuals — named people on committed items, rolled up to the project.
// Builds every project_roles row's monthly $ (person-linked rows only — generic/unassigned
// rows have no one to attribute capacity to) and rolls it up by person and by team.
// What we'd pay a person for a full month if 100% of their time were billed — the
// "are we getting our money's worth" baseline. Same working-days basis as everything else.
function fullCostForMonth(monthKey:string,rate:number){
  const[y,m]=monthKey.split('-').map(Number)
  const start=`${monthKey}-01`,end=localISO(new Date(y,m,0))
  return workingDays(start,end)*8*rate
}
function capacityByMonth(projects:any[],projectRoles:any[],people:any[],roles:any[]){
  const active=projects.filter((p:any)=>!PROJECT_TERMINAL.includes(p.status)&&p.start_date&&(p.end_date||p.ongoing))
  const perPerson=new Map<string,Map<string,{cost:number,pct:number}>>() // person_id -> month -> {cost,pct}
  const byProject=new Map<string,Map<string,any[]>>() // person_id -> month -> [{project,pct,cost}]
  for(const row of projectRoles){
    if(!row.person_id)continue
    const proj=active.find((p:any)=>p.id===row.project_id)
    if(!proj)continue
    const person=people.find((p:any)=>p.id===row.person_id)
    if(!person)continue
    const rate=rateOf(person,roles)
    const end=proj.end_date||localISO(new Date(Date.now()+180*86400000)) // ongoing: cap the view at ~6mo out
    const monthly=monthlyRowCost(row.allocation_pct,rate,proj.start_date,end)
    if(!perPerson.has(person.id))perPerson.set(person.id,new Map())
    if(!byProject.has(person.id))byProject.set(person.id,new Map())
    const pm=perPerson.get(person.id)!
    const bp=byProject.get(person.id)!
    for(const m of monthly){
      const totalDaysInMonth=workingDays(`${m.key}-01`,localISO(new Date(new Date(m.key+'-01T12:00:00').getFullYear(),new Date(m.key+'-01T12:00:00').getMonth()+1,0)))
      const pct=totalDaysInMonth>0?(m.days/totalDaysInMonth)*row.allocation_pct:0
      const prev=pm.get(m.key)||{cost:0,pct:0}
      pm.set(m.key,{cost:prev.cost+m.cost,pct:prev.pct+pct})
      if(!bp.has(m.key))bp.set(m.key,[])
      bp.get(m.key)!.push({project:proj.name,color:proj.color,pct,cost:m.cost})
    }
  }
  return{perPerson,byProject}
}
// A dollar amount splits CapEx/OpEx by role — but only on a "Build" project. On a
// "Support" project (e.g. Peak Prep) nothing is being capitalized, so it's all OpEx
// regardless of role, even for an otherwise capex-eligible dev.
function splitCapexOpex(cost:number,role:any,projectBudgetType:string){
  if(projectBudgetType==='support'||!role?.capex_eligible)return{capex:0,opex:cost}
  const pct=role.capex_pct??80
  return{capex:cost*(pct/100),opex:cost*(1-pct/100)}
}
// Rolls approved projects' cost (Layer 1 allocated + Layer 2 actual) into
// fiscal-quarter × department × capex/opex buckets. Only named (person-linked) rows
// count — same constraint as Capacity, since department/vendor only exist on people.
function quarterlyRollup(projects:any[],projectRoles:any[],itemAssignments:any[],items:any[],people:any[],roles:any[]){
  const out=new Map<string,{allocCapex:number,allocOpex:number,actCapex:number,actOpex:number}>()
  const byProj=new Map<string,Map<string,{name:string,color:string,allocCapex:number,allocOpex:number,actCapex:number,actOpex:number}>>()
  const bump=(fy:number,q:number,dept:string,field:'allocCapex'|'allocOpex'|'actCapex'|'actOpex',amt:number,proj?:any)=>{
    const key=`${fy}-${q}-${dept}`
    const cur=out.get(key)||{allocCapex:0,allocOpex:0,actCapex:0,actOpex:0}
    cur[field]+=amt
    out.set(key,cur)
    if(proj){
      if(!byProj.has(key))byProj.set(key,new Map())
      const pm=byProj.get(key)!
      const p=pm.get(proj.id)||{name:proj.name,color:proj.color,allocCapex:0,allocOpex:0,actCapex:0,actOpex:0}
      p[field]+=amt
      pm.set(proj.id,p)
    }
  }
  const approved=projects.filter((p:any)=>p.budget_status==='approved')
  // Allocated — Layer 1 roster rows, named people only
  for(const row of projectRoles){
    if(!row.person_id)continue
    const proj=approved.find((p:any)=>p.id===row.project_id)
    if(!proj||!proj.start_date)continue
    const person=people.find((p:any)=>p.id===row.person_id)
    if(!person?.department)continue
    const role=roles.find((r:any)=>r.id===person.role_id)
    const rate=rateOf(person,roles)
    const end=proj.end_date||localISO(new Date(Date.now()+365*86400000))
    for(const m of monthlyRowCost(row.allocation_pct,rate,proj.start_date,end)){
      const{fy,quarter}=fyOf(`${m.key}-15`)
      const{capex,opex}=splitCapexOpex(m.cost,role,proj.budget_type)
      bump(fy,quarter,person.department,'allocCapex',capex,proj)
      bump(fy,quarter,person.department,'allocOpex',opex,proj)
    }
  }
  // Actual — Layer 2 item assignments, named people only, on approved projects
  for(const it of items){
    const proj=approved.find((p:any)=>p.name===it.parent_project)
    if(!proj||!it.start_date||!it.end_date)continue
    const asg=itemAssignments.filter((a:any)=>a.item_id===it.id)
    for(const a of asg){
      const person=people.find((p:any)=>p.id===a.person_id)
      if(!person?.department)continue
      const role=roles.find((r:any)=>r.id===person.role_id)
      const rate=rateOf(person,roles)
      for(const m of monthlyHoursCost(a.hours||0,rate,it.start_date,it.end_date)){
        const{fy,quarter}=fyOf(`${m.key}-15`)
        const{capex,opex}=splitCapexOpex(m.cost,role,proj.budget_type)
        bump(fy,quarter,person.department,'actCapex',capex,proj)
        bump(fy,quarter,person.department,'actOpex',opex,proj)
      }
    }
  }
  return{totals:out,byProject:byProj}
}
// Real spend by vendor — CapEx/OpEx, approved projects only. Billing is about what
// actually happened, so this uses Layer 2 actuals only, never the Layer 1 forecast.
// Real spend by vendor, bucketed by fiscal quarter — CapEx/OpEx split, approved projects only.
// Returns vendor -> "fy-q" -> {capex,opex}; sum across quarters for an annual total.
function vendorRollup(projects:any[],itemAssignments:any[],items:any[],people:any[],roles:any[]){
  const out=new Map<string,Map<string,{capex:number,opex:number}>>()
  const approved=projects.filter((p:any)=>p.budget_status==='approved')
  for(const it of items){
    const proj=approved.find((p:any)=>p.name===it.parent_project)
    if(!proj||!it.start_date||!it.end_date)continue
    for(const a of itemAssignments.filter((a:any)=>a.item_id===it.id)){
      const person=people.find((p:any)=>p.id===a.person_id)
      const vendor=person?.vendor||'(no vendor set)'
      const role=roles.find((r:any)=>r.id===person?.role_id)
      const rate=rateOf(person,roles)
      if(!out.has(vendor))out.set(vendor,new Map())
      const vm=out.get(vendor)!
      for(const m of monthlyHoursCost(a.hours||0,rate,it.start_date,it.end_date)){
        const{fy,quarter}=fyOf(`${m.key}-15`)
        const key=`${fy}-${quarter}`
        const{capex,opex}=splitCapexOpex(m.cost,role,proj.budget_type)
        const cur=vm.get(key)||{capex:0,opex:0}
        cur.capex+=capex;cur.opex+=opex
        vm.set(key,cur)
      }
    }
  }
  return out
}
// Team → Department → Project waterfall. The team's cost is fixed (everyone active
// gets paid regardless of assignment); projects only ever CLAIM a slice of it. Dollars
// with no claiming project are Unallocated — flagged OpEx (nothing's being built), not
// merged into a project's own OpEx. Approved vs Planned (+ Requested/Draft) both compare
// against the same fixed ceiling so over-demand is visible before anything is committed.
function teamBudgetRollup(projects:any[],projectRoles:any[],people:any[],roles:any[],monthKeys:string[]){
  const totalCostOverWindow=(person:any)=>{
    const rate=rateOf(person,roles)
    return monthKeys.reduce((sum,k)=>sum+fullCostForMonth(k,rate),0)
  }
  const claimedCostOverWindow=(row:any,person:any)=>{
    // A project_roles row's $ contribution restricted to the chosen window's months
    const proj=projects.find((p:any)=>p.id===row.project_id)
    if(!proj||!proj.start_date)return 0
    const end=proj.end_date||localISO(new Date(Date.now()+365*86400000))
    const rate=rateOf(person,roles)
    return monthlyRowCost(row.allocation_pct,rate,proj.start_date,end)
      .filter((m:any)=>monthKeys.includes(m.key))
      .reduce((s:number,m:any)=>s+m.cost,0)
  }
  const teamOut:any={}
  const allTeams=[...new Set([...TEAMS,...people.map((p:any)=>p.team).filter(Boolean)])]
  for(const team of allTeams){
    const teamPeople=people.filter((p:any)=>p.active&&p.team===team)
    const depts=[...new Set(teamPeople.map((p:any)=>p.department).filter(Boolean))]
    const deptOut:any={}
    for(const dept of depts){
      const deptPeople=teamPeople.filter((p:any)=>p.department===dept)
      const deptTotal=deptPeople.reduce((s:number,p:any)=>s+totalCostOverWindow(p),0)
      const byStatusProj=new Map<string,any>() // project.id -> {name,color,status,capex,opex}
      for(const person of deptPeople){
        const rows=projectRoles.filter((r:any)=>r.person_id===person.id)
        for(const row of rows){
          const proj=projects.find((p:any)=>p.id===row.project_id)
          if(!proj)continue
          const cost=claimedCostOverWindow(row,person)
          if(cost<=0)continue
          const role=roles.find((r:any)=>r.id===person.role_id)
          const{capex,opex}=splitCapexOpex(cost,role,proj.budget_type)
          const cur=byStatusProj.get(proj.id)||{name:proj.name,color:proj.color,status:proj.budget_status||'draft',capex:0,opex:0}
          cur.capex+=capex;cur.opex+=opex
          byStatusProj.set(proj.id,cur)
        }
      }
      const allProjects=[...byStatusProj.values()]
      const approvedProjects=allProjects.filter((p:any)=>p.status==='approved')
      const plannedExtra=allProjects.filter((p:any)=>p.status==='requested'||p.status==='draft')
      const sum=(rows:any[])=>rows.reduce((s,r)=>({capex:s.capex+r.capex,opex:s.opex+r.opex}),{capex:0,opex:0})
      const approvedSum=sum(approvedProjects)
      const plannedSum=sum(allProjects) // approved + requested + draft
      deptOut[dept]={
        deptTotal,
        approvedProjects,approvedSum,
        plannedExtra,plannedSum,
        unallocApproved:Math.max(0,deptTotal-approvedSum.capex-approvedSum.opex),
        unallocPlanned:deptTotal-plannedSum.capex-plannedSum.opex, // can go negative — over-demand
      }
    }
    teamOut[team]={total:Object.values(deptOut).reduce((s:number,d:any)=>s+d.deptTotal,0),depts:deptOut}
  }
  return teamOut
}
function projectActual(project:any,items:any[],itemAssignments:any[],people:any[],roles:any[]){
  const projItems=items.filter(i=>i.parent_project===project.name&&i.start_date&&i.end_date)
  const rows:any[]=[]
  for(const it of projItems){
    const asg=itemAssignments.filter(a=>a.item_id===it.id)
    for(const a of asg){
      const person=people.find((p:any)=>p.id===a.person_id)
      const role=roles.find((r:any)=>r.id===person?.role_id)
      const rate=rateOf(person,roles)
      const hours=a.hours||0
      const cost=hours*rate
      rows.push({item_id:it.id,item_name:it.name,item_start:it.start_date,item_end:it.end_date,person_id:a.person_id,person:person?.name||'(removed)',role_id:role?.id,role:role?.name||'—',rate,hours,cost})
    }
  }
  const byRoleMap=new Map<string,number>()
  rows.forEach(r=>byRoleMap.set(r.role,(byRoleMap.get(r.role)||0)+r.cost))
  return{total:rows.reduce((a,r)=>a+r.cost,0),rows,byRole:[...byRoleMap.entries()].map(([role,cost])=>({role,cost}))}
}
// Spreads a fixed hours figure evenly across an item's working days, then buckets by
// calendar month — for reporting only; the headline cost (hours×rate) never depends on this.
function monthlyHoursCost(totalHours:number,rate:number,itemStart:string,itemEnd:string){
  const totalDays=workingDays(itemStart,itemEnd)
  if(totalDays<=0||!totalHours)return[] as{key:string,cost:number}[]
  const perDay=totalHours/totalDays
  const out:{key:string,cost:number}[]=[]
  for(const sl of monthSlices(itemStart,itemEnd)){
    const days=workingDays(sl.start,sl.end)
    if(days>0)out.push({key:sl.key,cost:perDay*days*rate})
  }
  return out
}
// Plan-vs-actual for one person on one project — the comparison shown while assigning.
function personProjectForecastHours(project:any,personId:any,projectRoles:any[]){
  if(!project?.start_date)return null
  const end=project.end_date||localISO(new Date(Date.now()+180*86400000))
  const days=workingDays(project.start_date,end)
  const rows=projectRoles.filter((r:any)=>r.project_id===project.id&&r.person_id===personId)
  if(!rows.length)return null
  return rows.reduce((sum:number,r:any)=>sum+days*8*(r.allocation_pct/100),0)
}
function personProjectActualHours(project:any,personId:any,items:any[],itemAssignments:any[]){
  const ids=new Set(items.filter((i:any)=>i.parent_project===project.name).map((i:any)=>i.id))
  return itemAssignments.filter((a:any)=>a.person_id===personId&&ids.has(a.item_id)).reduce((s:number,a:any)=>s+(a.hours||0),0)
}
function nextItemId(items){
  const max=items.reduce((m,i)=>{
    const match=/^RTL-(\d+)$/.exec(i.item_id||'')
    return match?Math.max(m,parseInt(match[1],10)):m
  },0)
  return `RTL-${String(max+1).padStart(3,'0')}`
}
function rice(item) {
  if(!item.reach||!item.impact||!item.confidence) return null
  const ew=item.effort==='S'?1:item.effort==='M'?2:item.effort==='L'?3:5
  return ((item.reach*item.impact*item.confidence)/ew).toFixed(2)
}

const sel={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer'}
const TH={padding:'8px 12px',color:'#7A8FA6',fontSize:11,fontWeight:700,letterSpacing:1,textAlign:'left' as const,borderBottom:'1px solid #243447',whiteSpace:'nowrap' as const}
const TD={padding:'8px 12px',borderBottom:'1px solid #243447',fontSize:12,verticalAlign:'middle' as const}

// ── PROJECTS TAB ─────────────────────────────────────────────────────────
function ViolationRow({v,project,fmt,d}:{v:any,project:any,fmt:any,d:any}) {
  const [open,setOpen]=useState(false)
  const [editStart,setEditStart]=useState(v.start_date||'')
  const [editEnd,setEditEnd]=useState(v.end_date||'')
  const [saving,setSaving]=useState(false)
  const beforeStart=d(v.start_date)&&d(project.start_date)&&d(v.start_date)<d(project.start_date)
  const afterEnd=d(v.end_date)&&d(project.end_date)&&d(v.end_date)>d(project.end_date)
  const startOk=!d(editStart)||!d(project.start_date)||d(editStart)>=d(project.start_date)
  const endOk=!d(editEnd)||!d(project.end_date)||d(editEnd)<=d(project.end_date)
  async function saveItem(){
    setSaving(true)
    await supabase.from('items').update({start_date:editStart,end_date:editEnd}).eq('id',v.id)
    setSaving(false);setOpen(false)
  }
  return(
    <div style={{marginBottom:8,borderRadius:6,overflow:'hidden',border:'1px solid rgba(192,57,43,0.25)'}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',cursor:'pointer',background:open?'rgba(192,57,43,0.12)':'transparent',fontSize:11,flexWrap:'wrap' as const}}
        onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,57,43,0.1)')}
        onMouseLeave={e=>(e.currentTarget.style.background=open?'rgba(192,57,43,0.12)':'transparent')}>
        <span style={{color:'#7A8FA6',fontFamily:'monospace',flexShrink:0}}>{v.item_id}</span>
        <span style={{color:'#F4F6F8',fontWeight:600,flexShrink:0}}>{v.name}</span>
        <span style={{color:'#E74C3C',flex:1}}>
          {beforeStart&&`starts ${fmt(v.start_date)} — before project start`}
          {beforeStart&&afterEnd&&' · '}
          {afterEnd&&`ends ${fmt(v.end_date)} — after project end`}
        </span>
        <span style={{color:'#C8973A',fontSize:11,flexShrink:0,fontWeight:600}}>{open?'▲ Close':'✏️ Fix dates'}</span>
      </div>
      {open&&(
        <div style={{padding:'12px 10px',background:'rgba(0,0,0,0.25)',borderTop:'1px solid rgba(192,57,43,0.2)'}}>
          <div style={{fontSize:10,color:'#7A8FA6',marginBottom:10}}>
            Project window: <span style={{color:'#C8973A',fontWeight:700}}>{fmt(project.start_date)} → {fmt(project.end_date)}</span>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap' as const}}>
            <div>
              <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Start Date</div>
              <input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)}
                style={{background:'#1E3048',color:startOk?'#F4F6F8':'#E74C3C',border:`1px solid ${startOk?'#243447':'#E74C3C'}`,borderRadius:6,padding:'5px 8px',fontSize:12}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>End Date</div>
              <input type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)}
                style={{background:'#1E3048',color:endOk?'#F4F6F8':'#E74C3C',border:`1px solid ${endOk?'#243447':'#E74C3C'}`,borderRadius:6,padding:'5px 8px',fontSize:12}}/>
            </div>
            <button onClick={saveItem} disabled={saving}
              style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'6px 14px',fontWeight:700,cursor:'pointer',fontSize:12,opacity:saving?0.7:1}}>
              {saving?'Saving...':'Save'}
            </button>
            <button onClick={()=>setOpen(false)}
              style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
          <div style={{marginTop:8,fontSize:10}}>
            {!startOk&&<div style={{color:'#E74C3C'}}>⚠️ Start still before project start ({fmt(project.start_date)})</div>}
            {!endOk&&<div style={{color:'#E74C3C'}}>⚠️ End still after project end ({fmt(project.end_date)})</div>}
            {startOk&&endOk&&editStart&&editEnd&&<div style={{color:'#27AE60'}}>✓ Dates are within the project window</div>}
          </div>
        </div>
      )}
    </div>
  )
}
function AssignPicker({available,onAdd}:any){
  const[pid,setPid]=useState('')
  const[days,setDays]=useState('1')
  return(
    <div style={{display:'flex',gap:5}}>
      <select value={pid} onChange={e=>setPid(e.target.value)} style={{flex:1,minWidth:0,background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 6px'}}>
        <option value="">+ Assign person…</option>
        {available.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="number" step="0.5" value={days} onChange={e=>setDays(e.target.value)} title="Days" style={{width:52,background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#F4F6F8',fontSize:10,padding:'4px 4px'}}/>
      <span style={{color:'#7A8FA6',fontSize:9,alignSelf:'center'}}>d</span>
      <button onClick={()=>{if(pid){onAdd(pid,parseFloat(days)||0);setPid('');setDays('1')}}} disabled={!pid} style={{background:'#5DADE2',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer',opacity:pid?1:0.5}}>+</button>
    </div>
  )
}
function ProjectDetail({project,items,setItems,projects,setProjects,milestones,setMilestones,tasks,setTasks,onClose,d,fmt,ccrs=[],ccrItems=[],roles=[],people=[],projectRoles=[],setProjectRoles,itemAssignments=[],setItemAssignments}:any) {
  async function updProjectField(fields:any){
    setProjects((prev:any[])=>prev.map(p=>p.id===project.id?{...p,...fields}:p))
    await supabase.from('projects').update(fields).eq('id',project.id)
  }
  const [pdCcrExp,setPdCcrExp]=useState<any>({})
  const [pdAsgOpen,setPdAsgOpen]=useState<any>({}) // item.id -> assignment editor open
  // Allocation % auto-defaults from the project's effort size (S=25/M=50/L=75/XL=100) — still
  // freely editable per row, this just kills the "type a number from thin air" step for the common case.
  const effortDefault=String(EFFORT_ALLOC[project.effort]??0)
  const [prTeam,setPrTeam]=useState('');const [prPerson,setPrPerson]=useState('');const [prRole,setPrRole]=useState('');const [prHead,setPrHead]=useState('1');const [prAlloc,setPrAlloc]=useState(effortDefault)
  useEffect(()=>{setPrAlloc(effortDefault)},[project.effort])
  async function addProjectRole(){
    // Named path: a specific roster person (their role/rate come with them — real capacity)
    if(prPerson){
      const person=people.find((p:any)=>p.id===prPerson)
      const{data,error}=await supabase.from('project_roles').insert({project_id:project.id,role_id:person?.role_id||null,person_id:prPerson,headcount:1,allocation_pct:parseFloat(prAlloc)||100}).select().single()
      if(error){alert('Failed to add: '+error.message);return}
      if(data){setProjectRoles((prev:any[])=>[...prev,data]);setPrTeam('');setPrPerson('');setPrAlloc(effortDefault)}
      return
    }
    // Generic path: role-only placeholder for early-stage forecasting before staffing is known
    if(!prRole)return
    const{data,error}=await supabase.from('project_roles').insert({project_id:project.id,role_id:prRole,person_id:null,headcount:parseFloat(prHead)||1,allocation_pct:parseFloat(prAlloc)||100}).select().single()
    if(error){alert('Failed to add role: '+error.message);return}
    if(data){setProjectRoles((prev:any[])=>[...prev,data]);setPrRole('');setPrHead('1');setPrAlloc(effortDefault)}
  }
  async function updProjectRole(id:any,fields:any){
    setProjectRoles((prev:any[])=>prev.map(r=>r.id===id?{...r,...fields}:r))
    await supabase.from('project_roles').update(fields).eq('id',id)
  }
  async function removeProjectRole(id:any){
    setProjectRoles((prev:any[])=>prev.filter(r=>r.id!==id))
    await supabase.from('project_roles').delete().eq('id',id)
  }
  async function addAssignment(itemId:any,personId:any,days:number){
    if(!personId)return
    const{data,error}=await supabase.from('item_assignments').insert({item_id:itemId,person_id:personId,hours:days*8}).select().single()
    if(error){alert('Failed to assign: '+error.message);return}
    if(data)setItemAssignments((prev:any[])=>[...prev,data])
  }
  async function updAssignment(id:any,fields:any){
    setItemAssignments((prev:any[])=>prev.map(a=>a.id===id?{...a,...fields}:a))
    await supabase.from('item_assignments').update(fields).eq('id',id)
  }
  async function removeAssignment(id:any){
    setItemAssignments((prev:any[])=>prev.filter(a=>a.id!==id))
    await supabase.from('item_assignments').delete().eq('id',id)
  }
  const mobileP=useIsMobile()
  const [pdTitle,setPdTitle]=useState('')
  const [pdDate,setPdDate]=useState('')
  // Commit-with-dates: for ∞/undated projects, ask for item dates inline instead of refusing
  const [cmtId,setCmtId]=useState<any>(null)
  const [cmtStart,setCmtStart]=useState('')
  const [cmtEnd,setCmtEnd]=useState('')
  function startCommit(item:any){
    const today=new Date();const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const plus30=new Date(+today+30*86400000)
    setCmtStart(project.start_date&&project.start_date>iso(today)?project.start_date:iso(today))
    setCmtEnd(iso(plus30))
    setCmtId(item.id)
  }
  async function confirmCommit(){
    if(!cmtId||!cmtStart||!cmtEnd)return
    if(cmtEnd<cmtStart){alert('End date is before start date.');return}
    const updates={start_date:cmtStart,end_date:cmtEnd}
    setItems(items.map(i=>i.id===cmtId?{...i,...updates}:i))
    setCmtId(null)
    await supabase.from('items').update(updates).eq('id',cmtId)
  }
  async function submitPdTask(){
    if(!pdTitle.trim())return
    const ok=await addProjectTask(setTasks,project.id,pdTitle,pdDate||null,spaceOf(project))
    if(ok){setPdTitle('');setPdDate('')}
  }
  const [addingItem,setAddingItem]=useState(false)
  const [savingItem,setSavingItem]=useState(false)
  const [newItem,setNewItem]=useState({name:'',priority:'P3',swimlane:'POS',effort:'M',status:'New',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  const [addingMilestone,setAddingMilestone]=useState(false)
  const [savingMilestone,setSavingMilestone]=useState(false)
  const [milestoneForm,setMilestoneForm]=useState({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const MILESTONE_TYPES=['Milestone','Go-Live','Deadline','Review','Release','Code Freeze','UAT','Kickoff']
  const swimlaneOpts=[...new Set([...SWIMLANES,...items.map(i=>i.swimlane).filter(Boolean)])]

  const projectItems=items.filter(i=>i.parent_project===project.name).sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    if(pa!==pb) return pa-pb
    if(a.start_date&&b.start_date) return new Date(a.start_date).getTime()-new Date(b.start_date).getTime()
    if(a.start_date) return -1
    if(b.start_date) return 1
    return 0
  })
  const doneItems=projectItems.filter(i=>i.status==='Done')
  const withDates=projectItems.filter(i=>i.status!=='Done'&&i.start_date&&i.end_date)
  const noDates=projectItems.filter(i=>i.status!=='Done'&&(!i.start_date||!i.end_date))
  const projectMilestones=milestones.filter(m=>m.project_id===project.id).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
  const ragColor=RAG_COLORS[project.rag]||'#27AE60'

  async function saveNewItem(){
    if(!newItem.name.trim()) return
    setSavingItem(true)
    const iid=nextItemId(items)
    const{data,error}=await supabase.from('items').insert({
      item_id:iid,name:newItem.name,description:newItem.description,
      priority:newItem.priority,swimlane:newItem.swimlane,team:project.team,
      effort:newItem.effort,status:newItem.status,request_type:newItem.request_type,
      region:newItem.region,vendor:newItem.vendor,parent_project:project.name,
      flagged:false,sort_order:items.length,space:spaceOf(project),
    }).select().single()
    if(error){alert('Failed to add item: '+error.message);setSavingItem(false);return}
    if(data) setItems([...items,data])
    setSavingItem(false);setAddingItem(false)
    setNewItem({name:'',priority:'P3',swimlane:'POS',effort:'M',status:'New',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  }
  async function saveMilestone(){
    if(!milestoneForm.name.trim()||!milestoneForm.date) return
    setSavingMilestone(true)
    const{data}=await supabase.from('milestones').insert({
      ...milestoneForm,project_id:project.id,
      sort_order:projectMilestones.length,space:spaceOf(project),
    }).select().single()
    if(data) setMilestones([...milestones,data])
    setSavingMilestone(false);setAddingMilestone(false)
    setMilestoneForm({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  }

  async function toggleMilestone(m){
    const v=!m.completed
    setMilestones(milestones.map(ms=>ms.id===m.id?{...ms,completed:v}:ms))
    await supabase.from('milestones').update({completed:v}).eq('id',m.id)
  }

  async function deleteMilestone(id){
    if(!confirm('Delete this milestone?')) return
    setMilestones(milestones.filter(m=>m.id!==id))
    await supabase.from('milestones').delete().eq('id',id)
  }

  const [editMsId,setEditMsId]=useState<any>(null)
  const [editMs,setEditMs]=useState<any>({name:'',date:'',type:'Milestone',notes:''})
  async function saveEditMs(){
    if(!editMsId||!editMs.name.trim()||!editMs.date)return
    const upd={name:editMs.name.trim(),date:editMs.date,type:editMs.type,notes:editMs.notes||null}
    setMilestones(milestones.map(m=>m.id===editMsId?{...m,...upd}:m))
    setEditMsId(null)
    const{error}=await supabase.from('milestones').update(upd).eq('id',editMsId)
    if(error)alert('Failed to save milestone: '+error.message)
  }

  return(
    <div style={{width:mobileP?'100%':440,flexShrink:mobileP?1:0,...(mobileP?{flex:1,minWidth:0}:{}),background:'#0D1B2A',display:'flex',flexDirection:'column',overflow:'hidden',borderLeft:mobileP?'none':'1px solid #243447'}}>

      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid #243447',background:'#162436',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{width:12,height:12,borderRadius:2,background:project.color||'#2E86AB',flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{project.name}</div>
          <div style={{fontSize:11,color:'#7A8FA6',marginTop:1}}>{projectItems.length} items · {projectMilestones.length} milestones</div>
        </div>
        <span style={{color:ragColor,fontSize:14}}>{project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':project.rag==='Red'?'🔴':'⚪'}</span>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#7A8FA6',padding:'0 4px'}}>×</button>
      </div>

      <div style={{flex:1,overflowY:'auto'}}>

        {/* Change requests for this project */}
        {spaceOf(project)==='work'&&(()=>{
          const projCcrs=(ccrs as any[]).filter((c:any)=>c.project_id===project.id)
          if(!projCcrs.length)return null
          const stClr=(st:string)=>st==='To Create'?'#E8B95A':st==='Opened'?'#5DADE2':st==='Approved'?'#27AE60':st==='Rejected'?'#E74C3C':'#7A8FA6'
          return(
            <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#5DADE2',letterSpacing:1,marginBottom:8}}>📋 CHANGE REQUESTS ({projCcrs.length})</div>
              {projCcrs.map((c:any)=>{
                const linked=(ccrItems as any[]).filter((l:any)=>l.ccr_id===c.id).map((l:any)=>items.find((x:any)=>x.id===l.item_id)).filter(Boolean)
                const exp=pdCcrExp[c.id]
                return(
                  <div key={c.id} style={{marginBottom:6}}>
                    <div onClick={()=>setPdCcrExp((e:any)=>({...e,[c.id]:!e[c.id]}))} style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer'}}>
                      <span style={{fontSize:9,color:'#7A8FA6'}}>{exp?'▾':'▸'}</span>
                      <span style={{fontSize:11,fontWeight:700,color:'#F4F6F8',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{c.title}</span>
                      {c.ccr_number&&<span onClick={e=>{e.stopPropagation();navigator.clipboard.writeText(c.ccr_number)}} title="Click to copy" style={{fontSize:9,fontFamily:'monospace',color:'#5DADE2',border:'1px solid #24445E',borderRadius:3,padding:'0 4px',cursor:'copy',flexShrink:0}}>{c.ccr_number}</span>}
                      <span style={{fontSize:9,fontWeight:700,color:stClr(c.status),flexShrink:0}}>{c.status.toUpperCase()}</span>
                    </div>
                    {exp&&(
                      <div style={{margin:'4px 0 0 20px'}}>
                        {linked.length===0&&<div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic'}}>No items attached</div>}
                        {linked.map((it:any)=>(
                          <div key={it.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:10,padding:'1px 0'}}>
                            <span style={{fontFamily:'monospace',color:'#7A8FA6'}}>{it.item_id}</span>
                            <span style={{color:'#C8C8D4',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{rt(it.request_type)} {it.name}</span>
                            <span style={{fontSize:8,fontWeight:700,color:sc(it.status),flexShrink:0}}>{it.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Budget */}
        {spaceOf(project)==='work'&&(()=>{
          const fc=projectForecast(project,projectRoles,roles)
          const ac=projectActual(project,items,itemAssignments,people,roles)
          const projRoleRows=projectRoles.filter((r:any)=>r.project_id===project.id)
          const bStatus=project.budget_status||'draft'
          const bType=project.budget_type||'build'
          // CapEx/OpEx split of the forecast — respects budget type per-row via each row's role
          let fcCapex=0,fcOpex=0
          fc.byRole.forEach((b:any)=>{const role=roles.find((r:any)=>r.id===b.role_id);const sp=splitCapexOpex(b.cost,role,bType);fcCapex+=sp.capex;fcOpex+=sp.opex})
          const stClr=(s:string)=>s==='approved'?'#27AE60':s==='requested'?'#5DADE2':s==='rejected'?'#E74C3C':'#7A8FA6'
          return(
            <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:'#27AE60',letterSpacing:1}}>$ BUDGET</span>
                <div style={{display:'flex',gap:3,marginLeft:8}}>
                  {[['build','🔨 Build'],['support','🛠 Support']].map(([k,label])=>(
                    <button key={k} onClick={()=>updProjectField({budget_type:k})} title={k==='support'?'Nothing capitalized here — everyone bills 100% OpEx':'Role-based CapEx/OpEx split applies'}
                      style={{background:bType===k?'#1E3048':'transparent',color:bType===k?'#F4F6F8':'#7A8FA6',border:'1px solid '+(bType===k?'#3A4A5E':'#243447'),borderRadius:5,padding:'2px 8px',fontSize:9,fontWeight:700,cursor:'pointer'}}>{label}</button>
                  ))}
                </div>
                <select value={project.effort||''} onChange={e=>updProjectField({effort:e.target.value||null})} title="Effort — sets the default allocation % when you add roster rows below"
                  style={{background:project.effort?'#1E3048':'rgba(231,76,60,0.12)',border:'1px solid '+(project.effort?'#3A4A5E':'#E74C3C'),borderRadius:5,color:'#F4F6F8',fontSize:9,fontWeight:700,padding:'2px 6px',cursor:'pointer'}}>
                  <option value="">Effort not set — 0%</option>
                  {EFFORTS.map(e=><option key={e} value={e}>{e} ({EFFORT_ALLOC[e]}%)</option>)}
                </select>
                <span style={{marginLeft:'auto',fontSize:9,fontWeight:700,color:stClr(bStatus),border:'1px solid '+stClr(bStatus),borderRadius:8,padding:'1px 8px'}}>{bStatus.toUpperCase()}</span>
              </div>
              <div style={{display:'flex',gap:6,marginBottom:10}}>
                {bStatus==='draft'&&<button onClick={()=>updProjectField({budget_status:'requested'})} style={{background:'#5DADE2',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer'}}>Submit for Approval</button>}
                {bStatus==='requested'&&<>
                  <button onClick={()=>updProjectField({budget_status:'approved'})} style={{background:'#27AE60',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer'}}>Approve</button>
                  <button onClick={()=>updProjectField({budget_status:'rejected'})} style={{background:'#E74C3C',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer'}}>Reject</button>
                </>}
                {bStatus==='rejected'&&<button onClick={()=>updProjectField({budget_status:'draft'})} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 8px',cursor:'pointer'}}>Revise & Resubmit</button>}
                {bStatus==='approved'&&<button onClick={()=>updProjectField({budget_status:'draft'})} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 8px',cursor:'pointer'}}>Withdraw</button>}
              </div>
              {fc.unset?(
                <div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic',marginBottom:8}}>Set project start/end dates to forecast a budget.</div>
              ):(
                <>
                <div style={{display:'flex',gap:16,fontSize:11,marginBottom:4}}>
                  <span style={{color:'#7A8FA6'}}>Forecast: <b style={{color:'#5DADE2'}}>{fmtUSD(fc.total)}</b></span>
                  <span style={{color:'#7A8FA6'}}>Actual: <b style={{color:ac.total>fc.total?'#E74C3C':'#27AE60'}}>{fmtUSD(ac.total)}</b></span>
                </div>
                <div style={{fontSize:10,color:'#7A8FA6',marginBottom:10}}>CapEx <b style={{color:'#F4F6F8'}}>{fmtUSD(fcCapex)}</b> / OpEx <b style={{color:'#F4F6F8'}}>{fmtUSD(fcOpex)}</b>{bStatus!=='approved'&&<span style={{fontStyle:'italic'}}> — won't count against the quarterly budget until approved</span>}</div>
                </>
              )}
              {projRoleRows.map((r:any)=>{
                const role=roles.find((x:any)=>x.id===r.role_id)
                const person=r.person_id?people.find((p:any)=>p.id===r.person_id):null
                return(
                  <div key={r.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:10,marginBottom:5}}>
                    <span style={{color:'#F4F6F8',flex:1}}>
                      {person?<>{person.name} <span style={{color:'#7A8FA6'}}>· {role?.name||'—'}{person.team?' · '+person.team:''}</span></>
                        :<>{role?.name||'(role removed)'} <span style={{color:'#7A8FA6',fontStyle:'italic'}}>· unassigned</span></>}
                    </span>
                    {!person&&<>
                      <input type="number" value={r.headcount} onChange={e=>updProjectRole(r.id,{headcount:parseFloat(e.target.value)||1})} style={{width:38,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',padding:'2px 4px',fontSize:10}}/>
                      <span style={{color:'#7A8FA6'}}>×</span>
                    </>}
                    <input type="number" value={r.allocation_pct} onChange={e=>updProjectRole(r.id,{allocation_pct:parseFloat(e.target.value)||0})} style={{width:44,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',padding:'2px 4px',fontSize:10}}/>
                    <span style={{color:'#7A8FA6'}}>%</span>
                    <button onClick={()=>removeProjectRole(r.id)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer'}}>✕</button>
                  </div>
                )
              })}
              <div style={{display:'flex',gap:5,marginTop:6,flexWrap:'wrap' as const}}>
                <select value={prTeam} onChange={e=>{setPrTeam(e.target.value);setPrPerson('');setPrRole('')}} style={{background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 6px'}}>
                  <option value="">Team…</option>
                  {[...new Set([...TEAMS,...people.map((p:any)=>p.team).filter(Boolean)])].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <select value={prPerson} onChange={e=>setPrPerson(e.target.value)} disabled={!prTeam}
                  style={{flex:1,minWidth:120,background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 6px',opacity:prTeam?1:0.5}}>
                  <option value="">+ Named person on {prTeam||'…'}</option>
                  {people.filter((p:any)=>p.active&&p.team===prTeam).map((p:any)=><option key={p.id} value={p.id}>{p.name} ({roles.find((r:any)=>r.id===p.role_id)?.name||'no role'})</option>)}
                </select>
                <span style={{color:'#7A8FA6',fontSize:9,alignSelf:'center'}}>or</span>
                <select value={prRole} onChange={e=>{setPrRole(e.target.value);setPrPerson('')}} style={{background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 6px'}}>
                  <option value="">Generic role (unassigned)…</option>
                  {roles.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {!prPerson&&<input type="number" value={prHead} onChange={e=>setPrHead(e.target.value)} title="Headcount" style={{width:38,background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#F4F6F8',fontSize:10,padding:'4px 4px'}}/>}
                <input type="number" value={prAlloc} onChange={e=>setPrAlloc(e.target.value)} title={`Allocation % — defaulted from this project's Effort (${project.effort||'not set'})`} style={{width:44,background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#F4F6F8',fontSize:10,padding:'4px 4px'}}/>
                <button onClick={addProjectRole} disabled={!prPerson&&!prRole} style={{background:'#27AE60',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 9px',cursor:'pointer',opacity:(prPerson||prRole)?1:0.5}}>+</button>
              </div>
            </div>
          )
        })()}

        {/* Milestones */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:'#C8973A',letterSpacing:1}}>🏁 MILESTONES</div>
            <button onClick={()=>setAddingMilestone(a=>!a)}
              style={{background:addingMilestone?'#1E3048':'#C8973A',color:addingMilestone?'#C8973A':'#0D1B2A',border:addingMilestone?'1px solid #C8973A':'none',borderRadius:5,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              {addingMilestone?'Cancel':'+ Add'}
            </button>
          </div>

          {addingMilestone&&(
            <div style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Name *</div>
                  <input value={milestoneForm.name} onChange={e=>setMilestoneForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Go-Live"
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'6px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Date *</div>
                    <input type="date" value={milestoneForm.date} onChange={e=>setMilestoneForm(p=>({...p,date:e.target.value}))}
                      style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'6px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Type</div>
                    <select value={milestoneForm.type} onChange={e=>setMilestoneForm(p=>({...p,type:e.target.value}))}
                      style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'5px 6px',fontSize:12}}>
                      {MILESTONE_TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:5}}>Color</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                    {COLORS.map(c=><div key={c} onClick={()=>setMilestoneForm(p=>({...p,color:c}))} style={{width:22,height:22,borderRadius:4,background:c,cursor:'pointer',border:milestoneForm.color===c?'2px solid #F4F6F8':'2px solid transparent'}}/>)}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Notes</div>
                  <input value={milestoneForm.notes} onChange={e=>setMilestoneForm(p=>({...p,notes:e.target.value}))} placeholder="Optional..."
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'6px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
              </div>
              <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:10}}>
                <button onClick={()=>setAddingMilestone(false)} style={{...sel,fontSize:11,padding:'4px 10px'}}>Cancel</button>
                <button onClick={saveMilestone} disabled={savingMilestone||!milestoneForm.name.trim()||!milestoneForm.date}
                  style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:5,padding:'4px 14px',fontWeight:700,cursor:'pointer',fontSize:11,opacity:savingMilestone?0.7:1}}>
                  {savingMilestone?'Saving...':'Save'}
                </button>
              </div>
            </div>
          )}

          {projectMilestones.length===0&&!addingMilestone&&(
            <div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',textAlign:'center' as const,padding:'10px 0'}}>No milestones yet</div>
          )}

          {projectMilestones.map(m=>{
            const isPast=d(m.date)&&d(m.date)<new Date()
            const daysAway=d(m.date)?Math.round((d(m.date).getTime()-new Date().getTime())/(1000*60*60*24)):null
            return(
              <div key={m.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 10px',background:m.completed?'rgba(39,174,96,0.05)':'#162436',borderRadius:6,marginBottom:5,borderTop:`1px solid ${m.completed?'rgba(39,174,96,0.2)':'#243447'}`,borderRight:`1px solid ${m.completed?'rgba(39,174,96,0.2)':'#243447'}`,borderBottom:`1px solid ${m.completed?'rgba(39,174,96,0.2)':'#243447'}`,borderLeft:`3px solid ${m.color||'#C8973A'}`}}>
                <button onClick={()=>toggleMilestone(m)}
                  style={{width:16,height:16,borderRadius:3,border:`2px solid ${m.color||'#C8973A'}`,background:m.completed?m.color||'#C8973A':'transparent',cursor:'pointer',flexShrink:0,marginTop:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff'}}>
                  {m.completed&&'✓'}
                </button>
                {editMsId===m.id?(
                  <div style={{flex:1,minWidth:0}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:6,marginBottom:6}}>
                      <input value={editMs.name} onChange={e=>setEditMs((p:any)=>({...p,name:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')saveEditMs()}} autoFocus
                        style={{flex:1,background:'#0F1C2B',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'4px 8px'}}/>
                      <input type="date" value={editMs.date} onChange={e=>setEditMs((p:any)=>({...p,date:e.target.value}))}
                        style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'4px 6px'}}/>
                      <select value={editMs.type} onChange={e=>setEditMs((p:any)=>({...p,type:e.target.value}))}
                        style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'4px 4px'}}>
                        {MILESTONE_TYPES_G.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <input value={editMs.notes||''} onChange={e=>setEditMs((p:any)=>({...p,notes:e.target.value}))} placeholder="Notes..."
                        style={{flex:1,background:'#0F1C2B',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'4px 8px'}}/>
                      <button onClick={()=>setEditMsId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'3px 9px',cursor:'pointer'}}>Cancel</button>
                      <button onClick={saveEditMs} disabled={!editMs.name.trim()||!editMs.date} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'3px 11px',cursor:'pointer',opacity:!editMs.name.trim()||!editMs.date?0.5:1}}>Save</button>
                    </div>
                  </div>
                ):(
                <div style={{flex:1,minWidth:0,cursor:'pointer'}} title="Click to edit name, date, type, and notes"
                  onClick={()=>{setEditMsId(m.id);setEditMs({name:m.name||'',date:m.date||'',type:m.type||'Milestone',notes:m.notes||''})}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:12,color:m.completed?'#7A8FA6':'#F4F6F8',fontWeight:600,textDecoration:m.completed?'line-through':'none'}}>{m.name}</span>
                    <span style={{background:'#1E3048',color:'#7A8FA6',borderRadius:3,padding:'1px 5px',fontSize:9}}>{m.type}</span>
                  </div>
                  <div style={{display:'flex',gap:8,marginTop:3,fontSize:10,alignItems:'center'}}>
                    <span style={{color:isPast&&!m.completed?'#E74C3C':'#7A8FA6',fontWeight:isPast&&!m.completed?700:400}}>{fmt(m.date)}</span>
                    {!m.completed&&daysAway!==null&&daysAway<14&&(
                      <span style={{color:daysAway<0?'#E74C3C':daysAway<7?'#D4820A':'#C8973A',fontWeight:700}}>
                        {daysAway<0?`${Math.abs(daysAway)}d overdue`:daysAway===0?'Today!':`${daysAway}d away`}
                      </span>
                    )}
                    {m.notes&&<span style={{color:'#7A8FA6',fontStyle:'italic',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:150}}>{m.notes}</span>}
                  </div>
                </div>
                )}
                <button onClick={()=>deleteMilestone(m.id)}
                  style={{background:'none',border:'none',cursor:'pointer',color:'#7A8FA6',fontSize:14,padding:'0 2px',flexShrink:0}}
                  onMouseEnter={e=>(e.currentTarget.style.color='#E74C3C')}
                  onMouseLeave={e=>(e.currentTarget.style.color='#7A8FA6')}>×</button>
              </div>
            )
          })}
        </div>

        {/* My tasks — personal reminders for this project */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#C8973A',letterSpacing:1,marginBottom:10}}>☑ MY TASKS ({(tasks||[]).filter((t:any)=>t.project_id===project.id&&!t.done).length})</div>
          {(tasks||[]).filter((t:any)=>t.project_id===project.id&&!t.done).sort((a:any,b:any)=>(a.due_date||'9999')<(b.due_date||'9999')?-1:1).map((t:any)=>{
            const overdue=t.due_date&&+new Date(t.due_date+'T12:00:00')<Date.now()
            return(
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,marginBottom:4}}>
                <input type="checkbox" checked={false} onChange={()=>toggleProjectTask(setTasks,t)} style={{cursor:'pointer'}}/>
                <span style={{color:'#F4F6F8',flex:1}}>{t.title}</span>
                {t.due_date&&<span style={{color:overdue?'#E74C3C':'#C8973A',fontWeight:700,fontSize:10}}>{overdue?'⚠ ':''}{t.due_date}</span>}
                <button onClick={()=>deleteProjectTask(setTasks,t)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer',padding:0}}>✕</button>
              </div>
            )
          })}
          <div style={{display:'flex',gap:6,marginTop:6}}>
            <input placeholder="New reminder..." value={pdTitle} onChange={e=>setPdTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitPdTask()}}
              style={{flex:1,background:'#0F1C2B',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
            <input type="date" value={pdDate} onChange={e=>setPdDate(e.target.value)} style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
            <button onClick={submitPdTask} disabled={!pdTitle.trim()} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 12px',cursor:'pointer',opacity:!pdTitle.trim()?0.5:1}}>+ Add</button>
          </div>
        </div>

        {/* Committed items */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#2E86AB',letterSpacing:1,marginBottom:10}}>📅 COMMITTED ({withDates.length})</div>
          {withDates.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No items with dates assigned</div>}
          {withDates.map(item=>{
            const pclr=pc(item.priority)
            const daysLeft=item.end_date?Math.round((new Date(item.end_date+'T12:00:00').getTime()-new Date().getTime())/(1000*60*60*24)):null
            return(
              <div key={item.id} style={{background:'#162436',borderTop:'1px solid #243447',borderRight:'1px solid #243447',borderBottom:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexWrap:'wrap' as const}}>
                  <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                  <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                  <span style={{fontSize:11,color:'#F4F6F8',fontWeight:600,flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{rt(item.request_type)} {item.name}</span>
                  {item.effort&&<span style={{fontSize:9,color:'#7A8FA6'}}>{item.effort}</span>}
                </div>
                <div style={{display:'flex',gap:10,fontSize:10,color:'#7A8FA6',alignItems:'center'}}>
                  <span>📅 {new Date(item.start_date+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric'})} → {new Date(item.end_date+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric',year:'2-digit'})}</span>
                  {daysLeft!==null&&<span style={{color:daysLeft<0?'#E74C3C':daysLeft<14?'#D4820A':'#7A8FA6',fontWeight:daysLeft<14?700:400}}>{daysLeft<0?`${Math.abs(daysLeft)}d overdue`:daysLeft===0?'Due today':`${daysLeft}d left`}</span>}
                  <select value={item.status||''} onClick={e=>e.stopPropagation()}
                    onChange={e=>applyItemStatus(items,setItems,item.id,e.target.value)}
                    style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:sc(item.status),fontSize:10,padding:'1px 4px',cursor:'pointer',fontFamily:'inherit'}}>
                    {statusesFor(spaceOf(project)).map(st=><option key={st} value={st}>{st}</option>)}
                  </select>
                  {spaceOf(project)==='work'&&(
                    <button onClick={()=>setPdAsgOpen((e:any)=>({...e,[item.id]:!e[item.id]}))} title="Assign people — actual cost"
                      style={{background:'none',border:'1px solid #243447',borderRadius:4,padding:'2px 7px',fontSize:9,color:'#7A8FA6',cursor:'pointer',flexShrink:0}}>👥 {itemAssignments.filter((a:any)=>a.item_id===item.id).length||''}</button>
                  )}
                  <button
                    onClick={async()=>{
                      setItems(items.map(i=>i.id===item.id?{...i,start_date:null,end_date:null}:i))
                      await supabase.from('items').update({start_date:null,end_date:null}).eq('id',item.id)
                    }}
                    style={{marginLeft:spaceOf(project)==='work'?0:'auto',background:'none',border:'1px solid #243447',borderRadius:4,padding:'2px 7px',fontSize:9,color:'#7A8FA6',cursor:'pointer',flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#E74C3C';e.currentTarget.style.color='#E74C3C'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#243447';e.currentTarget.style.color='#7A8FA6'}}>
                    ✕ Uncommit
                  </button>
                </div>
                {pdAsgOpen[item.id]&&(()=>{
                  const asg=itemAssignments.filter((a:any)=>a.item_id===item.id)
                  const itemCost=asg.reduce((sum:number,a:any)=>{const p=people.find((x:any)=>x.id===a.person_id);return sum+(a.hours||0)*rateOf(p,roles)},0)
                  const itemDays=asg.reduce((sum:number,a:any)=>sum+(a.hours||0),0)/8
                  const available=people.filter((p:any)=>p.active&&!asg.some((a:any)=>a.person_id===p.id))
                  return(
                    <div style={{marginTop:6,paddingTop:6,borderTop:'1px dashed #243447'}}>
                      {asg.map((a:any)=>{
                        const p=people.find((x:any)=>x.id===a.person_id)
                        const role=roles.find((r:any)=>r.id===p?.role_id)
                        const cost=(a.hours||0)*rateOf(p,roles)
                        const planHrs=personProjectForecastHours(project,a.person_id,projectRoles)
                        const actualHrs=personProjectActualHours(project,a.person_id,items,itemAssignments)
                        const over=planHrs!=null?actualHrs-planHrs:null
                        return(
                          <div key={a.id} style={{marginBottom:6}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10}}>
                              <span style={{color:'#F4F6F8',flex:1}}>{p?.name||'(removed)'} <span style={{color:'#7A8FA6'}}>· {role?.name||'—'}</span></span>
                              <input type="number" step="0.5" value={Math.round((a.hours||0)/8*100)/100} onChange={e=>updAssignment(a.id,{hours:(parseFloat(e.target.value)||0)*8})} style={{width:48,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',padding:'2px 4px',fontSize:10}}/>
                              <span style={{color:'#7A8FA6'}}>days</span>
                              <span style={{color:'#5DADE2',width:64,textAlign:'right' as const}}>{fmtUSD(cost)}</span>
                              <button onClick={()=>removeAssignment(a.id)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer'}}>✕</button>
                            </div>
                            {planHrs!=null&&(()=>{
                              const planD=planHrs/8,actualD=actualHrs/8,overD=over!=null?over/8:null
                              return(
                                <div style={{fontSize:9,color:(overD||0)>0?'#E74C3C':'#7A8FA6',marginTop:1,paddingLeft:2}}>
                                  Plan: {Math.round(planD*10)/10}d across this project · Assigned so far: {Math.round(actualD*10)/10}d{(overD||0)>0?` — ${Math.round(overD!*10)/10}d over plan`:actualD<planD?` (${Math.round((planD-actualD)*10)/10}d remaining)`:''}
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })}
                      {asg.length>0&&<div style={{fontSize:10,color:'#7A8FA6',textAlign:'right' as const,marginBottom:6}}>Item total: <b style={{color:'#F4F6F8'}}>{fmtUSD(itemCost)}</b> ({Math.round(itemDays*10)/10}d)</div>}
                      <AssignPicker available={available} onAdd={(pid:any,hrs:number)=>addAssignment(item.id,pid,hrs)}/>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>

        {/* Backlog items + add form */}
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:'#7A8FA6',letterSpacing:1}}>📋 BACKLOG ({noDates.length})</div>
            <button onClick={()=>setAddingItem(a=>!a)}
              style={{background:addingItem?'#1E3048':'#C8973A',color:addingItem?'#C8973A':'#0D1B2A',border:addingItem?'1px solid #C8973A':'none',borderRadius:5,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              {addingItem?'Cancel':'+ Add Item'}
            </button>
          </div>

          {addingItem&&(
            <div style={{background:'#162436',border:'1px solid #C8973A',borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#F4F6F8',marginBottom:10}}>New Item → {project.name}</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Item Name *</div>
                  <input value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="Describe the work item..."
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'7px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Description</div>
                  <textarea value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))} rows={2} placeholder="Optional details..."
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'7px 8px',fontSize:12,boxSizing:'border-box' as const,resize:'vertical' as const,fontFamily:'inherit'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {([
                    ['Priority','priority',PRIORITIES],
                    ['Swimlane','swimlane',swimlaneOpts],
                    ['Effort','effort',EFFORTS],
                    ['Request Type','request_type',REQUEST_TYPES],
                    ['Status','status',STATUSES],
                    ['Vendor','vendor',['Deckers','Salesforce','GreyOrange','Legion','SafeSize','ID.me','Adyen','Agilence','Boomi']],
                  ] as [string,string,string[]][]).map(([label,field,opts])=>(
                    <div key={field}>
                      <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>{label}</div>
                      <select value={newItem[field]} onChange={e=>setNewItem(p=>({...p,[field]:e.target.value}))}
                        style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'5px 6px',fontSize:11}}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{background:'#1E3048',borderRadius:5,padding:'6px 8px',fontSize:10,color:'#7A8FA6'}}>
                  Team: <span style={{color:'#F4F6F8',fontWeight:600}}>{project.team}</span> · Parent: <span style={{color:'#C8973A',fontWeight:600}}>{project.name}</span>
                </div>
              </div>
              <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:12}}>
                <button onClick={()=>setAddingItem(false)} style={{...sel,fontSize:11,padding:'5px 12px'}}>Cancel</button>
                <button onClick={saveNewItem} disabled={savingItem||!newItem.name.trim()}
                  style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:5,padding:'5px 16px',fontWeight:700,cursor:'pointer',fontSize:12,opacity:savingItem?0.7:1}}>
                  {savingItem?'Saving...':'Add to Backlog'}
                </button>
              </div>
            </div>
          )}

          {noDates.length===0&&!addingItem&&(
            <div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',textAlign:'center' as const,padding:'10px 0'}}>No backlog items</div>
          )}

          {noDates.map(item=>{
            const pclr=pc(item.priority)
            return(
              <div key={item.id} style={{background:'#162436',borderTop:'1px solid #243447',borderRight:'1px solid #243447',borderBottom:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:5}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                  <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                  <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                  <span style={{fontSize:11,color:'#C8C8D4',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{rt(item.request_type)} {item.name}</span>
                  <select value={item.status||''} onClick={e=>e.stopPropagation()}
                    onChange={e=>applyItemStatus(items,setItems,item.id,e.target.value)}
                    style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:sc(item.status),fontSize:10,padding:'1px 4px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
                    {statusesFor(spaceOf(project)).map(st=><option key={st} value={st}>{st}</option>)}
                  </select>
                  <button
                    onClick={async()=>{
                      if(!project.start_date||!project.end_date){
                        startCommit(item)
                        return
                      }
                      const updates={start_date:project.start_date,end_date:project.end_date}
                      setItems(items.map(i=>i.id===item.id?{...i,...updates}:i))
                      await supabase.from('items').update(updates).eq('id',item.id)
                    }}
                    style={{background:'#27AE60',color:'#fff',border:'none',borderRadius:4,padding:'2px 8px',fontSize:9,fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap' as const}}>
                    ✓ Commit
                  </button>
                </div>
                {cmtId===item.id&&(
                  <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:5,alignItems:'center',marginTop:6,padding:'5px 7px',border:'1px solid #27AE60',borderRadius:6,background:'rgba(39,174,96,0.06)'}}>
                    <span style={{fontSize:9,color:'#27AE60',fontWeight:700}}>{project.ongoing?'∞ project — set item dates:':'Project undated — set item dates:'}</span>
                    <input type="date" value={cmtStart} onChange={e=>setCmtStart(e.target.value)} style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,padding:'2px 5px'}}/>
                    <span style={{color:'#7A8FA6',fontSize:10}}>→</span>
                    <input type="date" value={cmtEnd} onChange={e=>setCmtEnd(e.target.value)} style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,padding:'2px 5px'}}/>
                    <button onClick={confirmCommit} style={{background:'#27AE60',border:'none',borderRadius:4,color:'#fff',fontSize:9,fontWeight:700,padding:'3px 9px',cursor:'pointer'}}>✓ Commit</button>
                    <button onClick={()=>setCmtId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:9,padding:'3px 7px',cursor:'pointer'}}>Cancel</button>
                  </div>
                )}
                {item.description&&<div style={{fontSize:10,color:'#7A8FA6',marginTop:3,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{item.description}</div>}
              </div>
            )
          })}
        </div>

        {/* Done items */}
        {doneItems.length>0&&(
          <div style={{padding:'14px 16px',borderTop:'1px solid #243447'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#16A085',letterSpacing:1,marginBottom:10}}>✓ DONE ({doneItems.length})</div>
            {doneItems.map(item=>(
              <div key={item.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'#12202F',border:'1px solid #1A2838',borderRadius:6,marginBottom:4,opacity:0.75}}>
                <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace',flexShrink:0}}>{item.item_id}</span>
                <span style={{fontSize:11,color:'#9AABBC',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',textDecoration:'line-through',textDecorationColor:'#3A4A5E'}}>{rt(item.request_type)} {item.name}</span>
                {item.end_date&&<span style={{fontSize:9,color:'#7A8FA6',flexShrink:0}}>{item.end_date}</span>}
                <select value={item.status||''} onClick={e=>e.stopPropagation()}
                  onChange={e=>applyItemStatus(items,setItems,item.id,e.target.value)}
                  style={{background:'#0F1C2B',border:'1px solid #243447',borderRadius:4,color:'#16A085',fontSize:10,padding:'1px 4px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
                  {statusesFor(spaceOf(project)).map(st=><option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
function Projects({items,setItems,projects,setProjects,milestones,setMilestones,tasks,setTasks,space,ccrs,ccrItems,roles=[],people=[],projectRoles=[],setProjectRoles,itemAssignments=[],setItemAssignments}:{items:any[],setItems:any,projects:any[],setProjects:any,milestones:any[],setMilestones:any,tasks:any[],setTasks:any,space:string,ccrs:any[],ccrItems:any[],roles?:any[],people?:any[],projectRoles?:any[],setProjectRoles?:any,itemAssignments?:any[],setItemAssignments?:any}) {
  const mobile=useIsMobile()
  const [adding,setAdding]=useState(false)
  const [editing,setEditing]=useState(null)
  const [saving,setSaving]=useState(false)
  const [filterTeam,setFilterTeam]=useState('All')
  const [filterRAG,setFilterRAG]=useState('All')
  const [selectedProject,setSelectedProject]=useState(null)
  const [dragId,setDragId]=useState(null)
  const [dragOverId,setDragOverId]=useState(null)
  const [addingMilestone,setAddingMilestone]=useState(false)
  const [milestoneForm,setMilestoneForm]=useState({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  const [savingMilestone,setSavingMilestone]=useState(false)
  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const MILESTONE_TYPES=['Milestone','Go-Live','Deadline','Review','Release','Code Freeze','UAT','Kickoff']
  const empty={name:'',description:'',priority:'P3',status:'Planning',rag:'Green',team:'Consumer Experience',effort:'',start_date:'',end_date:'',color:'#2E86AB',ongoing:false}
  const [form,setForm]=useState({...empty})
  

  const filtered=projects.filter(p=>{
    if(isProjectDone(p)) return false // completed/cancelled live in the Done tab
    if(filterTeam!=='All'&&p.team!==filterTeam) return false
    if(filterRAG!=='All'&&p.rag!==filterRAG) return false
    return true
  }).sort((a,b)=>(a.sort_order??999)-(b.sort_order??999)) // pure manual order — drag has full control; priority is a badge/filter, not a pin

  function d(str){return str?new Date(str+'T12:00:00'):null}
  function fmt(str){return d(str)?.toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})||'—'}

  function getViolations(project) {
    if(!project.start_date||!project.end_date) return []
    const children=items.filter(i=>i.parent_project===project.name&&i.start_date&&i.end_date)
    return children.filter(i=>d(i.start_date)<d(project.start_date)||d(i.end_date)>d(project.end_date))
  }

  function getProjectMilestones(project){
    return milestones.filter(m=>m.project_id===project.id).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
  }
  async function dropProject(targetId){
    if(!dragId||dragId===targetId) return
    const dragged=projects.find(p=>p.id===dragId)
    if(!dragged){setDragId(null);setDragOverId(null);return}
    const visible=filtered.map(p=>p.id)
    const fi=visible.indexOf(dragId),ti=visible.indexOf(targetId)
    if(fi===-1||ti===-1){setDragId(null);setDragOverId(null);return}
    const down=fi<ti
    // Splice into the GLOBAL project order; write only rows whose sort_order changed, in parallel
    const all=[...projects].sort((a,b)=>(a.sort_order??999)-(b.sort_order??999))
    const without=all.filter(p=>p.id!==dragId)
    const gIdx=without.findIndex(p=>p.id===targetId)
    const pos=gIdx===-1?without.length:(down?gIdx+1:gIdx)
    const reordered=[...without.slice(0,pos),dragged,...without.slice(pos)]
    const updated=reordered.map((p,idx)=>({...p,sort_order:idx}))
    const changed=updated.filter(u=>{const o=projects.find(p=>p.id===u.id);return o&&o.sort_order!==u.sort_order})
    setProjects(projects.map(p=>{const u=changed.find(u=>u.id===p.id);return u?{...p,sort_order:u.sort_order}:p}))
    setDragId(null);setDragOverId(null)
    Promise.all(changed.map(u=>supabase.from('projects').update({sort_order:u.sort_order}).eq('id',u.id))).then()
  }

  function getProjectItems(project){
    return items.filter(i=>i.parent_project===project.name).sort((a,b)=>{
      const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
      if(pa!==pb) return pa-pb
      if(a.start_date&&b.start_date) return new Date(a.start_date).getTime()-new Date(b.start_date).getTime()
      if(a.start_date) return -1
      if(b.start_date) return 1
      return 0
    })
  }

  async function saveProject() {
    if(!form.name.trim()) return
    setSaving(true)
    // Empty strings are invalid for Postgres date columns — send null instead
    const payload={...form,start_date:form.start_date||null,end_date:form.ongoing?null:(form.end_date||null)}
    if(editing) {
      const oldName=editing.name
      const newName=payload.name.trim()
      const{data,error}=await supabase.from('projects').update({...payload,updated_at:new Date().toISOString()}).eq('id',editing.id).select().single()
      if(error){alert('Failed to save project: '+error.message);setSaving(false);return}
      if(data) setProjects(projects.map(p=>p.id===editing.id?data:p))
      // Items link to projects by name — a rename must cascade or every item is orphaned
      if(oldName&&newName&&oldName!==newName){
        setItems(items.map(i=>i.parent_project===oldName?{...i,parent_project:newName}:i))
        const{error:cascErr}=await supabase.from('items').update({parent_project:newName}).eq('parent_project',oldName)
        if(cascErr)alert('Project renamed, but re-linking its items failed: '+cascErr.message+'\nRe-open and re-save the project to retry.')
      }
      await maybeCloseItems({...editing,name:newName},payload.status)
      setEditing(null)
    } else {
      const{data,error}=await supabase.from('projects').insert({...payload,sort_order:projects.length,space}).select().single()
      if(error){alert('Failed to create project: '+error.message);setSaving(false);return}
      if(data) setProjects([...projects,data])
      setAdding(false)
    }
    setSaving(false);setForm({...empty})
  }

  async function deleteProject(id) {
    if(!confirm('Delete this project?')) return
    setProjects(projects.filter(p=>p.id!==id))
    if(selectedProject?.id===id) setSelectedProject(null)
    await supabase.from('projects').delete().eq('id',id)
  }

  async function maybeCloseItems(project:any,newStatus:string){
    // Fires when a project transitions into a terminal status
    if(!PROJECT_TERMINAL.includes(newStatus)||PROJECT_TERMINAL.includes(project.status)) return
    const open=items.filter(i=>i.parent_project===project.name&&!ITEM_TERMINAL.includes(i.status))
    if(!open.length) return
    const home=spaceOf(project)==='home'
    const itemStatus=newStatus==='Cancelled'?(home?"Won't Do":'Will Not Implement'):'Done'
    const yes=confirm(`"${project.name}" is now ${newStatus}. Also mark its ${open.length} open item${open.length!==1?'s':''} as ${itemStatus}?\n\nOK — close the items (they move to the Done tab)\nCancel — leave them in the backlog`)
    if(yes) await closeItemsForProject(items,setItems,project.name,itemStatus)
  }
  async function updateField(id,field,val) {
    const project=projects.find(p=>p.id===id)
    setProjects(projects.map(p=>p.id===id?{...p,[field]:val}:p))
    if(selectedProject?.id===id) setSelectedProject(p=>({...p,[field]:val}))
    await supabase.from('projects').update({[field]:val}).eq('id',id)
    if(field==='status'&&project) await maybeCloseItems(project,val)
  }

  function startEdit(project) {
    setEditing(project)
    setForm({name:project.name,description:project.description||'',priority:project.priority,status:project.status,rag:project.rag,team:project.team,effort:project.effort||'',start_date:project.start_date||'',end_date:project.end_date||'',color:project.color||'#2E86AB',ongoing:!!project.ongoing})
    setAdding(true)
  }

  async function saveMilestone(){
    if(!milestoneForm.name.trim()||!milestoneForm.date||!selectedProject) return
    setSavingMilestone(true)
    const{data}=await supabase.from('milestones').insert({...milestoneForm,project_id:selectedProject.id,sort_order:milestones.filter(m=>m.project_id===selectedProject.id).length,space:spaceOf(selectedProject)}).select().single()
    if(data) setMilestones([...milestones,data])
    setSavingMilestone(false);setAddingMilestone(false)
    setMilestoneForm({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  }

  async function toggleMilestone(m){
    const updated={...m,completed:!m.completed}
    setMilestones(milestones.map(ms=>ms.id===m.id?updated:ms))
    await supabase.from('milestones').update({completed:!m.completed}).eq('id',m.id)
  }

  async function deleteMilestone(id){
    if(!confirm('Delete this milestone?')) return
    setMilestones(milestones.filter(m=>m.id!==id))
    await supabase.from('milestones').delete().eq('id',id)
  }

  const totalViolations=projects.reduce((acc,p)=>acc+getViolations(p).length,0)

  return(
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>

      {/* Project list */}
      <div style={{flex:1,minWidth:0,display:(mobile&&selectedProject)?'none':'flex',flexDirection:'column',overflow:'hidden',borderRight:(selectedProject&&!mobile)?'1px solid #243447':'none'}}>

        {/* Controls */}
        <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',alignItems:'center',background:'#162436',flexWrap:'wrap' as const}}>
          <select value={filterTeam} onChange={e=>setFilterTeam(e.target.value)} style={sel}>
            <option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}
          </select>
          <select value={filterRAG} onChange={e=>setFilterRAG(e.target.value)} style={sel}>
            <option value="All">All RAG</option>
            <option value="Green">🟢 Green</option>
            <option value="Amber">🟡 Amber</option>
            <option value="Red">🔴 Red</option>
          </select>
          {totalViolations>0&&(
            <div style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'5px 12px',fontSize:12,color:'#E74C3C'}}>
              ⚠️ {totalViolations} timeline violation{totalViolations!==1?'s':''}
            </div>
          )}
          <div style={{marginLeft:'auto'}}>
            <button onClick={()=>{setAdding(true);setEditing(null);setForm({...empty})}}
              style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
              + New Project
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'flex',gap:12,padding:'10px 20px',borderBottom:'1px solid #243447',background:'#0D1B2A',flexWrap:'wrap' as const}}>
          {[
            ['Total',projects.length,'#7A8FA6'],
            ['🟢 Green',projects.filter(p=>p.rag==='Green').length,'#27AE60'],
            ['🟡 Amber',projects.filter(p=>p.rag==='Amber').length,'#D4820A'],
            ['🔴 Red',projects.filter(p=>p.rag==='Red').length,'#C0392B'],
            ['In Progress',projects.filter(p=>p.status==='In Progress').length,'#2E86AB'],
            ['Planning',projects.filter(p=>p.status==='Planning').length,'#8E44AD'],
            ['Queued',projects.filter(p=>p.status==='Queued').length,'#7A8FA6'],
          ].map(([label,val,color]:[string,number,string])=>(
            <div key={label} style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'8px 14px',display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:18,fontWeight:700,color}}>{val}</span>
              <span style={{fontSize:11,color:'#7A8FA6'}}>{label}</span>
            </div>
          ))}
        </div>

        {/* Cards */}
        <div style={{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:10}}>
          {filtered.map(project=>{
            const violations=getViolations(project)
            const children=items.filter(i=>i.parent_project===project.name)
            const projectMilestones=getProjectMilestones(project)
            const ragColor=RAG_COLORS[project.rag]||'#27AE60'
            const pclr=pc(project.priority)
            const ps=d(project.start_date),pe=d(project.end_date)
            const now=new Date()
            const daysTotal=ps&&pe?Math.round((pe.getTime()-ps.getTime())/(1000*60*60*24)):null
            const daysLeft=pe?Math.round((pe.getTime()-now.getTime())/(1000*60*60*24)):null
            const progress=ps&&pe?Math.max(0,Math.min(100,Math.round((now.getTime()-ps.getTime())/(pe.getTime()-ps.getTime())*100))):0
            const isSelected=selectedProject?.id===project.id

            const edgeClr=dragOverId===project.id?'#C8973A':isSelected?'#C8973A':violations.length>0?'rgba(192,57,43,0.5)':'#243447'
            return(
              <div key={project.id}
              draggable
              onDragStart={()=>setDragId(project.id)}
              onDragOver={e=>{e.preventDefault();setDragOverId(project.id)}}
              onDrop={()=>dropProject(project.id)}
              onDragEnd={()=>{setDragId(null);setDragOverId(null)}}
              onClick={()=>setSelectedProject(isSelected?null:project)}
              style={{background:'#162436',borderTop:`1px solid ${edgeClr}`,borderRight:`1px solid ${edgeClr}`,borderBottom:`1px solid ${edgeClr}`,borderLeft:`4px solid ${project.color||'#2E86AB'}`,borderRadius:10,padding:'14px 18px',cursor:'grab',transition:'border-color 0.15s',opacity:dragId===project.id?0.5:1}}
              onMouseEnter={e=>{if(!isSelected){const c='rgba(200,151,58,0.4)';e.currentTarget.style.borderTopColor=c;e.currentTarget.style.borderRightColor=c;e.currentTarget.style.borderBottomColor=c}}}
              onMouseLeave={e=>{if(!isSelected){const c=dragOverId===project.id?'#C8973A':violations.length>0?'rgba(192,57,43,0.5)':'#243447';e.currentTarget.style.borderTopColor=c;e.currentTarget.style.borderRightColor=c;e.currentTarget.style.borderBottomColor=c}}}>
                {/* Header */}
                <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap' as const}}>
                      <span style={{fontSize:15,fontWeight:700,color:'#F4F6F8'}}>{project.name}</span>
                      <span style={{background:pclr.bg,color:'#fff',padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:700}}>{project.priority}</span>
                      <span style={{background:ragColor+'22',color:ragColor,border:`1px solid ${ragColor}44`,padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700}}>
                        {project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':project.rag==='Red'?'🔴':'⚪'} {project.rag}
                      </span>
                      <span style={{color:sc(project.status),fontSize:11,fontWeight:600}}>{project.status}</span>
                      <span style={{fontSize:11,color:'#7A8FA6'}}>{project.team==='Consumer Experience'?'CE':'OE'}</span>
                      {violations.length>0&&<span style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:5,padding:'2px 7px',fontSize:11,color:'#E74C3C'}}>⚠️ {violations.length} violation{violations.length!==1?'s':''}</span>}
                      {projectMilestones.length>0&&<span style={{background:'rgba(200,151,58,0.15)',border:'1px solid rgba(200,151,58,0.3)',borderRadius:5,padding:'2px 7px',fontSize:11,color:'#C8973A'}}>🏁 {projectMilestones.length} milestone{projectMilestones.length!==1?'s':''}</span>}
                    </div>
                    {project.description&&<div style={{fontSize:12,color:'#7A8FA6',lineHeight:1.4}}>{project.description}</div>}
                  </div>
                  <div style={{display:'flex',gap:5,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>startEdit(project)} style={{...sel,fontSize:11,padding:'3px 8px'}}>Edit</button>
                    <button onClick={()=>deleteProject(project.id)} style={{...sel,fontSize:11,padding:'3px 8px',color:'#E74C3C',border:'1px solid #E74C3C'}}>Delete</button>
                  </div>
                </div>

                {/* Timeline */}
                {ps&&pe&&(
                  <div style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#7A8FA6',marginBottom:4}}>
                      <span>{fmt(project.start_date)}</span>
                      <span style={{color:daysLeft!==null&&daysLeft<0?'#E74C3C':daysLeft!==null&&daysLeft<30?'#E74C3C':daysLeft!==null&&daysLeft<60?'#D4820A':'#7A8FA6',fontWeight:daysLeft!==null&&daysLeft<60?700:400}}>
                        {daysLeft!==null&&daysLeft>0?`${daysLeft}d remaining`:daysLeft!==null&&daysLeft<=0?`${Math.abs(daysLeft)}d overdue`:'—'}
                      </span>
                      <span>{fmt(project.end_date)}</span>
                    </div>
                    <div style={{height:6,background:'#1E3048',borderRadius:3,overflow:'hidden',marginBottom:3,position:'relative'}}>
                      <div style={{height:'100%',width:`${progress}%`,background:project.color||'#2E86AB',borderRadius:3}}/>
                      {/* Milestone markers on timeline */}
                      {projectMilestones.map(m=>{
                        if(!d(m.date)) return null
                        const mPct=Math.max(0,Math.min(100,(d(m.date).getTime()-ps.getTime())/(pe.getTime()-ps.getTime())*100))
                        return(
                          <div key={m.id} title={`${m.name} — ${fmt(m.date)}`}
                            style={{position:'absolute',top:-3,left:`${mPct}%`,width:2,height:12,background:m.color||'#C8973A',zIndex:2,transform:'translateX(-50%)'}}/>
                        )
                      })}
                    </div>
                    <div style={{fontSize:10,color:'#7A8FA6'}}>{progress}% · {daysTotal}d total · {children.length} items · {projectMilestones.filter(m=>!m.completed).length} upcoming milestones</div>
                  </div>
                )}

                {/* Quick controls */}
                <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',gap:3,fontSize:11}}>
                    <span style={{color:'#7A8FA6'}}>RAG:</span>
                    {['Green','Amber','Red','—'].map(r=>(
                      <button key={r} onClick={()=>updateField(project.id,'rag',r==='—'?null:r)}
                        style={{background:(project.rag===r||(!project.rag&&r==='—'))?(RAG_COLORS[r]||'#7A8FA6')+'33':'transparent',color:RAG_COLORS[r]||'#7A8FA6',border:`1px solid ${(project.rag===r||(!project.rag&&r==='—'))?(RAG_COLORS[r]||'#7A8FA6'):'#243447'}`,borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:(project.rag===r||(!project.rag&&r==='—'))?700:400}}>
                        {r==='Green'?'🟢':r==='Amber'?'🟡':r==='Red'?'🔴':'⚪'} {r}
                      </button>
                    ))}
                  </div>
                  <select value={project.status} onChange={e=>updateField(project.id,'status',e.target.value)} style={{...sel,fontSize:11,padding:'2px 5px'}}>
                    {projectStatusesFor(space).map(s=><option key={s}>{s}</option>)}
                  </select>
                  <select value={project.priority} onChange={e=>updateField(project.id,'priority',e.target.value)} style={{...sel,fontSize:11,padding:'2px 5px'}}>
                    {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                  </select>
                  <span style={{fontSize:11,color:'#7A8FA6',marginLeft:4}}>{children.length} items</span>
                  <span style={{fontSize:11,color:'#C8973A',marginLeft:4,cursor:'pointer',fontWeight:600}} onClick={()=>setSelectedProject(isSelected?null:project)}>
                    {isSelected?'▲ Close detail':'▼ View detail'}
                  </span>
                </div>

                {/* Violations */}
                {violations.length>0&&(
                  <div style={{background:'rgba(192,57,43,0.08)',border:'1px solid rgba(192,57,43,0.2)',borderRadius:6,padding:'10px 12px',marginTop:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#E74C3C',marginBottom:8}}>
                      ⚠️ Timeline violations — window: {fmt(project.start_date)} → {fmt(project.end_date)}
                    </div>
                    {violations.map(v=><ViolationRow key={v.id} v={v} project={project} fmt={fmt} d={d}/>)}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length===0&&(
            <div style={{textAlign:'center',padding:60,color:'#7A8FA6'}}>
              <div style={{fontSize:32,marginBottom:12}}>📋</div>
              <div style={{fontSize:16,marginBottom:8}}>No projects yet</div>
              <div style={{fontSize:13}}>Click "+ New Project" to get started</div>
            </div>
          )}
        </div>
      </div>

      {/* Project detail panel */}
      {selectedProject&&(
  <ProjectDetail
    project={projects.find(p=>p.id===selectedProject.id)||selectedProject}
    items={items}
    setItems={setItems}
    projects={projects}
    setProjects={setProjects}
    milestones={milestones}
    setMilestones={setMilestones}
    tasks={tasks}
    setTasks={setTasks}
    onClose={()=>setSelectedProject(null)}
    d={d}
    fmt={fmt}
    ccrs={ccrs}
    ccrItems={ccrItems}
    roles={roles}
    people={people}
    projectRoles={projectRoles}
    setProjectRoles={setProjectRoles}
    itemAssignments={itemAssignments}
    setItemAssignments={setItemAssignments}
  />
)}

      {/* Add/Edit modal */}
      {adding&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:520,maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:20}}>{editing?'Edit Project':'New Project'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Project Name *</div>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Peak Prep"
                  style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'8px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Description</div>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
                  style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'8px 10px',fontSize:13,boxSizing:'border-box' as const,resize:'vertical' as const,fontFamily:'inherit'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                {([['Priority','priority',PRIORITIES],['Status','status',projectStatusesFor(space)],['Team','team',TEAMS],['Effort','effort',EFFORTS]] as [string,string,string[]][]).map(([label,field,opts])=>(
                  <div key={field}>
                    <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>{label}{field==='effort'&&<span style={{color:'#7A8FA6',fontWeight:400}}> — sets default budget allocation %</span>}</div>
                    <select value={form[field]} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}
                      style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 8px',fontSize:12}}>
                      {field==='effort'&&<option value="">Not set (0%)</option>}
                      {opts.map(o=><option key={o} value={o}>{field==='effort'?`${o} (${EFFORT_ALLOC[o]}%)`:o}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>RAG Status</div>
                  <select value={form.rag} onChange={e=>setForm(p=>({...p,rag:e.target.value}))}
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 8px',fontSize:12}}>
                    <option value="Green">🟢 Green</option>
                    <option value="Amber">🟡 Amber</option>
                    <option value="Red">🔴 Red</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Start Date</div>
                  <input type="date" value={form.start_date} onChange={e=>setForm(p=>({...p,start_date:e.target.value}))}
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>End Date</div>
                  <input type="date" value={form.end_date} disabled={!!form.ongoing} onChange={e=>setForm(p=>({...p,end_date:e.target.value}))}
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const,opacity:form.ongoing?0.4:1}}/>
                </div>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#F4F6F8',cursor:'pointer'}}>
                <input type="checkbox" checked={!!form.ongoing} onChange={e=>setForm(p=>({...p,ongoing:e.target.checked}))}/>
                ∞ Ongoing / open-ended — no fixed end date (long-running vendor deliverables); track via milestones
              </label>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8}}>Project Color</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                  {COLORS.map(c=>(
                    <div key={c} onClick={()=>setForm(p=>({...p,color:c}))}
                      style={{width:28,height:28,borderRadius:6,background:c,cursor:'pointer',border:form.color===c?'3px solid #F4F6F8':'3px solid transparent'}}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>{setAdding(false);setEditing(null);setForm({...empty})}} style={sel}>Cancel</button>
              <button onClick={saveProject} disabled={saving||!form.name.trim()}
                style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.7:1}}>
                {saving?'Saving...':(editing?'Save Changes':'Create Project')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// ── BACKLOG ───────────────────────────────────────────────────────────────
// Top-level so its identity is stable across renders — defining it inside
// Backlog remounts the input on every keystroke and drops focus
function PanelField({label,field,type='text',selected,upd}:{label:string,field:string,type?:string,selected:any,upd:any}) {
  if(!selected) return null
  const val=selected[field]??''
  return(
    <div>
      <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}}>{label}</div>
      {type==='textarea'
        ?<textarea value={val} onChange={e=>upd(selected.id,field,e.target.value)} rows={3} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const,resize:'vertical' as const,fontFamily:'inherit'}}/>
        :type==='date'
        ?<input type="date" value={val} onChange={e=>upd(selected.id,field,e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
        :type==='number'
        ?<input type="number" value={val} onChange={e=>upd(selected.id,field,parseFloat(e.target.value)||null)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
        :<input type="text" value={val} onChange={e=>upd(selected.id,field,e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
      }
    </div>
  )
}

function Backlog({items,setItems,projects,setProjects,space,ccrs=[],ccrItems=[],setCcrItems}:{items:any[],setItems:any,projects:any[],setProjects:any,space:string,ccrs?:any[],ccrItems?:any[],setCcrItems?:any}) {
  // CCR membership helpers — the link is a junction row, edited from either side
  const itemCcrLink=(itemId:any)=>{const l=(ccrItems as any[]).find((x:any)=>x.item_id===itemId);return l?{link:l,ccr:(ccrs as any[]).find((c:any)=>c.id===l.ccr_id)}:null}
  async function detachItemCcr(itemId:any){
    const found=itemCcrLink(itemId);if(!found)return
    setCcrItems((prev:any[])=>prev.filter((l:any)=>l.item_id!==itemId))
    const{error}=await supabase.from('ccr_items').delete().eq('item_id',itemId)
    if(error){alert('Failed to remove CCR link: '+error.message)}
  }
  async function attachItemCcr(itemId:any,ccrId:any){
    if(!ccrId)return
    if((ccrItems as any[]).some((l:any)=>l.item_id===itemId))return
    setCcrItems((prev:any[])=>[...prev,{ccr_id:ccrId,item_id:itemId}])
    const{error}=await supabase.from('ccr_items').insert({ccr_id:ccrId,item_id:itemId})
    if(error){setCcrItems((prev:any[])=>prev.filter((l:any)=>!(l.ccr_id===ccrId&&l.item_id===itemId)));alert('Failed to link CCR: '+error.message)}
  }
 const [ft,setFt]=useState('All')
  const [fp,setFp]=useState('All')
  const [fs,setFs]=useState('All')
  const [fst,setFst]=useState('All')
  const [fpp,setFpp]=useState('All')
  const [frt,setFrt]=useState('All')
  const [frg,setFrg]=useState('All')
  const [fvn,setFvn]=useState('All')
  const [fef,setFef]=useState('All')
  const [srch,setSrch]=useState('')
  const [sf,setSf]=useState(false)
  const [sortCol,setSortCol]=useState('priority')
  const [sortDir,setSortDir]=useState<'asc'|'desc'>('asc')
  const [did,setDid]=useState(null)
  const [doid,setDoid]=useState(null)
  const [sac,setSac]=useState(false)
  const [ncn,setNcn]=useState('')
  const [cc,setCc]=useState([])
  const [ai,setAi]=useState(false)
  const [sav,setSav]=useState(false)
  const [selected,setSelected]=useState(null)
  const [ni,setNi]=useState({name:'',priority:'P3',swimlane:'POS',team:'Consumer Experience',effort:'M',status:'New',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  const [vendors,setVendors]=useState(['Deckers','Salesforce','GreyOrange','Legion','SafeSize','ID.me','Adyen','Agilence','Boomi'])
  const [swimlaneOpts,setSwimOpts]=useState([...SWIMLANES])
  const [statusOpts,setStatusOpts]=useState([...statusesFor(space)])
  // ── Universal CSV import: upsert by RTL id or Jira key; any provided column updates; blank cells never touch
  const [jrOpen,setJrOpen]=useState(false)
  const [jrRows,setJrRows]=useState<any[]>([])
  const [jrProj,setJrProj]=useState('')
  const [jrErr,setJrErr]=useState('')
  const [jrBusy,setJrBusy]=useState(false)
  const [jrDone,setJrDone]=useState('')
  function parseCsv(text:string):string[][]{
    // RFC-4180-ish: quoted fields may contain commas, newlines, and "" escapes
    const rows:string[][]=[];let row:string[]=[];let cur='';let q=false
    for(let i=0;i<text.length;i++){
      const ch=text[i]
      if(q){
        if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}
        else cur+=ch
      }else{
        if(ch==='"')q=true
        else if(ch===','){row.push(cur);cur=''}
        else if(ch==='\n'||ch==='\r'){
          if(ch==='\r'&&text[i+1]==='\n')i++
          row.push(cur);cur=''
          if(row.some(c=>c.trim()!==''))rows.push(row)
          row=[]
        }
        else cur+=ch
      }
    }
    row.push(cur);if(row.some(c=>c.trim()!==''))rows.push(row)
    return rows
  }
  const normPri=(p:string)=>{
    if(/^p[1-4]$/i.test(p.trim()))return p.trim().toUpperCase()
    return /highest|blocker/i.test(p)?'P1':/high|critical|major/i.test(p)?'P2':/low/i.test(p)?'P4':/medium/i.test(p)?'P3':null
  }
  const normType=(t:string)=>{
    const exact=REQUEST_TYPES.find(x=>x.toLowerCase()===t.trim().toLowerCase())
    if(exact)return exact
    return /bug|defect/i.test(t)?'Bug':/debt/i.test(t)?'Tech Debt':/epic|initiative/i.test(t)?'Strategic Initiative':/story|task|improvement|enhancement/i.test(t)?'Enhancement':null
  }
  const normStatus=(st:string):string|null=>{
    const exact=statusesFor(space).find(x=>x.toLowerCase()===st.trim().toLowerCase())
    if(exact)return exact
    const x=(st||'').toLowerCase()
    if(/done|closed|resolved|complete/.test(x))return 'Done'
    if(/deploy/.test(x))return 'Ready for Deployment'
    if(/test|qa|verification/.test(x))return 'Testing'
    if(/progress|development|doing/.test(x))return 'In Progress'
    if(/block|impedi/.test(x))return 'Blocked'
    if(/review/.test(x))return 'Under Review'
    if(/to do|todo|open|backlog|new|selected/.test(x))return 'New'
    return null
  }
  const normEffort=(e:string)=>{const u=e.trim().toUpperCase();return ['XS',...EFFORTS].includes(u)?u:null}
  const normDate=(d:string)=>{
    if(/^\d{4}-\d{2}-\d{2}$/.test(d.trim()))return d.trim()
    const t=Date.parse(d);if(isNaN(t))return null
    const dd=new Date(t);return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`
  }
  function analyzeCsv(text:string){
    setJrErr('');setJrDone('')
    const rows=parseCsv(text)
    if(rows.length<2){setJrErr('Could not read the file — no data rows found.');return}
    const head=rows[0].map(h=>h.trim().toLowerCase())
    const col=(re:RegExp)=>head.findIndex(h=>re.test(h))
    const cKey=col(/^(issue ?key|jira ?key|key)$/)
    const cRtl=col(/^(id|item ?id|rtl( ?id)?)$/)
    const cName=col(/^(summary|name|item|title)$/)
    const cType=col(/^(issue ?type|type|request ?type)$/)
    const cPri=col(/^(priority|pri)$/)
    const cSt=col(/^status$/)
    const cDesc=col(/^description$/)
    const cProj=col(/^project$/)
    const cEff=col(/^(size|effort)$/)
    const cVen=col(/^vendor$/)
    const cVDate=col(/^vendor ?(delivery ?)?date$/)
    if(cKey<0&&cRtl<0&&cName<0){setJrErr('Need at least one of: "Issue key" / "Jira Key", "ID" / "RTL ID", or "Summary" / "Name". Found: '+rows[0].join(', '));return}
    const byJira=new Map(items.filter(i=>i.jira_key).map(i=>[String(i.jira_key).toUpperCase(),i]))
    const byRtl=new Map(items.map(i=>[String(i.item_id).toUpperCase(),i]))
    const projByName=new Map(projects.map((p:any)=>[p.name.toLowerCase(),p]))
    const defaultProj=jrProj?projects.find(p=>p.id===jrProj):null
    const out=rows.slice(1).map(r=>{
      const v=(c:number)=>c>=0?(r[c]||'').trim():''
      const jira=v(cKey).toUpperCase()
      const rtl=v(cRtl).toUpperCase()
      const name=v(cName)
      const notes:string[]=[]
      // ---- match: RTL id first (authoritative), then jira key
      const byR=rtl?byRtl.get(rtl):null
      const byJ=jira?byJira.get(jira):null
      if(rtl&&!byR)return{mode:'skip',key:rtl||jira,name,reason:`RTL id ${rtl} not found — ids are system-assigned, remove the column to insert as new`}
      if(byR&&byJ&&byR.id!==byJ.id)return{mode:'skip',key:rtl,name,reason:`${rtl} and ${jira} are different items — fix the row`}
      const existing=byR||byJ
      // ---- parse provided fields (blank = not provided = untouched)
      const fields:any={}
      if(name)fields.name=name
      if(v(cType)){const t=normType(v(cType));if(t)fields.request_type=t;else notes.push(`type "${v(cType)}" not recognized`)}
      if(v(cPri)){const p=normPri(v(cPri));if(p)fields.priority=p;else notes.push(`priority "${v(cPri)}" not recognized`)}
      if(v(cSt)){const st=normStatus(v(cSt));if(st)fields.status=st;else notes.push(`status "${v(cSt)}" not recognized — keeping current`)}
      if(v(cDesc))fields.description=v(cDesc).slice(0,500)
      if(v(cEff)){const e=normEffort(v(cEff));if(e)fields.effort=e;else notes.push(`size "${v(cEff)}" not recognized`)}
      if(v(cVen))fields.vendor=v(cVen)
      if(v(cVDate)){const d=normDate(v(cVDate));if(d)fields.vendor_delivery_date=d;else notes.push(`vendor date "${v(cVDate)}" not parseable`)}
      if(v(cProj)){
        const pr:any=projByName.get(v(cProj).toLowerCase())
        if(pr){fields.parent_project=pr.name;if(pr.team)fields.team=pr.team}
        else notes.push(`project "${v(cProj)}" not found — ignored`)
      }
      if(jira)fields.jira_key=jira
      if(existing){
        // ---- update: keep only real changes
        const changes:any={}
        Object.keys(fields).forEach(k=>{if((existing[k]??'')!==(fields[k]??'')&&fields[k]!==existing[k])changes[k]=fields[k]})
        if(changes.vendor_delivery_date)changes.vendor_date_changed_at=new Date().toISOString()
        if(Object.keys(changes).length===0)return{mode:'skip',key:existing.item_id,name:existing.name,reason:notes.length?notes.join(' · '):'no changes'}
        const summary=Object.keys(changes).filter(k=>k!=='vendor_date_changed_at').map(k=>{
          const label=k==='parent_project'?'project':k==='request_type'?'type':k==='vendor_delivery_date'?'vendor date':k
          return `${label}: ${existing[k]||'—'} → ${changes[k]}`
        }).join(' · ')
        return{mode:'update',key:existing.item_id,name:existing.name,existingId:existing.id,existingStatus:existing.status,changes,summary,notes}
      }
      // ---- insert: needs a name
      if(!name)return{mode:'skip',key:jira||'(no key)',name:'',reason:'new row without a Summary/Name — nothing to create'}
      if(!fields.parent_project&&defaultProj){fields.parent_project=defaultProj.name;if(defaultProj.team)fields.team=defaultProj.team}
      return{mode:'insert',key:jira||'—',name,fields,notes,
        summary:[fields.request_type||'Enhancement',fields.priority||'P3',fields.status||'New',fields.parent_project||'no project'].join(' · ')}
    }).filter(Boolean)
    if(!(out as any[]).some((r:any)=>r.mode!=='skip')&&(out as any[]).length===0){setJrErr('No usable rows found.');return}
    setJrRows(out as any[])
  }
  async function runImport(){
    setJrBusy(true)
    let cur=[...items]
    const inserts=jrRows.filter(r=>r.mode==='insert')
    const updates=jrRows.filter(r=>r.mode==='update')
    let inserted=0,updated=0
    if(inserts.length){
      const base=parseInt(/^RTL-(\d+)$/.exec(nextItemId(cur))![1],10)
      const payloads=inserts.map((r,ix)=>({
        item_id:`RTL-${String(base+ix).padStart(3,'0')}`,
        name:r.fields.name,description:r.fields.description||null,jira_key:r.fields.jira_key||null,
        request_type:r.fields.request_type||'Enhancement',priority:r.fields.priority||'P3',
        status:r.fields.status||(space==='home'?'To Do':'New'),effort:r.fields.effort||'M',
        swimlane:'POS',region:'',vendor:r.fields.vendor||'',flagged:false,
        vendor_delivery_date:r.fields.vendor_delivery_date||null,
        parent_project:r.fields.parent_project||null,team:r.fields.team||null,
        sort_order:cur.length+ix,space,
      }))
      const{data,error}=await supabase.from('items').insert(payloads).select()
      if(error){setJrErr('Insert failed: '+error.message);setJrBusy(false);return}
      if(data){setItems((prev:any[])=>[...prev,...data]);cur=[...cur,...data];inserted=data.length}
    }
    for(const r of updates){
      const{status,...rest}=r.changes
      if(Object.keys(rest).length){
        setItems((prev:any[])=>prev.map(i=>i.id===r.existingId?{...i,...rest}:i))
        cur=cur.map(i=>i.id===r.existingId?{...i,...rest}:i)
        const{error}=await supabase.from('items').update(rest).eq('id',r.existingId)
        if(error){setJrErr(`Update failed on ${r.key}: `+error.message);setJrBusy(false);return}
      }
      if(status){
        await applyItemStatus(cur,setItems,r.existingId,status)
        // mirror the same transform locally so later rows compute ranks against fresh data
        if(!ITEM_TERMINAL.includes(status)){
          cur=cur.map(i=>i.id===r.existingId?{...i,status}:i)
        }else{
          const active=cur.filter(i=>i.id!==r.existingId&&!ITEM_TERMINAL.includes(i.status)&&i.priority!=='P1'&&i.priority!=='P2')
            .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
          const rank=new Map(active.map((i,idx)=>[i.id,idx]))
          cur=cur.map(i=>i.id===r.existingId?{...i,status,committed_priority:null}:rank.has(i.id)?{...i,committed_priority:rank.get(i.id)}:i)
        }
      }
      updated++
    }
    setJrBusy(false)
    setJrRows([])
    setJrDone(`Imported ${inserted} new item${inserted!==1?'s':''}, updated ${updated} item${updated!==1?'s':''}.`)
  }
  useEffect(()=>{setStatusOpts([...statusesFor(space)])},[space])
  const [rtOpts,setRtOpts]=useState([...REQUEST_TYPES])
  const [regionOpts,setRegionOpts]=useState(['North America','EMEA','Japan','China','Global','NA/EMEA/JP'])

  // Parent options driven by projects table
  const parentOpts=projects.map(p=>p.name)

  const fc=items.filter(i=>i.flagged).length

  function sortVal(item,col){
    switch(col){
      case 'priority': return PRIORITY_ORDER[item.priority]??4
      case 'item_id': return item.item_id||''
      case 'name': return item.name?.toLowerCase()||''
      case 'swimlane': return item.swimlane?.toLowerCase()||''
      case 'status': return item.status?.toLowerCase()||''
      case 'team': return item.team?.toLowerCase()||''
      case 'effort': return ['S','M','L','XL'].indexOf(item.effort)
      case 'parent_project': return item.parent_project?.toLowerCase()||'zzz'
      case 'request_type': return item.request_type?.toLowerCase()||''
      case 'region': return item.region?.toLowerCase()||''
      case 'vendor': return item.vendor?.toLowerCase()||''
      case 'wsjf': return parseFloat(item.wsjf)||0
      case 'rice': return rice(item)||0
      case 'reach': return item.reach||0
      case 'impact': return item.impact||0
      case 'confidence': return item.confidence||0
      case 'start_date': return item.start_date||'9999'
      case 'end_date': return item.end_date||'9999'
      case 'committed_priority': return item.committed_priority??999
      case 'vendor_delivery_date': return item.vendor_delivery_date||'9999'
      case 'owner': return item.owner?.toLowerCase()||'zzz'
      default: return item.sort_order
    }
  }

const sorted=items.filter(i=>!isItemDone(i)).sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    // P1/P2 always stay at top
    if(pa<=1&&pb>1) return -1
    if(pa>1&&pb<=1) return 1
    if(pa<=1&&pb<=1) return pa-pb
    // For all other sorts — use committed_priority as tiebreaker
    if(sortCol==='priority'){
      if(pa!==pb) return sortDir==='asc'?pa-pb:pb-pa
      const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
      return am-bm
    }
    const av=sortVal(a,sortCol),bv=sortVal(b,sortCol)
    const dir=sortDir==='asc'?1:-1
    if(av<bv) return -1*dir
    if(av>bv) return 1*dir
    // Tiebreaker — committed_priority
    const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
    return am-bm
  })

  // Manual rank entry — place item at typed position, renumber everything else
  function setRank(item,target){
    if(item.priority==='P1'||item.priority==='P2') return
    const nonP12=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2'&&!isItemDone(i))
      .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
    const without=nonP12.filter(i=>i.id!==item.id)
    const pos=Math.max(0,Math.min(isNaN(target)?0:target,without.length))
    const reordered=[...without.slice(0,pos),item,...without.slice(pos)]
    const updated=reordered.map((i,idx)=>({...i,committed_priority:idx}))
    const changed=updated.filter(u=>{const o=items.find(i=>i.id===u.id);return o&&o.committed_priority!==u.committed_priority})
    setItems(prev=>prev.map(i=>{const u=changed.find(u=>u.id===i.id);return u?{...i,committed_priority:u.committed_priority}:i}))
    Promise.all(changed.map(u=>supabase.from('items').update({committed_priority:u.committed_priority}).eq('id',u.id))).then()
  }


  const filtered=sorted.filter(item=>{
    if(ft!=='All'&&item.team!==ft) return false
    if(fp!=='All'&&item.priority!==fp) return false
    if(fs!=='All'&&item.swimlane!==fs) return false
    if(fst!=='All'&&item.status!==fst) return false
    if(fpp!=='All'&&item.parent_project!==fpp) return false
    if(frt!=='All'&&item.request_type!==frt) return false
    if(frg!=='All'&&item.region!==frg) return false
    if(fvn!=='All'&&item.vendor!==fvn) return false
    if(fef!=='All'&&item.effort!==fef) return false
    if(sf&&!item.flagged) return false
    if(srch&&!item.name?.toLowerCase().includes(srch.toLowerCase())&&!item.item_id?.toLowerCase().includes(srch.toLowerCase())) return false
    return true
  })

  // Export current filtered view to Excel, always in ranked order (P1/P2 first, then committed rank)
  function exportExcel(){
    const ordered=[...filtered].sort((a,b)=>{
      const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
      if(pa<=1&&pb>1) return -1
      if(pa>1&&pb<=1) return 1
      if(pa<=1&&pb<=1) return pa-pb
      const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
      return am-bm
    })
    const rows=ordered.map(i=>({
      'ID':i.item_id,'Item Name':i.name,'Description':i.description||'',
      'Priority':i.priority,'Rank':i.committed_priority??'',
      'Swimlane':i.swimlane||'','Status':i.status||'','Team':i.team||'',
      'Effort':i.effort||'','Parent Project':i.parent_project||'',
      'Request Type':i.request_type||'','Region':i.region||'','Vendor':i.vendor||'',
      'Vendor Date':i.vendor_delivery_date||'','WSJF':i.wsjf?parseFloat(i.wsjf):'',
      'RICE':rice(i)||'','Reach':i.reach||'','Impact':i.impact||'','Confidence':i.confidence??'',
      'Owner':i.owner||'','Start Date':i.start_date||'','End Date':i.end_date||'',
      'Flagged':i.flagged?'Yes':'','Notes':i.notes||'',
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    ws['!cols']=[{wch:9},{wch:42},{wch:50},{wch:8},{wch:6},{wch:12},{wch:22},{wch:20},{wch:7},{wch:24},{wch:16},{wch:14},{wch:12},{wch:12},{wch:7},{wch:7},{wch:7},{wch:7},{wch:10},{wch:14},{wch:11},{wch:11},{wch:8},{wch:50}]
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Backlog')
    XLSX.writeFile(wb,`backlog-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  // Timeline violation check per item
  function hasViolation(item) {
    if(!item.parent_project||!item.start_date||!item.end_date) return false
    const project=projects.find(p=>p.name===item.parent_project)
    if(!project||!project.start_date||!project.end_date) return false
    return new Date(item.start_date)<new Date(project.start_date)||new Date(item.end_date)>new Date(project.end_date)
  }

  async function upd(id,field,val) {
    if(field==='status'){
      if(selected?.id===id) setSelected(s=>({...s,status:val,...(ITEM_TERMINAL.includes(val)?{committed_priority:null}:{})}))
      await applyItemStatus(items,setItems,id,val)
      return
    }
    const extra=field==='vendor_delivery_date'?{vendor_date_changed_at:new Date().toISOString()}:{}
    setItems(items.map(i=>i.id===id?{...i,[field]:val,...extra}:i))
    if(selected?.id===id) setSelected(s=>({...s,[field]:val,...extra}))
    await supabase.from('items').update({[field]:val,...extra}).eq('id',id)
  }
  async function flag(id) {
    const item=items.find(i=>i.id===id)
    if(!item) return
    // Cycle: none -> dev -> stakeholder -> both -> none
    const cur=!item.flagged?null:(item.flag_audience||'both')
    const next=cur===null?{flagged:true,flag_audience:'dev'}
      :cur==='dev'?{flagged:true,flag_audience:'stakeholder'}
      :cur==='stakeholder'?{flagged:true,flag_audience:'both'}
      :{flagged:false,flag_audience:null}
    setItems(items.map(i=>i.id===id?{...i,...next}:i))
    if(selected?.id===id) setSelected(s=>({...s,...next}))
    await supabase.from('items').update(next).eq('id',id)
  }
  function ds(e,id){setDid(id);e.dataTransfer.effectAllowed='move'}
  function dov(e,id){e.preventDefault();setDoid(id)}
 function drop(e,tid) {
    e.preventDefault()
    if(!did||did===tid){setDid(null);setDoid(null);return}
    const dragged=items.find(i=>i.id===did)
    if(!dragged||dragged.priority==='P1'||dragged.priority==='P2'){setDid(null);setDoid(null);return}
    const visibleIds=filtered.map(i=>i.id)
    const fi=visibleIds.indexOf(did)
    const ti=visibleIds.indexOf(tid)
    if(fi===-1||ti===-1){setDid(null);setDoid(null);return}
    const down=fi<ti
    // Splice into the GLOBAL rank order — never renumber just the filtered subset
    const nonP12=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2'&&!isItemDone(i))
      .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
    const without=nonP12.filter(i=>i.id!==did)
    const gIdx=without.findIndex(i=>i.id===tid)
    const pos=gIdx===-1?0:(down?gIdx+1:gIdx) // target is P1/P2 → move to top
    const reordered=[...without.slice(0,pos),dragged,...without.slice(pos)]
    const updated=reordered.map((item,idx)=>({...item,committed_priority:idx}))
    const changed=updated.filter(u=>{const o=items.find(i=>i.id===u.id);return o&&o.committed_priority!==u.committed_priority})
    setItems(items.map(i=>{const u=changed.find(u=>u.id===i.id);return u?{...i,committed_priority:u.committed_priority}:i}))
    setDid(null);setDoid(null)
    Promise.all(changed.map(u=>supabase.from('items').update({committed_priority:u.committed_priority}).eq('id',u.id))).then()
  }
  
  
  async function addIt() {
    if(!ni.name.trim()) return
    setSav(true)
    const iid=nextItemId(items)
    const{data,error}=await supabase.from('items').insert({item_id:iid,name:ni.name,description:ni.description,priority:ni.priority,swimlane:ni.swimlane,team:ni.team,effort:ni.effort,status:ni.status,request_type:ni.request_type,region:ni.region,vendor:ni.vendor,flagged:false,sort_order:items.length,space}).select().single()
    if(error){alert('Failed to add item: '+error.message);setSav(false);return}
    if(data) setItems([...items,data])
    setSav(false);setAi(false)
    setNi({name:'',priority:'P3',swimlane:'POS',team:'Consumer Experience',effort:'M',status:'New',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  }
  async function deleteItem(id) {
    if(!confirm('Delete this item?')) return
    setItems(items.filter(i=>i.id!==id))
    setSelected(null)
    await supabase.from('items').delete().eq('id',id)
  }

  function EditableDropdown({field,value,options,setOptions,label}:{field:string,value:string,options:string[],setOptions:any,label:string}) {
    const [open,setOpen]=useState(false)
    const [search,setSearch]=useState('')
    const ref=useRef(null)
    const filtered2=options.filter(o=>o.toLowerCase().includes(search.toLowerCase()))
    const canAdd=search.trim()&&!options.find(o=>o.toLowerCase()===search.toLowerCase())&&setOptions!==null
    useEffect(()=>{
      function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false)}
      document.addEventListener('mousedown',h)
      return()=>document.removeEventListener('mousedown',h)
    },[])
    return(
      <div ref={ref} style={{position:'relative'}}>
        <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}}>{label}</div>
        <div onClick={()=>setOpen(o=>!o)} style={{background:'#1E3048',border:`1px solid ${open?'#C8973A':'#243447'}`,borderRadius:6,padding:'7px 10px',fontSize:13,color:value?'#F4F6F8':'#7A8FA6',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',userSelect:'none' as const}}>
          <span>{value||'—'}</span>
          <span style={{fontSize:10,color:'#7A8FA6',transition:'transform 0.15s',transform:open?'rotate(180deg)':'none'}}>▾</span>
        </div>
        {open&&(
          <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:999,background:'#162436',border:'1px solid #243447',borderRadius:8,marginTop:4,boxShadow:'0 8px 24px rgba(0,0,0,0.5)',maxHeight:220,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'6px 6px 4px'}}>
              <input autoFocus placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==='Escape'){setOpen(false);setSearch('')}
                  if(e.key==='Enter'&&canAdd&&setOptions){setOptions(p=>[...p,search.trim()]);upd(selected.id,field,search.trim());setOpen(false);setSearch('')}
                  if(e.key==='Enter'&&!canAdd&&filtered2.length===1){upd(selected.id,field,filtered2[0]);setOpen(false);setSearch('')}
                }}
                style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'5px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
            </div>
            <div style={{overflowY:'auto',maxHeight:160}}>
              {filtered2.map(o=>(
                <div key={o} onClick={()=>{upd(selected.id,field,o);setOpen(false);setSearch('')}}
                  style={{padding:'8px 12px',fontSize:13,color:o===value?'#C8973A':'#F4F6F8',background:o===value?'rgba(200,151,58,0.12)':'transparent',cursor:'pointer',fontWeight:o===value?700:400,borderLeft:o===value?'3px solid #C8973A':'3px solid transparent'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}
                  onMouseLeave={e=>(e.currentTarget.style.background=o===value?'rgba(200,151,58,0.12)':'transparent')}>
                  {o}
                </div>
              ))}
              {canAdd&&setOptions&&(
                <div onClick={()=>{setOptions(p=>[...p,search.trim()]);upd(selected.id,field,search.trim());setOpen(false);setSearch('')}}
                  style={{padding:'8px 12px',fontSize:13,color:'#27AE60',cursor:'pointer',borderTop:'1px solid #243447',display:'flex',alignItems:'center',gap:8,fontWeight:600}}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(39,174,96,0.1)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span style={{fontSize:16,lineHeight:'1'}}>+</span> Add "{search.trim()}"
                </div>
              )}
              {filtered2.length===0&&!canAdd&&<div style={{padding:'8px 12px',fontSize:12,color:'#7A8FA6',fontStyle:'italic'}}>No matches</div>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {jrOpen&&(
        <div onClick={()=>!jrBusy&&setJrOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#162436',border:'1px solid #243447',borderRadius:12,width:760,maxWidth:'94vw',maxHeight:'86vh',display:'flex',flexDirection:'column' as const,padding:18,boxSizing:'border-box' as const}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <span style={{fontSize:15,fontWeight:800,color:'#F4F6F8'}}>⬆ CSV Import</span>
              <button onClick={()=>setJrOpen(false)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:10,lineHeight:1.5}}>
              Works with Jira exports or hand-built files. Match by <b>RTL ID</b> or <b>Jira Key</b> → update; no match → insert (needs a Name/Summary).
              Recognized columns: ID, Jira Key, Name, Type, Pri, Status, Description, Project, Size, Vendor, Vendor Date.
              Blank cells never overwrite · unrecognized values are skipped with a note, never guessed.
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10,flexWrap:'wrap' as const}}>
              <input type="file" accept=".csv,text/csv" onChange={e=>{
                const f=e.target.files?.[0];if(!f)return
                const rd=new FileReader();rd.onload=()=>analyzeCsv(String(rd.result||''));rd.readAsText(f)
              }} style={{fontSize:11,color:'#7A8FA6'}}/>
              <select value={jrProj} onChange={e=>setJrProj(e.target.value)} title="Fallback project for new rows without a Project column value" style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px',maxWidth:220}}>
                <option value="">Default project for new rows: none</option>
                {projects.filter(p=>!PROJECT_TERMINAL.includes(p.status)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {jrErr&&<div style={{background:'rgba(231,76,60,0.12)',border:'1px solid #E74C3C',borderRadius:6,color:'#E74C3C',fontSize:11,padding:'7px 10px',marginBottom:10}}>{jrErr}</div>}
            {jrDone&&<div style={{background:'rgba(39,174,96,0.12)',border:'1px solid #27AE60',borderRadius:6,color:'#27AE60',fontSize:12,fontWeight:700,padding:'7px 10px',marginBottom:10}}>✓ {jrDone}</div>}
            {jrRows.length>0&&(()=>{
              const ins=jrRows.filter(r=>r.mode==='insert')
              const upd=jrRows.filter(r=>r.mode==='update')
              const skip=jrRows.filter(r=>r.mode==='skip')
              return(
                <>
                <div style={{fontSize:12,color:'#F4F6F8',fontWeight:700,marginBottom:6}}>
                  {ins.length} new · {upd.length} status update{upd.length!==1?'s':''} · {skip.length} unchanged
                </div>
                <div style={{overflowY:'auto',flex:1,minHeight:0,border:'1px solid #243447',borderRadius:8}}>
                  <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:11}}>
                    <thead><tr style={{position:'sticky' as const,top:0,background:'#12202F'}}>
                      {['','Key','Item','Changes'].map(h=><th key={h} style={{textAlign:'left',padding:'5px 8px',color:'#7A8FA6',fontSize:10,borderBottom:'1px solid #243447'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                    {jrRows.map((r,ix)=>(
                      <tr key={ix} style={{opacity:r.mode==='skip'?0.45:1,borderBottom:'1px solid #1A2838'}}>
                        <td style={{padding:'4px 8px'}}>
                          <span style={{fontSize:9,fontWeight:700,color:r.mode==='insert'?'#27AE60':r.mode==='skip'?'#7A8FA6':'#5DADE2'}}>
                            {r.mode==='insert'?'NEW':r.mode==='skip'?'SKIP':'UPD'}
                          </span>
                        </td>
                        <td style={{padding:'4px 8px',fontFamily:'monospace',color:'#5DADE2',whiteSpace:'nowrap' as const}}>{r.key}</td>
                        <td style={{padding:'4px 8px',color:'#F4F6F8',maxWidth:240,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{r.name}</td>
                        <td style={{padding:'4px 8px',color:'#C8C8D4',maxWidth:320}}>
                          {r.mode==='skip'?<span style={{fontStyle:'italic'}}>{r.reason}</span>:r.summary}
                          {r.notes?.length>0&&<div style={{fontSize:10,color:'#C8973A'}}>{r.notes.join(' · ')}</div>}
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
                <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
                  <button onClick={()=>setJrRows([])} disabled={jrBusy} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'7px 14px',cursor:'pointer'}}>Clear</button>
                  <button onClick={runImport} disabled={jrBusy||(ins.length===0&&upd.length===0)} style={{background:'#5DADE2',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:700,padding:'7px 18px',cursor:'pointer',opacity:jrBusy||(ins.length===0&&upd.length===0)?0.5:1}}>
                    {jrBusy?'Importing…':`Import ${ins.length} new${upd.length?` + update ${upd.length}`:''}`}
                  </button>
                </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',flexWrap:'wrap',alignItems:'center',background:'#162436'}}>
        <input placeholder="Search..." value={srch} onChange={e=>setSrch(e.target.value)} style={{...sel,width:160}}/>
        <select value={ft} onChange={e=>setFt(e.target.value)} style={sel}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        <select value={fp} onChange={e=>setFp(e.target.value)} style={sel}><option value="All">All Priorities</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
        <select value={fs} onChange={e=>setFs(e.target.value)} style={sel}><option value="All">All Swimlanes</option>{swimlaneOpts.map(s=><option key={s}>{s}</option>)}</select>
        <select value={fst} onChange={e=>setFst(e.target.value)} style={sel}><option value="All">All Statuses</option>{statusOpts.map(s=><option key={s}>{s}</option>)}</select>
        <select value={fpp} onChange={e=>setFpp(e.target.value)} style={sel}><option value="All">All Projects</option>{[...new Set(items.map(i=>i.parent_project).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select>
        <select value={frt} onChange={e=>setFrt(e.target.value)} style={sel}><option value="All">All Types</option>{rtOpts.map(r=><option key={r}>{r}</option>)}</select>
        <select value={frg} onChange={e=>setFrg(e.target.value)} style={sel}><option value="All">All Regions</option>{regionOpts.map(r=><option key={r}>{r}</option>)}</select>
        <select value={fvn} onChange={e=>setFvn(e.target.value)} style={sel}><option value="All">All Vendors</option>{vendors.map(v=><option key={v}>{v}</option>)}</select>
        <select value={fef} onChange={e=>setFef(e.target.value)} style={sel}><option value="All">All Efforts</option>{EFFORTS.map(e=><option key={e}>{e}</option>)}</select>
        <button onClick={()=>setSf(f=>!f)} style={{...sel,background:sf?'#7D2D00':'#1E3048',color:sf?'#FF8C42':'#7A8FA6',border:`1px solid ${sf?'#FF8C42':'#243447'}`}}>
          🚩{fc>0&&<span style={{background:'#C8973A',color:'#0D1B2A',borderRadius:10,padding:'0 5px',fontSize:10,fontWeight:700,marginLeft:3}}>{fc}</span>}
        </button>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={exportExcel} title="Export current view to Excel in ranked order" style={{...sel,color:'#27AE60',border:'1px solid rgba(39,174,96,0.4)'}}>⬇ Excel</button>
          <button onClick={()=>{setJrOpen(true);setJrRows([]);setJrErr('');setJrDone('')}} title="Import CSV — Jira exports or hand-built files; matches by RTL ID or Jira Key to update, inserts the rest" style={{...sel,color:'#5DADE2',border:'1px solid rgba(93,173,226,0.4)'}}>⬆ Import CSV</button>
          <button onClick={()=>setSac(true)} style={{...sel,color:'#7A8FA6'}}>+ Column</button>
          <button onClick={()=>setAi(true)} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Item</button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div data-backlog-table="true" style={{flex:1,overflowX:'auto',overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1400}}>
            <thead style={{position:'sticky',top:0,zIndex:10,background:'#162436'}}>
          <tr>
                <th style={{...TH,width:32}}></th>
                {[
                  ['item_id','ID',85],['name','Item Name',200],['priority','Priority',70],['committed_priority','Rank',55],
                  ['swimlane','Swimlane',110],['status','Status',130],['team','Team',50],
                  ['effort','Effort',55],['parent_project','Parent Project',130],
                  ['request_type','Request Type',110],['region','Region',100],
                  ['vendor','Vendor',90],['vendor_delivery_date','Vendor Date',100],
                  ['wsjf','WSJF',65],['rice','RICE',65],['reach','Reach',55],
                  ['impact','Impact',55],['confidence','Confidence',80],
                  ['owner','Owner',90],['start_date','Start Date',95],['end_date','End Date',95],
                ].map(([col,label,w]:[string,string,number])=>(
                  <th key={col} style={{...TH,width:w,cursor:'pointer',userSelect:'none' as const}}
                    onClick={()=>{
                      if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc')
                      else{setSortCol(col);setSortDir('asc')}
                    }}>
                    <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'space-between'}}>
                      <span>{label}</span>
                      <span style={{fontSize:9,color:sortCol===col?'#C8973A':'#243447',fontWeight:700}}>
                        {sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕'}
                      </span>
                    </div>
                  </th>
                ))}
                <th style={{...TH,width:30}}>⚠️</th>
                <th style={{...TH,width:50}}>🚩</th>
                {cc.map(c=><th key={c.key} style={TH}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item,idx)=>{
                const r=rice(item)
                const p12=item.priority==='P1'||item.priority==='P2'
                const isSel=selected?.id===item.id
                const violation=hasViolation(item)
                const bg=isSel?'#1E3048':doid===item.id?'#1E3048':violation?'rgba(192,57,43,0.05)':item.flagged?'rgba(200,151,58,0.07)':p12?(item.priority==='P1'?'#2D1515':'#2D1E0A'):idx%2===0?'#0D1B2A':'#162436'
                const pclr=pc(item.priority)
                return(
                  <tr key={item.id} draggable
                    onDragStart={e=>ds(e,item.id)} onDragOver={e=>dov(e,item.id)}
                    onDrop={e=>drop(e,item.id)} onDragEnd={()=>{setDid(null);setDoid(null)}}
                    onClick={()=>setSelected(isSel?null:item)}
                    style={{background:bg,cursor:'pointer',borderLeft:isSel?'3px solid #C8973A':violation?'3px solid #E74C3C':'3px solid transparent'}}>
                    <td style={{...TD,color:'#243447',textAlign:'center' as const,cursor:'grab',padding:'0 4px'}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                        <span>⠿</span>
                        {item.priority!=='P1'&&item.priority!=='P2'&&(
                          <button
                            title="Move to top of backlog"
                      onClick={e=>{
                              e.stopPropagation()
                              setRank(item,0)
                            }}
                            style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'#C8973A',padding:0,lineHeight:1,opacity:0.6}}
                            onMouseEnter={e=>(e.currentTarget.style.opacity='1')}
                            onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}>
                            ⬆
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{...TD,color:'#7A8FA6',fontFamily:'monospace',fontSize:10}}>{item.item_id}</td>
                    <td style={TD}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{fontSize:12,color:'#F4F6F8',fontWeight:isSel?700:400}}>{rt(item.request_type)} {item.name}</div>
                        {item.start_date&&item.end_date&&(
                          <span title={`Committed: ${item.start_date} → ${item.end_date}`}
                            style={{background:'rgba(39,174,96,0.15)',color:'#27AE60',border:'1px solid rgba(39,174,96,0.4)',borderRadius:4,padding:'1px 6px',fontSize:9,fontWeight:700,flexShrink:0}}>
                            ✓ committed
                          </span>
                        )}
                      </div>
                      {item.description&&<div style={{color:'#7A8FA6',fontSize:10,marginTop:1,maxWidth:220,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{item.description}</div>}
                    </td>
                    <td style={TD}><span style={{background:pclr.bg,color:pclr.text,borderRadius:4,padding:'2px 8px',fontSize:10,fontWeight:700,whiteSpace:'nowrap' as const}}>{item.priority}</span></td>
                    <td style={{...TD,textAlign:'center' as const,padding:'0 4px'}} onClick={e=>e.stopPropagation()}>
                      {(item.priority==='P1'||item.priority==='P2')
                        ? <span style={{fontSize:11,color:'#7A8FA6'}}>—</span>
                        : <input key={`rk-${item.id}-${item.committed_priority}`} type="number" min={0} defaultValue={item.committed_priority??''}
                            onKeyDown={e=>{if(e.key==='Enter'){setRank(item,parseInt(e.currentTarget.value,10));e.currentTarget.blur()}}}
                            onBlur={e=>{const v=parseInt(e.target.value,10);if(!isNaN(v)&&v!==item.committed_priority)setRank(item,v)}}
                            style={{width:44,background:'transparent',border:'1px solid #243447',borderRadius:4,color:'#C8973A',fontWeight:700,fontSize:11,textAlign:'center' as const,padding:'2px 0'}}/>}
                    </td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.swimlane}</td>
                    <td style={TD}><span style={{color:sc(item.status),fontSize:11,fontWeight:600}}>{item.status}</span></td>
                    <td style={{...TD,fontSize:10,color:'#7A8FA6'}}>{item.team==='Consumer Experience'?'CE':'OE'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11}}>{item.effort}</td>
                    <td style={{...TD,fontSize:11,color:item.parent_project?'#F4F6F8':'#7A8FA6'}}>{item.parent_project||'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.request_type}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.region}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.vendor}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.vendor_delivery_date||'—'}</td>
                    <td style={{...TD,color:item.wsjf?'#E8B95A':'#7A8FA6',fontWeight:item.wsjf?700:400,fontSize:11}}>{item.wsjf?parseFloat(item.wsjf).toFixed(1):'—'}</td>
                    <td style={{...TD,color:r?'#27AE60':'#7A8FA6',fontWeight:r?700:400,fontSize:11}}>{r||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11,color:'#7A8FA6'}}>{item.reach||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11,color:'#7A8FA6'}}>{item.impact||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11,color:'#7A8FA6'}}>{item.confidence?`${Math.round(item.confidence*100)}%`:'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.owner||'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.start_date||'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.end_date||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const}}>
                      {violation&&<span title="Outside project timeline" style={{fontSize:14}}>⚠️</span>}
                    </td>
                    <td style={{...TD,textAlign:'center' as const}} onClick={e=>{e.stopPropagation();flag(item.id)}}>
                      <button title={item.flagged?`Flagged: ${item.flag_audience||'both'} — click to cycle`:'Click to flag for dev'} style={{background:'none',border:'none',cursor:'pointer',fontSize:15,opacity:item.flagged?1:0.25,whiteSpace:'nowrap' as const}}>🚩{item.flagged&&<span style={{fontSize:9,fontWeight:800,color:'#C8973A',verticalAlign:'top'}}>{flagLabel(item)}</span>}</button>
                    </td>
                    {cc.map(c=><td key={c.key} style={TD}><input placeholder="—" style={{background:'transparent',color:'#F4F6F8',border:'none',fontSize:12,width:70}}/></td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{textAlign:'center',padding:60,color:'#7A8FA6'}}>No items match your filters.</div>}
        </div>

        {selected&&(
          <div style={{width:320,borderLeft:'1px solid #243447',background:'#162436',overflowY:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px',borderBottom:'1px solid #243447',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{selected.item_id}</div>
                <div style={{fontSize:13,fontWeight:700,color:'#F4F6F8',marginTop:2,lineHeight:1.3}}>{selected.name}</div>
              </div>
              {hasViolation(selected)&&<span title="Outside project timeline" style={{fontSize:16}}>⚠️</span>}
              <button onClick={()=>flag(selected.id)} title={selected.flagged?`Flagged: ${selected.flag_audience||'both'} — click to cycle`:'Click to flag for dev'} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,opacity:selected.flagged?1:0.3}}>🚩{selected.flagged&&<span style={{fontSize:10,fontWeight:800,color:'#C8973A',verticalAlign:'top'}}>{flagLabel(selected)}</span>}</button>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#7A8FA6'}}>×</button>
            </div>
            {hasViolation(selected)&&(()=>{
              const proj=projects.find(p=>p.name===selected.parent_project)
              return proj?(
                <div style={{padding:'8px 16px',background:'rgba(192,57,43,0.1)',borderBottom:'1px solid rgba(192,57,43,0.3)',fontSize:11,color:'#E74C3C'}}>
                  ⚠️ Outside project window: {proj.start_date} → {proj.end_date}
                </div>
              ):null
            })()}
            <div style={{padding:16,display:'flex',flexDirection:'column',gap:14,flex:1}}>
              <PanelField selected={selected} upd={upd} label="Item Name" field="name"/>
              <PanelField selected={selected} upd={upd} label="Description" field="description" type="textarea"/>
              <EditableDropdown field="priority" value={selected.priority} options={PRIORITIES} setOptions={null} label="Priority"/>
              <EditableDropdown field="team" value={selected.team} options={TEAMS} setOptions={null} label="Dev Team"/>
              <EditableDropdown field="swimlane" value={selected.swimlane} options={swimlaneOpts} setOptions={setSwimOpts} label="Swimlane"/>
              <EditableDropdown field="status" value={selected.status} options={statusOpts} setOptions={setStatusOpts} label="Status"/>
              <EditableDropdown field="effort" value={selected.effort} options={EFFORTS} setOptions={null} label="Effort"/>
              <EditableDropdown field="request_type" value={selected.request_type} options={rtOpts} setOptions={setRtOpts} label="Request Type"/>
              <EditableDropdown field="region" value={selected.region} options={regionOpts} setOptions={setRegionOpts} label="Region"/>
              <EditableDropdown field="vendor" value={selected.vendor} options={vendors} setOptions={setVendors} label="Vendor"/>
              <EditableDropdown field="parent_project" value={selected.parent_project} options={parentOpts} setOptions={null} label="Parent Project"/>
              <PanelField selected={selected} upd={upd} label="Owner" field="owner"/>
              <PanelField selected={selected} upd={upd} label="Dependency" field="dependency"/>
              <PanelField selected={selected} upd={upd} label="Vendor Delivery Date" field="vendor_delivery_date" type="date"/>
              {space==='work'&&(()=>{
                const found=itemCcrLink(selected.id)
                const stClr=(st:string)=>st==='To Create'?'#E8B95A':st==='Opened'?'#5DADE2':st==='Approved'?'#27AE60':st==='Rejected'?'#E74C3C':'#7A8FA6'
                return(
                  <div>
                    <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}}>CCR</div>
                    {found?(
                      <div style={{display:'flex',alignItems:'center',gap:7,background:'#1E3048',border:'1px solid #243447',borderRadius:6,padding:'7px 10px'}}>
                        <span onClick={()=>found.ccr?.ccr_number&&navigator.clipboard.writeText(found.ccr.ccr_number)} title={found.ccr?.ccr_number?'Click to copy':undefined}
                          style={{fontFamily:'monospace',fontSize:12,color:'#5DADE2',cursor:found.ccr?.ccr_number?'copy':'default'}}>
                          {found.ccr?.ccr_number||found.ccr?.title||'(deleted CCR)'}
                        </span>
                        {found.ccr&&<span style={{fontSize:9,fontWeight:700,color:stClr(found.ccr.status)}}>{found.ccr.status.toUpperCase()}</span>}
                        {found.ccr&&!found.ccr.ccr_number&&<span style={{fontSize:10,color:'#7A8FA6',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}></span>}
                        <button onClick={()=>detachItemCcr(selected.id)} title="Remove this item from the CCR — everywhere in the app"
                          style={{marginLeft:'auto',background:'none',border:'1px solid rgba(231,76,60,0.4)',borderRadius:4,color:'#E74C3C',fontSize:10,fontWeight:700,padding:'2px 8px',cursor:'pointer'}}>✕ Remove</button>
                      </div>
                    ):(
                      <select value="" onChange={e=>attachItemCcr(selected.id,e.target.value)}
                        style={{width:'100%',boxSizing:'border-box' as const,background:'#1E3048',border:'1px dashed #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'7px 10px',cursor:'pointer'}}>
                        <option value="">— Not in a CCR — attach to…</option>
                        {(ccrs as any[]).filter((c:any)=>c.status!=='Closed').map((c:any)=><option key={c.id} value={c.id}>{c.ccr_number?c.ccr_number+' — ':''}{c.title} ({c.status})</option>)}
                        {(ccrs as any[]).filter((c:any)=>c.status==='Closed').map((c:any)=><option key={c.id} value={c.id}>{c.ccr_number?c.ccr_number+' — ':''}{c.title} (Closed)</option>)}
                      </select>
                    )}
                  </div>
                )
              })()}
              <PanelField selected={selected} upd={upd} label="Notes" field="notes" type="textarea"/>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>RICE SCORING</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <PanelField selected={selected} upd={upd} label="Reach (1-5)" field="reach" type="number"/>
                  <PanelField selected={selected} upd={upd} label="Impact (1-5)" field="impact" type="number"/>
                </div>
                <div style={{marginTop:10}}>
                  <EditableDropdown field="confidence" value={selected.confidence?`${Math.round(selected.confidence*100)}%`:''} options={['20%','50%','80%','100%']} setOptions={null} label="Confidence"/>
                </div>
                {rice(selected)&&(
                  <div style={{marginTop:10,background:'#1E3048',borderRadius:8,padding:'10px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:12,color:'#7A8FA6'}}>RICE Score</span>
                    <span style={{fontSize:18,fontWeight:700,color:'#27AE60'}}>{rice(selected)}</span>
                  </div>
                )}
              </div>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>ROADMAP</div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <PanelField selected={selected} upd={upd} label="Start Date" field="start_date" type="date"/>
                  <PanelField selected={selected} upd={upd} label="End Date" field="end_date" type="date"/>
                </div>
              </div>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>SCORING</div>
                <PanelField selected={selected} upd={upd} label="Manual Rank" field="manual_rank" type="number"/>
              </div>
            </div>
            <div style={{padding:'12px 16px',borderTop:'1px solid #243447',flexShrink:0}}>
              <button onClick={()=>deleteItem(selected.id)} style={{width:'100%',background:'transparent',border:'1px solid #C0392B',color:'#C0392B',borderRadius:6,padding:'8px',fontSize:12,cursor:'pointer',fontWeight:600}}>Delete Item</button>
            </div>
          </div>
        )}
      </div>

      <div style={{display:'flex',gap:24,padding:'8px 20px',borderTop:'1px solid #243447',background:'#162436',fontSize:12,color:'#7A8FA6',flexShrink:0}}>
        <span>{filtered.length} of {items.length} items</span>
        <span>P1: {items.filter(i=>i.priority==='P1').length}</span>
        <span>P2: {items.filter(i=>i.priority==='P2').length}</span>
        <span style={{color:fc>0?'#C8973A':'#7A8FA6'}}>🚩 {fc} flagged</span>
        {selected&&<span style={{marginLeft:'auto',color:'#C8973A'}}>Editing: {selected.item_id}</span>}
      </div>

      {sac&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:24,width:320}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:16}}>Add Custom Column</div>
            <input autoFocus placeholder="Column name..." value={ncn} onChange={e=>setNcn(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&ncn.trim()){setCc(p=>[...p,{key:ncn.toLowerCase().replace(/\s+/g,'_'),label:ncn}]);setNcn('');setSac(false)};if(e.key==='Escape')setSac(false)}}
              style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
            <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}>
              <button onClick={()=>setSac(false)} style={sel}>Cancel</button>
              <button onClick={()=>{if(ncn.trim()){setCc(p=>[...p,{key:ncn.toLowerCase().replace(/\s+/g,'_'),label:ncn}]);setNcn('');setSac(false)}}} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'6px 16px',fontWeight:700,cursor:'pointer'}}>Add</button>
            </div>
          </div>
        </div>
      )}

      {ai&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:480,maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:20}}>New Backlog Item</div>
            {[['Item Name','name'],['Description','description']].map(([label,field])=>(
              <div key={field} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>{label}</div>
                <input value={ni[field]} onChange={e=>setNi(p=>({...p,[field]:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
            ))}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              {([['Priority','priority',PRIORITIES],['Team','team',TEAMS],['Swimlane','swimlane',swimlaneOpts],['Status','status',statusOpts],['Effort','effort',EFFORTS],['Request Type','request_type',rtOpts],['Region','region',regionOpts],['Vendor','vendor',vendors]] as [string,string,string[]][]).map(([label,field,opts])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>{label}</div>
                  <select value={(ni as any)[field]} onChange={e=>setNi((p:any)=>({...p,[field]:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'6px 8px',fontSize:12}}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button onClick={()=>setAi(false)} style={sel}>Cancel</button>
              <button onClick={addIt} disabled={sav} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>{sav?'Saving...':'Add Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ROADMAP ───────────────────────────────────────────────────────────────
function Roadmap({items,setItems,projects,setProjects,milestones}:{items:any[],projects:any[],setItems:any,setProjects:any,milestones:any[]}) {
  const [view,setView]=useState('quarter')
  const [colorBy,setColorBy]=useState('status')
  const [ft,setFt]=useState('All')
  const [zoom,setZoom]=useState(1)
  const [editing,setEditing]=useState(null)
  const [editForm,setEditForm]=useState({name:'',start_date:'',end_date:'',roadmap_color:''})
  const [saving,setSaving]=useState(false)
  const [sortBy,setSortBy]=useState('start_date')
  const [sortDir,setSortDir]=useState('asc')
  const [collapsed,setCollapsed]=useState(null)
  const [showSettings,setShowSettings]=useState(false)
  const [codeFreezeStart,setCodeFreezeStart]=useState('2026-10-01')
  const [codeFreezeEnd,setCodeFreezeEnd]=useState('2026-12-31')
  const mobileR=useIsMobile()
  const [backlogOpen,setBacklogOpen]=useState(true)
  const [discussionOpen,setDiscussionOpen]=useState(true)
  // On mobile, side panels start collapsed so the Gantt owns the screen
  useEffect(()=>{if(mobileR){setBacklogOpen(false);setDiscussionOpen(false)}},[mobileR])
  const [discussNoteId,setDiscussNoteId]=useState(null)
  const [discussNoteDraft,setDiscussNoteDraft]=useState('')
  const [detailItem,setDetailItem]=useState(null)

  async function updItem(id,field,val){
    const extra=field==='vendor_delivery_date'?{vendor_date_changed_at:new Date().toISOString()}:{}
    setItems((prev:any[])=>prev.map(i=>i.id===id?{...i,[field]:val,...extra}:i))
    setDetailItem((d:any)=>d&&d.id===id?{...d,[field]:val,...extra}:d)
    await supabase.from('items').update({[field]:val,...extra}).eq('id',id)
  }
  const [projectsPanelOpen,setProjectsPanelOpen]=useState(true)
  const [backlogSectionOpen,setBacklogSectionOpen]=useState(true)
  const [dragOverProject,setDragOverProject]=useState(null)
  const [dragOverCol,setDragOverCol]=useState(null)
  const [draggingBar,setDraggingBar]=useState(null)
  const [draggingEdge,setDraggingEdge]=useState(null)
  const [draggingProjectOver,setDraggingProjectOver]=useState(false)
  const [dragTooltip,setDragTooltip]=useState(null)
  const [backlogHover,setBacklogHover]=useState(false)
  const ganttRef=useRef(null)
  const labelRef=useRef(null)
  const barDragState=useRef(null)
  const today=new Date()

  const filteredItems=items.filter(i=>ft==='All'||i.team===ft)
  const withDates=filteredItems.filter(i=>i.start_date&&i.end_date)
  const noDates=filteredItems.filter(i=>!i.start_date||!i.end_date)
  const uncommitted=[...noDates].sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    // P1/P2 always stay at top
    if(pa<=1&&pb>1) return -1
    if(pa>1&&pb<=1) return 1
    if(pa<=1&&pb<=1) return pa-pb
    // Everything else — committed rank order
    const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
    return am-bm
  })
  const [hideDone,setHideDone]=useState(false)
  const filteredProjects=projects.filter(p=>(ft==='All'||p.team===ft)&&(!hideDone||!PROJECT_TERMINAL.includes(p.status)))
  const flaggedItems=items.filter(flagStk) // roadmap discussion = stakeholder audience

  async function saveDiscussNote(item){
    setItems((prev:any[])=>prev.map(i=>i.id===item.id?{...i,notes:discussNoteDraft}:i))
    setDiscussNoteId(null)
    await supabase.from('items').update({notes:discussNoteDraft}).eq('id',item.id)
  }

  function ragColor(rag){return rag==='Red'?'#C0392B':rag==='Amber'?'#D4820A':'#27AE60'}
  function ragBg(rag){return rag==='Red'?'rgba(192,57,43,0.14)':rag==='Amber'?'rgba(212,130,10,0.14)':'rgba(39,174,96,0.08)'}
  function ragBorder(rag){return rag==='Red'?'rgba(192,57,43,0.6)':rag==='Amber'?'rgba(212,130,10,0.6)':'rgba(39,174,96,0.4)'}

  const groups=filteredProjects.map(project=>{
    const children=withDates.filter(i=>i.parent_project===project.name)
    const violations=children.filter(i=>{
      if(!project.start_date||!project.end_date) return false
      return new Date(i.start_date+'T12:00:00')<new Date(project.start_date+'T12:00:00')||new Date(i.end_date+'T12:00:00')>new Date(project.end_date+'T12:00:00')
    })
    return{...project,items:children,violations,bar_start:project.start_date,bar_end:project.ongoing?(project.end_date||'9999-12-31'):project.end_date}
  }).filter((g:any)=>g.items.length>0||(g.bar_start&&g.bar_end)).sort((a:any,b:any)=>{
    // Ongoing (∞) projects always pin to the bottom regardless of sort
    if(!!a.ongoing!==!!b.ongoing) return a.ongoing?1:-1
    let av,bv
    if(sortBy==='start_date'){av=new Date((a.bar_start||'9999')+'T12:00:00');bv=new Date((b.bar_start||'9999')+'T12:00:00')}
    else if(sortBy==='end_date'){av=new Date((a.bar_end||'9999')+'T12:00:00');bv=new Date((b.bar_end||'9999')+'T12:00:00')}
    else if(sortBy==='name'){av=a.name.toLowerCase();bv=b.name.toLowerCase()}
    else if(sortBy==='rag'){av=['Red','Amber','Green'].indexOf(a.rag);bv=['Red','Amber','Green'].indexOf(b.rag)}
    else{av=new Date((a.bar_start||'9999')+'T12:00:00');bv=new Date((b.bar_start||'9999')+'T12:00:00')}
    if(av<bv) return sortDir==='asc'?-1:1
    if(av>bv) return sortDir==='asc'?1:-1
    return 0
  })

  const orphans=withDates.filter(i=>!i.parent_project||!projects.find(p=>p.name===i.parent_project))
  const totalViolations=groups.reduce((acc,g:any)=>acc+g.violations.length,0)

  function getCollapsed(){
    if(collapsed===null){
      const all={}
      groups.forEach((g:any)=>all[g.id]=true)
      all['__nodates']=true;all['__orphans']=true
      return all
    }
    return collapsed
  }
  function toggleCollapse(key){const c=getCollapsed();setCollapsed({...c,[key]:!c[key]})}
  function collapseAll(){const all={};groups.forEach((g:any)=>all[g.id]=true);all['__nodates']=true;all['__orphans']=true;setCollapsed(all)}
  function expandAll(){setCollapsed({})}

  function buildCols(){
    const cfStart=new Date(codeFreezeStart+'T12:00:00'),cfEnd=new Date(codeFreezeEnd+'T12:00:00')
    function isCF(s,e){return s<=cfEnd&&e>=cfStart}
    const allDates=[
      ...items.filter(i=>i.start_date).map(i=>new Date(i.start_date+'T12:00:00')),
      ...items.filter(i=>i.end_date).map(i=>new Date(i.end_date+'T12:00:00')),
      ...projects.filter(p=>p.start_date).map(p=>new Date(p.start_date+'T12:00:00')),
      ...projects.filter(p=>p.end_date).map(p=>new Date(p.end_date+'T12:00:00')),
    ]
    const earliest=allDates.length>0?new Date(Math.min(...allDates.map(d=>d.getTime()))):new Date()
    const latest=allDates.length>0?new Date(Math.max(...allDates.map(d=>d.getTime()))):new Date()
    const rangeStart=new Date(earliest);rangeStart.setMonth(rangeStart.getMonth()-3)
    const rangeEnd=new Date(latest);rangeEnd.setMonth(rangeEnd.getMonth()+3)
    const qStart=new Date(rangeStart.getFullYear(),Math.floor(rangeStart.getMonth()/3)*3,1)
    const qEnd=new Date(rangeEnd.getFullYear(),Math.floor(rangeEnd.getMonth()/3)*3+3,0)
    if(view==='week'){
      const cols=[];let d=new Date(qStart)
      while(d<=qEnd){const we=new Date(d);we.setDate(we.getDate()+6);cols.push({key:d.toISOString(),label:`${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`,start:new Date(d),end:we,isCodeFreeze:isCF(new Date(d),we)});d.setDate(d.getDate()+7)}
      return cols
    }else if(view==='month'){
      const cols=[];let d=new Date(qStart.getFullYear(),qStart.getMonth(),1)
      while(d<=qEnd){const ms=new Date(d.getFullYear(),d.getMonth(),1);const me=new Date(d.getFullYear(),d.getMonth()+1,0);cols.push({key:`${d.getFullYear()}-${d.getMonth()}`,label:d.toLocaleString('default',{month:'short',year:'2-digit'}),start:ms,end:me,isCodeFreeze:isCF(ms,me)});d.setMonth(d.getMonth()+1)}
      return cols
    }else if(view==='quarter'){
      const cols=[];let y=qStart.getFullYear();let q=Math.floor(qStart.getMonth()/3)
      const endY=qEnd.getFullYear();const endQ=Math.floor(qEnd.getMonth()/3)
      while(y<endY||(y===endY&&q<=endQ)){
        const ms=new Date(y,q*3,1);const me=new Date(y,q*3+3,0)
        const fy=ms.getMonth()<3?y:y+1
        const fyq=q===0?4:q===1?1:q===2?2:3
        const qLabel=`Q${fyq} FY${String(fy).slice(2)}`;const cf=isCF(ms,me)
        cols.push({key:`${y}-Q${q}`,label:cf?`${qLabel} 🔒`:qLabel,start:ms,end:me,isCodeFreeze:cf})
        q++;if(q>3){q=0;y++}
      }
      return cols
    }else{
      const cols=[];let y=qStart.getFullYear()
      while(y<=qEnd.getFullYear()+1){
        const ms=new Date(y,3,1);const me=new Date(y+1,2,31)
        if(me>=qStart&&ms<=qEnd){cols.push({key:`FY${y+1}`,label:`FY ${y+1}`,start:ms,end:me,isCodeFreeze:false})}
        y++
      }
      return cols
    }
  }

  const cols=buildCols()
  const totalStart=cols[0]?.start
  const totalEnd=cols[cols.length-1]?.end
  const totalMs=totalEnd.getTime()-totalStart.getTime()
  const COL_W=view==='week'?60*zoom:view==='month'?100*zoom:view==='quarter'?200*zoom:300*zoom
  const TOTAL_W=cols.length*COL_W

  function pct(dateStr){return(new Date(dateStr+'T12:00:00').getTime()-totalStart.getTime())/totalMs*TOTAL_W}
  function barPx(s,e){return Math.max(2,(new Date(e+'T12:00:00').getTime()-totalStart.getTime())/totalMs*TOTAL_W-pct(s))}
  function todayPx(){return Math.max(0,Math.min(TOTAL_W,(today.getTime()-totalStart.getTime())/totalMs*TOTAL_W))}
  function dateToStr(d){return d.toISOString().split('T')[0]}
  function fmtD(str){return new Date(str+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})}

  function handleGanttDragOver(e,projectName,col){e.preventDefault();setDragOverProject(projectName);setDragOverCol(col.key)}
  function handleGanttDragLeave(){setDragOverProject(null);setDragOverCol(null)}
  async function handleGanttDrop(e,projectName,col){
    e.preventDefault()
    const draggedProjectId=e.dataTransfer.getData('projectId')
    if(draggedProjectId){
      const updates={start_date:dateToStr(col.start),end_date:dateToStr(col.end)}
      setProjects((prev:any[])=>prev.map(p=>p.id===draggedProjectId?{...p,...updates}:p))
      await supabase.from('projects').update(updates).eq('id',draggedProjectId)
      setDragOverProject(null);setDragOverCol(null);return
    }
    const itemId=e.dataTransfer.getData('itemId')
    if(!itemId){setDragOverProject(null);setDragOverCol(null);return}
    const updates={start_date:dateToStr(col.start),end_date:dateToStr(col.end),parent_project:projectName}
    setItems(items.map(i=>i.id===itemId?{...i,...updates}:i))
    await supabase.from('items').update(updates).eq('id',itemId)
    setDragOverProject(null);setDragOverCol(null)
  }

  function startBarDrag(e,item,type){
    e.preventDefault();e.stopPropagation()
    const gantt=ganttRef.current as any;if(!gantt) return
    barDragState.current={item,type,startX:e.clientX,origStart:item.start_date,origEnd:item.end_date,containerWidth:TOTAL_W}
    setDraggingBar(item.id);if(type!=='move') setDraggingEdge(type)
  }
  function startProjectBarDrag(e,project,type){
    e.preventDefault();e.stopPropagation()
    barDragState.current={item:project,type,startX:e.clientX,origStart:project.start_date,origEnd:project.end_date,containerWidth:TOTAL_W,isProject:true}
    setDraggingBar(project.id);if(type!=='move') setDraggingEdge(type)
  }

  useEffect(()=>{
    function onMouseMove(e){
      const state=barDragState.current;if(!state) return
      const dx=e.clientX-state.startX
      const daysTotal=totalMs/(1000*60*60*24)
      const pxPerDay=state.containerWidth/daysTotal
      const daysDelta=Math.round(dx/pxPerDay)
      const origStartMs=new Date(state.origStart+'T12:00:00').getTime()
      const origEndMs=new Date(state.origEnd+'T12:00:00').getTime()
      const DAY=1000*60*60*24
      let newStart=state.origStart,newEnd=state.origEnd
      if(state.type==='move'){newStart=dateToStr(new Date(origStartMs+daysDelta*DAY));newEnd=dateToStr(new Date(origEndMs+daysDelta*DAY))}
      else if(state.type==='left'){const ns=new Date(origStartMs+daysDelta*DAY);if(ns<new Date(state.origEnd+'T12:00:00'))newStart=dateToStr(ns)}
      else if(state.type==='right'){const ne=new Date(origEndMs+daysDelta*DAY);if(ne>new Date(state.origStart+'T12:00:00'))newEnd=dateToStr(ne)}
      if(state.isProject){setProjects((prev:any[])=>prev.map(p=>p.id===state.item.id?{...p,start_date:newStart,end_date:newEnd}:p))}
      else{setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,start_date:newStart,end_date:newEnd}:i))}
      setDragTooltip({x:e.clientX,y:e.clientY,start:newStart,end:newEnd})
      const el=document.elementFromPoint(e.clientX,e.clientY)
      setBacklogHover(!!el?.closest('[data-backlog-panel]'))
    }
    async function onMouseUp(e){
      const state=barDragState.current;if(!state) return
      const el=document.elementFromPoint(e.clientX,e.clientY)
      const overBacklog=el?.closest('[data-backlog-panel]')
      if(state.isProject){
        if(overBacklog){
          setProjects((prev:any[])=>prev.map(p=>p.id===state.item.id?{...p,start_date:null,end_date:null}:p))
          await supabase.from('projects').update({start_date:null,end_date:null}).eq('id',state.item.id)
        }else{
          const cp=projects.find(p=>p.id===state.item.id)
          if(cp) await supabase.from('projects').update({start_date:cp.start_date,end_date:cp.end_date}).eq('id',state.item.id)
        }
        barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false);return
      }
      const currentItem=items.find(i=>i.id===state.item.id)
      if(!currentItem){barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false);return}
      if(overBacklog){
        setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,start_date:null,end_date:null}:i))
        await supabase.from('items').update({start_date:null,end_date:null}).eq('id',state.item.id)
        barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false);return
      }
      const projectRow=el?.closest('[data-project-name]')
      const newProjectName=projectRow?.getAttribute('data-project-name')
      const updates:any={start_date:currentItem.start_date,end_date:currentItem.end_date}
      if(newProjectName&&newProjectName!==currentItem.parent_project){
        updates.parent_project=newProjectName
        setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,parent_project:newProjectName}:i))
      }
      await supabase.from('items').update(updates).eq('id',state.item.id)
      barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false)
    }
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp)}
  },[items,projects,totalMs,TOTAL_W])

  async function saveEdit(){
    if(!editing) return;setSaving(true)
    await supabase.from('items').update({start_date:editForm.start_date,end_date:editForm.end_date,roadmap_color:editForm.roadmap_color,name:editForm.name}).eq('id',editing.id)
    setSaving(false);setEditing(null)
  }

  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const ROW_H=40,PARENT_H=52

  function CfShading(){
    return(
      <>{cols.map((col,ci)=>col.isCodeFreeze&&(
        <div key={`cf-${col.key}`} style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,background:'rgba(192,57,43,0.07)',zIndex:0,borderLeft:'1px dashed rgba(192,57,43,0.3)',borderRight:'1px dashed rgba(192,57,43,0.3)',pointerEvents:'none'}}/>
      ))}</>
    )
  }

  function GanttBar({item,groupColor,isViolation}:{item:any,groupColor:string,isViolation:boolean}){
    const isDragging=draggingBar===item.id
    const itemColor=colorBy==='status'?sc(item.status):(item.roadmap_color||groupColor)
    const leftPx=pct(item.start_date)
    const widthPx=barPx(item.start_date,item.end_date)
    return(
      <div style={{position:'absolute',top:6,height:28,left:leftPx,width:widthPx,zIndex:3,minWidth:8,opacity:isDragging?0.6:1}}>
        <div onMouseDown={e=>startBarDrag(e,item,'left')} style={{position:'absolute',left:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'4px 0 0 4px'}}/>
        <div draggable onDragStart={e=>{e.dataTransfer.setData('itemId',item.id);e.dataTransfer.effectAllowed='move'}}
          onMouseDown={e=>startBarDrag(e,item,'move')}
          onClick={()=>{if(!draggingBar){setEditing(item);setEditForm({name:item.name,start_date:item.start_date,end_date:item.end_date,roadmap_color:item.roadmap_color||groupColor})}}}
          style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:isViolation?'#C0392B':itemColor,borderRadius:5,display:'flex',alignItems:'center',padding:'0 12px',fontSize:10,fontWeight:600,color:'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,cursor:isDragging?'grabbing':'grab',border:isViolation?'1px dashed #ff6b6b':'none',boxShadow:isDragging?'0 4px 12px rgba(0,0,0,0.5)':'none'}}>
          {item.name}
        </div>
        <div onMouseDown={e=>startBarDrag(e,item,'right')} style={{position:'absolute',right:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'0 4px 4px 0'}}/>
      </div>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {/* Controls */}
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',alignItems:'center',background:'#162436',flexWrap:'wrap' as const}}>
        <select value={ft} onChange={e=>setFt(e.target.value)} style={sel}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        <div style={{display:'flex',gap:3}}>
          {(mobileR?[['month','Month'],['quarter','Quarter']]:[['week','Week'],['month','Month'],['quarter','Quarter'],['year','Year']]).map(([k,label])=>(
            <button key={k} onClick={()=>setView(k)} style={{background:view===k?'#C8973A':'#1E3048',color:view===k?'#0D1B2A':'#7A8FA6',border:`1px solid ${view===k?'#C8973A':'#243447'}`,borderRadius:6,padding:'4px 12px',fontSize:12,cursor:'pointer',fontWeight:view===k?700:400}}>{label}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:11,color:'#7A8FA6'}}>Color</span>
          <div style={{display:'flex',gap:3}}>
            {[['project','Project'],['status','Status']].map(([k,label])=>(
              <button key={k} onClick={()=>setColorBy(k)} style={{background:colorBy===k?'#C8973A':'#1E3048',color:colorBy===k?'#0D1B2A':'#7A8FA6',border:`1px solid ${colorBy===k?'#C8973A':'#243447'}`,borderRadius:6,padding:'3px 8px',fontSize:11,cursor:'pointer',fontWeight:colorBy===k?700:400}}>{label}</button>
            ))}
          </div>
        </div>
        {!mobileR&&<div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:11,color:'#7A8FA6'}}>Sort</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...sel,fontSize:11,padding:'4px 8px'}}>
            <option value="start_date">Start Date</option>
            <option value="end_date">End Date</option>
            <option value="name">Name</option>
            <option value="rag">RAG Status</option>
          </select>
          <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} style={{...sel,fontSize:13,padding:'3px 10px'}}>{sortDir==='asc'?'↑':'↓'}</button>
        </div>}
        <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#7A8FA6',cursor:'pointer',whiteSpace:'nowrap' as const}} title="Remove Complete/Cancelled projects from the board">
          <input type="checkbox" checked={hideDone} onChange={e=>setHideDone(e.target.checked)} style={{accentColor:'#C8973A'}}/>Hide completed
        </label>
        {!mobileR&&<div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:12,color:'#7A8FA6'}}>Zoom</span>
          <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={e=>setZoom(parseFloat(e.target.value))} style={{width:90,accentColor:'#C8973A'}}/>
          <button onClick={()=>setZoom(1)} style={{...sel,fontSize:11,padding:'3px 8px'}}>Fit</button>
        </div>}
        {!mobileR&&<div style={{display:'flex',gap:6}}>
          <button onClick={expandAll} style={{...sel,fontSize:11,padding:'3px 10px'}}>Expand All</button>
          <button onClick={collapseAll} style={{...sel,fontSize:11,padding:'3px 10px'}}>Collapse All</button>
        </div>}
        {!mobileR&&<button onClick={()=>setShowSettings(true)} style={{...sel,fontSize:11,padding:'4px 10px',color:'#E74C3C',border:'1px solid #E74C3C'}}>🔒 Code Freeze</button>}
        {totalViolations>0&&<div style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'4px 10px',fontSize:11,color:'#E74C3C'}}>⚠️ {totalViolations} violation{totalViolations!==1?'s':''}</div>}
        {!mobileR&&<div style={{display:'flex',gap:10,fontSize:11,marginLeft:'auto',color:'#7A8FA6',alignItems:'center'}}>
          <span style={{whiteSpace:'nowrap' as const}}>{groups.length} projects · {withDates.length} committed · {uncommitted.length} backlog</span>
          <span style={{display:'flex',gap:8,flexWrap:'wrap' as const,alignItems:'center',justifyContent:'flex-end',opacity:0.85}}>
            {[...new Set(withDates.map(i=>i.status).filter(Boolean))].map((st:any)=>(
              <span key={st} style={{fontSize:9,color:sc(st),fontWeight:700,whiteSpace:'nowrap' as const}}>● {st}</span>
            ))}
          </span>
          <span style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:2,height:10,background:'#E74C3C',display:'inline-block'}}/> Today</span>
        </div>}
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Discussion panel */}
        <div style={{borderRight:'1px solid #243447',background:'#162436',flexShrink:0,display:'flex',flexDirection:'column',transition:'width 0.2s',width:discussionOpen?(discussNoteId?300:200):32,minWidth:32,overflow:'hidden'}}>
          <button onClick={()=>setDiscussionOpen(o=>!o)} style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 8px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,whiteSpace:'nowrap' as const,width:'100%',flexShrink:0}}>
            <span style={{fontSize:12}}>{discussionOpen?'◀':'▶'}</span>
            {discussionOpen&&<span>🚩 DISCUSSION ({flaggedItems.length})</span>}
          </button>
          {discussionOpen&&(
            <div style={{overflowY:'auto',flex:1,padding:10}}>
              {flaggedItems.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',padding:4}}>No flagged items</div>}
              {flaggedItems.map(item=>{
                const noteOpen=discussNoteId===item.id
                return(
                <div key={item.id}
                  onClick={()=>{if(!noteOpen){setDiscussNoteId(item.id);setDiscussNoteDraft(item.notes||'')}}}
                  style={{background:'#1E3048',border:noteOpen?'1px solid #C8973A':'1px solid rgba(200,151,58,0.3)',borderRadius:6,padding:'6px 8px',marginBottom:6,cursor:noteOpen?'default':'pointer'}}>
                  <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                  <div style={{fontSize:11,color:'#F4F6F8',marginTop:2,lineHeight:1.3}}>{rt(item.request_type)} {item.name}</div>
                  <div style={{marginTop:4,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 6px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                    {item.notes&&!noteOpen&&<span title="Has notes" style={{fontSize:10}}>📝</span>}
                  </div>
                  {item.notes&&!noteOpen&&(
                    <div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic',marginTop:4,lineHeight:1.35,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical' as const}}>{item.notes}</div>
                  )}
                  {noteOpen&&(
                    <div style={{marginTop:6}} onClick={e=>e.stopPropagation()}>
                      <textarea value={discussNoteDraft} onChange={e=>setDiscussNoteDraft(e.target.value)} rows={5} autoFocus placeholder="Discussion notes..."
                        style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:6,resize:'vertical' as const,fontFamily:'inherit',lineHeight:1.4}}/>
                      <div style={{display:'flex',gap:6,marginTop:4,justifyContent:'flex-end'}}>
                        <button onClick={()=>setDiscussNoteId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:10,padding:'3px 8px',cursor:'pointer'}}>Cancel</button>
                        <button onClick={()=>saveDiscussNote(item)} style={{background:'#C8973A',border:'none',borderRadius:4,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'3px 10px',cursor:'pointer'}}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Gantt — frozen label + scrollable bars */}
        <div style={{flex:1,display:'flex',overflow:'hidden',position:'relative',userSelect:draggingBar?'none':'auto' as const}}>

          {/* Frozen label column */}
          <div style={{width:220,flexShrink:0,overflowY:'hidden',borderRight:'1px solid #243447',zIndex:6,background:'#0D1B2A',boxShadow:'4px 0 12px rgba(0,0,0,0.6)',display:'flex',flexDirection:'column'}}>
            <div style={{height:36,flexShrink:0,background:'#162436',borderBottom:'1px solid #243447',padding:'0 12px',fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,display:'flex',alignItems:'center'}}>
              PROJECT / ITEM
            </div>
            <div ref={labelRef} style={{flex:1,overflowY:'hidden'}}>
              {groups.map((group:any)=>{
                const isCollapsed=getCollapsed()[group.id]
                const childItems=[...group.items].sort((a,b)=>(!a.start_date?1:!b.start_date?-1:new Date(a.start_date+'T12:00:00').getTime()-new Date(b.start_date+'T12:00:00').getTime()))
                const rc=ragColor(group.rag)
                const rb=ragBg(group.rag)
                const rbd=ragBorder(group.rag)
                return(
                  <div key={group.id}>
                    <div style={{height:PARENT_H,background:PROJECT_TERMINAL.includes(group.status)?'rgba(122,143,166,0.05)':rb,borderBottom:'1px solid #243447',borderTop:`2px solid ${PROJECT_TERMINAL.includes(group.status)?'#3A4A5E':rbd}`,display:'flex',alignItems:'center',padding:'0 8px',gap:6,opacity:PROJECT_TERMINAL.includes(group.status)?0.6:1}}>
                      <button onClick={()=>toggleCollapse(group.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#C8973A',fontSize:14,padding:'2px 4px',lineHeight:1,flexShrink:0}}>
                        {isCollapsed?'▶':'▼'}
                      </button>
                      <div style={{overflow:'hidden',flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
                          <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:110}}>{group.name}{group.ongoing?' ∞':''}</span>
                          <span style={{fontSize:10,color:rc,fontWeight:700,flexShrink:0}}>{group.rag==='Green'?'🟢':group.rag==='Amber'?'🟡':group.rag==='Red'?'🔴':'⚪'}</span>
                          {group.violations.length>0&&<span style={{fontSize:9,color:'#E74C3C',flexShrink:0}}>⚠️</span>}
                        </div>
                        <div style={{fontSize:9,color:'#7A8FA6'}}>{childItems.length} committed · {group.status}</div>
                      </div>
                    </div>
                    {!isCollapsed&&childItems.map((item,idx)=>{
                      const isViolation=!!group.violations.find((v:any)=>v.id===item.id)
                      return(
                        <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:isViolation?'rgba(192,57,43,0.05)':idx%2===0?'#0D1B2A':'#111D2C',display:'flex',alignItems:'center',padding:'0 8px 0 28px',gap:6}}>
                          <div style={{width:1,height:20,background:'#243447',flexShrink:0}}/>
                          <span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700,flexShrink:0}}>{item.priority}</span>
                          <div style={{overflow:'hidden'}}>
                            <div style={{fontSize:11,color:isViolation?'#E74C3C':'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:130}}>{rt(item.request_type)} {item.name}{isViolation?' ⚠️':''}</div>
                            <div style={{fontSize:9,color:'#7A8FA6',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}><span style={{fontFamily:'monospace'}}>{item.item_id}</span> <span style={{color:sc(item.status),fontWeight:700}}>● {item.status}</span></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {orphans.length>0&&(
                <div>
                  <div style={{height:PARENT_H,background:'rgba(122,143,166,0.08)',borderBottom:'1px solid #243447',borderTop:'2px solid #243447',display:'flex',alignItems:'center',padding:'0 8px',gap:8}}>
                    <button onClick={()=>toggleCollapse('__orphans')} style={{background:'none',border:'none',cursor:'pointer',color:'#7A8FA6',fontSize:14,padding:'2px 4px',lineHeight:1,flexShrink:0}}>
                      {getCollapsed()['__orphans']?'▶':'▼'}
                    </button>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:'#7A8FA6'}}>No Project Assigned</div>
                      <div style={{fontSize:10,color:'#7A8FA6'}}>{orphans.length} items</div>
                    </div>
                  </div>
                  {!getCollapsed()['__orphans']&&orphans.map((item,idx)=>(
                    <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:idx%2===0?'#0D1B2A':'#111D2C',display:'flex',alignItems:'center',padding:'0 8px 0 28px',gap:6}}>
                      <span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                      <div style={{overflow:'hidden'}}>
                        <div style={{fontSize:11,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:140}}>{rt(item.request_type)} {item.name}</div>
                        <div style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{height:28,borderTop:'1px solid #243447',background:'#162436'}}/>
            </div>
          </div>

          {/* Scrollable bar area */}
          <div ref={ganttRef}
            style={{flex:1,overflowX:'auto',overflowY:'auto',position:'relative'}}
            onScroll={e=>{if(labelRef.current)(labelRef.current as any).scrollTop=e.currentTarget.scrollTop}}
            onDragOver={e=>{e.preventDefault();setDraggingProjectOver(true)}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDraggingProjectOver(false)}}
            onDrop={async e=>{
              e.preventDefault();setDraggingProjectOver(false)
              const draggedProjectId=e.dataTransfer.getData('projectId')
              if(!draggedProjectId) return
              const gantt=ganttRef.current as any
              const rect=gantt.getBoundingClientRect()
              const x=e.clientX-rect.left+gantt.scrollLeft
              const colIdx=Math.max(0,Math.min(cols.length-1,Math.floor(x/COL_W)))
              const col=cols[colIdx]
              const updates={start_date:dateToStr(col.start),end_date:dateToStr(col.end)}
              setProjects((prev:any[])=>prev.map(p=>p.id===draggedProjectId?{...p,...updates}:p))
              await supabase.from('projects').update(updates).eq('id',draggedProjectId)
            }}>
            {draggingProjectOver&&(
              <div style={{position:'absolute',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(46,134,171,0.08)',border:'3px dashed #2E86AB',borderRadius:8,pointerEvents:'none'}}>
                <div style={{background:'#162436',border:'2px solid #2E86AB',borderRadius:12,padding:'16px 32px',fontSize:14,fontWeight:700,color:'#2E86AB',textAlign:'center' as const}}>
                  <div style={{fontSize:24,marginBottom:8}}>◈</div>Drop to place on roadmap
                </div>
              </div>
            )}
            <div style={{minWidth:TOTAL_W,position:'relative'}}>

              {/* Header */}
              <div style={{display:'flex',position:'sticky',top:0,zIndex:10,background:'#162436',borderBottom:'1px solid #243447',height:36}}>
                {cols.map(col=>(
                  <div key={col.key} style={{width:COL_W,flexShrink:0,borderRight:'1px solid #243447',padding:'6px 4px',fontSize:10,fontWeight:700,color:col.isCodeFreeze?'#E74C3C':'#C8973A',textAlign:'center' as const,overflow:'hidden',whiteSpace:'nowrap' as const,background:col.isCodeFreeze?'rgba(192,57,43,0.12)':'transparent',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                    {col.label}
                    {col.isCodeFreeze&&<div style={{fontSize:8,color:'#E74C3C',marginTop:1}}>CODE FREEZE</div>}
                  </div>
                ))}
              </div>

              {/* Project groups */}
              {groups.map((group:any)=>{
                const isCollapsed=getCollapsed()[group.id]
                const childItems=[...group.items].sort((a,b)=>(!a.start_date?1:!b.start_date?-1:new Date(a.start_date+'T12:00:00').getTime()-new Date(b.start_date+'T12:00:00').getTime()))
                const rc=ragColor(group.rag)
                const rb=ragBg(group.rag)
                const rbd=ragBorder(group.rag)
                return(
                  <div key={group.id} data-project-id={group.id} data-project-name={group.name}>
                    {/* Parent bar row */}
                    <div style={{height:PARENT_H,background:rb,borderBottom:'1px solid #243447',borderTop:`2px solid ${rbd}`,position:'relative'}}>
                      <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.5,zIndex:4,pointerEvents:'none'}}/>
                      <CfShading/>
                      {cols.map((col,ci)=>(
                        <div key={col.key}
                          style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,zIndex:2,background:dragOverProject===group.name&&dragOverCol===col.key?'rgba(200,151,58,0.2)':'transparent'}}
                          onDragOver={e=>handleGanttDragOver(e,group.name,col)}
                          onDragLeave={handleGanttDragLeave}
                          onDrop={e=>handleGanttDrop(e,group.name,col)}/>
                      ))}
                      {group.bar_start&&group.bar_end&&(
                        <div style={{position:'absolute',top:10,height:32,left:pct(group.bar_start),width:group.ongoing?Math.max(cols.length*COL_W-pct(group.bar_start),8):barPx(group.bar_start,group.bar_end),zIndex:3,minWidth:8}}>
                          <div onMouseDown={e=>startProjectBarDrag(e,group,'left')} style={{position:'absolute',left:0,top:0,bottom:0,width:10,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'4px 0 0 4px'}}/>
                          <div draggable onDragStart={e=>{e.dataTransfer.setData('projectId',group.id);e.dataTransfer.effectAllowed='move'}}
                            onMouseDown={e=>startProjectBarDrag(e,group,'move')}
                            style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:PROJECT_TERMINAL.includes(group.status)?'repeating-linear-gradient(45deg,#2E3D4E,#2E3D4E 8px,#26333F 8px,#26333F 16px)':group.ongoing?`linear-gradient(90deg, ${rc} 0%, ${rc} 55%, ${rc}33 100%)`:rc,borderRadius:6,display:'flex',alignItems:'center',padding:'0 14px',fontSize:11,fontWeight:700,color:PROJECT_TERMINAL.includes(group.status)?'#8FA3B8':'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,opacity:draggingBar===group.id?0.7:PROJECT_TERMINAL.includes(group.status)?0.75:0.9,border:PROJECT_TERMINAL.includes(group.status)?'1px solid #3A4A5E':group.ongoing?'1px dashed rgba(255,255,255,0.45)':group.violations.length>0?'2px dashed rgba(255,255,255,0.5)':'none',boxShadow:PROJECT_TERMINAL.includes(group.status)?'none':`0 2px 8px ${rc}55`,cursor:draggingBar===group.id?'grabbing':'grab'}}>
                            {PROJECT_TERMINAL.includes(group.status)?(group.status==='Cancelled'?'✕':'✓'):group.rag==='Red'?'🔴':group.rag==='Amber'?'🟡':group.rag==='Green'?'🟢':'⚪'} {group.name}{group.ongoing?' ∞':''}{PROJECT_TERMINAL.includes(group.status)?` — ${group.status}`:''}
                            {!PROJECT_TERMINAL.includes(group.status)&&group.violations.length>0&&<span style={{marginLeft:6,fontSize:10}}>⚠️</span>}
                          </div>
                          <div onMouseDown={e=>startProjectBarDrag(e,group,'right')} style={{position:'absolute',right:0,top:0,bottom:0,width:10,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'0 4px 4px 0'}}/>
                        </div>
                      )}
                      {milestones.filter(m=>m.project_id===group.id&&m.date).map(m=>{
                        const mPx=pct(m.date)
                        const isPast=new Date(m.date+'T12:00:00')<today
                        return(
                          <div key={m.id} title={`${m.name} — ${fmtD(m.date)}${m.notes?' · '+m.notes:''}`}
                            style={{position:'absolute',top:4,left:mPx,transform:'translateX(-50%)',zIndex:6,pointerEvents:'none'}}>
                            <div style={{width:12,height:12,background:m.completed?'#27AE60':isPast&&!m.completed?'#E74C3C':m.color||'#C8973A',transform:'rotate(45deg)',border:'2px solid #0D1B2A',opacity:isPast&&!m.completed?0.6:1}}/>
                            <div style={{position:'absolute',top:16,left:'50%',transform:'translateX(-50%)',background:'#0D1B2A',border:`1px solid ${m.color||'#C8973A'}`,borderRadius:3,padding:'1px 5px',fontSize:8,color:m.completed?'#27AE60':m.color||'#C8973A',whiteSpace:'nowrap' as const,fontWeight:700,maxWidth:80,overflow:'hidden',textOverflow:'ellipsis'}}>
                              {m.completed?'✓ ':''}{m.name}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Child rows */}
                    {!isCollapsed&&childItems.map((item,idx)=>{
                      const isViolation=!!group.violations.find((v:any)=>v.id===item.id)
                      return(
                        <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:isViolation?'rgba(192,57,43,0.05)':idx%2===0?'#0D1B2A':'#111D2C',position:'relative'}}>
                          <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4,pointerEvents:'none'}}/>
                          <CfShading/>
                          {cols.map((col,ci)=>(
                            <div key={col.key}
                              style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,borderRight:'1px solid rgba(36,52,71,0.4)',background:dragOverProject===group.name&&dragOverCol===col.key?'rgba(200,151,58,0.1)':'transparent'}}
                              onDragOver={e=>handleGanttDragOver(e,group.name,col)}
                              onDragLeave={handleGanttDragLeave}
                              onDrop={e=>handleGanttDrop(e,group.name,col)}/>
                          ))}
                          <GanttBar item={item} groupColor={ragColor(group.rag)} isViolation={isViolation}/>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Orphans */}
              {orphans.length>0&&(
                <div>
                  <div style={{height:PARENT_H,background:'rgba(122,143,166,0.08)',borderBottom:'1px solid #243447',borderTop:'2px solid #243447',position:'relative'}}>
                    <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4,pointerEvents:'none'}}/>
                    {cols.map((col,ci)=>(
                      <div key={col.key}
                        style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,background:dragOverProject===''&&dragOverCol===col.key?'rgba(200,151,58,0.15)':'transparent'}}
                        onDragOver={e=>handleGanttDragOver(e,'',col)}
                        onDragLeave={handleGanttDragLeave}
                        onDrop={e=>handleGanttDrop(e,'',col)}/>
                    ))}
                  </div>
                  {!getCollapsed()['__orphans']&&orphans.map((item,idx)=>(
                    <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:idx%2===0?'#0D1B2A':'#111D2C',position:'relative'}}>
                      <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4,pointerEvents:'none'}}/>
                      <CfShading/>
                      {cols.map((col,ci)=>(
                        <div key={col.key}
                          style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,borderRight:'1px solid rgba(36,52,71,0.4)',background:dragOverProject===''&&dragOverCol===col.key?'rgba(200,151,58,0.1)':'transparent'}}
                          onDragOver={e=>handleGanttDragOver(e,'',col)}
                          onDragLeave={handleGanttDragLeave}
                          onDrop={e=>handleGanttDrop(e,'',col)}/>
                      ))}
                      <GanttBar item={item} groupColor='#7A8FA6' isViolation={false}/>
                    </div>
                  ))}
                </div>
              )}

              {/* Today footer */}
              <div style={{height:28,borderTop:'1px solid #243447',background:'#162436',position:'relative'}}>
                <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.6}}/>
                <div style={{position:'absolute',top:4,left:todayPx()+6,fontSize:10,color:'#E74C3C',fontWeight:700,whiteSpace:'nowrap' as const}}>Today — {today.toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Planning Panel */}
        <div
          data-backlog-panel="true"
          style={{borderLeft:'1px solid #243447',background:backlogHover?'rgba(200,151,58,0.05)':'#162436',flexShrink:0,display:'flex',flexDirection:'column',transition:'width 0.2s, background 0.2s',width:backlogOpen?280:32,minWidth:32,overflow:'hidden',outline:backlogHover?'2px dashed #C8973A':'none'}}
          onDragOver={e=>{e.preventDefault();setBacklogHover(true)}}
          onDragLeave={()=>setBacklogHover(false)}
          onDrop={async e=>{
            e.preventDefault();setBacklogHover(false)
            const itemId=e.dataTransfer.getData('itemId')
            if(itemId){setItems((prev:any[])=>prev.map(i=>i.id===itemId?{...i,start_date:null,end_date:null}:i));await supabase.from('items').update({start_date:null,end_date:null}).eq('id',itemId);return}
            const projectId=e.dataTransfer.getData('projectId')
            if(projectId){setProjects((prev:any[])=>prev.map(p=>p.id===projectId?{...p,start_date:null,end_date:null}:p));await supabase.from('projects').update({start_date:null,end_date:null}).eq('id',projectId)}
          }}>
          <button onClick={()=>setBacklogOpen(o=>!o)} style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 8px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,whiteSpace:'nowrap' as const,width:'100%',flexShrink:0}}>
            <span style={{fontSize:12}}>{backlogOpen?'▶':'◀'}</span>
            {backlogOpen&&<span>PLANNING PANEL</span>}
          </button>
          {backlogOpen&&(
            <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
              {backlogHover&&<div style={{background:'rgba(200,151,58,0.15)',border:'2px dashed #C8973A',borderRadius:8,padding:'10px 8px',textAlign:'center' as const,margin:8,fontSize:11,color:'#C8973A',fontWeight:700}}>Drop here to remove from roadmap</div>}
              {/* Projects */}
              <div style={{borderBottom:'1px solid #243447',flexShrink:0}}>
                <button onClick={()=>setProjectsPanelOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',padding:'10px 12px',display:'flex',alignItems:'center',gap:6,color:'#2E86AB',fontSize:11,fontWeight:700,letterSpacing:1,width:'100%',whiteSpace:'nowrap' as const}}>
                  <span style={{fontSize:10}}>{projectsPanelOpen?'▼':'▶'}</span>
                  <span>◈ PROJECTS ({filteredProjects.filter(p=>!p.start_date||!p.end_date).length})</span>
                  <span style={{marginLeft:'auto',fontSize:9,color:'#7A8FA6',fontWeight:400}}>drag to set dates</span>
                </button>
                {projectsPanelOpen&&(
                  <div style={{padding:'0 8px 10px'}}>
                    {filteredProjects.filter(p=>!p.start_date||!p.end_date).map(project=>{
                      const rc=ragColor(project.rag)
                      const pclr=pc(project.priority)
                      const childCount=withDates.filter(i=>i.parent_project===project.name).length
                      const totalCount=items.filter(i=>i.parent_project===project.name).length
                      return(
                        <div key={project.id} draggable
                          onDragStart={e=>{e.dataTransfer.setData('projectId',project.id);e.dataTransfer.setData('projectName',project.name);e.dataTransfer.effectAllowed='copy'}}
                          style={{background:'#1E3048',borderTop:'1px solid #243447',borderRight:'1px solid #243447',borderBottom:'1px solid #243447',borderLeft:`3px solid ${rc}`,borderRadius:6,padding:'8px 10px',marginBottom:6,cursor:'grab',userSelect:'none' as const,transition:'border-color 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor='#2E86AB')}
                          onMouseLeave={e=>{e.currentTarget.style.borderTopColor='#243447';e.currentTarget.style.borderRightColor='#243447';e.currentTarget.style.borderBottomColor='#243447'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                            <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{project.priority}</span>
                            <span style={{fontSize:10,color:rc,fontWeight:700}}>{project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':project.rag==='Red'?'🔴':'⚪'}</span>
                            <span style={{fontSize:9,color:'#7A8FA6',marginLeft:'auto'}}>{project.team==='Consumer Experience'?'CE':'OE'}</span>
                          </div>
                          <div style={{fontSize:11,color:'#F4F6F8',fontWeight:600,lineHeight:1.3,marginBottom:3}}>{project.name}</div>
                          <div style={{display:'flex',gap:8,fontSize:9,color:'#7A8FA6'}}>
                            <span>{childCount} committed · {totalCount-childCount} backlog</span>
                            {project.start_date&&project.end_date?<span style={{color:'#27AE60',marginLeft:'auto'}}>✓ dated</span>:<span style={{color:'#D4820A',marginLeft:'auto'}}>no dates</span>}
                          </div>
                        </div>
                      )
                    })}
                    {filteredProjects.filter(p=>!p.start_date||!p.end_date).length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',padding:'8px 4px'}}>All projects dated ✓</div>}
                  </div>
                )}
              </div>
              {/* Backlog */}
              <div style={{flexShrink:0}}>
                <button onClick={()=>setBacklogSectionOpen(o=>!o)} style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 12px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,width:'100%',whiteSpace:'nowrap' as const}}>
                  <span style={{fontSize:10}}>{backlogSectionOpen?'▼':'▶'}</span>
                  <span>📋 BACKLOG ({uncommitted.length})</span>
                  <span style={{marginLeft:'auto',fontSize:9,color:'#7A8FA6',fontWeight:400}}>drag to commit</span>
                </button>
                {backlogSectionOpen&&(
                  <div style={{padding:'8px 8px 10px'}}>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:8,lineHeight:1.5}}>Drag onto a project row · Drag roadmap bars here to remove</div>
                    {uncommitted.length===0&&!backlogHover&&<div style={{textAlign:'center' as const,padding:16,color:'#7A8FA6',fontSize:11}}><div style={{fontSize:18,marginBottom:6}}>🎯</div>All items committed!</div>}
                    {uncommitted.map(item=>{
                      const pclr=pc(item.priority)
                      const r=rice(item)
                      return(
                        <div key={item.id} draggable
                          onDragStart={e=>{e.dataTransfer.setData('itemId',item.id);e.dataTransfer.effectAllowed='copy'}}
                          onClick={()=>setDetailItem(item)}
                          style={{background:'#1E3048',borderTop:'1px solid #243447',borderRight:'1px solid #243447',borderBottom:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:6,cursor:'grab',userSelect:'none' as const,transition:'border-color 0.15s'}}
                          onMouseEnter={e=>{e.currentTarget.style.borderTopColor='#C8973A';e.currentTarget.style.borderRightColor='#C8973A';e.currentTarget.style.borderBottomColor='#C8973A'}}
                          onMouseLeave={e=>{e.currentTarget.style.borderTopColor='#243447';e.currentTarget.style.borderRightColor='#243447';e.currentTarget.style.borderBottomColor='#243447'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                            <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                            <span style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                            {item.effort&&<span style={{fontSize:9,color:'#7A8FA6',marginLeft:'auto'}}>{item.effort}</span>}
                          </div>
                          <div style={{fontSize:11,color:'#F4F6F8',lineHeight:1.3,marginBottom:3}}>{rt(item.request_type)} {item.name}</div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexWrap:'wrap' as const}}>
                            {item.status&&<span style={{fontSize:9,fontWeight:700,color:sc(item.status)}}>{item.status}</span>}
                            {item.vendor_delivery_date&&<span style={{fontSize:9,color:'#7A8FA6'}}>🚚 {item.vendor_delivery_date}</span>}
                          </div>
                          <div style={{display:'flex',gap:8,fontSize:9,color:'#7A8FA6'}}>
                            {item.wsjf&&<span>WSJF: <span style={{color:'#E8B95A',fontWeight:700}}>{parseFloat(item.wsjf).toFixed(1)}</span></span>}
                            {r&&<span>RICE: <span style={{color:'#27AE60',fontWeight:700}}>{r}</span></span>}
                            {item.swimlane&&<span style={{marginLeft:'auto'}}>{item.swimlane}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag tooltip */}
      {dragTooltip&&(
        <div style={{position:'fixed',left:dragTooltip.x+16,top:dragTooltip.y-44,background:'#0D1B2A',border:'1px solid #C8973A',borderRadius:8,padding:'6px 12px',fontSize:12,color:'#F4F6F8',zIndex:2000,pointerEvents:'none',whiteSpace:'nowrap' as const,boxShadow:'0 4px 16px rgba(0,0,0,0.6)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#C8973A',fontWeight:700}}>{fmtD(dragTooltip.start)}</span>
            <span style={{color:'#7A8FA6'}}>→</span>
            <span style={{color:'#C8973A',fontWeight:700}}>{fmtD(dragTooltip.end)}</span>
            <span style={{color:'#7A8FA6',fontSize:10,marginLeft:4}}>{Math.round((new Date(dragTooltip.end+'T12:00:00').getTime()-new Date(dragTooltip.start+'T12:00:00').getTime())/(1000*60*60*24))}d</span>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:460}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>Edit Item</div>
            <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace',marginBottom:20}}>{editing.item_id} · {editing.parent_project||'No project'}</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Name</div>
              <input value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Start Date</div>
                <input type="date" value={editForm.start_date} onChange={e=>setEditForm(p=>({...p,start_date:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>End Date</div>
                <input type="date" value={editForm.end_date} onChange={e=>setEditForm(p=>({...p,end_date:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Assign to Project</div>
              <select value={editing.parent_project||''} onChange={async e=>{
                const v=e.target.value
                setEditing({...editing,parent_project:v})
                setItems(items.map(i=>i.id===editing.id?{...i,parent_project:v}:i))
                await supabase.from('items').update({parent_project:v}).eq('id',editing.id)
              }} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 8px',fontSize:12}}>
                <option value="">— No project —</option>
                {projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8}}>Bar Color</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                {COLORS.map(c=><div key={c} onClick={()=>setEditForm(p=>({...p,roadmap_color:c}))} style={{width:28,height:28,borderRadius:6,background:c,cursor:'pointer',border:editForm.roadmap_color===c?'3px solid #F4F6F8':'3px solid transparent'}}/>)}
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'space-between'}}>
              <button onClick={async()=>{
                if(confirm('Remove from roadmap?')){
                  setItems(items.map(i=>i.id===editing.id?{...i,start_date:null,end_date:null}:i))
                  await supabase.from('items').update({start_date:null,end_date:null}).eq('id',editing.id)
                  setEditing(null)
                }
              }} style={{...sel,color:'#E74C3C',border:'1px solid #E74C3C',fontSize:11}}>Remove from Roadmap</button>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setEditing(null)} style={sel}>Cancel</button>
                <button onClick={saveEdit} disabled={saving} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.7:1}}>{saving?'Saving...':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Code freeze settings */}
      {showSettings&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:420}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>🔒 Code Freeze Window</div>
            <div style={{fontSize:12,color:'#7A8FA6',marginBottom:20}}>All views will highlight this date range in red.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Start Date</div>
                <input type="date" value={codeFreezeStart} onChange={e=>setCodeFreezeStart(e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>End Date</div>
                <input type="date" value={codeFreezeEnd} onChange={e=>setCodeFreezeEnd(e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
            </div>
            <div style={{background:'#1E3048',borderRadius:8,padding:12,marginBottom:16,fontSize:12,color:'#7A8FA6'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span>Current window</span>
                <span style={{color:'#E74C3C',fontWeight:700}}>{fmtD(codeFreezeStart)} → {fmtD(codeFreezeEnd)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>Duration</span>
                <span style={{color:'#F4F6F8',fontWeight:700}}>{Math.round((new Date(codeFreezeEnd+'T12:00:00').getTime()-new Date(codeFreezeStart+'T12:00:00').getTime())/(1000*60*60*24))} days</span>
              </div>
            </div>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8}}>Quick set</div>
            <div style={{display:'flex',gap:8,marginBottom:20}}>
              {[['Q3 FY27 (Oct-Dec 26)','2026-10-01','2026-12-31'],['Q3 FY28 (Oct-Dec 27)','2027-10-01','2027-12-31']].map(([label,s,e])=>(
                <button key={label} onClick={()=>{setCodeFreezeStart(s);setCodeFreezeEnd(e)}} style={{flex:1,background:'#1E3048',color:'#7A8FA6',border:'1px solid #243447',borderRadius:6,padding:'6px 8px',fontSize:11,cursor:'pointer'}}>{label}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowSettings(false)} style={sel}>Cancel</button>
              <button onClick={()=>setShowSettings(false)} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>Done</button>
            </div>
          </div>
        </div>
      )}
      {/* Backlog item detail modal */}
      {detailItem&&(
        <div onClick={()=>setDetailItem(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#162436',border:'1px solid #243447',borderRadius:12,width:520,maxWidth:'92vw',maxHeight:'85vh',overflowY:'auto',padding:20}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{background:pc(detailItem.priority).bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{detailItem.priority}</span>
              <span style={{fontSize:12,color:'#7A8FA6',fontFamily:'monospace'}}>{detailItem.item_id}</span>
              {detailItem.status&&<span style={{fontSize:11,fontWeight:700,color:sc(detailItem.status)}}>{detailItem.status}</span>}
              {detailItem.committed_priority!=null&&<span style={{fontSize:11,color:'#C8973A',fontWeight:700}}>Rank {detailItem.committed_priority}</span>}
              <button onClick={()=>setDetailItem(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
            </div>
            <div style={{display:'flex',flexWrap:'wrap' as const,gap:6,margin:'8px 0 14px'}}>
              {[['Swimlane',detailItem.swimlane],['Team',detailItem.team],['Effort',detailItem.effort],['Type',detailItem.request_type],['Region',detailItem.region],['Vendor',detailItem.vendor],['Project',detailItem.parent_project],['WSJF',detailItem.wsjf?parseFloat(detailItem.wsjf).toFixed(1):null],['RICE',rice(detailItem)]].filter(([,v])=>v).map(([k,v])=>(
                <span key={k as string} style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,padding:'3px 8px',fontSize:10,color:'#7A8FA6'}}>{k}: <span style={{color:'#F4F6F8',fontWeight:600}}>{v}</span></span>
              ))}
            </div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
              <PanelField selected={detailItem} upd={updItem} label="Item Name" field="name"/>
              <PanelField selected={detailItem} upd={updItem} label="Description" field="description" type="textarea"/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <PanelField selected={detailItem} upd={updItem} label="Owner" field="owner"/>
                <PanelField selected={detailItem} upd={updItem} label="Vendor Delivery Date" field="vendor_delivery_date" type="date"/>
                <PanelField selected={detailItem} upd={updItem} label="Start Date" field="start_date" type="date"/>
                <PanelField selected={detailItem} upd={updItem} label="End Date" field="end_date" type="date"/>
              </div>
              <PanelField selected={detailItem} upd={updItem} label="Dependency" field="dependency"/>
              <PanelField selected={detailItem} upd={updItem} label="Notes" field="notes" type="textarea"/>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// ── STAKEHOLDER ───────────────────────────────────────────────────────────
// ── TEAMS ─────────────────────────────────────────────────────────────────
// Read-only per-team work queue. All editing happens in Backlog/Projects/Roadmap.
function Teams({items,projects,milestones,ccrs,ccrItems}:{items:any[],projects:any[],milestones:any[],ccrs:any[],ccrItems:any[]}) {
  const [extractHtml,setExtractHtml]=useState<string|null>(null)
  const [copiedX,setCopiedX]=useState(false)
  const [newDays,setNewDays]=useState(7)
  const teams=[...new Set(items.map(i=>i.team).filter(Boolean))].sort() as string[]
  const [team,setTeam]=useState(teams[0]||'')
  const [showDone,setShowDone]=useState(false)
  const [expandedId,setExpandedId]=useState(null)
  const RAG={Green:'#27AE60',Amber:'#E8B95A',Red:'#E74C3C'}

  const isDone=(s:string)=>/done|complete|closed|deployed|cancel/i.test(s||'')
  const teamItems=items.filter(i=>i.team===team&&(showDone||!isDone(i.status)))

  // Ranked order — P1/P2 pinned, then committed rank (same rule as everywhere)
  const ranked=[...teamItems].sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    if(pa<=1&&pb>1) return -1
    if(pa>1&&pb<=1) return 1
    if(pa<=1&&pb<=1) return pa-pb
    const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
    return am-bm
  })
  // Team-relative queue numbers (1 = this team's next most important item)
  const queueNo=new Map(ranked.map((i,idx)=>[i.id,idx+1]))

  // Group by parent project, ordered like the Projects tab; unassigned last
  const projOrder=new Map(projects.map((p,idx)=>[p.name,p.sort_order??idx]))
  const groupsMap=new Map()
  ranked.forEach(i=>{
    const k=i.parent_project||'__none__'
    if(!groupsMap.has(k)) groupsMap.set(k,[])
    groupsMap.get(k).push(i)
  })
  const groups=[...groupsMap.entries()].sort((a:any,b:any)=>{
    if(a[0]==='__none__') return 1
    if(b[0]==='__none__') return -1
    return (projOrder.get(a[0])??999)-(projOrder.get(b[0])??999)
  })

  // ── Milestone timeline (driven by this team's projects) ──
  const teamProjNames=groups.map(([n]:any)=>n).filter((n:string)=>n!=='__none__')
  const teamProjects=teamProjNames.map(n=>projects.find(p=>p.name===n)).filter(Boolean)
  const tlRows=teamProjects.map((p:any)=>({project:p,ms:milestones.filter(m=>m.project_id===p.id).sort((a,b)=>a.date<b.date?-1:1)})).filter(r=>r.ms.length>0)
  const now=new Date();now.setHours(12,0,0,0)
  const allDates=tlRows.flatMap(r=>r.ms.map((m:any)=>+new Date(m.date+'T12:00:00'))).concat(+now)
  const tlMin=Math.min(...allDates)-14*86400000
  const tlMax=Math.max(...allDates)+14*86400000
  const tlPct=(t:number)=>((t-tlMin)/(tlMax-tlMin))*100
  const monthTicks:{pct:number,label:string}[]=[]
  {const d=new Date(tlMin);d.setDate(1);d.setMonth(d.getMonth()+1)
   while(+d<tlMax){monthTicks.push({pct:tlPct(+d),label:d.toLocaleDateString('default',{month:'short'})});d.setMonth(d.getMonth()+1)}}
  const msClr=(m:any)=>m.completed?'#27AE60':(+new Date(m.date+'T12:00:00')<+now?'#E74C3C':'#C8973A')

  function generateExtract(){
    const hs=(t:string)=>(t||'').replace(/ /g,'&nbsp;')
    const fmtD=(str:string)=>str?new Date(str+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric'}):''
    const today=new Date().toLocaleDateString('default',{month:'long',day:'numeric',year:'numeric'})
    const TD_='padding:3px 7px;border:1px solid #D9D9D9;font-size:13px;color:#222222;vertical-align:top;'
    const TH_='padding:3px 7px;border:1px solid #D9D9D9;font-size:13px;color:#222222;background:#F2F2F2;font-weight:bold;text-align:left;'
    const H2='font-size:18px;font-weight:bold;color:#1F1F1F;margin:24px 0 8px;border-bottom:3px solid #1F1F1F;padding-bottom:4px;'
    const PCLRT:any={P1:'#C0392B',P2:'#C55A11',P3:'#2E5E8C',P4:'#595959'}
    const priTxt=(pr:string)=>`<span style="color:${PCLRT[pr]||'#595959'};font-weight:bold;">${pr||''}</span>`
    // Active items for this team only — Done/WNI excluded regardless of the on-screen toggle
    const active=items.filter(i=>i.team===team&&!ITEM_TERMINAL.includes(i.status))
    const rankedX=[...active].sort((a,b)=>{
      const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
      if(pa<=1&&pb>1)return -1
      if(pa>1&&pb<=1)return 1
      if(pa<=1&&pb<=1)return pa-pb
      return (a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999)
    })
    const inFlight=rankedX.filter(i=>i.start_date&&i.end_date)
    const upNext=rankedX.filter(i=>!(i.start_date&&i.end_date))
    const teamProjs=teamProjects.filter((p:any)=>((p.start_date&&p.end_date)||(p.ongoing&&p.start_date))&&!PROJECT_TERMINAL.includes(p.status))
    // Roadmap grid
    let roadmapHtml=''
    if(teamProjs.length){
      const m0=(dstr:string)=>{const x=new Date(dstr+'T12:00:00');return new Date(x.getFullYear(),x.getMonth(),1)}
      const curM=new Date(new Date().getFullYear(),new Date().getMonth(),1)
      const floor=new Date(curM.getFullYear(),curM.getMonth()-1,1)
      const minM=Math.max(Math.min(...teamProjs.map((p:any)=>+m0(p.start_date)),+curM),+floor)
      const maxTarget=Math.max(...teamProjs.filter((p:any)=>p.end_date).map((p:any)=>+m0(p.end_date)),+curM)
      const months:Date[]=[]
      {const d0=new Date(minM);let n=0;while(+d0<=maxTarget&&n<12){months.push(new Date(d0));d0.setMonth(d0.getMonth()+1);n++}}
      const idxOf=(dstr:string)=>{const t=+m0(dstr);let i=-1;months.forEach((m,j)=>{if(+m===t)i=j});return i}
      const sorted2=[...teamProjs].sort((a:any,b:any)=>(!!a.ongoing===!!b.ongoing)?0:(a.ongoing?1:-1))
      const rows=sorted2.map((p:any)=>{
        const si=+m0(p.start_date),ei=p.ongoing?+months[months.length-1]:+m0(p.end_date)
        const msM=new Set(milestones.filter(m=>m.project_id===p.id&&!m.completed).map(m=>idxOf(m.date)).filter(i=>i>=0))
        const startsBefore=si<+months[0],endsAfter=p.ongoing||ei>+months[months.length-1]
        const cells=months.map((m,ci)=>{
          const activeC=(+m>=si&&+m<=ei)||(startsBefore&&+m<=ei)
          const freeze=m.getMonth()>=9
          const bg=activeC?(p.ongoing?'#B7C4D0':(p.color||'#2E5E8C')):(freeze?'#FBEAEA':'#FFFFFF')
          const mark=msM.has(ci)?'◆':(endsAfter&&ci===months.length-1&&activeC?(p.ongoing?'∞':'→'):'')
          return `<td style="padding:0;height:18px;background:${bg};border:1px solid ${freeze?'#F0C9C4':'#D9D9D9'};text-align:center;font-size:10px;color:${p.ongoing?'#44515E':'#FFFFFF'};font-weight:bold;">${mark}</td>`
        }).join('')
        const nm=(p.ongoing?'∞ ':'')+(p.name.length>26?p.name.slice(0,25)+'…':p.name)
        return `<tr><td style="${TD_}white-space:nowrap;font-weight:bold;">${hs(nm)}</td>${cells}</tr>`
      }).join('')
      const header=`<tr><td style="${TH_}"></td>${months.map(m=>{
        const isCur=+m===+curM,freeze=m.getMonth()>=9
        return `<td style="${TH_}text-align:center;color:${freeze?'#C0392B':'#222222'};${isCur?'background:#DDEBF7;':''}">${m.toLocaleDateString('default',{month:'short'})}${m.getMonth()===0||+m===+months[0]?`&nbsp;${String(m.getFullYear()).slice(2)}`:''}</td>`
      }).join('')}</tr>`
      roadmapHtml=`<div style="${H2}">Roadmap</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;"><colgroup><col style="width:200px;"/>${months.map(()=>'<col/>').join('')}</colgroup>${header}${rows}</table>
      <div style="font-size:11px;color:#595959;margin:4px 0 0;">◆ milestone&nbsp;&nbsp;→ continues&nbsp;&nbsp;∞ ongoing&nbsp;&nbsp;<span style="color:#C0392B;">Oct–Dec: code freeze</span></div>`
    }
    const itemCell=(i:any)=>`${i.name}${i.description?`<div style="font-size:11px;color:#595959;margin-top:1px;">${i.description}</div>`:''}${i.vendor_delivery_date?`<div style="font-size:11px;color:#8A6D1F;">Vendor deliverable: ${hs(fmtD(i.vendor_delivery_date))}</div>`:''}`
    // Per-project blocks (like the stakeholder view): Committed + Backlog tables per project
    const teamProjNames=new Set(teamProjects.map((p:any)=>p.name))
    const projBlocks=teamProjects.filter((p:any)=>!PROJECT_TERMINAL.includes(p.status)).map((p:any)=>{
      const committed=rankedX.filter(i=>i.parent_project===p.name&&i.start_date&&i.end_date)
      const backlog=rankedX.filter(i=>i.parent_project===p.name&&!(i.start_date&&i.end_date))
      if(!committed.length&&!backlog.length)return ''
      const tbl=(rows:any[])=>`<table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
        <colgroup><col style="width:28px;"/><col style="width:68px;"/><col style="width:300px;"/><col style="width:100px;"/><col style="width:36px;"/><col style="width:36px;"/><col style="width:140px;"/><col style="width:72px;"/></colgroup>
        <tr><th style="${TH_}">#</th><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Type</th><th style="${TH_}">Pri</th><th style="${TH_}">Size</th><th style="${TH_}">Status</th><th style="${TH_}">Target</th></tr>
        ${rows.map((i,n)=>`<tr>
          <td style="${TD_}text-align:center;font-weight:bold;">${n+1}</td>
          <td style="${TD_}white-space:nowrap;overflow:hidden;">${hs(i.item_id)}</td>
          <td style="${TD_}overflow:hidden;word-wrap:break-word;"><b>${i.name}</b>${i.description?`<div style="font-size:11px;color:#595959;margin-top:1px;">${i.description}</div>`:''}${i.vendor_delivery_date?`<div style="font-size:11px;color:#8A6D1F;">Vendor: ${hs(fmtD(i.vendor_delivery_date))}</div>`:''}</td>
          <td style="${TD_}overflow:hidden;">${hs(i.request_type)}</td>
          <td style="${TD_}white-space:nowrap;">${priTxt(i.priority)}</td>
          <td style="${TD_}text-align:center;">${i.effort||''}</td>
          <td style="${TD_}overflow:hidden;">${hs(i.status)}</td>
          <td style="${TD_}white-space:nowrap;font-weight:bold;">${i.start_date&&i.end_date?hs(fmtD(i.end_date)):'<span style="color:#7F7F7F;font-weight:normal;">—</span>'}</td>
        </tr>`).join('')}</table>`
      return `<div style="margin:0 0 18px;">
        <div style="font-size:14px;font-weight:bold;color:#1F1F1F;border-bottom:1px solid #D9D9D9;padding-bottom:3px;margin-bottom:5px;">${p.name}</div>
        ${committed.length?`<div style="font-size:12px;font-weight:bold;color:#595959;margin:6px 0 3px;">Committed (${committed.length})</div>${tbl(committed)}`:''}
        ${backlog.length?`<div style="font-size:12px;font-weight:bold;color:#595959;margin:8px 0 3px;">Not Committed (${backlog.length})</div>${tbl(backlog)}`:''}
      </div>`
    }).join('')
    const projectsHtml=projBlocks?`<div style="${H2}">Projects</div>${projBlocks}`:''
    // Items with no project — by convention these are bugs: one prioritized queue
    const noProj=rankedX.filter(i=>!i.parent_project||!teamProjNames.has(i.parent_project))
    const bugsHtml=noProj.length?`<div style="${H2}">Backlog (${noProj.length})</div>
      <div style="font-size:12px;color:#595959;margin-bottom:6px;">No project attached — prioritized, work top to bottom.</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:28px;"/><col style="width:68px;"/><col style="width:300px;"/><col style="width:100px;"/><col style="width:36px;"/><col style="width:36px;"/><col style="width:140px;"/><col style="width:72px;"/></colgroup>
      <tr><th style="${TH_}">#</th><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Type</th><th style="${TH_}">Pri</th><th style="${TH_}">Size</th><th style="${TH_}">Status</th><th style="${TH_}">Target</th></tr>
      ${noProj.map((i,n)=>`<tr>
        <td style="${TD_}text-align:center;font-weight:bold;">${n+1}</td>
        <td style="${TD_}white-space:nowrap;overflow:hidden;">${hs(i.item_id)}</td>
        <td style="${TD_}overflow:hidden;word-wrap:break-word;"><b>${i.name}</b>${i.description?`<div style="font-size:11px;color:#595959;margin-top:1px;">${i.description}</div>`:''}</td>
        <td style="${TD_}overflow:hidden;">${hs(i.request_type)}</td>
        <td style="${TD_}white-space:nowrap;">${priTxt(i.priority)}</td>
        <td style="${TD_}text-align:center;">${i.effort||''}</td>
        <td style="${TD_}overflow:hidden;">${hs(i.status)}</td>
        <td style="${TD_}white-space:nowrap;font-weight:bold;">${i.end_date?hs(fmtD(i.end_date)):'<span style="color:#7F7F7F;">—</span>'}</td>
      </tr>`).join('')}</table>`:''
    const upc=milestones.filter(m=>!m.completed&&teamProjects.some((p:any)=>p.id===m.project_id)).sort((a,b)=>a.date<b.date?-1:1)
    const msHtml=upc.length?`<div style="${H2}">Milestones (${upc.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;">
      <tr><th style="${TH_}width:70px;">Date</th><th style="${TH_}width:220px;">Project</th><th style="${TH_}">Milestone</th></tr>
      ${upc.map(m=>{const pr=projects.find(p=>p.id===m.project_id);return `<tr><td style="${TD_}white-space:nowrap;">${hs(fmtD(m.date))}</td><td style="${TD_}">${pr?.name||''}</td><td style="${TD_}">${m.name}${m.type&&m.type!=='Milestone'?` <span style="color:#595959;font-size:11px;">(${m.type})</span>`:''}</td></tr>`}).join('')}</table>`:''
    const devFlags=items.filter(i=>i.team===team&&flagDev(i))
    const teamFlaggedProj=teamProjects.filter((p:any)=>flagDev(p)&&!PROJECT_TERMINAL.includes(p.status))
    const teamProjFlagTable=teamFlaggedProj.length?`<div style="font-size:13px;font-weight:bold;color:#595959;margin:4px 0 3px;">Projects (${teamFlaggedProj.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:8px;">
      <colgroup><col style="width:240px;"/><col style="width:110px;"/><col style="width:494px;"/></colgroup>
      <tr><th style="${TH_}">Project</th><th style="${TH_}">Status</th><th style="${TH_}">Notes</th></tr>
      ${teamFlaggedProj.map((p:any)=>`<tr>
        <td style="${TD_}overflow:hidden;"><b>${p.name}</b></td>
        <td style="${TD_}overflow:hidden;">${hs(p.status)}</td>
        <td style="${TD_}line-height:1.5;">${p.flag_notes||'<span style="color:#7F7F7F;font-style:italic;">—</span>'}</td>
      </tr>`).join('')}</table>`:''
    const flagsHtml=(devFlags.length||teamFlaggedProj.length)?`<div style="${H2}">For Discussion</div>
      ${teamProjFlagTable}
      ${devFlags.length&&teamFlaggedProj.length?`<div style="font-size:13px;font-weight:bold;color:#595959;margin:4px 0 3px;">Items (${devFlags.length})</div>`:''}`+(devFlags.length?`
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:60px;"/><col style="width:240px;"/><col style="width:150px;"/><col style="width:394px;"/></colgroup>
      <tr><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Project</th><th style="${TH_}">Notes</th></tr>
      ${devFlags.map(i=>`<tr><td style="${TD_}white-space:nowrap;">${hs(i.item_id)}</td><td style="${TD_}font-weight:bold;">${i.name}</td><td style="${TD_}">${i.parent_project||'<span style="color:#7F7F7F;">—</span>'}</td><td style="${TD_}line-height:1.5;">${i.notes||'<span style="color:#7F7F7F;font-style:italic;">—</span>'}</td></tr>`).join('')}</table>`:''):''
    const html=`<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;max-width:900px;color:#222222;">
      <div style="font-size:22px;font-weight:bold;color:#1F1F1F;">${team} — Work Queue</div>
      <div style="font-size:13px;color:#595959;margin-bottom:12px;">${today}</div>
      <div style="font-size:13px;color:#222222;margin-bottom:4px;"><b>${inFlight.length} committed</b> · <b>${upNext.length} in backlog</b>${noProj.length?` · ${noProj.length} backlog (no project)`:''}${(devFlags.length+teamFlaggedProj.length)?` · ${devFlags.length+teamFlaggedProj.length} for discussion`:''}</div>
      ${roadmapHtml}
      ${msHtml}
      ${projectsHtml}
      ${bugsHtml}
      ${flagsHtml}
    </div>`
    setExtractHtml(html)
  }
  function generateNewExtract(){
    const hs=(t:string)=>(t||'').replace(/ /g,'&nbsp;')
    const TD_='padding:3px 7px;border:1px solid #D9D9D9;font-size:13px;color:#222222;vertical-align:top;'
    const TH_='padding:3px 7px;border:1px solid #D9D9D9;font-size:13px;color:#222222;background:#F2F2F2;font-weight:bold;text-align:left;'
    const cutoff=Date.now()-newDays*86400000
    const fresh=items.filter(i=>i.team===team&&i.created_at&&+new Date(i.created_at)>=cutoff)
      .sort((a,b)=>{
        const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
        if(pa!==pb)return pa-pb
        return a.created_at<b.created_at?1:-1
      })
    const fmtD=(d:string)=>new Date(d).toLocaleDateString('default',{month:'short',day:'numeric'})
    const priTxt=(p:string)=>{const c=p==='P1'?'#C00000':p==='P2'?'#E36C09':p==='P3'?'#1F6FC4':'#595959';return `<span style="color:${c};font-weight:bold;">${p||''}</span>`}
    const today=new Date().toLocaleDateString('default',{month:'long',day:'numeric',year:'numeric'})
    const SH='font-size:15px;font-weight:bold;color:#1F1F1F;margin:18px 0 6px;border-bottom:1px solid #BFBFBF;padding-bottom:3px;'
    const teamProjSet=new Set(projects.filter((p:any)=>p.team===team).map((p:any)=>p.name))
    // New projects for this team
    const freshProjects=projects.filter((p:any)=>p.team===team&&p.created_at&&+new Date(p.created_at)>=cutoff)
      .sort((a:any,b:any)=>a.created_at<b.created_at?1:-1)
    // New milestones on this team's projects
    const projById=new Map(projects.map((p:any)=>[p.id,p]))
    const freshMs=milestones.filter((m:any)=>{
      const pr:any=projById.get(m.project_id)
      return pr&&pr.team===team&&m.created_at&&+new Date(m.created_at)>=cutoff
    }).sort((a:any,b:any)=>a.date<b.date?-1:1)
    // Vendor date changes on this team's items (tracked from now on via vendor_date_changed_at)
    const vendorChanged=items.filter(i=>i.team===team&&i.vendor_date_changed_at&&+new Date(i.vendor_date_changed_at)>=cutoff&&i.vendor_delivery_date)
      .sort((a,b)=>a.vendor_date_changed_at<b.vendor_date_changed_at?1:-1)
    // New CCRs tied to this team (via project team, or via any linked item's team)
    const freshCcrs=ccrs.filter((c:any)=>{
      if(!c.created_at||+new Date(c.created_at)<cutoff)return false
      const pr:any=c.project_id?projById.get(c.project_id):null
      if(pr)return pr.team===team
      const linked=ccrItems.filter((l:any)=>l.ccr_id===c.id).map((l:any)=>items.find(x=>x.id===l.item_id)).filter(Boolean)
      if(linked.length)return linked.some((x:any)=>x.team===team)
      return true // unassociated CCRs appear for every team rather than vanishing
    }).sort((a:any,b:any)=>a.created_at<b.created_at?1:-1)
    const total=fresh.length+freshProjects.length+freshMs.length+vendorChanged.length+freshCcrs.length
    const html=`<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;max-width:960px;color:#222222;">
      <div style="font-size:20px;font-weight:bold;color:#1F1F1F;">${team} — What's New (Last ${newDays} Days)</div>
      <div style="font-size:13px;color:#595959;margin:2px 0 12px;">${today} · ${fresh.length} item${fresh.length!==1?'s':''} · ${freshProjects.length} project${freshProjects.length!==1?'s':''} · ${freshMs.length} milestone${freshMs.length!==1?'s':''} · ${vendorChanged.length} vendor date change${vendorChanged.length!==1?'s':''} · ${freshCcrs.length} CCR${freshCcrs.length!==1?'s':''}</div>
      ${total===0?`<div style="font-size:13px;color:#595959;font-style:italic;">Nothing new in this window.</div>`:''}
      ${freshProjects.length?`<div style="${SH}">New Projects (${freshProjects.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:60px;"/><col style="width:360px;"/><col style="width:34px;"/><col style="width:130px;"/><col style="width:170px;"/></colgroup>
      <tr><th style="${TH_}">Added</th><th style="${TH_}">Project</th><th style="${TH_}">Pri</th><th style="${TH_}">Status</th><th style="${TH_}">Timeline</th></tr>
      ${freshProjects.map((p:any)=>`<tr>
        <td style="${TD_}white-space:nowrap;">${hs(fmtD(p.created_at))}</td>
        <td style="${TD_}overflow:hidden;"><b>${p.name}</b>${p.description?`<div style="font-size:11px;color:#595959;margin-top:1px;">${p.description}</div>`:''}</td>
        <td style="${TD_}white-space:nowrap;">${priTxt(p.priority)}</td>
        <td style="${TD_}overflow:hidden;">${hs(p.status)}</td>
        <td style="${TD_}white-space:nowrap;">${p.start_date?hs(fmtD(p.start_date)):'—'}${p.ongoing?' – Ongoing ∞':p.end_date?' – '+hs(fmtD(p.end_date)):''}</td>
      </tr>`).join('')}</table>`:''}
      ${fresh.length?`<div style="${SH}">New Items (${fresh.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:60px;"/><col style="width:66px;"/><col style="width:300px;"/><col style="width:150px;"/><col style="width:96px;"/><col style="width:34px;"/><col style="width:34px;"/><col style="width:130px;"/></colgroup>
      <tr><th style="${TH_}">Added</th><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Project</th><th style="${TH_}">Type</th><th style="${TH_}">Pri</th><th style="${TH_}">Size</th><th style="${TH_}">Status</th></tr>
      ${fresh.map(i=>`<tr>
        <td style="${TD_}white-space:nowrap;">${hs(fmtD(i.created_at))}</td>
        <td style="${TD_}white-space:nowrap;overflow:hidden;">${hs(i.item_id)}</td>
        <td style="${TD_}overflow:hidden;word-wrap:break-word;"><b>${i.name}</b>${i.description?`<div style="font-size:11px;color:#595959;margin-top:1px;">${i.description}</div>`:''}</td>
        <td style="${TD_}overflow:hidden;">${i.parent_project||'<span style="color:#7F7F7F;">—</span>'}</td>
        <td style="${TD_}overflow:hidden;">${hs(i.request_type)}</td>
        <td style="${TD_}white-space:nowrap;">${priTxt(i.priority)}</td>
        <td style="${TD_}text-align:center;">${i.effort||''}</td>
        <td style="${TD_}overflow:hidden;">${hs(i.status)}</td>
      </tr>`).join('')}</table>`:''}
      ${freshMs.length?`<div style="${SH}">New Milestones (${freshMs.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:60px;"/><col style="width:76px;"/><col style="width:220px;"/><col style="width:470px;"/></colgroup>
      <tr><th style="${TH_}">Added</th><th style="${TH_}">Date</th><th style="${TH_}">Project</th><th style="${TH_}">Milestone</th></tr>
      ${freshMs.map((m:any)=>{const pr:any=projById.get(m.project_id);return `<tr>
        <td style="${TD_}white-space:nowrap;">${hs(fmtD(m.created_at))}</td>
        <td style="${TD_}white-space:nowrap;font-weight:bold;">${hs(fmtD(m.date))}</td>
        <td style="${TD_}overflow:hidden;">${pr?.name||''}</td>
        <td style="${TD_}overflow:hidden;">${m.name}</td>
      </tr>`}).join('')}</table>`:''}
      ${vendorChanged.length?`<div style="${SH}">Vendor Date Changes (${vendorChanged.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:60px;"/><col style="width:66px;"/><col style="width:330px;"/><col style="width:180px;"/><col style="width:110px;"/></colgroup>
      <tr><th style="${TH_}">Changed</th><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Project</th><th style="${TH_}">New Vendor Date</th></tr>
      ${vendorChanged.map(i=>`<tr>
        <td style="${TD_}white-space:nowrap;">${hs(fmtD(i.vendor_date_changed_at))}</td>
        <td style="${TD_}white-space:nowrap;overflow:hidden;">${hs(i.item_id)}</td>
        <td style="${TD_}overflow:hidden;"><b>${i.name}</b></td>
        <td style="${TD_}overflow:hidden;">${i.parent_project||'<span style="color:#7F7F7F;">—</span>'}</td>
        <td style="${TD_}white-space:nowrap;font-weight:bold;color:#8A6D1F;">${hs(fmtD(i.vendor_delivery_date))}</td>
      </tr>`).join('')}</table>`:''}
      ${freshCcrs.length?`<div style="${SH}">New Change Requests (${freshCcrs.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:60px;"/><col style="width:330px;"/><col style="width:110px;"/><col style="width:110px;"/><col style="width:180px;"/><col style="width:90px;"/></colgroup>
      <tr><th style="${TH_}">Added</th><th style="${TH_}">Change Request</th><th style="${TH_}">CCR #</th><th style="${TH_}">Status</th><th style="${TH_}">Project</th><th style="${TH_}">Target</th></tr>
      ${freshCcrs.map((c:any)=>{const pr:any=c.project_id?projById.get(c.project_id):null;return `<tr>
        <td style="${TD_}white-space:nowrap;">${hs(fmtD(c.created_at))}</td>
        <td style="${TD_}overflow:hidden;"><b>${c.title}</b></td>
        <td style="${TD_}white-space:nowrap;font-family:Consolas,monospace;">${c.ccr_number||'—'}</td>
        <td style="${TD_}overflow:hidden;">${hs(c.status)}</td>
        <td style="${TD_}overflow:hidden;">${pr?.name||'—'}</td>
        <td style="${TD_}white-space:nowrap;">${c.target_date?hs(fmtD(c.target_date)):'—'}</td>
      </tr>`}).join('')}</table>`:''}
    </div>`
    setExtractHtml(html)
  }
  async function copyExtract(){
    try{
      const blob=new Blob([extractHtml||''],{type:'text/html'})
      const txt=new Blob([(extractHtml||'').replace(/<[^>]+>/g,' ')],{type:'text/plain'})
      await (navigator.clipboard as any).write([new (window as any).ClipboardItem({'text/html':blob,'text/plain':txt})])
      setCopiedX(true);setTimeout(()=>setCopiedX(false),2000)
    }catch{alert('Copy failed — use Download instead')}
  }
  function downloadExtract(){
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([extractHtml||''],{type:'text/html'}))
    a.download=`${team.toLowerCase().replace(/\s+/g,'-')}-work-queue-${new Date().toISOString().slice(0,10)}.html`
    a.click()
  }

  return(
    <div style={{height:'100%',overflowY:'auto',padding:'20px 28px'}}>
      {extractHtml&&(
        <div onClick={()=>setExtractHtml(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#162436',border:'1px solid #243447',borderRadius:12,width:920,maxWidth:'96vw',maxHeight:'88vh',display:'flex',flexDirection:'column' as const}}>
            <div style={{display:'flex',alignItems:'center',padding:'14px 20px',borderBottom:'1px solid #243447'}}>
              <span style={{fontSize:15,fontWeight:800}}>{team} — Work Queue Extract</span>
              <button onClick={()=>setExtractHtml(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{overflowY:'auto',flex:1,background:'#ffffff',margin:'14px 20px',borderRadius:8,padding:20}} dangerouslySetInnerHTML={{__html:extractHtml}}/>
            <div style={{padding:'12px 20px',borderTop:'1px solid #243447',display:'flex',justifyContent:'flex-end',gap:10}}>
              <button onClick={downloadExtract} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'8px 16px',cursor:'pointer'}}>Download .html</button>
              <button onClick={copyExtract} style={{background:'#27AE60',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:700,padding:'8px 18px',cursor:'pointer'}}>{copiedX?'✓ Copied!':'Copy for Outlook / Teams'}</button>
            </div>
          </div>
        </div>
      )}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap' as const}}>
        {teams.map(t=>(
          <button key={t} onClick={()=>setTeam(t)} style={{background:team===t?'#C8973A':'#1E3048',color:team===t?'#0D1B2A':'#7A8FA6',border:`1px solid ${team===t?'#C8973A':'#243447'}`,borderRadius:20,padding:'6px 16px',fontSize:13,fontWeight:700,cursor:'pointer'}}>{t}</button>
        ))}
        <label style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#7A8FA6',cursor:'pointer'}}>
          <input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/> Show completed
        </label>
        <button onClick={generateExtract} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:700,padding:'7px 16px',cursor:'pointer'}}>⬇ Extract for {team}</button>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <button onClick={generateNewExtract} title="Items added recently — send so nothing sits unseen" style={{background:'#27AE60',border:'none',borderRadius:'6px 0 0 6px',color:'#fff',fontSize:12,fontWeight:700,padding:'7px 12px',cursor:'pointer'}}>✨ New Items</button>
          <select value={newDays} onChange={e=>setNewDays(parseInt(e.target.value))} style={{background:'#1E8449',border:'none',borderRadius:'0 6px 6px 0',color:'#fff',fontSize:11,fontWeight:700,padding:'7px 4px',cursor:'pointer'}}>
            <option value={7}>7d</option><option value={14}>14d</option><option value={30}>30d</option>
          </select>
        </div>
      </div>
      <div style={{fontSize:12,color:'#7A8FA6',marginBottom:18}}>{ranked.length} items · read-only view · numbers show this team's queue order</div>

      {tlRows.length>0&&(
        <div style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'12px 14px 6px',marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:8}}>◆ MILESTONES</div>
          <div style={{position:'relative'}}>
            {/* month ticks */}
            <div style={{position:'relative',height:16,marginLeft:150}}>
              {monthTicks.map((t,i)=>(
                <span key={i} style={{position:'absolute',left:`${t.pct}%`,fontSize:9,color:'#7A8FA6',transform:'translateX(-50%)'}}>{t.label}</span>
              ))}
            </div>
            <div style={{position:'relative'}}>
              {tlRows.map(({project,ms}:any)=>(
                <div key={project.id} style={{display:'flex',alignItems:'center',height:38}}>
                  <div style={{width:150,flexShrink:0,fontSize:11,fontWeight:600,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',paddingRight:10,borderRight:`3px solid ${project.color||'#3A4A5E'}`}}>{project.name}</div>
                  <div style={{position:'relative',flex:1,height:'100%',marginLeft:10}}>
                    <div style={{position:'absolute',left:0,right:0,top:'50%',height:1,background:'#243447'}}/>
                    <div title="Today" style={{position:'absolute',left:`${tlPct(+now)}%`,top:2,bottom:2,width:1,background:'rgba(231,76,60,0.5)'}}/>
                    {ms.map((m:any)=>(
                      <div key={m.id} title={`${m.name} · ${m.date}${m.completed?' · completed':''}`}
                        style={{position:'absolute',left:`${tlPct(+new Date(m.date+'T12:00:00'))}%`,top:'50%',transform:'translate(-50%,-50%)'}}>
                        <div style={{width:9,height:9,background:msClr(m),transform:'rotate(45deg)',border:'1px solid rgba(0,0,0,0.3)'}}/>
                        <div style={{position:'absolute',top:11,left:'50%',transform:'translateX(-50%)',fontSize:8,color:'#7A8FA6',whiteSpace:'nowrap' as const,maxWidth:90,overflow:'hidden',textOverflow:'ellipsis'}}>{m.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:14,fontSize:9,color:'#7A8FA6',marginTop:6,marginLeft:150}}>
              <span><span style={{display:'inline-block',width:7,height:7,background:'#27AE60',transform:'rotate(45deg)',marginRight:4}}/>Completed</span>
              <span><span style={{display:'inline-block',width:7,height:7,background:'#C8973A',transform:'rotate(45deg)',marginRight:4}}/>Upcoming</span>
              <span><span style={{display:'inline-block',width:7,height:7,background:'#E74C3C',transform:'rotate(45deg)',marginRight:4}}/>Overdue</span>
            </div>
          </div>
        </div>
      )}

      {groups.map(([pname,gItems]:any)=>{
        const project=pname==='__none__'?null:projects.find(p=>p.name===pname)
        return(
          <div key={pname} style={{marginBottom:22}}>
            <div style={{display:'flex',alignItems:'center',gap:10,background:'#162436',borderTop:'1px solid #243447',borderRight:'1px solid #243447',borderBottom:'1px solid #243447',borderLeft:`4px solid ${project?.color||'#3A4A5E'}`,borderRadius:'8px 8px 0 0',padding:'10px 14px'}}>
              {project?.rag&&<span title={project.rag} style={{width:10,height:10,borderRadius:'50%',background:RAG[project.rag]||'#7A8FA6',flexShrink:0}}/>}
              <span style={{fontSize:14,fontWeight:800,letterSpacing:0.3}}>{pname==='__none__'?'No Project Assigned':pname}</span>
              {project?.status&&<span style={{fontSize:11,color:'#7A8FA6'}}>{project.status}</span>}
              {project?.start_date&&project?.end_date&&<span style={{fontSize:11,color:'#7A8FA6'}}>{project.start_date} → {project.end_date}</span>}
              <span style={{marginLeft:'auto',fontSize:11,color:'#7A8FA6'}}>{gItems.length} item{gItems.length!==1?'s':''}</span>
            </div>
            <div style={{border:'1px solid #243447',borderTop:'none',borderRadius:'0 0 8px 8px',overflow:'hidden'}}>
              {gItems.map((item:any,idx:number)=>{
                const pclr=pc(item.priority)
                const committed=item.start_date&&item.end_date
                const open=expandedId===item.id
                return(
                  <div key={item.id} onClick={()=>setExpandedId(open?null:item.id)}
                    style={{display:'flex',alignItems:'flex-start',gap:12,padding:'10px 14px',background:idx%2?'#12202F':'#0F1C2B',borderTop:idx?'1px solid #1A2838':'none',cursor:'pointer'}}>
                    <span style={{fontSize:16,fontWeight:800,color:'#C8973A',minWidth:30,textAlign:'right' as const,lineHeight:1.3}}>{queueNo.get(item.id)}</span>
                    <span style={{background:pclr.bg,color:'#fff',padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:700,marginTop:1}}>{item.priority}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' as const}}>
                        <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                        <span style={{fontSize:13,color:'#F4F6F8',fontWeight:600}}>{rt(item.request_type)} {item.name}</span>
                        {committed&&<span style={{fontSize:9,color:'#27AE60',border:'1px solid rgba(39,174,96,0.4)',borderRadius:3,padding:'1px 5px'}}>✓ committed</span>}
                        {item.flagged&&<span style={{fontSize:11}}>🚩</span>}
                      </div>
                      {item.description&&!open&&<div style={{fontSize:11,color:'#7A8FA6',marginTop:2,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{item.description}</div>}
                      {open&&(
                        <div style={{marginTop:6}}>
                          {item.description&&<div style={{fontSize:12,color:'#B8C4D0',lineHeight:1.5,marginBottom:6}}>{item.description}</div>}
                          {item.notes&&<div style={{fontSize:11,color:'#E8B95A',background:'rgba(200,151,58,0.08)',border:'1px solid rgba(200,151,58,0.25)',borderRadius:6,padding:'6px 10px',lineHeight:1.5}}>📝 {item.notes}</div>}
                          {item.dependency&&<div style={{fontSize:11,color:'#7A8FA6',marginTop:6}}>Depends on: <span style={{color:'#F4F6F8'}}>{item.dependency}</span></div>}
                          {item.owner&&<div style={{fontSize:11,color:'#7A8FA6',marginTop:2}}>Owner: <span style={{color:'#F4F6F8'}}>{item.owner}</span></div>}
                        </div>
                      )}
                    </div>
                    <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:3,flexShrink:0}}>
                      <span style={{fontSize:11,fontWeight:700,color:sc(item.status)}}>{item.status}</span>
                      <div style={{display:'flex',gap:8,fontSize:10,color:'#7A8FA6'}}>
                        {item.effort&&<span>{item.effort}</span>}
                        {item.swimlane&&<span>{item.swimlane}</span>}
                        {item.vendor_delivery_date&&<span>🚚 {item.vendor_delivery_date}</span>}
                      </div>
                      {committed&&<span style={{fontSize:10,color:'#7A8FA6'}}>{item.start_date} → {item.end_date}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {groups.length===0&&<div style={{textAlign:'center' as const,color:'#7A8FA6',padding:60,fontSize:13}}>No items for this team</div>}
    </div>
  )
}

// ── STAKEHOLDER UPDATE COMPOSER ───────────────────────────────────────────
function ComposeUpdate({projects,milestones,items,onClose}:{projects:any[],milestones:any[],items:any[],onClose:any}) {
  const active=projects.filter(p=>!PROJECT_TERMINAL.includes(p.status))
  const [sel,setSel]=useState(()=>new Set(active.map(p=>p.id)))
  const [drafts,setDrafts]=useState<any>({})
  const [last,setLast]=useState<any>({})
  const [saving,setSaving]=useState(false)
  const [previewHtml,setPreviewHtml]=useState<string|null>(null)
  const [copied,setCopied]=useState(false)

  useEffect(()=>{(async()=>{
    const{data}=await supabase.from('project_updates').select('*').order('created_at',{ascending:false})
    if(data){const m:any={};data.forEach((u:any)=>{if(!m[u.project_id])m[u.project_id]=u});setLast(m)}
  })()},[])

  const toggle=(id:any)=>setSel(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  const setDraft=(id:any,field:string,val:string)=>setDrafts((d:any)=>({...d,[id]:{...d[id],[field]:val}}))
  const RAGC:any={Green:'#27AE60',Amber:'#B8860B',Red:'#C0392B'}
  const fmtD=(str:string)=>str?new Date(str+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric'}):''

  async function generate(){
    setSaving(true)
    const hs=(t:string)=>(t||'').replace(/ /g,'&nbsp;')
    const selected=active.filter(p=>sel.has(p.id))
    // Save new updates for history
    const inserts=selected.filter(p=>(drafts[p.id]?.update||'').trim()||(drafts[p.id]?.blockers||'').trim())
      .map(p=>({project_id:p.id,update_text:(drafts[p.id]?.update||'').trim()||null,blockers:(drafts[p.id]?.blockers||'').trim()||null}))
    if(inserts.length){const{error}=await supabase.from('project_updates').insert(inserts);if(error)alert('Failed to save updates: '+error.message)}
    // Build email HTML — deliberately plain "typed in Outlook + pasted Excel tables" styling
    const today=new Date().toLocaleDateString('default',{month:'long',day:'numeric',year:'numeric'})
    const g=selected.filter(p=>p.rag==='Green').length,a=selected.filter(p=>p.rag==='Amber').length,r=selected.filter(p=>p.rag==='Red').length
    const upcoming=milestones
      .filter(m=>!m.completed&&selected.some(p=>p.id===m.project_id))
      .sort((x,y)=>x.date<y.date?-1:1)
    const RAGT:any={Green:'#217346',Amber:'#B8860B',Red:'#C0392B'}
    const PCLRT:any={P1:'#C0392B',P2:'#C55A11',P3:'#2E5E8C',P4:'#595959'}
    const ragTxt=(rg:string)=>`<span style="color:${RAGT[rg]||'#7F7F7F'};font-weight:bold;">${rg||'—'}</span>`
    const priTxt=(pr:string)=>`<span style="color:${PCLRT[pr]||'#595959'};font-weight:bold;">${pr||''}</span>`
    // Excel-paste table styling
    const TD_='padding:3px 7px;border:1px solid #D9D9D9;font-size:13px;color:#222222;vertical-align:top;'
    const TH_='padding:3px 7px;border:1px solid #D9D9D9;font-size:13px;color:#222222;background:#F2F2F2;font-weight:bold;text-align:left;'
    const H2='font-size:18px;font-weight:bold;color:#1F1F1F;margin:26px 0 10px;border-bottom:3px solid #1F1F1F;padding-bottom:4px;'

    // Roadmap grid (Excel-style)
    const dated=selected.filter(p=>(p.start_date&&p.end_date)||(p.ongoing&&p.start_date))
    let roadmapHtml=''
    if(dated.length){
      const m0=(dstr:string)=>{const x=new Date(dstr+'T12:00:00');return new Date(x.getFullYear(),x.getMonth(),1)}
      const curM=new Date(new Date().getFullYear(),new Date().getMonth(),1)
      const floor=new Date(curM.getFullYear(),curM.getMonth()-1,1)
      let minM=Math.max(Math.min(...dated.map(p=>+m0(p.start_date)),+curM),+floor)
      const maxTarget=Math.max(...dated.filter(p=>p.end_date).map(p=>+m0(p.end_date)),+curM)
      const months:Date[]=[]
      {const d=new Date(minM);let n=0;while(+d<=maxTarget&&n<12){months.push(new Date(d));d.setMonth(d.getMonth()+1);n++}}
      const idxOf=(dstr:string)=>{const t=+m0(dstr);let i=-1;months.forEach((m,j)=>{if(+m===t)i=j});return i}
      const datedSorted=[...dated].sort((a,b)=>(!!a.ongoing===!!b.ongoing)?0:(a.ongoing?1:-1))
      const rows=datedSorted.map(p=>{
        const si=+m0(p.start_date),ei=p.ongoing?+months[months.length-1]:+m0(p.end_date)
        const msMonths=new Set(milestones.filter(m=>m.project_id===p.id&&!m.completed).map(m=>idxOf(m.date)).filter(i=>i>=0))
        const startsBefore=si<+months[0]
        const endsAfter=p.ongoing||ei>+months[months.length-1]
        const cells=months.map((m,ci)=>{
          const active=(+m>=si&&+m<=ei)||(startsBefore&&+m<=ei)
          const freeze=m.getMonth()>=9
          // Ongoing rows shade in a distinct muted gray-blue so they read differently from dated commitments
          const bg=active?(p.ongoing?'#B7C4D0':(p.color||'#2E5E8C')):(freeze?'#FBEAEA':'#FFFFFF')
          const mark=msMonths.has(ci)?'◆':(endsAfter&&ci===months.length-1&&active?(p.ongoing?'∞':'→'):'')
          return `<td style="padding:0;height:18px;background:${bg};border:1px solid #D9D9D9;text-align:center;font-size:10px;color:${p.ongoing?'#44515E':'#FFFFFF'};font-weight:bold;">${mark}</td>`
        }).join('')
        const nm=(p.ongoing?'∞ ':'')+(p.name.length>26?p.name.slice(0,25)+'…':p.name)
        return `<tr><td style="${TD_}white-space:nowrap;font-weight:bold;">${hs(nm)}</td>${cells}</tr>`
      }).join('')
      const header=`<tr><td style="${TH_}"></td>${months.map(m=>{
        const isCur=+m===+curM
        const freeze=m.getMonth()>=9
        return `<td style="${TH_}text-align:center;color:${freeze?'#C0392B':'#222222'};${isCur?'background:#DDEBF7;':''}">${m.toLocaleDateString('default',{month:'short'})}${m.getMonth()===0||+m===+months[0]?`&nbsp;${String(m.getFullYear()).slice(2)}`:''}</td>`
      }).join('')}</tr>`
      roadmapHtml=`<div style="${H2}">Roadmap</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;"><colgroup><col style="width:200px;"/>${months.map(()=>'<col/>').join('')}</colgroup>${header}${rows}</table>
      <div style="font-size:11px;color:#595959;margin:4px 0 0;">◆ upcoming milestone&nbsp;&nbsp;→ continues beyond window&nbsp;&nbsp;<span style="background:#B7C4D0;padding:0 6px;">&nbsp;</span> ∞ ongoing (vendor-dependent)&nbsp;&nbsp;<span style="color:#C0392B;">Oct–Dec: code freeze</span>&nbsp;&nbsp;(committed projects only)</div>`
    }

    // Item sections
    const p12=items.filter((i:any)=>(i.priority==='P1'||i.priority==='P2')&&!ITEM_TERMINAL.includes(i.status))
      .sort((a:any,b:any)=>(PRIORITY_ORDER[a.priority]??4)-(PRIORITY_ORDER[b.priority]??4)||((a.committed_priority??999)-(b.committed_priority??999)))
    const top10=items.filter((i:any)=>i.priority!=='P1'&&i.priority!=='P2'&&!ITEM_TERMINAL.includes(i.status)&&!(i.start_date&&i.end_date))
      .sort((a:any,b:any)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999)).slice(0,10)
    const flagged=items.filter(flagStk)
    const itemRow=(i:any,n?:number)=>`<tr>
      ${n!=null?`<td style="${TD_}text-align:center;font-weight:bold;">${n}</td>`:''}
      <td style="${TD_}white-space:nowrap;overflow:hidden;">${hs(i.item_id)}</td>
      <td style="${TD_}overflow:hidden;word-wrap:break-word;"><b>${i.name}</b></td>
      <td style="${TD_}overflow:hidden;">${i.parent_project||'<span style="color:#7F7F7F;">—</span>'}</td>
      <td style="${TD_}white-space:nowrap;">${priTxt(i.priority)}</td>
      <td style="${TD_}overflow:hidden;">${hs(i.status)}</td>
      <td style="${TD_}overflow:hidden;">${hs(i.team)}</td>
    </tr>`
    const itemHead=(n?:boolean)=>`${n?'<colgroup><col style="width:26px;"/><col style="width:68px;"/><col style="width:300px;"/><col style="width:160px;"/><col style="width:36px;"/><col style="width:140px;"/><col style="width:140px;"/></colgroup>':'<colgroup><col style="width:68px;"/><col style="width:300px;"/><col style="width:160px;"/><col style="width:36px;"/><col style="width:140px;"/><col style="width:140px;"/></colgroup>'}<tr>${n?`<th style="${TH_}">#</th>`:''}<th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Project</th><th style="${TH_}">Pri</th><th style="${TH_}">Status</th><th style="${TH_}">Team</th></tr>`
    const p12Html=p12.length?`<div style="${H2}">Critical Items (P1 / P2)</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">${itemHead()}${p12.map((i:any)=>itemRow(i)).join('')}</table>`:''
    const top10Html=top10.length?`<div style="${H2}">Top 10 Backlog — Not Yet Committed</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">${itemHead(true)}${top10.map((i:any,n:number)=>itemRow(i,n+1)).join('')}</table>`:''
    const flaggedProj=projects.filter((p:any)=>flagStk(p)&&!PROJECT_TERMINAL.includes(p.status))
    const flaggedProjTable=flaggedProj.length?`<div style="font-size:13px;font-weight:bold;color:#595959;margin:4px 0 3px;">Projects (${flaggedProj.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:8px;">
      <colgroup><col style="width:240px;"/><col style="width:110px;"/><col style="width:70px;"/><col style="width:424px;"/></colgroup>
      <tr><th style="${TH_}">Project</th><th style="${TH_}">Status</th><th style="${TH_}">RAG</th><th style="${TH_}">Discussion Notes</th></tr>
      ${flaggedProj.map((p:any)=>`<tr>
        <td style="${TD_}overflow:hidden;"><b>${p.name}</b></td>
        <td style="${TD_}overflow:hidden;">${hs(p.status)}</td>
        <td style="${TD_}white-space:nowrap;color:${p.rag==='Red'?'#C00000':p.rag==='Amber'?'#E36C09':p.rag==='Green'?'#1F8A3B':'#595959'};font-weight:bold;">${p.rag||'—'}</td>
        <td style="${TD_}line-height:1.5;">${p.flag_notes||'<span style="color:#7F7F7F;font-style:italic;">—</span>'}</td>
      </tr>`).join('')}</table>`:''
    const flaggedHtml=(flagged.length||flaggedProj.length)?`<div style="${H2}">Flagged for Discussion</div>
      ${flaggedProjTable}
      ${flagged.length&&flaggedProj.length?`<div style="font-size:13px;font-weight:bold;color:#595959;margin:4px 0 3px;">Items (${flagged.length})</div>`:''}`+(flagged.length?`
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:68px;"/><col style="width:240px;"/><col style="width:150px;"/><col style="width:36px;"/><col style="width:350px;"/></colgroup>
      <tr><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Project</th><th style="${TH_}">Pri</th><th style="${TH_}">Discussion Notes</th></tr>
      ${flagged.map((i:any)=>`<tr>
        <td style="${TD_}white-space:nowrap;">${hs(i.item_id)}</td>
        <td style="${TD_}font-weight:bold;">${i.name}</td>
        <td style="${TD_}">${i.parent_project||'<span style="color:#7F7F7F;">—</span>'}</td>
        <td style="${TD_}white-space:nowrap;">${priTxt(i.priority)}</td>
        <td style="${TD_}line-height:1.5;">${i.notes||'<span style="color:#7F7F7F;font-style:italic;">No discussion notes yet.</span>'}</td>
      </tr>`).join('')}</table>`:''):''

    const projBlock=(p:any,tag?:string)=>{
      const d=drafts[p.id]||{}
      const upd=(d.update||'').trim()||(last[p.id]?.update_text||'')
      const blk=(d.blockers||'').trim()
      const pItems=items.filter((i:any)=>i.parent_project===p.name&&i.start_date&&i.end_date&&!ITEM_TERMINAL.includes(i.status))
        .sort((a:any,b:any)=>(a.end_date<b.end_date?-1:a.end_date>b.end_date?1:0))
      const pUncommitted=items.filter((i:any)=>i.parent_project===p.name&&!(i.start_date&&i.end_date)&&!/done|will not/i.test(i.status||''))
        .sort((a:any,b:any)=>((PRIORITY_ORDER[a.priority]??4)-(PRIORITY_ORDER[b.priority]??4))||((a.committed_priority??999)-(b.committed_priority??999)))
      const timeline=p.ongoing?`${p.start_date?hs(fmtD(p.start_date))+' – ':''}Ongoing ∞`:(p.start_date&&p.end_date?`${hs(fmtD(p.start_date))} – ${hs(fmtD(p.end_date))}`:'')
      return `<div style="margin:0 0 18px;">
        <div style="font-size:14px;font-weight:bold;color:#1F1F1F;border-bottom:1px solid #D9D9D9;padding-bottom:3px;margin-bottom:5px;">${p.name}${tag?` <span style="font-size:11px;font-weight:bold;color:#7F7F7F;">[${tag}]</span>`:''} <span style="font-size:12px;font-weight:normal;color:#595959;">— ${ragTxt(p.rag)}${p.status?` | ${p.status}`:''}${timeline?` | ${timeline}`:''}</span></div>
        ${upd?`<div style="font-size:13px;color:#222222;line-height:1.55;">${upd}</div>`:`<div style="font-size:13px;color:#7F7F7F;font-style:italic;">No update provided this period.</div>`}
        ${blk?`<div style="font-size:13px;color:#222222;line-height:1.5;margin-top:4px;"><b style="color:#C0392B;">Risks / Blockers:</b> ${blk}</div>`:''}
        ${(()=>{
          const sTbl=(rows:any[])=>`<table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;margin-top:2px;">
            <colgroup><col style="width:68px;"/><col style="width:380px;"/><col style="width:36px;"/><col style="width:150px;"/><col style="width:72px;"/></colgroup>
            <tr><th style="${TH_}">ID</th><th style="${TH_}">Item</th><th style="${TH_}">Pri</th><th style="${TH_}">Status</th><th style="${TH_}">Target</th></tr>
            ${rows.map((i:any)=>`<tr>
              <td style="${TD_}white-space:nowrap;overflow:hidden;">${hs(i.item_id)}</td>
              <td style="${TD_}overflow:hidden;word-wrap:break-word;"><b>${i.name}</b>${i.vendor_delivery_date?`<div style="font-size:11px;color:#8A6D1F;">Vendor deliverable: ${hs(fmtD(i.vendor_delivery_date))}</div>`:''}</td>
              <td style="${TD_}white-space:nowrap;">${priTxt(i.priority)}</td>
              <td style="${TD_}overflow:hidden;">${hs(i.status)}</td>
              <td style="${TD_}white-space:nowrap;font-weight:bold;">${i.start_date&&i.end_date?hs(fmtD(i.end_date)):'<span style="color:#7F7F7F;font-weight:normal;">—</span>'}</td>
            </tr>`).join('')}</table>`
          return `${pItems.length?`<div style="font-size:12px;font-weight:bold;color:#595959;margin:8px 0 3px;">Committed (${pItems.length})</div>${sTbl(pItems)}`:''}
          ${pUncommitted.length?`<div style="font-size:12px;font-weight:bold;color:#595959;margin:8px 0 3px;">Not Committed (${pUncommitted.length})</div>${sTbl(pUncommitted)}`:''}`
        })()}
      </div>`
    }
    // Completed this year — project name + completion date (end of timeline)
    const yr=new Date().getFullYear()
    const closedRecent=projects.filter((p:any)=>p.status==='Complete'&&p.end_date&&new Date(p.end_date+'T12:00:00').getFullYear()===yr)
      .sort((a:any,b:any)=>a.end_date<b.end_date?1:-1)
    const closedHtml=closedRecent.length?`<div style="${H2}">Completed Projects — ${yr} (${closedRecent.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:560px;"/><col style="width:120px;"/></colgroup>
      <tr><th style="${TH_}">Project</th><th style="${TH_}">Completed</th></tr>
      ${closedRecent.map((p:any)=>`<tr>
        <td style="${TD_}overflow:hidden;"><b>${p.name}</b></td>
        <td style="${TD_}white-space:nowrap;font-weight:bold;">${hs(fmtD(p.end_date))}</td>
      </tr>`).join('')}</table>`:''
    const milestonesHtml=upcoming.length?`<div style="${H2}">Milestones (${upcoming.length})</div>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <colgroup><col style="width:70px;"/><col style="width:220px;"/><col style="width:560px;"/></colgroup>
      <tr><th style="${TH_}">Date</th><th style="${TH_}">Project</th><th style="${TH_}">Milestone</th></tr>
      ${upcoming.map(m=>{
        const pr=projects.find(p=>p.id===m.project_id)
        return `<tr><td style="${TD_}white-space:nowrap;">${hs(fmtD(m.date))}</td><td style="${TD_}">${pr?.name||''}</td><td style="${TD_}">${m.name}</td></tr>`
      }).join('')}</table>`:''
    const html=`<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;max-width:900px;color:#222222;">
      <div style="font-size:22px;font-weight:bold;color:#1F1F1F;">Retail Technology — Program Update</div>
      <div style="font-size:13px;color:#595959;margin-bottom:12px;">${today}</div>
      <div style="font-size:13px;color:#222222;margin-bottom:4px;"><b>${selected.length} active project${selected.length!==1?'s':''}:</b> <span style="color:#217346;font-weight:bold;">${g} Green</span>, <span style="color:#B8860B;font-weight:bold;">${a} Amber</span>, <span style="color:#C0392B;font-weight:bold;">${r} Red</span></div>
      ${p12Html}
      ${roadmapHtml}
      ${milestonesHtml}
      ${(()=>{
        const onRoadmap=selected.filter(p=>(p.start_date&&p.end_date)||(p.ongoing&&p.start_date))
        const backlogP=selected.filter(p=>!((p.start_date&&p.end_date)||(p.ongoing&&p.start_date)))
        return `${onRoadmap.length?`<div style="${H2}">Project Updates — On Roadmap</div>${onRoadmap.map(p=>projBlock(p)).join('')}`:''}
        ${backlogP.length?`<div style="${H2}">Project Updates — Backlog</div>${backlogP.map(p=>projBlock(p,'BACKLOG')).join('')}`:''}`
      })()}
      ${flaggedHtml}
      ${top10Html}
      ${closedHtml}
    </div>`
    setPreviewHtml(html)
    setSaving(false)
  }

  async function copyRich(){
    try{
      const blob=new Blob([previewHtml||''],{type:'text/html'})
      const txt=new Blob([(previewHtml||'').replace(/<[^>]+>/g,' ')],{type:'text/plain'})
      await (navigator.clipboard as any).write([new (window as any).ClipboardItem({'text/html':blob,'text/plain':txt})])
      setCopied(true);setTimeout(()=>setCopied(false),2000)
    }catch{alert('Copy failed — use Download instead')}
  }
  function download(){
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([previewHtml||''],{type:'text/html'}))
    a.download=`program-update-${new Date().toISOString().slice(0,10)}.html`
    a.click()
  }

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,width:920,maxWidth:'96vw',maxHeight:'88vh',display:'flex',flexDirection:'column' as const}}>
        <div style={{display:'flex',alignItems:'center',padding:'14px 20px',borderBottom:'1px solid #243447'}}>
          <span style={{fontSize:15,fontWeight:800}}>{previewHtml?'Update Preview':'Compose Stakeholder Update'}</span>
          <button onClick={onClose} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>
        {!previewHtml?(
          <>
          <div style={{overflowY:'auto',padding:'14px 20px',flex:1}}>
            {active.map(p=>(
              <div key={p.id} style={{borderTop:'1px solid #243447',borderRight:'1px solid #243447',borderBottom:'1px solid #243447',borderLeft:`4px solid ${p.color||'#3A4A5E'}`,borderRadius:8,padding:'10px 14px',marginBottom:10,opacity:sel.has(p.id)?1:0.45}}>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <input type="checkbox" checked={sel.has(p.id)} onChange={()=>toggle(p.id)}/>
                  <span style={{fontSize:13,fontWeight:700}}>{p.name}</span>
                  <span style={{fontSize:11,color:p.rag==='Green'?'#27AE60':p.rag==='Amber'?'#E8B95A':p.rag==='Red'?'#E74C3C':'#7A8FA6',fontWeight:700}}>{p.rag}</span>
                  <span style={{fontSize:11,color:'#7A8FA6'}}>{p.status}</span>
                </label>
                {sel.has(p.id)&&(
                  <div style={{marginTop:8}}>
                    {last[p.id]&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:6}}>Last update ({new Date(last[p.id].created_at).toLocaleDateString()}): {last[p.id].update_text}</div>}
                    <textarea placeholder="This period's update..." value={drafts[p.id]?.update||''} onChange={e=>setDraft(p.id,'update',e.target.value)} rows={2}
                      style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:8,resize:'vertical' as const,fontFamily:'inherit',marginBottom:6}}/>
                    <textarea placeholder="Risks / Blockers (optional)..." value={drafts[p.id]?.blockers||''} onChange={e=>setDraft(p.id,'blockers',e.target.value)} rows={1}
                      style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid rgba(231,76,60,0.35)',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:8,resize:'vertical' as const,fontFamily:'inherit'}}/>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{padding:'12px 20px',borderTop:'1px solid #243447',display:'flex',justifyContent:'flex-end',gap:10}}>
            <button onClick={onClose} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'8px 16px',cursor:'pointer'}}>Cancel</button>
            <button onClick={generate} disabled={saving||sel.size===0} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:700,padding:'8px 18px',cursor:'pointer',opacity:saving||sel.size===0?0.6:1}}>{saving?'Generating...':`Generate (${sel.size})`}</button>
          </div>
          </>
        ):(
          <>
          <div style={{overflowY:'auto',flex:1,background:'#ffffff',margin:'14px 20px',borderRadius:8,padding:20}} dangerouslySetInnerHTML={{__html:previewHtml}}/>
          <div style={{padding:'12px 20px',borderTop:'1px solid #243447',display:'flex',justifyContent:'flex-end',gap:10}}>
            <button onClick={()=>setPreviewHtml(null)} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'8px 16px',cursor:'pointer'}}>← Back</button>
            <button onClick={download} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',fontSize:12,padding:'8px 16px',cursor:'pointer'}}>Download .html</button>
            <button onClick={copyRich} style={{background:'#27AE60',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:700,padding:'8px 18px',cursor:'pointer'}}>{copied?'✓ Copied!':'Copy for Outlook'}</button>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stakeholder({items,projects,milestones}:{items:any[],projects:any[],milestones:any[]}) {
  const [composing,setComposing]=useState(false)
  const [fl,setFl]=useState({})
  const p1=items.filter(i=>i.priority==='P1'&&!ITEM_TERMINAL.includes(i.status))
  const p2=items.filter(i=>i.priority==='P2'&&!ITEM_TERMINAL.includes(i.status))
  const bl=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2'&&!ITEM_TERMINAL.includes(i.status)&&!(i.start_date&&i.end_date))
    .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999)).slice(0,10)
  const disc=items.filter(flagStk)
  const redProjects=projects.filter(p=>p.rag==='Red')
  const amberProjects=projects.filter(p=>p.rag==='Amber')
  return(
    <div style={{maxWidth:960,margin:'0 auto',padding:'24px 20px',overflowY:'auto',height:'100%',boxSizing:'border-box' as const}}>
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center'}}>
          <div style={{fontSize:22,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>Retail Technology — Program Status</div>
          <button onClick={()=>setComposing(true)} style={{marginLeft:'auto',background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:700,padding:'8px 16px',cursor:'pointer'}}>✉ Compose Update</button>
        </div>
        <div style={{fontSize:13,color:'#7A8FA6'}}>Read-only · Flag items for discussion</div>
        {composing&&<ComposeUpdate projects={projects} milestones={milestones} items={items} onClose={()=>setComposing(false)}/>}
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
        {([['P1 Active',p1.length,'#C00000'],['P2 Active',p2.length,'#D4820A'],['Projects',projects.length,'#2E86AB'],['For Discussion',disc.length,'#C8973A']] as [string,number,string][]).map(([label,val,color])=>(
          <div key={label} style={{background:'#162436',border:'1px solid #243447',borderRadius:10,padding:'16px 20px'}}>
            <div style={{fontSize:28,fontWeight:700,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:12,color:'#7A8FA6',marginTop:4}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Project RAG summary */}
      {(redProjects.length>0||amberProjects.length>0)&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:10}}>PROJECT HEALTH</div>
          {[...redProjects,...amberProjects].map(project=>{
            const ragColor=RAG_COLORS[project.rag]
            const pclr=pc(project.priority)
            return(
              <div key={project.id} style={{background:`${ragColor}11`,borderTop:`1px solid ${ragColor}33`,borderRight:`1px solid ${ragColor}33`,borderBottom:`1px solid ${ragColor}33`,borderLeft:`4px solid ${ragColor}`,borderRadius:8,padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:16}}>{project.rag==='Red'?'🔴':'🟡'}</span>
                <span style={{background:pclr.bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{project.priority}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#F4F6F8'}}>{project.name}</div>
                  <div style={{fontSize:11,color:'#7A8FA6'}}>{project.status} · {project.team==='Consumer Experience'?'CE':'OE'} · {project.start_date} → {project.end_date}</div>
                </div>
                <span style={{fontSize:11,color:ragColor,fontWeight:700}}>{project.rag}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* P1/P2 items */}
      {[...p1,...p2].map(item=>(
        <div key={item.id} style={{background:item.priority==='P1'?'#2D1515':'#2D1E0A',border:`1px solid ${(item.priority==='P1'?'#C00000':'#D4820A')}44`,borderRadius:8,padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
          <span style={{background:pc(item.priority).bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{item.priority}</span>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#F4F6F8'}}>{rt(item.request_type)} {item.name}</div><div style={{fontSize:11,color:'#7A8FA6'}}>{item.item_id} · {item.swimlane} · {item.status}</div></div>
          <button onClick={()=>setFl(p=>({...p,[item.id]:!p[item.id]}))} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,opacity:fl[item.id]||item.flagged?1:0.3}}>🚩</button>
        </div>
      ))}

      <div style={{fontSize:13,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:10,marginTop:20}}>TOP PRIORITY BACKLOG</div>
      {bl.map((item,idx)=>(
        <div key={item.id} style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'10px 16px',marginBottom:6,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:11,color:'#7A8FA6',width:20,textAlign:'center' as const}}>{idx+1}</span>
          <span style={{background:pc(item.priority).bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{item.priority}</span>
          <div style={{flex:1}}><div style={{fontSize:13,color:'#F4F6F8'}}>{item.name}</div><div style={{fontSize:11,color:'#7A8FA6'}}>{item.item_id} · {item.swimlane} · {item.team}</div></div>
          <span style={{fontSize:11,color:sc(item.status)}}>{item.status}</span>
          <button onClick={()=>setFl(p=>({...p,[item.id]:!p[item.id]}))} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,opacity:fl[item.id]?1:0.25}}>🚩</button>
        </div>
      ))}

      {disc.length>0&&(
        <>
          {(()=>{
            const fp=projects.filter((p:any)=>flagStk(p)&&!PROJECT_TERMINAL.includes(p.status))
            if(!fp.length)return null
            return(
              <>
              <div style={{fontSize:13,fontWeight:700,color:'#C8973A',letterSpacing:1,marginBottom:10,marginTop:20}}>◈ FLAGGED PROJECTS</div>
              {fp.map((p:any)=>(
                <div key={p.id} style={{background:'#162436',border:'1px solid rgba(200,151,58,0.35)',borderRadius:8,padding:'10px 16px',marginBottom:6,display:'flex',alignItems:'flex-start',gap:12}}>
                  <span style={{width:10,height:10,borderRadius:2,background:p.color||'#3A4A5E',marginTop:3,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:'#F4F6F8',fontWeight:700}}>{p.name} <span style={{fontSize:11,fontWeight:400,color:'#7A8FA6'}}>· {p.status} · {p.rag||'—'}</span></div>
                    {p.flag_notes&&<div style={{fontSize:11,color:'#C8C8D4',marginTop:3,whiteSpace:'pre-wrap' as const,lineHeight:1.5}}>{p.flag_notes}</div>}
                  </div>
                </div>
              ))}
              </>
            )
          })()}
          <div style={{fontSize:13,fontWeight:700,color:'#C8973A',letterSpacing:1,marginBottom:10,marginTop:20}}>🚩 FLAGGED FOR DISCUSSION</div>
          {disc.map(item=>(
            <div key={item.id} style={{background:'rgba(200,151,58,0.1)',border:'1px solid rgba(200,151,58,0.3)',borderRadius:8,padding:'10px 16px',marginBottom:6}}>
              <div style={{fontSize:13,color:'#F4F6F8'}}>{item.name}</div>
              <div style={{fontSize:11,color:'#7A8FA6'}}>{item.item_id} · {item.priority}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────────────────────
// ── DESK — daily notes & planning ─────────────────────────────────────────
// Section syntax: a plain line ending with ':' is a section header.
// A header ending with ': ↻' is marked to carry the whole section to the next day.
const isDeskHeader=(l:string)=>{const t=l.trim();return t.length>1&&!t.startsWith('[ ]')&&!t.startsWith('[x]')&&/:\s*↻?$/.test(t)}
const isCarriedHeader=(l:string)=>/:\s*↻$/.test(l.trim())
// Sub-section: header with a numbered/bulleted prefix (1) 2. -) or leading indentation
const isSubHeader=(l:string)=>isDeskHeader(l)&&(/^\s+\S/.test(l)||/^(\d+[).]|[-•])\s*/.test(l.trim()))
// Days since a breadcrumb date like 'Jul 8' (year-wrap tolerant)
function crumbAge(dateStr:string){
  const d=new Date(`${dateStr} ${new Date().getFullYear()}`)
  if(isNaN(+d))return 0
  if(+d>Date.now()+86400000)d.setFullYear(d.getFullYear()-1)
  return Math.floor((Date.now()-+d)/86400000)
}

function Desk({items,setItems,projects,setProjects,milestones,setMilestones,tasks,setTasks,ccrs,setCcrs,ccrItems,setCcrItems,space,openAssistant}:{items:any[],setItems:any,projects:any[],setProjects:any,milestones:any[],setMilestones:any,tasks:any[],setTasks:any,ccrs:any[],setCcrs:any,ccrItems:any[],setCcrItems:any,space:string,openAssistant?:any}) {
  const [asstText,setAsstText]=useState('')
  const [deskSpace,setDeskSpace]=useState(space) // work | home | both — Desk is the one place worlds can meet
  useEffect(()=>{setDeskSpace(space)},[space])
  const inDeskSpace=(x:any)=>deskSpace==='both'?true:spaceOf(x)===deskSpace
  const homeTag=(x:any)=>deskSpace==='both'&&spaceOf(x)==='home'
  // ── CCRs — change requests: To Create → Opened (gets corporate #) → Closed
  const [ccrOpen,setCcrOpen]=useState(true)
  const [showClosedCcrs,setShowClosedCcrs]=useState(false)
  const [ccrExpand,setCcrExpand]=useState<any>({})
  const [ncTitle,setNcTitle]=useState('');const [ncProj,setNcProj]=useState('');const [ncDate,setNcDate]=useState('')
  const [ccrNumEdit,setCcrNumEdit]=useState<any>({})
  const [copiedCcr,setCopiedCcr]=useState<any>(null)
  async function addCcr(){
    if(!ncTitle.trim())return
    const{data,error}=await supabase.from('ccrs').insert({title:ncTitle.trim(),project_id:ncProj||null,target_date:ncDate||null,status:'To Create'}).select().single()
    if(error){alert('Failed to add CCR: '+error.message);return}
    if(data){setCcrs((prev:any[])=>[...prev,data]);setNcTitle('');setNcProj('');setNcDate('')}
    else{const{data:all}=await supabase.from('ccrs').select('*').order('created_at',{ascending:true});if(all)setCcrs(all)}
  }
  async function setCcrField(c:any,fields:any){
    setCcrs((prev:any[])=>prev.map(x=>x.id===c.id?{...x,...fields}:x))
    const{error}=await supabase.from('ccrs').update(fields).eq('id',c.id)
    if(error)alert('Failed to update CCR: '+error.message)
  }
  async function deleteCcr(c:any){
    if(!confirm(`Delete CCR "${c.title}"?`))return
    setCcrs((prev:any[])=>prev.filter(x=>x.id!==c.id))
    await supabase.from('ccrs').delete().eq('id',c.id)
  }
  async function addItemToCcr(ccrId:any,itemId:any){
    if(!itemId)return
    if(ccrItems.some(l=>l.ccr_id===ccrId&&l.item_id===itemId))return
    setCcrItems((prev:any[])=>[...prev,{ccr_id:ccrId,item_id:itemId}])
    const{error}=await supabase.from('ccr_items').insert({ccr_id:ccrId,item_id:itemId})
    if(error){setCcrItems((prev:any[])=>prev.filter(l=>!(l.ccr_id===ccrId&&l.item_id===itemId)));alert('Failed to link item: '+error.message)}
  }
  async function closeCcrWithItems(c:any){
    const linked=ccrItems.filter(l=>l.ccr_id===c.id).map(l=>items.find(x=>x.id===l.item_id)).filter(Boolean)
    const open=linked.filter((x:any)=>!ITEM_TERMINAL.includes(x.status))
    await setCcrField(c,{status:'Closed'})
    if(open.length){
      const yes=confirm(`CCR "${c.title}" closed. Mark its ${open.length} open item${open.length!==1?'s':''} as Done?\n\nOK — items deployed with this change: mark them Done\nCancel — items did NOT ship: remove them from this CCR (they stay open and can join a future CCR)`)
      if(yes){
        let cur=[...items]
        for(const it of open as any[]){
          await applyItemStatus(cur,setItems,it.id,'Done')
          const active=cur.filter(i=>i.id!==it.id&&!ITEM_TERMINAL.includes(i.status)&&i.priority!=='P1'&&i.priority!=='P2')
            .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
          const rank=new Map(active.map((i,idx)=>[i.id,idx]))
          cur=cur.map(i=>i.id===it.id?{...i,status:'Done',committed_priority:null}:rank.has(i.id)?{...i,committed_priority:rank.get(i.id)!}:i)
        }
      }else{
        // Unshipped items don't belong in a closed change — detach so the record is honest and they're free for the next CCR
        const openIds=new Set((open as any[]).map((x:any)=>x.id))
        setCcrItems((prev:any[])=>prev.filter(l=>!(l.ccr_id===c.id&&openIds.has(l.item_id))))
        const{error}=await supabase.from('ccr_items').delete().eq('ccr_id',c.id).in('item_id',[...openIds])
        if(error)alert('CCR closed, but detaching the open items failed: '+error.message)
      }
    }
  }
  async function removeItemFromCcr(ccrId:any,itemId:any){
    setCcrItems((prev:any[])=>prev.filter(l=>!(l.ccr_id===ccrId&&l.item_id===itemId)))
    await supabase.from('ccr_items').delete().eq('ccr_id',ccrId).eq('item_id',itemId)
  }
  async function unflagDev(item:any){
    // dev-only flag clears; a 'both' flag downgrades to stakeholder-only
    const next=(item.flag_audience==='both')?{flagged:true,flag_audience:'stakeholder'}:{flagged:false,flag_audience:null}
    setItems((prev:any[])=>prev.map(i=>i.id===item.id?{...i,...next}:i))
    await supabase.from('items').update(next).eq('id',item.id)
  }
  async function unflagStk(item:any){
    const next=(item.flag_audience==='both')?{flagged:true,flag_audience:'dev'}:{flagged:false,flag_audience:null}
    setItems((prev:any[])=>prev.map(i=>i.id===item.id?{...i,...next}:i))
    await supabase.from('items').update(next).eq('id',item.id)
  }
  const [devOpen,setDevOpen]=useState(true)
  const [stkOpen,setStkOpen]=useState(true)
  const [railOpen,setRailOpen]=useState<any>({due:true,ms:true,vend:true,proj:true})
  const railToggle=(k:string)=>setRailOpen((o:any)=>({...o,[k]:!o[k]}))
  const RailHead=({k,children}:{k:string,children:any})=>(
    <button onClick={()=>railToggle(k)} style={{background:'none',border:'none',padding:0,cursor:'pointer',width:'100%',display:'flex',alignItems:'center',gap:6,...railTitle as any,marginBottom:railOpen[k]?8:0}}>
      <span style={{fontSize:9}}>{railOpen[k]?'▾':'▸'}</span>{children}
    </button>
  )
  const [noteEditId,setNoteEditId]=useState<any>(null)
  const [noteDraft,setNoteDraft]=useState('')
  const [projView,setProjView]=useState<any>(null)
  const [msName,setMsName]=useState('')
  const [msDate,setMsDate]=useState('')
  const [msEditId,setMsEditId]=useState<any>(null)
  const [msEdit,setMsEdit]=useState<any>({name:'',date:'',type:'Milestone'})
  async function saveMsEdit(){
    if(!msEditId||!msEdit.name.trim()||!msEdit.date)return
    const upd={name:msEdit.name.trim(),date:msEdit.date,type:msEdit.type}
    setMilestones((prev:any[])=>prev.map(m=>m.id===msEditId?{...m,...upd}:m))
    setMsEditId(null)
    const{error}=await supabase.from('milestones').update(upd).eq('id',msEditId)
    if(error)alert('Failed to save milestone: '+error.message)
  }
  const [tasksOpen,setTasksOpen]=useState(true)
  const [showDoneTasks,setShowDoneTasks]=useState(false)
  const [editTaskId,setEditTaskId]=useState<any>(null)
  async function saveTaskDate(t:any,newDate:string){
    const upd={due_date:newDate||null}
    setTasks((prev:any[])=>prev.map(x=>x.id===t.id?{...x,...upd}:x))
    setEditTaskId(null)
    await supabase.from('tasks').update(upd).eq('id',t.id)
  }
  const [ntProj,setNtProj]=useState('')
  const [ntSpace,setNtSpace]=useState('work')
  const [ntTitle,setNtTitle]=useState('')
  const [ntDate,setNtDate]=useState('')
  const [mvTitle,setMvTitle]=useState('')
  const [mvDate,setMvDate]=useState('')
  async function updateProj(fields:any){
    if(!projView)return
    const wasTerminal=PROJECT_TERMINAL.includes(projView.status)
    setProjects((prev:any[])=>prev.map(p=>p.id===projView.id?{...p,...fields}:p))
    setProjView((p:any)=>({...p,...fields}))
    const{error}=await supabase.from('projects').update(fields).eq('id',projView.id)
    if(error){alert('Failed to update project: '+error.message);return}
    // Terminal transition: offer to close the project's open items (same flow as the Projects tab)
    if(fields.status&&PROJECT_TERMINAL.includes(fields.status)&&!wasTerminal){
      const open=items.filter(i=>i.parent_project===projView.name&&!ITEM_TERMINAL.includes(i.status))
      if(open.length){
        const home=spaceOf(projView)==='home'
        const itemStatus=fields.status==='Cancelled'?(home?"Won't Do":'Will Not Implement'):'Done'
        const yes=confirm(`"${projView.name}" is now ${fields.status}. Also mark its ${open.length} open item${open.length!==1?'s':''} as ${itemStatus}?\n\nOK — close the items (they move to the Done tab)\nCancel — leave them in the backlog`)
        if(yes)await closeItemsForProject(items,setItems,projView.name,itemStatus)
      }
    }
  }
  const [mcId,setMcId]=useState<any>(null)
  const [mcStart,setMcStart]=useState('')
  const [mcEnd,setMcEnd]=useState('')
  const [qiName,setQiName]=useState('')
  const [qiPri,setQiPri]=useState('P3')
  const [qiType,setQiType]=useState('Bug')
  async function submitQuickItem(){
    if(!qiName.trim()||!projView)return
    const iid=nextItemId(items)
    const{data,error}=await supabase.from('items').insert({
      item_id:iid,name:qiName.trim(),description:'',priority:qiPri,request_type:qiType,
      swimlane:'POS',team:projView.team||'Consumer Experience',effort:'M',status:spaceOf(projView)==='home'?'To Do':'New',
      region:'',vendor:'Deckers',parent_project:projView.name,flagged:false,sort_order:items.length,space:spaceOf(projView),
    }).select().single()
    if(error){alert('Failed to add item: '+error.message);return}
    if(data){setItems((prev:any[])=>[...prev,data]);setQiName('');setQiPri('P3');setQiType('Bug')}
  }
  async function submitModalTask(){
    if(!mvTitle.trim()||!projView)return
    const ok=await addProjectTask(setTasks,projView.id,mvTitle,mvDate||null,spaceOf(projView))
    if(ok){setMvTitle('');setMvDate('')}
  }
  async function submitTask(){
    if(!ntTitle.trim())return
    const proj=ntProj?projects.find(p=>p.id===ntProj):null
    const tSpace=proj?spaceOf(proj):(deskSpace==='home'?'home':deskSpace==='work'?'work':ntSpace)
    const ok=await addProjectTask(setTasks,ntProj||null,ntTitle,ntDate||null,tSpace)
    if(ok){setNtTitle('');setNtDate('')}
  }
  const openTasks=[...tasks].filter(inDeskSpace).filter(t=>!t.done).sort((a,b)=>(a.due_date||'9999')<(b.due_date||'9999')?-1:1)
  const doneTasks=tasks.filter(inDeskSpace).filter(t=>t.done)
  async function toggleMs(m:any){
    const v=!m.completed
    setMilestones((prev:any[])=>prev.map(x=>x.id===m.id?{...x,completed:v}:x))
    await supabase.from('milestones').update({completed:v}).eq('id',m.id)
  }
  async function addMs(){
    if(!msName.trim()||!msDate||!projView) return
    const{data,error}=await supabase.from('milestones').insert({project_id:projView.id,name:msName.trim(),date:msDate,type:'milestone',completed:false,sort_order:milestones.filter(m=>m.project_id===projView.id).length,space:spaceOf(projView)}).select().single()
    if(error){alert('Failed to add milestone: '+error.message);return}
    if(data){setMilestones((prev:any[])=>[...prev,data]);setMsName('');setMsDate('')}
  }
  async function saveNote(item:any){
    setItems((prev:any[])=>prev.map(i=>i.id===item.id?{...i,notes:noteDraft}:i))
    setNoteEditId(null)
    await supabase.from('items').update({notes:noteDraft}).eq('id',item.id)
  }
  const [date,setDate]=useState(localISO(new Date()))
  const [pastDates,setPastDates]=useState<string[]>([])
  useEffect(()=>{
    supabase.from('daily_notes').select('note_date').order('note_date',{ascending:false}).limit(15)
      .then(({data}:any)=>{if(data)setPastDates(data.map((r:any)=>r.note_date))})
  },[date])
  const [noteId,setNoteId]=useState<any>(null)
  const [content,setContent]=useState('')
  const [bothNoteSpace,setBothNoteSpace]=useState('work')
  const noteSpace=deskSpace==='both'?bothNoteSpace:deskSpace
  const [raw,setRaw]=useState(false)
  const [savedAt,setSavedAt]=useState<any>(null)
  const saveTimer=useRef<any>(null)
  const inputRefs=useRef<any>({})
  const pendingFocus=useRef<any>(null)

  useEffect(()=>{(async()=>{
    const{data}=await supabase.from('daily_notes').select('*').order('note_date',{ascending:false})
    const rows=data||[]
    const exact=rows.find((r:any)=>r.note_date===date&&spaceOf(r)===noteSpace)
    if(exact){setNoteId(exact.id);setContent(exact.content||'')}
    else{
      setNoteId(null)
      setContent('')
    }
    setSavedAt(null)
  })()},[date,noteSpace])

  useEffect(()=>{
    if(pendingFocus.current!=null){
      const{idx,caret}=pendingFocus.current
      const el=inputRefs.current[idx]
      if(el){el.focus();if(caret!=null)try{el.setSelectionRange(caret,caret)}catch{}}
      pendingFocus.current=null
    }
  },[content])

  function persist(next:string){
    setContent(next)
    clearTimeout(saveTimer.current)
    saveTimer.current=setTimeout(async()=>{
      if(noteId){
        const{error}=await supabase.from('daily_notes').update({content:next,updated_at:new Date().toISOString()}).eq('id',noteId)
        if(!error)setSavedAt(new Date())
      }else{
        const{data,error}=await supabase.from('daily_notes').insert({note_date:date,content:next,space:noteSpace}).select().single()
        if(error){if(!String(error.message).includes('duplicate'))alert('Save failed: '+error.message);return}
        if(data){setNoteId(data.id);setSavedAt(new Date())}
      }
    },700)
  }

  const lines=content.split('\n')
  const isTask=(l:string)=>l.trimStart().startsWith('[ ]')||l.trimStart().startsWith('[x]')
  const isBullet=(l:string)=>l.trimStart().startsWith('- ')&&!isTask(l)
  function setLine(idx:number,val:string){
    // typing "[]" or "[ ]" at the start of a plain line turns it into a task
    const v=val.replace(/^\[\]\s?/,'[ ] ')
    const ls=content.split('\n');ls[idx]=v;persist(ls.join('\n'))
  }
  function toggle(idx:number){
    const ls=content.split('\n');const l=ls[idx]
    ls[idx]=l.trimStart().startsWith('[ ]')?l.replace('[ ]','[x]'):l.replace('[x]','[ ]')
    persist(ls.join('\n'))
  }
  function onKey(e:any,idx:number){
    const ls=content.split('\n')
    if(e.key==='Enter'){
      e.preventDefault()
      const el=e.currentTarget
      const caret=el.selectionStart??el.value.length
      const before=el.value.slice(0,caret),after=el.value.slice(caret)
      const task=isTask(ls[idx])
      const bullet=isBullet(ls[idx])
      const prefix=task?'[ ] ':bullet?'- ':''
      ls[idx]=(task||bullet)?ls[idx].slice(0,ls[idx].length-el.value.length)+before:before
      ls.splice(idx+1,0,prefix+after)
      persist(ls.join('\n'))
      pendingFocus.current={idx:idx+1,caret:prefix.length}
    }
    if(e.key==='Backspace'&&e.currentTarget.value===''){
      e.preventDefault()
      if(isTask(ls[idx])||isBullet(ls[idx])){ls[idx]=''}  // first backspace: unwrap task/bullet to plain empty line
      else if(ls.length>1){ls.splice(idx,1);pendingFocus.current={idx:Math.max(0,idx-1),caret:null}}
      persist(ls.join('\n'))
    }
  }
  function shiftDate(days:number){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);setDate(localISO(d))}

  const now=new Date();now.setHours(0,0,0,0)
  const in14=+now+14*86400000, in7=+now+7*86400000
  const upMs=milestones.filter(inDeskSpace).filter(m=>!m.completed&&+new Date(m.date+'T12:00:00')>=+now&&+new Date(m.date+'T12:00:00')<=in14)
    .sort((a,b)=>a.date<b.date?-1:1)
  const flaggedDevL=items.filter(inDeskSpace).filter(flagDev)
  const flaggedStkL=items.filter(inDeskSpace).filter(flagStk)
  const vend=items.filter(inDeskSpace).filter(i=>i.vendor_delivery_date&&+new Date(i.vendor_delivery_date+'T12:00:00')<=in7&&!/done|complete|closed|cancel/i.test(i.status||''))
    .sort((a,b)=>a.vendor_delivery_date<b.vendor_delivery_date?-1:1)
  const in5=+now+5*86400000
  const dueSoon=items.filter(inDeskSpace).filter(i=>i.end_date&&+new Date(i.end_date+'T12:00:00')<=in5&&!ITEM_TERMINAL.includes(i.status))
    .sort((a,b)=>a.end_date<b.end_date?-1:1)
  const activeProjects=[...projects].filter(inDeskSpace).filter(p=>!PROJECT_TERMINAL.includes(p.status)).sort((a,b)=>(a.sort_order??999)-(b.sort_order??999))
  const projItems=(p:any)=>items.filter(i=>i.parent_project===p.name&&!/done|complete|closed|cancel|will not/i.test(i.status||''))
    .sort((a:any,b:any)=>((PRIORITY_ORDER[a.priority]??4)-(PRIORITY_ORDER[b.priority]??4))||((a.committed_priority??999)-(b.committed_priority??999)))
  const fmtDt=(str:string)=>new Date(str+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric'})
  const isToday=date===localISO(new Date())
  const dispDate=new Date(date+'T12:00:00').toLocaleDateString('default',{weekday:'long',month:'long',day:'numeric'})
  const mobile=useIsMobile()
  const [deskView,setDeskView]=useState('plan') // mobile: plan | radar | flags
  const railCard={background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'10px 12px',marginBottom:12}
  const railTitle={fontSize:10,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:8}
  const lineInput={flex:1,background:'transparent',border:'none',outline:'none',color:'#F4F6F8',fontSize:14,lineHeight:1.6,fontFamily:'inherit',padding:0}

  return(
    <div style={{height:'100%',display:'flex',flexDirection:(mobile?'column':'row') as any,gap:0,overflow:'hidden'}}>
      {mobile&&(
        <div style={{display:'flex',gap:6,padding:'10px 12px',borderBottom:'1px solid #243447',flexShrink:0}}>
          {([['plan','✎ Plan'],['radar','🎯 Radar'],['flags','🚩 Flags']] as [string,string][]).map(([k,label])=>(
            <button key={k} onClick={()=>setDeskView(k)}
              style={{flex:1,background:deskView===k?'#C8973A':'#12202F',color:deskView===k?'#0D1B2A':'#7A8FA6',border:'1px solid '+(deskView===k?'#C8973A':'#243447'),borderRadius:8,padding:'8px 4px',fontSize:12,fontWeight:700,cursor:'pointer'}}>{label}</button>
          ))}
        </div>
      )}
      {/* Left rail — flagged for discussion, split by audience */}
      <div style={{width:mobile?'100%':270,flexShrink:mobile?1:0,...(mobile?{flex:1,minHeight:0}:{}),borderRight:mobile?'none':'1px solid #243447',padding:mobile?'14px 12px':'18px 14px',overflowY:'auto',display:mobile&&deskView!=='flags'?'none':'block',boxSizing:'border-box' as const}}>
        {deskSpace!=='home'&&(()=>{
          const closed=ccrs.filter(c=>c.status==='Closed')
          const toCreate=ccrs.filter(c=>c.status==='To Create')
          const opened=ccrs.filter(c=>c.status==='Opened')
          const approved=ccrs.filter(c=>c.status==='Approved')
          const rejected=ccrs.filter(c=>c.status==='Rejected')
          const linkFor=(cid:any)=>ccrItems.filter(l=>l.ccr_id===cid).map(l=>items.find(x=>x.id===l.item_id)).filter(Boolean)
          const ccrCard=(c:any)=>{
            const pr=projects.find(p=>p.id===c.project_id)
            const linked=linkFor(c.id)
            const exp=ccrExpand[c.id]
            const overdue=c.target_date&&+new Date(c.target_date+'T12:00:00')<Date.now()&&c.status!=='Closed'
            const inAnyCcr=new Set(ccrItems.map(l=>l.item_id))
            const candidates=items.filter(x=>spaceOf(x)==='work'&&!ITEM_TERMINAL.includes(x.status)&&(!pr||x.parent_project===pr.name)&&!inAnyCcr.has(x.id))
            return(
              <div key={c.id} style={{background:'#12202F',border:'1px solid '+(c.status==='To Create'?'#5A4A2A':'#243447'),borderRadius:8,padding:'8px 10px',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={()=>setCcrExpand((e:any)=>({...e,[c.id]:!e[c.id]}))}>
                  <span style={{fontSize:9,color:'#7A8FA6'}}>{exp?'▾':'▸'}</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{c.title}</span>
                  {c.ccr_number&&<span onClick={e=>{e.stopPropagation();navigator.clipboard.writeText(c.ccr_number).then(()=>{setCopiedCcr(c.id);setTimeout(()=>setCopiedCcr(null),1500)})}}
                    title="Click to copy CCR number"
                    style={{fontSize:9,fontFamily:'monospace',color:copiedCcr===c.id?'#27AE60':'#5DADE2',flexShrink:0,cursor:'copy',border:'1px solid '+(copiedCcr===c.id?'#27AE60':'#24445E'),borderRadius:3,padding:'0 5px'}}>{copiedCcr===c.id?'✓ copied':c.ccr_number}</span>}
                  <span style={{fontSize:9,fontWeight:700,color:c.status==='To Create'?'#E8B95A':c.status==='Opened'?'#5DADE2':c.status==='Approved'?'#27AE60':c.status==='Rejected'?'#E74C3C':'#7A8FA6',flexShrink:0}}>{c.status.toUpperCase()}</span>
                </div>
                <div style={{display:'flex',gap:6,marginTop:3,fontSize:9,color:'#7A8FA6',alignItems:'center',flexWrap:'wrap' as const}}>
                  {pr&&<span style={{borderLeft:`3px solid ${pr.color||'#3A4A5E'}`,paddingLeft:5}}>{pr.name}</span>}
                  {c.target_date&&<span style={{color:overdue?'#E74C3C':'#7A8FA6',fontWeight:overdue?700:400}}>{overdue?'⚠ ':''}{c.target_date}</span>}
                  <span>{linked.length} item{linked.length!==1?'s':''}</span>
                </div>
                {exp&&(
                  <div style={{marginTop:8,borderTop:'1px solid #1A2838',paddingTop:8}}>
                    {linked.map((it:any)=>(
                      <div key={it.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:10,marginBottom:3}}>
                        <span style={{fontFamily:'monospace',color:'#7A8FA6',flexShrink:0}}>{it.item_id}</span>
                        <span style={{color:'#C8C8D4',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{rt(it.request_type)} {it.name}</span>
                        <button onClick={()=>removeItemFromCcr(c.id,it.id)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer',padding:0,flexShrink:0}}>✕</button>
                      </div>
                    ))}
                    {candidates.length>0&&c.status!=='Closed'&&(
                      <select value="" onChange={e=>addItemToCcr(c.id,e.target.value)}
                        style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px dashed #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 6px',marginTop:3,cursor:'pointer'}}>
                        <option value="">+ Add item{pr?` from ${pr.name}`:''}...</option>
                        {candidates.map(x=><option key={x.id} value={x.id}>{x.item_id} — {x.name}</option>)}
                      </select>
                    )}
                    <div style={{display:'flex',gap:5,marginTop:8,alignItems:'center',flexWrap:'wrap' as const}}>
                      {c.status==='To Create'&&(
                        <>
                        <input placeholder="CCR # once opened" value={ccrNumEdit[c.id]??''} onChange={e=>setCcrNumEdit((p:any)=>({...p,[c.id]:e.target.value}))}
                          style={{flex:1,minWidth:90,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:10,padding:'4px 6px'}}/>
                        <button onClick={()=>{setCcrField(c,{status:'Opened',ccr_number:(ccrNumEdit[c.id]||'').trim()||null});setCcrNumEdit((p:any)=>({...p,[c.id]:''}))}}
                          style={{background:'#27AE60',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer'}}>Mark Opened</button>
                        </>
                      )}
                      {c.status==='Opened'&&(
                        <>
                        <input value={c.ccr_number||''} placeholder="CCR #" onChange={e=>setCcrField(c,{ccr_number:e.target.value})}
                          style={{width:100,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#5DADE2',fontSize:10,fontFamily:'monospace',padding:'4px 6px'}}/>
                        <button onClick={()=>setCcrField(c,{status:'Approved'})} style={{background:'#27AE60',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 9px',cursor:'pointer'}}>Approve</button>
                        <button onClick={()=>setCcrField(c,{status:'Rejected'})} style={{background:'#E74C3C',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 9px',cursor:'pointer'}}>Reject</button>
                        </>
                      )}
                      {c.status==='Approved'&&(
                        <>
                        <input value={c.ccr_number||''} placeholder="CCR #" onChange={e=>setCcrField(c,{ccr_number:e.target.value})}
                          style={{width:100,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#5DADE2',fontSize:10,fontFamily:'monospace',padding:'4px 6px'}}/>
                        <button onClick={()=>closeCcrWithItems(c)} style={{background:'#16A085',border:'none',borderRadius:5,color:'#fff',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer'}}>Close</button>
                        </>
                      )}
                      {c.status==='Rejected'&&(
                        <>
                        <input value={c.ccr_number||''} placeholder="CCR #" onChange={e=>setCcrField(c,{ccr_number:e.target.value})}
                          style={{width:100,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#5DADE2',fontSize:10,fontFamily:'monospace',padding:'4px 6px'}}/>
                        <button onClick={()=>setCcrField(c,{status:'Opened'})} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 8px',cursor:'pointer'}}>Resubmit</button>
                        <button onClick={()=>setCcrField(c,{status:'Closed'})} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 8px',cursor:'pointer'}}>Close out</button>
                        </>
                      )}
                      {c.status==='Closed'&&<button onClick={()=>setCcrField(c,{status:'Opened'})} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'4px 8px',cursor:'pointer'}}>Reopen</button>}
                      <input type="date" value={c.target_date||''} onChange={e=>setCcrField(c,{target_date:e.target.value||null})} title="Target date"
                        style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:10,padding:'3px 5px'}}/>
                      <button onClick={()=>deleteCcr(c)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer',padding:0,marginLeft:'auto'}}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
            )
          }
          return(
            <div style={{marginBottom:16}}>
              <button onClick={()=>setCcrOpen(o=>!o)} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,letterSpacing:1,color:'#5DADE2',marginBottom:ccrOpen?8:0,width:'100%'}}>
                <span style={{fontSize:9}}>{ccrOpen?'▾':'▸'}</span>📋 CCRs ({toCreate.length} to create · {opened.length} open{approved.length?` · ${approved.length} approved`:''}{rejected.length?` · ${rejected.length} rejected`:''})
              </button>
              {ccrOpen&&(
                <>
                {toCreate.length===0&&opened.length===0&&approved.length===0&&rejected.length===0&&<div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic',marginBottom:6}}>No open change requests</div>}
                {toCreate.map(ccrCard)}
                {opened.map(ccrCard)}
                {approved.map(ccrCard)}
                {rejected.map(ccrCard)}
                {showClosedCcrs&&closed.map(ccrCard)}
                {closed.length>0&&<button onClick={()=>setShowClosedCcrs(o=>!o)} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:10,cursor:'pointer',padding:'2px 0',marginBottom:6}}>{showClosedCcrs?'Hide':'Show'} {closed.length} closed</button>}
                <div style={{borderTop:'1px dashed #243447',paddingTop:8}}>
                  <input placeholder="New CCR... (e.g., Legion Japan deployment)" value={ncTitle} onChange={e=>setNcTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCcr()}}
                    style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px',marginBottom:5}}/>
                  <div style={{display:'flex',gap:5}}>
                    <select value={ncProj} onChange={e=>setNcProj(e.target.value)} style={{flex:1,minWidth:0,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:10,padding:'4px 6px'}}>
                      <option value="">No project</option>
                      {projects.filter(p=>spaceOf(p)==='work'&&!PROJECT_TERMINAL.includes(p.status)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="date" value={ncDate} onChange={e=>setNcDate(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:10,padding:'4px 5px'}}/>
                    <button onClick={addCcr} disabled={!ncTitle.trim()} style={{background:'#5DADE2',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'4px 10px',cursor:'pointer',opacity:!ncTitle.trim()?0.5:1}}>+ CCR</button>
                  </div>
                </div>
                </>
              )}
            </div>
          )
        })()}
        {(()=>{
          const devProj=projects.filter(p=>inDeskSpace(p)&&flagDev(p)&&!PROJECT_TERMINAL.includes(p.status))
          const stkProj=projects.filter(p=>inDeskSpace(p)&&flagStk(p)&&!PROJECT_TERMINAL.includes(p.status))
          const projRow=(p:any)=>(
            <div key={p.id} style={{background:'#12202F',border:'1px solid rgba(200,151,58,0.35)',borderRadius:8,padding:'7px 9px',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:8,height:8,borderRadius:2,background:p.color||'#3A4A5E',flexShrink:0}}/>
                <span onClick={()=>setProjView(p)} style={{fontSize:12,fontWeight:700,color:'#F4F6F8',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',cursor:'pointer'}}>{homeTag(p)?'🏠 ':''}{p.name}</span>
                <span style={{fontSize:10}}>{p.rag==='Red'?'🔴':p.rag==='Amber'?'🟡':p.rag==='Green'?'🟢':'⚪'}</span>
                <button onClick={async()=>{setProjects((prev:any[])=>prev.map(x=>x.id===p.id?{...x,flagged:false,flag_audience:null}:x));await supabase.from('projects').update({flagged:false,flag_audience:null}).eq('id',p.id)}}
                  title="Unflag" style={{background:'none',border:'none',color:'#3A4A5E',fontSize:12,cursor:'pointer',padding:0,flexShrink:0}}>✕</button>
              </div>
              {p.flag_notes&&<div style={{fontSize:10,color:'#C8C8D4',marginTop:4,lineHeight:1.4,whiteSpace:'pre-wrap' as const}}>{p.flag_notes}</div>}
            </div>
          )
          return([['🚩 DEV FLAGGED',flaggedDevL,devProj,devOpen,setDevOpen,unflagDev],['◉ STAKEHOLDER FLAGGED',flaggedStkL,stkProj,stkOpen,setStkOpen,unflagStk]] as any[]).map(([title,list,projList,open,setOpen,unflag]:any)=>(
          <div key={title} style={railCard as any}>
            <button onClick={()=>setOpen((o:boolean)=>!o)} style={{background:'none',border:'none',padding:0,cursor:'pointer',width:'100%',display:'flex',alignItems:'center',gap:6,...railTitle as any,marginBottom:open?8:0}}>
              <span style={{fontSize:9}}>{open?'▾':'▸'}</span>{title} ({list.length+projList.length})
            </button>
            {open&&list.length===0&&projList.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>Nothing flagged</div>}
            {open&&projList.length>0&&(
              <>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:'#7A8FA6',margin:'2px 0 5px'}}>◈ PROJECTS ({projList.length})</div>
              {projList.map(projRow)}
              {list.length>0&&<div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:'#7A8FA6',margin:'8px 0 5px'}}>≡ ITEMS ({list.length})</div>}
              </>
            )}
            {open&&list.map((i:any)=>{
              const editing=noteEditId===i.id
              return(
                <div key={i.id} onClick={()=>{if(!editing){setNoteEditId(i.id);setNoteDraft(i.notes||'')}}}
                  style={{fontSize:11,marginBottom:10,lineHeight:1.4,position:'relative' as const,paddingRight:16,cursor:editing?'default':'pointer',borderLeft:editing?'2px solid #C8973A':'2px solid transparent',paddingLeft:6}}>
                  <button onClick={e=>{e.stopPropagation();unflag(i)}} title="Remove from this list"
                    style={{position:'absolute',right:0,top:0,background:'none',border:'none',color:'#7A8FA6',fontSize:12,cursor:'pointer',padding:0,lineHeight:1}}>✕</button>
                  <span style={{color:'#F4F6F8',fontWeight:600}}>{rt(i.request_type)} {i.name}</span> <span style={{color:'#7A8FA6',fontSize:10}}>{i.item_id}</span>
                  {!editing&&i.notes&&<div style={{color:'#7A8FA6',fontSize:10,marginTop:1,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical' as const}}>{i.notes}</div>}
                  {editing&&(
                    <div style={{marginTop:5}} onClick={e=>e.stopPropagation()}>
                      <textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} rows={4} autoFocus placeholder="Discussion notes..."
                        style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:6,resize:'vertical' as const,fontFamily:'inherit',lineHeight:1.4}}/>
                      <div style={{display:'flex',gap:6,marginTop:4,justifyContent:'flex-end'}}>
                        <button onClick={()=>setNoteEditId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:10,padding:'2px 8px',cursor:'pointer'}}>Cancel</button>
                        <button onClick={()=>saveNote(i)} style={{background:'#C8973A',border:'none',borderRadius:4,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'2px 10px',cursor:'pointer'}}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))})()}
      </div>
      <div style={{flex:1,minHeight:0,display:mobile&&deskView!=='plan'?'none':'flex',flexDirection:'column' as const,padding:mobile?'12px 12px':'18px 24px',overflow:'hidden',minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          <button onClick={()=>shiftDate(-1)} style={{background:'#1E3048',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',padding:'4px 10px',cursor:'pointer'}}>‹</button>
          <div style={{fontSize:17,fontWeight:800}}>{dispDate}{isToday&&<span style={{fontSize:11,color:'#C8973A',marginLeft:8}}>TODAY</span>}</div>
          <button onClick={()=>shiftDate(1)} style={{background:'#1E3048',border:'1px solid #243447',borderRadius:6,color:'#7A8FA6',padding:'4px 10px',cursor:'pointer'}}>›</button>
          {!isToday&&<button onClick={()=>setDate(localISO(new Date()))} style={{background:'none',border:'1px solid #243447',borderRadius:6,color:'#C8973A',padding:'4px 10px',fontSize:11,cursor:'pointer'}}>Today</button>}
          <div style={{display:'flex',gap:3,marginLeft:8}}>
            {([['work','🏢'],['home','🏠'],['both','⊕']] as [string,string][]).map(([k,icon])=>(
              <button key={k} onClick={()=>setDeskSpace(k)} title={k==='both'?'Combined view':k[0].toUpperCase()+k.slice(1)}
                style={{background:deskSpace===k?'#C8973A':'transparent',color:deskSpace===k?'#0D1B2A':'#7A8FA6',border:'1px solid '+(deskSpace===k?'#C8973A':'#243447'),borderRadius:6,padding:'3px 9px',fontSize:12,fontWeight:700,cursor:'pointer'}}>{icon}</button>
            ))}
          </div>
          <span style={{marginLeft:'auto',fontSize:10,color:'#7A8FA6'}}>{savedAt?`Saved ${savedAt.toLocaleTimeString()}`:''}</span>
{deskSpace==='both'&&(
            <div style={{display:'flex',gap:3,marginRight:8}}>
              {([['work','🏢 Work note'],['home','🏠 Home note']] as [string,string][]).map(([k,label])=>(
                <button key={k} onClick={()=>setBothNoteSpace(k)}
                  style={{background:bothNoteSpace===k?'#1E3048':'transparent',color:bothNoteSpace===k?'#F4F6F8':'#7A8FA6',border:'1px solid '+(bothNoteSpace===k?'#3A4A5E':'#243447'),borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>{label}</button>
              ))}
            </div>
          )}
          <button onClick={()=>setRaw(r=>!r)} style={{background:raw?'#C8973A':'#1E3048',border:'1px solid #243447',borderRadius:6,color:raw?'#0D1B2A':'#7A8FA6',padding:'4px 14px',fontSize:11,fontWeight:700,cursor:'pointer'}}>{raw?'Done':'Raw'}</button>
        </div>
        {openAssistant&&(
          <div style={{display:'flex',gap:7,marginBottom:10}}>
            <input value={asstText} onChange={e=>setAsstText(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&asstText.trim()){openAssistant(asstText.trim());setAsstText('')}}}
              placeholder="💬 Tell the assistant… add an item, create a CCR, ask what's due (🎤 on your keyboard)"
              style={{flex:1,minWidth:0,background:'#0D1B2A',border:'1px solid #243447',borderRadius:8,color:'#F4F6F8',fontSize:12,padding:'8px 11px'}}/>
            <button onClick={()=>{if(asstText.trim()){openAssistant(asstText.trim());setAsstText('')}}} disabled={!asstText.trim()}
              style={{background:'#C8973A',border:'none',borderRadius:8,color:'#0D1B2A',fontSize:12,fontWeight:800,padding:'0 14px',cursor:'pointer',opacity:asstText.trim()?1:0.5}}>➤</button>
          </div>
        )}
        {/* Project tasks — dated reminders attached to projects */}
        <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'10px 14px',marginBottom:12,maxHeight:'38%',display:'flex',flexDirection:'column' as const}}>
          <button onClick={()=>setTasksOpen(o=>!o)} style={{background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:tasksOpen?8:0}}>
            <span style={{fontSize:9}}>{tasksOpen?'▾':'▸'}</span>☑ TASKS ({openTasks.length}{doneTasks.length?` · ${doneTasks.length} done`:''})
          </button>
          {tasksOpen&&(
            <>
            <div style={{overflowY:'auto',flex:1,minHeight:0}}>
              {openTasks.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:6}}>No open tasks — add a reminder below</div>}
              {openTasks.map(t=>{
                const pr=projects.find(p=>p.id===t.project_id)
                const overdue=t.due_date&&+new Date(t.due_date+'T12:00:00')<+now
                const soon=t.due_date&&!overdue&&+new Date(t.due_date+'T12:00:00')<=+now+3*86400000
                return(
                  <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'3px 0'}}>
                    <input type="checkbox" checked={false} onChange={()=>toggleProjectTask(setTasks,t)} style={{cursor:'pointer',flexShrink:0}}/>
                    <span style={{fontSize:13,color:'#F4F6F8',flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{homeTag(t)?'🏠 ':''}{t.title}</span>
                    {pr
                      ?<span style={{fontSize:10,color:'#7A8FA6',background:'#1E3048',borderLeft:`3px solid ${pr.color||'#3A4A5E'}`,borderRadius:3,padding:'1px 7px',flexShrink:0,maxWidth:180,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{pr.name}</span>
                      :<span style={{fontSize:10,color:'#5C6E80',background:'#0F1C2B',border:'1px solid #243447',borderRadius:3,padding:'1px 7px',flexShrink:0}}>General</span>}
                    {editTaskId===t.id
                      ?<input type="date" defaultValue={t.due_date||''} autoFocus onBlur={e=>saveTaskDate(t,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveTaskDate(t,(e.target as HTMLInputElement).value);if(e.key==='Escape')setEditTaskId(null)}}
                          style={{background:'#0D1B2A',border:'1px solid #C8973A',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'2px 5px',flexShrink:0}}/>
                      :<span onClick={()=>setEditTaskId(t.id)} title="Click to edit date"
                          style={{fontSize:11,fontWeight:700,color:overdue?'#E74C3C':soon?'#E8B95A':t.due_date?'#7A8FA6':'#3A4A5E',flexShrink:0,cursor:'pointer',borderBottom:t.due_date?'1px dashed #3A4A5E':'1px dashed #3A4A5E'}}>
                          {overdue?'⚠ ':''}{t.due_date?fmtDt(t.due_date):'+ date'}
                        </span>}
                    <button onClick={()=>deleteProjectTask(setTasks,t)} title="Delete task" style={{background:'none',border:'none',color:'#3A4A5E',fontSize:12,cursor:'pointer',padding:0,flexShrink:0}}>✕</button>
                  </div>
                )
              })}
              {showDoneTasks&&doneTasks.map(t=>{
                const pr=projects.find(p=>p.id===t.project_id)
                return(
                  <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'3px 0',opacity:0.55}}>
                    <input type="checkbox" checked onChange={()=>toggleProjectTask(setTasks,t)} style={{cursor:'pointer',flexShrink:0}}/>
                    <span style={{fontSize:13,color:'#7A8FA6',flex:1,textDecoration:'line-through',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{t.title}</span>
                    {pr&&<span style={{fontSize:10,color:'#7A8FA6',flexShrink:0}}>{pr.name}</span>}
                    <button onClick={()=>deleteProjectTask(setTasks,t)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:12,cursor:'pointer',padding:0,flexShrink:0}}>✕</button>
                  </div>
                )
              })}
              {doneTasks.length>0&&<button onClick={()=>setShowDoneTasks(o=>!o)} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:10,cursor:'pointer',padding:'2px 0'}}>{showDoneTasks?'Hide':'Show'} {doneTasks.length} completed</button>}
            </div>
            <div style={{display:'flex',gap:6,marginTop:8,flexShrink:0}}>
              <select value={ntProj} onChange={e=>setNtProj(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px',maxWidth:180}}>
                <option value="">General</option>
                {activeProjects.map(p=><option key={p.id} value={p.id}>{deskSpace==='both'?(spaceOf(p)==='home'?'🏠 ':'🏢 '):''}{p.name}</option>)}
              </select>
              {deskSpace==='both'&&!ntProj&&(
                <select value={ntSpace} onChange={e=>setNtSpace(e.target.value)} title="Space for this general task"
                  style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 6px'}}>
                  <option value="work">🏢</option><option value="home">🏠</option>
                </select>
              )}
              <input placeholder="New reminder... (e.g., CCR required for deployment)" value={ntTitle} onChange={e=>setNtTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitTask()}}
                style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}/>
              <input type="date" value={ntDate} onChange={e=>setNtDate(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
              <button onClick={submitTask} disabled={!ntTitle.trim()} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 14px',cursor:'pointer',opacity:!ntTitle.trim()?0.5:1}}>+ Task</button>
            </div>
            </>
          )}
        </div>
        {raw?(
          <textarea value={content} onChange={e=>persist(e.target.value)} autoFocus
            style={{flex:1,background:'#0F1C2B',border:'1px solid #243447',borderRadius:10,color:'#F4F6F8',fontSize:14,lineHeight:1.7,padding:16,resize:'none' as const,fontFamily:'inherit',outline:'none'}}/>
        ):(
          <div style={{flex:1,overflowY:'auto',background:'#0F1C2B',border:'1px solid #243447',borderRadius:10,padding:'14px 16px'}}
               onClick={e=>{if(e.target===e.currentTarget){const el=inputRefs.current[lines.length-1];el?.focus()}}}>
            {lines.map((l,idx)=>{
              const t=l.trimStart()
              const task=isTask(l)
              const done=t.startsWith('[x]')
              const header=!task&&isDeskHeader(l)
              const carried=header&&isCarriedHeader(l)
              if(header){
                const sub=isSubHeader(l)
                const shown=l.replace(/\s*↻$/,'')
                return(
                  <div key={idx} style={{display:'flex',alignItems:'center',gap:8,padding:'2px 0',marginTop:idx===0?0:(sub?6:14),borderBottom:sub?'1px dashed #243447':'2px solid #2E4258',paddingLeft:sub?14:0}}>
                    <input ref={el=>{if(el)inputRefs.current[idx]=el}} value={shown}
                      onChange={e=>setLine(idx,e.target.value)}
                      onKeyDown={e=>{
                        if(e.key==='Tab'){
                          e.preventDefault()
                          const ls=content.split('\n')
                          if(e.shiftKey) ls[idx]=ls[idx].replace(/^\s+/,'')
                          else if(!isSubHeader(ls[idx])) ls[idx]='  '+ls[idx]
                          persist(ls.join('\n'));return
                        }
                        onKey(e,idx)
                      }}
                      style={{...lineInput as any,color:sub?'#E8B95A':'#C8973A',fontWeight:800,fontSize:sub?13:16,letterSpacing:sub?0.2:0.5,textTransform:sub?'none' as const:'none' as const}}/>

                  </div>
                )
              }
              const bullet=isBullet(l)
              const raw=task?t.slice(3).replace(/^\s/,''):bullet?t.slice(2):l
              const mIdx=task?raw.indexOf(' ⌁ '):-1
              const main=mIdx>=0?raw.slice(0,mIdx):raw
              const meta=mIdx>=0?raw.slice(mIdx+3):null
              const metaDate=meta?meta.split(' · ').pop()||'':''
              const age=meta?crumbAge(metaDate):0
              return(
                <div key={idx} style={{display:'flex',alignItems:'center',gap:8,padding:'2px 0',paddingLeft:(task||bullet)?24:14}}>
                  {task&&<input type="checkbox" checked={done} onChange={()=>toggle(idx)} style={{cursor:'pointer',flexShrink:0}}/>}
                  {bullet&&<span style={{color:'#C8973A',fontSize:14,lineHeight:1,flexShrink:0,userSelect:'none' as const}}>•</span>}
                  <input ref={el=>{if(el)inputRefs.current[idx]=el}} value={main}
                    onChange={e=>setLine(idx,task?((done?'[x] ':'[ ] ')+e.target.value+(meta?' ⌁ '+meta:'')):bullet?('- '+e.target.value):e.target.value)}
                    onKeyDown={e=>onKey(e,idx)}
                    placeholder={idx===0&&lines.length===1&&!l?'Plan your day...  (type [ ] for a task, end a line with : for a section)':''}
                    style={{...lineInput as any,color:done?'#7A8FA6':'#F4F6F8',textDecoration:done?'line-through':'none'}}/>
                  {meta&&(
                    <span style={{fontSize:10,color:'#5C6E80',flexShrink:0,whiteSpace:'nowrap' as const,marginLeft:'auto',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',paddingLeft:12}} title={`Carried since ${metaDate}`}>
                      {meta.includes(' · ')?meta.slice(0,meta.lastIndexOf(' · ')):''}{meta.includes(' · ')?' · ':''}
                      <span style={{color:age>=5?'#E74C3C':age>=2?'#E8B95A':'#5C6E80',fontWeight:age>=2?700:400}}>{metaDate}</span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{fontSize:10,color:'#7A8FA6',marginTop:6}}>Autosaves · daily scratch pad — durable to-dos go in Tasks above · [ ] = checkbox · - = bullet · end a line with : for a section · 1) or Tab for a sub-section</div>
        {pastDates.filter(d2=>d2<localISO(new Date())).length>0&&(
          <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8,flexWrap:'wrap' as const}}>
            <span style={{fontSize:10,color:'#5C6E80'}}>📋 Past:</span>
            {pastDates.filter(d2=>d2<localISO(new Date())).slice(0,7).map(d2=>{
              const dd=new Date(d2+'T12:00:00')
              return(
                <button key={d2} onClick={()=>setDate(d2)}
                  style={{background:date===d2?'#C8973A':'#0F1C2B',border:'1px solid #243447',borderRadius:10,color:date===d2?'#0D1B2A':'#7A8FA6',fontSize:10,fontWeight:date===d2?700:400,padding:'2px 9px',cursor:'pointer'}}>
                  {dd.toLocaleDateString('default',{month:'short',day:'numeric'})}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div style={{width:mobile?'100%':300,flexShrink:mobile?1:0,...(mobile?{flex:1,minHeight:0}:{}),borderLeft:mobile?'none':'1px solid #243447',padding:mobile?'14px 12px':'18px 16px',overflowY:'auto',display:mobile&&deskView!=='radar'?'none':'block',boxSizing:'border-box' as const}}>
        <div style={railCard as any}>
          <RailHead k="due">🎯 DUE — NEXT 5 DAYS ({dueSoon.length})</RailHead>
          {railOpen.due&&<>
          {dueSoon.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>Nothing due</div>}
          {dueSoon.map(i=>{const overdue=+new Date(i.end_date+'T12:00:00')<+now;return(
            <div key={i.id} style={{fontSize:11,marginBottom:6,lineHeight:1.4}}>
              <span style={{color:overdue?'#E74C3C':'#C8973A',fontWeight:700}}>{fmtDt(i.end_date)}{overdue?' ⚠':''}</span> <span style={{color:'#F4F6F8'}}>{rt(i.request_type)} {i.name}</span>
              <div style={{color:'#7A8FA6',fontSize:10}}>{i.item_id}{i.parent_project?` · ${i.parent_project}`:''} · <span style={{color:sc(i.status)}}>{i.status}</span></div>
            </div>
          )})}
          </>}
        </div>
        <div style={railCard as any}>
          <RailHead k="ms">📅 MILESTONES — NEXT 14 DAYS ({upMs.length})</RailHead>
          {railOpen.ms&&<>
          {upMs.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>None due</div>}
          {upMs.map(m=>{const pr=projects.find(p=>p.id===m.project_id);return(
            <div key={m.id} style={{fontSize:11,marginBottom:6,lineHeight:1.4}}>
              <span style={{color:'#C8973A',fontWeight:700}}>{fmtDt(m.date)}</span> <span style={{color:'#F4F6F8'}}>{m.name}</span>
              {pr&&<div style={{color:'#7A8FA6',fontSize:10}}>{pr.name}</div>}
            </div>
          )})}
          </>}
        </div>
        <div style={railCard as any}>
          <RailHead k="vend">🚚 VENDOR DATES — THIS WEEK ({vend.length})</RailHead>
          {railOpen.vend&&<>
          {vend.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>None due</div>}
          {vend.map(i=>{const overdue=+new Date(i.vendor_delivery_date+'T12:00:00')<+now;return(
            <div key={i.id} style={{fontSize:11,marginBottom:6,lineHeight:1.4}}>
              <span style={{color:overdue?'#E74C3C':'#C8973A',fontWeight:700}}>{fmtDt(i.vendor_delivery_date)}{overdue?' ⚠':''}</span> <span style={{color:'#F4F6F8'}}>{rt(i.request_type)} {i.name}</span>
              <div style={{color:'#7A8FA6',fontSize:10}}>{i.item_id}{i.vendor?` · ${i.vendor}`:''}</div>
            </div>
          )})}
          </>}
        </div>
        <div style={railCard as any}>
          <RailHead k="proj">◈ PRIORITY PROJECTS ({activeProjects.length})</RailHead>
          {railOpen.proj&&<>
          {activeProjects.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No active projects</div>}
          {activeProjects.map((p,pi)=>{
            const pis=projItems(p)
            const shown=pis.slice(0,5)
            return(
              <div key={p.id} onClick={()=>setProjView(p)} style={{marginBottom:10,paddingLeft:8,borderLeft:`3px solid ${p.color||'#3A4A5E'}`,cursor:'pointer'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#F4F6F8',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:'#C8973A'}}>{pi+1}.</span> {p.name}
                  <span style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:p.rag==='Green'?'#27AE60':p.rag==='Amber'?'#E8B95A':p.rag==='Red'?'#E74C3C':'#3A4A5E'}}/>
                </div>
                {shown.map(i=>(
                  <div key={i.id} style={{fontSize:10,color:'#B8C4D0',lineHeight:1.5,paddingLeft:14,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>
                    {rt(i.request_type)} {i.name} <span style={{color:'#7A8FA6'}}>· {i.status}</span>
                  </div>
                ))}
                {pis.length>5&&<div style={{fontSize:9,color:'#7A8FA6',paddingLeft:14}}>+{pis.length-5} more</div>}
              </div>
            )
          })}
          </>}
        </div>
      </div>
      {projView&&(()=>{
        const pms=milestones.filter(m=>m.project_id===projView.id).sort((a,b)=>a.date<b.date?-1:1)
        const pis=items.filter(i=>i.parent_project===projView.name)
          .sort((a:any,b:any)=>((PRIORITY_ORDER[a.priority]??4)-(PRIORITY_ORDER[b.priority]??4))||((a.committed_priority??999)-(b.committed_priority??999)))
        const doneP=pis.filter(i=>i.status==='Done')
        const committed=pis.filter(i=>i.status!=='Done'&&i.start_date&&i.end_date)
        return(
        <div onClick={()=>setProjView(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:250,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#162436',border:'1px solid #243447',borderRadius:12,width:560,maxWidth:'94vw',maxHeight:'86vh',overflowY:'auto',padding:16,boxSizing:'border-box' as const}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
              <span style={{width:12,height:12,borderRadius:3,background:projView.color||'#3A4A5E'}}/>
              <span style={{fontSize:16,fontWeight:800}}>{projView.name}</span>
              <div style={{display:'flex',gap:3}}>
                {(['Green','Amber','Red','—'] as string[]).map(r=>{
                  const active=projView.rag===r||(!projView.rag&&r==='—')
                  const clr=r==='Green'?'#27AE60':r==='Amber'?'#E8B95A':r==='Red'?'#E74C3C':'#7A8FA6'
                  return(
                    <button key={r} onClick={()=>updateProj({rag:r==='—'?null:r})} title={r==='—'?'No RAG':r}
                      style={{background:active?clr+'33':'transparent',border:'1px solid '+(active?clr:'#243447'),borderRadius:4,padding:'1px 6px',fontSize:10,cursor:'pointer',lineHeight:1.5}}>
                      {r==='Green'?'🟢':r==='Amber'?'🟡':r==='Red'?'🔴':'⚪'}
                    </button>
                  )
                })}
              </div>
              <button onClick={()=>{
                  const cur=!projView.flagged?null:(projView.flag_audience||'both')
                  const next=cur===null?{flagged:true,flag_audience:'dev'}
                    :cur==='dev'?{flagged:true,flag_audience:'stakeholder'}
                    :cur==='stakeholder'?{flagged:true,flag_audience:'both'}
                    :{flagged:false,flag_audience:null}
                  updateProj(next)
                }} title={projView.flagged?`Flagged: ${projView.flag_audience||'both'} — click to cycle`:'Click to flag for dev'}
                style={{background:'none',border:'none',cursor:'pointer',fontSize:16,opacity:projView.flagged?1:0.25,lineHeight:1}}>🚩{projView.flagged&&<span style={{fontSize:9,fontWeight:800,color:'#C8973A',verticalAlign:'top'}}>{flagLabel(projView)}</span>}</button>
              <button onClick={()=>setProjView(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer',lineHeight:1}}>✕</button>
            </div>
            {projView.flagged&&(
              <textarea value={projView.flag_notes||''} onChange={e=>updateProj({flag_notes:e.target.value})} placeholder="Discussion notes…" rows={2}
                style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid rgba(200,151,58,0.4)',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'6px 8px',resize:'vertical' as const,fontFamily:'inherit',marginBottom:10,lineHeight:1.4}}/>
            )}
            <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:10,alignItems:'center'}}>
              <select value={projView.status||''} onChange={e=>updateProj({status:e.target.value})} title="Status"
                style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,fontWeight:600,padding:'3px 6px',cursor:'pointer'}}>
                {projectStatusesFor(spaceOf(projView)).map(st=><option key={st} value={st}>{st}</option>)}
              </select>
              <select value={projView.priority||''} onChange={e=>updateProj({priority:e.target.value})} title="Priority"
                style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,fontWeight:600,padding:'3px 6px',cursor:'pointer'}}>
                {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              {spaceOf(projView)==='work'&&(
                <select value={projView.team||''} onChange={e=>updateProj({team:e.target.value})} title="Team"
                  style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,fontWeight:600,padding:'3px 6px',cursor:'pointer'}}>
                  {TEAMS.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <select value={projView.effort||''} onChange={e=>updateProj({effort:e.target.value})} title="Effort — sets the default per-person budget allocation %"
                style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,fontWeight:600,padding:'3px 6px',cursor:'pointer'}}>
                <option value="">Effort…</option>
                {EFFORTS.map(e=><option key={e} value={e}>{e} ({EFFORT_ALLOC[e]}%)</option>)}
              </select>
              <input type="date" value={projView.start_date||''} onChange={e=>updateProj({start_date:e.target.value||null})} title="Start date"
                style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,padding:'2px 5px'}}/>
              <span style={{color:'#7A8FA6',fontSize:10}}>→</span>
              <input type="date" value={projView.end_date||''} disabled={!!projView.ongoing} onChange={e=>updateProj({end_date:e.target.value||null})} title="End date"
                style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,padding:'2px 5px',opacity:projView.ongoing?0.4:1}}/>
              <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#7A8FA6',cursor:'pointer'}} title="Ongoing — no fixed end date">
                <input type="checkbox" checked={!!projView.ongoing} onChange={e=>updateProj({ongoing:e.target.checked,...(e.target.checked?{end_date:null}:{})})}/>∞
              </label>
              <span style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,padding:'3px 8px',fontSize:10,color:'#7A8FA6'}}>Items: <span style={{color:'#F4F6F8',fontWeight:600}}>{committed.length} committed / {pis.length}</span></span>
            </div>
            {projView.description&&<div style={{fontSize:12,color:'#B8C4D0',lineHeight:1.5,marginBottom:12}}>{projView.description}</div>}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:5}}>MILESTONES</div>
              {pms.map(m=>{
                const clr=m.completed?'#27AE60':(+new Date(m.date+'T12:00:00')<Date.now()?'#E74C3C':'#C8973A')
                const editing=msEditId===m.id
                if(editing)return(
                  <div key={m.id} style={{display:'flex',gap:6,alignItems:'center',marginBottom:4,padding:'4px 6px',border:'1px solid #C8973A',borderRadius:6}}>
                    <input value={msEdit.name} onChange={e=>setMsEdit((p:any)=>({...p,name:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')saveMsEdit()}} autoFocus
                      style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 6px'}}/>
                    <input type="date" value={msEdit.date} onChange={e=>setMsEdit((p:any)=>({...p,date:e.target.value}))}
                      style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 6px'}}/>
                    <select value={msEdit.type} onChange={e=>setMsEdit((p:any)=>({...p,type:e.target.value}))}
                      style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 4px'}}>
                      {MILESTONE_TYPES_G.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={()=>setMsEditId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:10,padding:'2px 7px',cursor:'pointer'}}>Cancel</button>
                    <button onClick={saveMsEdit} disabled={!msEdit.name.trim()||!msEdit.date} style={{background:'#C8973A',border:'none',borderRadius:4,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'2px 9px',cursor:'pointer',opacity:!msEdit.name.trim()||!msEdit.date?0.5:1}}>Save</button>
                  </div>
                )
                return(
                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:7,fontSize:11,marginBottom:3}}>
                    <input type="checkbox" checked={!!m.completed} onChange={()=>toggleMs(m)} style={{cursor:'pointer'}} title={m.completed?'Mark incomplete':'Mark complete'}/>
                    <span onClick={()=>{setMsEditId(m.id);setMsEdit({name:m.name||'',date:m.date||'',type:m.type||'Milestone'})}}
                      style={{display:'flex',gap:7,alignItems:'center',cursor:'pointer',flex:1}} title="Click to edit name, date, and type">
                      <span style={{color:clr,fontWeight:700}}>◆ {m.date}</span>
                      <span style={{color:m.completed?'#7A8FA6':'#F4F6F8',textDecoration:m.completed?'line-through':'none'}}>{m.name}</span>
                      {m.type&&m.type!=='Milestone'&&<span style={{fontSize:9,color:'#7A8FA6',border:'1px solid #243447',borderRadius:3,padding:'0 5px'}}>{m.type}</span>}
                    </span>
                  </div>
                )
              })}
              {pms.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:4}}>No milestones yet</div>}
              <div style={{display:'flex',gap:6,marginTop:6}}>
                <input placeholder="New milestone..." value={msName} onChange={e=>setMsName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addMs()}}
                  style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                <input type="date" value={msDate} onChange={e=>setMsDate(e.target.value)}
                  style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                <button onClick={addMs} disabled={!msName.trim()||!msDate} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 12px',cursor:'pointer',opacity:!msName.trim()||!msDate?0.5:1}}>+ Add</button>
              </div>
            </div>
            {(()=>{
              const pTasks=tasks.filter(t=>t.project_id===projView.id&&!t.done).sort((a,b)=>(a.due_date||'9999')<(b.due_date||'9999')?-1:1)
              return(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:5}}>☑ MY TASKS</div>
                  {pTasks.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:4}}>No open tasks</div>}
                  {pTasks.map(t=>{
                    const overdue=t.due_date&&+new Date(t.due_date+'T12:00:00')<Date.now()
                    return(
                      <div key={t.id} style={{display:'flex',alignItems:'center',gap:7,fontSize:11,marginBottom:3}}>
                        <input type="checkbox" checked={false} onChange={()=>toggleProjectTask(setTasks,t)} style={{cursor:'pointer'}}/>
                        <span style={{color:'#F4F6F8',flex:1}}>{t.title}</span>
                        {t.due_date&&<span style={{color:overdue?'#E74C3C':'#C8973A',fontWeight:700,fontSize:10}}>{overdue?'⚠ ':''}{t.due_date}</span>}
                        <button onClick={()=>deleteProjectTask(setTasks,t)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer',padding:0}}>✕</button>
                      </div>
                    )
                  })}
                  <div style={{display:'flex',gap:6,marginTop:5}}>
                    <input placeholder="New task..." value={mvTitle} onChange={e=>setMvTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitModalTask()}}
                      style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                    <input type="date" value={mvDate} onChange={e=>setMvDate(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                    <button onClick={submitModalTask} disabled={!mvTitle.trim()} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 12px',cursor:'pointer',opacity:!mvTitle.trim()?0.5:1}}>+ Add</button>
                  </div>
                </div>
              )
            })()}
            {(()=>{
              const uncommittedP=pis.filter(i=>i.status!=='Done'&&!(i.start_date&&i.end_date))
              const committedI=(i:any)=>!!(i.start_date&&i.end_date)
              async function commitItem(i:any){
                if(!projView.start_date||!projView.end_date){
                  const today=new Date();const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                  setMcStart(projView.start_date&&projView.start_date>iso(today)?projView.start_date:iso(today))
                  setMcEnd(iso(new Date(+today+30*86400000)))
                  setMcId(i.id)
                  return
                }
                const upd={start_date:projView.start_date,end_date:projView.end_date}
                setItems((prev:any[])=>prev.map(x=>x.id===i.id?{...x,...upd}:x))
                await supabase.from('items').update(upd).eq('id',i.id)
              }
              async function confirmModalCommit(){
                if(!mcId||!mcStart||!mcEnd)return
                if(mcEnd<mcStart){alert('End date is before start date.');return}
                const upd={start_date:mcStart,end_date:mcEnd}
                setItems((prev:any[])=>prev.map(x=>x.id===mcId?{...x,...upd}:x))
                setMcId(null)
                await supabase.from('items').update(upd).eq('id',mcId)
              }
              async function uncommitItem(i:any){
                setItems((prev:any[])=>prev.map(x=>x.id===i.id?{...x,start_date:null,end_date:null}:x))
                await supabase.from('items').update({start_date:null,end_date:null}).eq('id',i.id)
              }
              const row=(i:any)=>(
                <div key={i.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,marginBottom:3}}>
                  <span style={{color:'#7A8FA6',fontFamily:'monospace',fontSize:10,flexShrink:0}}>{i.item_id}</span>
                  <span style={{color:'#F4F6F8',flex:1}}>{rt(i.request_type)} {i.name}</span>
                  <select value={i.status||''} onChange={e=>applyItemStatus(items,setItems,i.id,e.target.value)}
                    style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:sc(i.status),fontSize:10,padding:'1px 4px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
                    {statusesFor(spaceOf(i)).map(st=><option key={st} value={st}>{st}</option>)}
                  </select>
                  {i.end_date&&<span style={{color:'#7A8FA6',fontSize:10,flexShrink:0}}>{i.end_date}</span>}
                  {committedI(i)
                    ?<button onClick={()=>uncommitItem(i)} title="Uncommit — clear dates, return to backlog" style={{background:'none',border:'1px solid rgba(231,76,60,0.4)',borderRadius:4,color:'#E74C3C',fontSize:9,fontWeight:700,padding:'1px 7px',cursor:'pointer',flexShrink:0}}>✕ Uncommit</button>
                    :<button onClick={()=>commitItem(i)} title="Commit — set dates to the project timeline" style={{background:'none',border:'1px solid rgba(39,174,96,0.4)',borderRadius:4,color:'#27AE60',fontSize:9,fontWeight:700,padding:'1px 7px',cursor:'pointer',flexShrink:0}}>✓ Commit</button>}
                </div>
              )
              const rowWithCommit=(i:any)=>(
                <div key={i.id}>
                  {row(i)}
                  {mcId===i.id&&(
                    <div style={{display:'flex',gap:5,alignItems:'center',margin:'2px 0 6px',padding:'5px 7px',border:'1px solid #27AE60',borderRadius:6,background:'rgba(39,174,96,0.06)',flexWrap:'wrap' as const}}>
                      <span style={{fontSize:9,color:'#27AE60',fontWeight:700}}>{projView.ongoing?'∞ project — set item dates:':'Project undated — set item dates:'}</span>
                      <input type="date" value={mcStart} onChange={e=>setMcStart(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,padding:'2px 5px'}}/>
                      <span style={{color:'#7A8FA6',fontSize:10}}>→</span>
                      <input type="date" value={mcEnd} onChange={e=>setMcEnd(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:10,padding:'2px 5px'}}/>
                      <button onClick={confirmModalCommit} style={{background:'#27AE60',border:'none',borderRadius:4,color:'#fff',fontSize:9,fontWeight:700,padding:'3px 9px',cursor:'pointer'}}>✓ Commit</button>
                      <button onClick={()=>setMcId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:9,padding:'3px 7px',cursor:'pointer'}}>Cancel</button>
                    </div>
                  )}
                </div>
              )
              return(<>
                {committed.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#27AE60',marginBottom:5}}>✓ COMMITTED ({committed.length})</div>
                    {[...committed].sort((a:any,b:any)=>a.end_date<b.end_date?-1:1).map(row)}
                  </div>
                )}
                {uncommittedP.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#C8973A',marginBottom:5}}>◌ NOT COMMITTED ({uncommittedP.length})</div>
                    {uncommittedP.map(rowWithCommit)}
                  </div>
                )}
                {doneP.length>0&&(
                  <div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#16A085',marginBottom:5}}>✓ DONE ({doneP.length})</div>
                    {doneP.map(i=>(
                      <div key={i.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,marginBottom:3,opacity:0.7}}>
                        <span style={{color:'#7A8FA6',fontFamily:'monospace',fontSize:10,flexShrink:0}}>{i.item_id}</span>
                        <span style={{color:'#9AABBC',flex:1,textDecoration:'line-through',textDecorationColor:'#3A4A5E'}}>{rt(i.request_type)} {i.name}</span>
                        <select value={i.status||''} onChange={e=>applyItemStatus(items,setItems,i.id,e.target.value)}
                          style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#16A085',fontSize:10,padding:'1px 4px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
                          {statusesFor(spaceOf(i)).map(st=><option key={st} value={st}>{st}</option>)}
                        </select>
                        {i.end_date&&<span style={{color:'#7A8FA6',fontSize:10,flexShrink:0}}>{i.end_date}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>)
            })()}
            <div style={{borderTop:'1px solid #243447',marginTop:14,paddingTop:10}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#7A8FA6',marginBottom:6}}>+ ADD ITEM TO THIS PROJECT</div>
              <div style={{display:'flex',gap:6}}>
                <input placeholder="New item name..." value={qiName} onChange={e=>setQiName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitQuickItem()}}
                  style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                <select value={qiPri} onChange={e=>setQiPri(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 6px'}}>
                  {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <select value={qiType} onChange={e=>setQiType(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 6px'}}>
                  {REQUEST_TYPES.map(t=><option key={t} value={t}>{rt(t)} {t}</option>)}
                </select>
                <button onClick={submitQuickItem} disabled={!qiName.trim()} style={{background:'#C8973A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 12px',cursor:'pointer',opacity:!qiName.trim()?0.5:1}}>+ Add</button>
              </div>
              <div style={{fontSize:9,color:'#5C6E80',marginTop:4}}>Lands uncommitted with defaults (New · M · {'{'}team from project{'}'}) — refine in the Backlog anytime</div>
            </div>
          </div>
        </div>
      )
    })()}
  </div>
  )
}


// ── DONE — history of completed projects and items ───────────────────────
function BudgetTab({roles,setRoles,people,setPeople,projects,items,projectRoles,itemAssignments,qBudgets,setQBudgets}:any){
  const [view,setView]=useState('dashboard') // dashboard | capacity | rf | vendor | roster | rates
  const [capSel,setCapSel]=useState<any>(null) // {personId,key} — capacity cell drill-down
  const [rfFy,setRfFy]=useState<any>(null)
  const [rfNewDept,setRfNewDept]=useState('')
  const [rfNewQ,setRfNewQ]=useState('1')
  const [rfNewLabel,setRfNewLabel]=useState('Original')
  const [rfNewCapex,setRfNewCapex]=useState('')
  const [rfNewOpex,setRfNewOpex]=useState('')
  const [rfSel,setRfSel]=useState<any>(null) // {dept,q} — RF quarter card drill-down
  const [vendorFy,setVendorFy]=useState<any>(null)
  const [tcSel,setTcSel]=useState<any>(null) // {personId,key} — Team Cost cell drill-down
  const [capWindow,setCapWindow]=useState('6')
  const [tcWindow,setTcWindow]=useState('6')
  const [tbWindow,setTbWindow]=useState('fy')
  const [newRoleName,setNewRoleName]=useState('')
  const [newRoleRate,setNewRoleRate]=useState('')
  const [newPersonName,setNewPersonName]=useState('')
  const [newPersonRole,setNewPersonRole]=useState('')
  const [newPersonRate,setNewPersonRate]=useState('')
  const [newPersonTeam,setNewPersonTeam]=useState('')
  const [newPersonVendor,setNewPersonVendor]=useState('')
  const [newPersonDept,setNewPersonDept]=useState('')
  const [exporting,setExporting]=useState(false)

  async function updRole(id:any,fields:any){
    setRoles((prev:any[])=>prev.map(r=>r.id===id?{...r,...fields}:r))
    await supabase.from('roles').update(fields).eq('id',id)
  }
  async function addRole(){
    if(!newRoleName.trim())return
    const{data,error}=await supabase.from('roles').insert({name:newRoleName.trim(),hourly_rate:parseFloat(newRoleRate)||0,type:'contractor',sort_order:roles.length}).select().single()
    if(error){alert('Failed to add role: '+error.message);return}
    if(data){setRoles((prev:any[])=>[...prev,data]);setNewRoleName('');setNewRoleRate('')}
  }
  async function deleteRole(id:any){
    if(!confirm('Delete this role? People assigned to it will show as unassigned until given a new role.'))return
    setRoles((prev:any[])=>prev.filter(r=>r.id!==id))
    await supabase.from('roles').delete().eq('id',id)
  }
  async function updPerson(id:any,fields:any){
    setPeople((prev:any[])=>prev.map(p=>p.id===id?{...p,...fields}:p))
    await supabase.from('people').update(fields).eq('id',id)
  }
  async function addPerson(){
    if(!newPersonName.trim())return
    const{data,error}=await supabase.from('people').insert({name:newPersonName.trim(),role_id:newPersonRole||null,rate_override:newPersonRate?parseFloat(newPersonRate):null,team:newPersonTeam||null,vendor:newPersonVendor.trim()||null,department:newPersonDept.trim()||null,active:true,sort_order:people.length}).select().single()
    if(error){alert('Failed to add person: '+error.message);return}
    if(data){setPeople((prev:any[])=>[...prev,data]);setNewPersonName('');setNewPersonRole('');setNewPersonRate('');setNewPersonTeam('');setNewPersonVendor('');setNewPersonDept('')}
  }
  async function deletePerson(id:any){
    if(!confirm('Remove this person from the roster? Their existing item assignments stay on record but will show as "(removed)".'))return
    setPeople((prev:any[])=>prev.filter(p=>p.id!==id))
    await supabase.from('people').delete().eq('id',id)
  }

  const activeProjects=projects.filter((p:any)=>!PROJECT_TERMINAL.includes(p.status))
  const rollup=activeProjects.map((p:any)=>{
    const fc=projectForecast(p,projectRoles,roles)
    const ac=projectActual(p,items,itemAssignments,people,roles)
    const elapsedPct=fc.unset?null:Math.min(100,Math.max(0,Math.round((Date.now()-(+new Date(p.start_date+'T12:00:00')))/((+new Date(p.end_date+'T12:00:00'))-(+new Date(p.start_date+'T12:00:00')))*100)))
    const spentPct=fc.total>0?Math.round(ac.total/fc.total*100):null
    return{project:p,fc,ac,elapsedPct,spentPct}
  })
  const portfolioForecast=rollup.reduce((a,r)=>a+r.fc.total,0)
  const portfolioActual=rollup.reduce((a,r)=>a+r.ac.total,0)

  async function exportExcel(){
    setExporting(true)
    try{
      const ExcelJS=(await import('exceljs')).default||(await import('exceljs'))
      const wb=new ExcelJS.Workbook()
      wb.creator='Perfect Game'
      wb.created=new Date()
      const NAVY='FF1F3B57',WHITE='FFFFFFFF',LIGHT='FFEAF0F6',RED='FFE74C3C',GREEN='FF27AE60'
      const USD='"$"#,##0'
      const PCT='0"%"'
      // Styles every sheet in the workbook the same way — this is the whole "professional,
      // not a bad extract" ask: real bold headers, real currency formats, frozen header row.
      function styleSheet(ws:any,opts:{headerRow?:number,moneyCols?:number[],pctCols?:number[],boldCols?:number[],totalRow?:number}={}){
        const hRow=opts.headerRow||1
        ws.getRow(hRow).eachCell((cell:any)=>{
          cell.font={bold:true,color:{argb:WHITE}}
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}}
          cell.alignment={vertical:'middle'}
          cell.border={bottom:{style:'thin',color:{argb:'FF3A4A5E'}}}
        })
        ws.views=[{state:'frozen',ySplit:hRow}]
        ws.autoFilter={from:{row:hRow,column:1},to:{row:hRow,column:ws.columnCount}}
        for(const c of(opts.moneyCols||[]))ws.getColumn(c).numFmt=USD
        for(const c of(opts.pctCols||[]))ws.getColumn(c).numFmt=PCT
        if(opts.totalRow){
          const r=ws.getRow(opts.totalRow)
          r.eachCell((cell:any)=>{cell.font={bold:true};cell.border={top:{style:'medium',color:{argb:'FF3A4A5E'}}}})
        }
      }
      const boldRow=(ws:any,rowNum:number,color?:string)=>{
        ws.getRow(rowNum).eachCell((cell:any)=>{cell.font={bold:true,color:color?{argb:color}:undefined}})
      }

      // ── 1. Portfolio Summary (Dashboard tab) ──
      const ws1=wb.addWorksheet('Portfolio Summary')
      ws1.columns=[{header:'Project',key:'p',width:32},{header:'Forecast',key:'f',width:14},{header:'Actual to Date',key:'a',width:16},{header:'Delta',key:'d',width:12},{header:'% Timeline Elapsed',key:'e',width:18},{header:'% Budget Spent',key:'s',width:15}]
      rollup.forEach((r:any)=>ws1.addRow({p:r.project.name,f:Math.round(r.fc.total),a:Math.round(r.ac.total),d:Math.round(r.ac.total-r.fc.total),e:r.elapsedPct==null?null:r.elapsedPct,s:r.spentPct==null?null:r.spentPct}))
      const t1=ws1.addRow({p:'TOTAL',f:Math.round(portfolioForecast),a:Math.round(portfolioActual),d:Math.round(portfolioActual-portfolioForecast)})
      styleSheet(ws1,{moneyCols:[2,3,4],pctCols:[5,6],totalRow:t1.number})

      // ── 2. Per-Project Detail (Dashboard drill-down) ──
      const ws2=wb.addWorksheet('Per-Project Detail')
      ws2.columns=[{header:'Project',key:'p',width:28},{header:'Layer',key:'l',width:10},{header:'Role',key:'r',width:18},{header:'Hours / Alloc',key:'h',width:16},{header:'Rate',key:'ra',width:10},{header:'Cost',key:'c',width:12}]
      rollup.forEach((r:any)=>{
        boldRow(ws2,ws2.addRow({p:r.project.name,l:'FORECAST'}).number,'FF5DADE2')
        r.fc.byRole.forEach((b:any)=>ws2.addRow({r:b.role,h:`${b.headcount}x @ ${b.allocation_pct}%`,ra:b.rate,c:Math.round(b.cost)}))
        boldRow(ws2,ws2.addRow({p:r.project.name,l:'ACTUAL'}).number,'FF27AE60')
        r.ac.byRole.forEach((b:any)=>ws2.addRow({r:b.role,c:Math.round(b.cost)}))
        ws2.addRow({})
      })
      ws2.getColumn(5).numFmt=USD;ws2.getColumn(6).numFmt=USD
      ws2.getRow(1).eachCell((cell:any)=>{cell.font={bold:true,color:{argb:WHITE}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}}})
      ws2.views=[{state:'frozen',ySplit:1}]

      // ── 3. Budget by Period (FY/Quarter/Month) ──
      const monthMap=new Map<string,{forecast:number,actual:number}>()
      const bump=(key:string,field:'forecast'|'actual',amt:number)=>{
        const cur=monthMap.get(key)||{forecast:0,actual:0}
        cur[field]+=amt
        monthMap.set(key,cur)
      }
      for(const row of projectRoles){
        const proj=activeProjects.find((p:any)=>p.id===row.project_id)
        if(!proj||!proj.start_date)continue
        const end=proj.end_date||localISO(new Date(Date.now()+180*86400000))
        const role=roles.find((r:any)=>r.id===row.role_id)
        const rate=row.person_id?rateOf(people.find((p:any)=>p.id===row.person_id),roles):(role?.hourly_rate||0)
        const mult=row.person_id?1:(row.headcount||1)
        for(const m of monthlyRowCost(row.allocation_pct,rate,proj.start_date,end))bump(m.key,'forecast',m.cost*mult)
      }
      for(const r of rollup){
        for(const row of r.ac.rows){
          const it=items.find((x:any)=>x.id===row.item_id)
          if(!it)continue
          for(const m of monthlyHoursCost(row.hours,row.rate,it.start_date,it.end_date))bump(m.key,'actual',m.cost)
        }
      }
      const ws3=wb.addWorksheet('Budget by Period')
      ws3.columns=[{header:'Month',key:'m',width:12},{header:'Fiscal Year',key:'fy',width:10},{header:'Quarter',key:'q',width:9},{header:'Forecast',key:'f',width:14},{header:'Actual',key:'a',width:14},{header:'Delta',key:'d',width:12}]
      ;[...monthMap.keys()].sort().forEach(k=>{
        const v=monthMap.get(k)!;const fy=fyOf(`${k}-15`)
        ws3.addRow({m:monthLabel(k),fy:`FY${fy.fy}`,q:`Q${fy.quarter}`,f:Math.round(v.forecast),a:Math.round(v.actual),d:Math.round(v.actual-v.forecast)})
      })
      styleSheet(ws3,{moneyCols:[4,5,6]})

      // ── 4. Capacity (Capacity tab) — uses the window currently selected in-app ──
      const capKeys=buildMonthKeys(capWindow)
      const{perPerson:capPerPerson}=capacityByMonth(projects,projectRoles,people,roles)
      const ws4=wb.addWorksheet('Capacity')
      ws4.columns=[{header:'Person',key:'n',width:20},{header:'Role',key:'r',width:16},{header:'Team',key:'t',width:20},...capKeys.map((k:string)=>({header:monthLabel(k),key:k,width:12}))]
      const capTeamOrder=[...TEAMS,'']
      for(const t of capTeamOrder){
        const grp=people.filter((p:any)=>p.active&&(p.team||'')===t)
        if(!grp.length)continue
        boldRow(ws4,ws4.addRow({n:(t||'No Team').toUpperCase()}).number,'FF5DADE2')
        for(const p of grp){
          const pm=capPerPerson.get(p.id)
          const row:any={n:p.name,r:roles.find((x:any)=>x.id===p.role_id)?.name||'—',t:p.team||''}
          capKeys.forEach((k:string)=>{row[k]=pm?.get(k)?Math.round(pm.get(k)!.pct):null})
          ws4.addRow(row)
        }
      }
      ws4.getRow(1).eachCell((cell:any)=>{cell.font={bold:true,color:{argb:WHITE}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}}})
      ws4.views=[{state:'frozen',xSplit:3,ySplit:1}]
      capKeys.forEach((_:string,ix:number)=>ws4.getColumn(4+ix).numFmt=PCT)

      // ── 5. Team Cost (Team Cost tab) — uses the window currently selected in-app ──
      const tcKeys=buildMonthKeys(tcWindow)
      const ws5=wb.addWorksheet('Team Cost')
      const tcCols:any[]=[{header:'Person',key:'n',width:20},{header:'Role',key:'r',width:16},{header:'Team',key:'t',width:20}]
      tcKeys.forEach((k:string)=>{tcCols.push({header:`${monthLabel(k)} Allocated`,key:k+'_a',width:16});tcCols.push({header:`${monthLabel(k)} Full Cost`,key:k+'_f',width:15})})
      ws5.columns=tcCols
      for(const t of capTeamOrder){
        const grp=people.filter((p:any)=>p.active&&(p.team||'')===t)
        if(!grp.length)continue
        boldRow(ws5,ws5.addRow({n:(t||'No Team').toUpperCase()}).number,'FF5DADE2')
        for(const p of grp){
          const rate=rateOf(p,roles)
          const pm=capPerPerson.get(p.id)
          const row:any={n:p.name,r:roles.find((x:any)=>x.id===p.role_id)?.name||'—',t:p.team||''}
          tcKeys.forEach((k:string)=>{row[k+'_a']=Math.round(pm?.get(k)?.cost||0);row[k+'_f']=Math.round(fullCostForMonth(k,rate))})
          ws5.addRow(row)
        }
      }
      ws5.getRow(1).eachCell((cell:any)=>{cell.font={bold:true,color:{argb:WHITE}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}}})
      ws5.views=[{state:'frozen',xSplit:3,ySplit:1}]
      for(let c=4;c<=tcCols.length;c++)ws5.getColumn(c).numFmt=USD

      // ── 6. RF Budget + FY Summary (RF Budget tab) — current FY, all departments ──
      const curFy=fyOf(localISO(new Date())).fy
      const{totals:qRollup}=quarterlyRollup(projects,projectRoles,itemAssignments,items,people,roles)
      const depts=[...new Set(people.map((p:any)=>p.department).filter(Boolean))]
      const ws6=wb.addWorksheet(`RF Budget FY${curFy}`)
      ws6.columns=[{header:'Department',key:'d',width:20},{header:'Quarter',key:'q',width:9},{header:'Label',key:'l',width:9},{header:'CapEx Approved',key:'ca',width:15},{header:'CapEx Actual',key:'ct',width:14},{header:'OpEx Approved',key:'oa',width:15},{header:'OpEx Actual',key:'ot',width:14}]
      let fyAllocC=0,fyAllocO=0,fyActC=0,fyActO=0,fyCeilC=0,fyCeilO=0
      for(const dept of depts){
        for(let q=1;q<=4;q++){
          const revs=qBudgets.filter((b:any)=>b.department===dept&&b.fiscal_year===curFy&&b.quarter===q).sort((a:any,b:any)=>a.created_at<b.created_at?1:-1)
          const bud=revs[0]
          const r=qRollup.get(`${curFy}-${q}-${dept}`)||{allocCapex:0,allocOpex:0,actCapex:0,actOpex:0}
          fyAllocC+=r.allocCapex;fyAllocO+=r.allocOpex;fyActC+=r.actCapex;fyActO+=r.actOpex
          if(bud){fyCeilC+=bud.capex_approved;fyCeilO+=bud.opex_approved}
          if(!bud&&r.allocCapex===0&&r.allocOpex===0&&r.actCapex===0&&r.actOpex===0)continue
          ws6.addRow({d:dept,q:`Q${q}`,l:bud?.label||'—',ca:bud?Math.round(bud.capex_approved):null,ct:Math.round(r.actCapex),oa:bud?Math.round(bud.opex_approved):null,ot:Math.round(r.actOpex)})
        }
      }
      const t6=ws6.addRow({d:'FY TOTAL',ca:Math.round(fyCeilC)||null,ct:Math.round(fyActC),oa:Math.round(fyCeilO)||null,ot:Math.round(fyActO)})
      styleSheet(ws6,{moneyCols:[4,5,6,7],totalRow:t6.number})

      // ── 7. By Vendor + FY Total (Vendor tab) — current FY ──
      const vr=vendorRollup(projects,itemAssignments,items,people,roles)
      const vCell=(vendor:string,q:number)=>vr.get(vendor)?.get(`${curFy}-${q}`)||{capex:0,opex:0}
      const ws7=wb.addWorksheet(`By Vendor FY${curFy}`)
      ws7.columns=[{header:'Vendor',key:'v',width:18},
        {header:'Q1 CapEx',key:'q1c',width:11},{header:'Q1 OpEx',key:'q1o',width:11},
        {header:'Q2 CapEx',key:'q2c',width:11},{header:'Q2 OpEx',key:'q2o',width:11},
        {header:'Q3 CapEx',key:'q3c',width:11},{header:'Q3 OpEx',key:'q3o',width:11},
        {header:'Q4 CapEx',key:'q4c',width:11},{header:'Q4 OpEx',key:'q4o',width:11},
        {header:'FY CapEx',key:'fc',width:13},{header:'FY OpEx',key:'fo',width:13},{header:'FY Total',key:'ft',width:13}]
      const vSorted=[...vr.keys()].map(vendor=>{
        let capex=0,opex=0
        for(let q=1;q<=4;q++){const c=vCell(vendor,q);capex+=c.capex;opex+=c.opex}
        return{vendor,capex,opex}
      }).sort((a,b)=>(b.capex+b.opex)-(a.capex+a.opex))
      vSorted.forEach(v=>{
        const row:any={v:v.vendor}
        ;[1,2,3,4].forEach(q=>{const c=vCell(v.vendor,q);row[`q${q}c`]=Math.round(c.capex);row[`q${q}o`]=Math.round(c.opex)})
        row.fc=Math.round(v.capex);row.fo=Math.round(v.opex);row.ft=Math.round(v.capex+v.opex)
        ws7.addRow(row)
      })
      const t7row:any={v:'TOTAL'}
      ;[1,2,3,4].forEach(q=>{t7row[`q${q}c`]=Math.round(vSorted.reduce((s,v)=>s+vCell(v.vendor,q).capex,0));t7row[`q${q}o`]=Math.round(vSorted.reduce((s,v)=>s+vCell(v.vendor,q).opex,0))})
      t7row.fc=Math.round(vSorted.reduce((s,v)=>s+v.capex,0));t7row.fo=Math.round(vSorted.reduce((s,v)=>s+v.opex,0));t7row.ft=t7row.fc+t7row.fo
      const t7=ws7.addRow(t7row)
      styleSheet(ws7,{moneyCols:[2,3,4,5,6,7,8,9,10,11,12],totalRow:t7.number})

      // ── 8. Rate Card (Rate Card tab) ──
      const ws8=wb.addWorksheet('Rate Card')
      ws8.columns=[{header:'Role',key:'n',width:22},{header:'Type',key:'t',width:14},{header:'Hourly Rate',key:'r',width:14},{header:'CapEx Eligible',key:'e',width:14},{header:'CapEx / OpEx Split',key:'s',width:16}]
      roles.forEach((r:any)=>ws8.addRow({n:r.name,t:r.type||'contractor',r:r.hourly_rate,e:(r.capex_eligible??true)?'Yes':'No',s:(r.capex_eligible??true)?`${r.capex_pct??80}% / ${100-(r.capex_pct??80)}%`:'0% / 100%'}))
      ws8.getColumn(3).numFmt=USD
      styleSheet(ws8,{moneyCols:[3]})

      // ── 9. Roster (Roster tab) — role-level rate shown, no editorializing ──
      const ws9=wb.addWorksheet('Roster')
      ws9.columns=[{header:'Name',key:'n',width:20},{header:'Role',key:'r',width:18},{header:'Team',key:'t',width:20},{header:'Department',key:'d',width:18},{header:'Vendor',key:'v',width:16},{header:'Rate',key:'ra',width:12},{header:'Active',key:'a',width:9}]
      people.forEach((p:any)=>ws9.addRow({n:p.name,r:roles.find((x:any)=>x.id===p.role_id)?.name||'—',t:p.team||'',d:p.department||'',v:p.vendor||'',ra:rateOf(p,roles),a:p.active?'Yes':'No'}))
      styleSheet(ws9,{moneyCols:[6]})

      const buf=await wb.xlsx.writeBuffer()
      const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url;a.download=`Budget Report — ${localISO(new Date())}.xlsx`
      document.body.appendChild(a);a.click();document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }catch(e:any){alert('Export failed: '+(e?.message||e))}
    setExporting(false)
  }

  return(
    <div style={{height:'100%',overflowY:'auto',padding:'20px 28px'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
        <span style={{fontSize:20,fontWeight:800,color:'#F4F6F8'}}>$ Budget</span>
        <div style={{display:'flex',gap:4,marginLeft:16}}>
          {[['dashboard','Dashboard'],['capacity','Capacity'],['teamcost','Team Cost'],['teambudget','Team Budget'],['rf','RF Budget'],['vendor','Vendor'],['roster','Roster'],['rates','Rate Card']].map(([k,label])=>(
            <button key={k} onClick={()=>setView(k)} style={{background:view===k?'#C8973A':'#1E3048',color:view===k?'#0D1B2A':'#7A8FA6',border:'1px solid '+(view===k?'#C8973A':'#243447'),borderRadius:6,padding:'6px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>{label}</button>
          ))}
        </div>
        {view==='dashboard'&&<button onClick={exportExcel} disabled={exporting} style={{marginLeft:'auto',background:'#27AE60',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:700,padding:'7px 16px',cursor:'pointer',opacity:exporting?0.6:1}}>{exporting?'Exporting…':'⬇ Excel — for leadership'}</button>}
      </div>

      {view==='rates'&&(
        <div style={{maxWidth:640}}>
          <div style={{fontSize:11,color:'#7A8FA6',marginBottom:12,lineHeight:1.5}}>The rate card. Every project roster row and roster person pulls its default rate from here.</div>
          {roles.map((r:any)=>(
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,background:'#12202F',border:'1px solid #243447',borderRadius:8,padding:'8px 12px',marginBottom:6}}>
              <input value={r.name} onChange={e=>updRole(r.id,{name:e.target.value})} style={{flex:1,background:'transparent',border:'none',color:'#F4F6F8',fontSize:13,fontWeight:600}}/>
              <select value={r.type||'contractor'} onChange={e=>updRole(r.id,{type:e.target.value})} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'4px 6px'}}>
                <option value="contractor">Contractor</option><option value="fte">FTE</option>
              </select>
              <div style={{display:'flex',alignItems:'center',gap:3}}>
                <span style={{color:'#7A8FA6',fontSize:12}}>$</span>
                <input type="number" value={r.hourly_rate} onChange={e=>updRole(r.id,{hourly_rate:parseFloat(e.target.value)||0})} style={{width:70,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'4px 6px'}}/>
                <span style={{color:'#7A8FA6',fontSize:11}}>/hr</span>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#7A8FA6',cursor:'pointer'}} title="Can this role's time be capitalized on a Build project?">
                <input type="checkbox" checked={r.capex_eligible??true} onChange={e=>updRole(r.id,{capex_eligible:e.target.checked})}/>CapEx
              </label>
              {(r.capex_eligible??true)&&(
                <div style={{display:'flex',alignItems:'center',gap:3}}>
                  <input type="number" value={r.capex_pct??80} onChange={e=>updRole(r.id,{capex_pct:parseFloat(e.target.value)||0})} style={{width:40,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'4px 4px'}}/>
                  <span style={{color:'#7A8FA6',fontSize:10}}>/{100-(r.capex_pct??80)}</span>
                </div>
              )}
              <button onClick={()=>deleteRole(r.id)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:13,cursor:'pointer'}}>🗑</button>
            </div>
          ))}
          <div style={{display:'flex',gap:6,marginTop:10}}>
            <input value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} placeholder="New role name" style={{flex:1,background:'#12202F',border:'1px dashed #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'7px 10px'}}/>
            <input type="number" value={newRoleRate} onChange={e=>setNewRoleRate(e.target.value)} placeholder="$/hr" style={{width:90,background:'#12202F',border:'1px dashed #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'7px 10px'}}/>
            <button onClick={addRole} style={{background:'#5DADE2',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:700,padding:'0 16px',cursor:'pointer'}}>+ Add</button>
          </div>
        </div>
      )}

      {view==='roster'&&(
        <div style={{maxWidth:980}}>
          <div style={{fontSize:11,color:'#7A8FA6',marginBottom:12,lineHeight:1.5}}>Named people you assign to items (Layer 2 — actuals). Leave rate blank to inherit the role's rate card price.</div>
          {(()=>{
            const teamOptions=[...new Set([...TEAMS,...people.map((p:any)=>p.team).filter(Boolean)])]
            const TeamSelect=({value,onChange}:any)=>(
              <select value={teamOptions.includes(value)?value:''} onChange={e=>{
                  if(e.target.value==='__new__'){const v=prompt('New team name:');if(v&&v.trim())onChange(v.trim())}
                  else onChange(e.target.value||null)
                }} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'4px 6px'}}>
                <option value="">No team</option>
                {teamOptions.map(t=><option key={t} value={t}>{t}</option>)}
                <option value="__new__">+ Add new…</option>
              </select>
            )
            const deptOptions=[...new Set(['OMNI Engineering','OMNI Consumer',...people.map((p:any)=>p.department).filter(Boolean)])]
            const vendorOptions=[...new Set(['Toptal','EPAM',...people.map((p:any)=>p.vendor).filter(Boolean)])]
            const DeptSelect=({value,onChange}:any)=>(
              <select value={deptOptions.includes(value)?value:''} onChange={e=>{
                  if(e.target.value==='__new__'){const v=prompt('New department name:');if(v&&v.trim())onChange(v.trim())}
                  else onChange(e.target.value||null)
                }} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'4px 6px'}}>
                <option value="">No department</option>
                {deptOptions.map(d=><option key={d} value={d}>{d}</option>)}
                <option value="__new__">+ Add new…</option>
              </select>
            )
            const VendorSelect=({value,onChange}:any)=>(
              <select value={vendorOptions.includes(value)?value:''} onChange={e=>{
                  if(e.target.value==='__new__'){const v=prompt('New vendor name:');if(v&&v.trim())onChange(v.trim())}
                  else onChange(e.target.value||null)
                }} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'4px 6px'}}>
                <option value="">No vendor</option>
                {vendorOptions.map(v=><option key={v} value={v}>{v}</option>)}
                <option value="__new__">+ Add new…</option>
              </select>
            )
            return(
            <>
          {people.map((p:any)=>(
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,background:p.active?'#12202F':'#0D1B2A',opacity:p.active?1:0.5,border:'1px solid #243447',borderRadius:8,padding:'8px 12px',marginBottom:6}}>
              <input value={p.name} onChange={e=>updPerson(p.id,{name:e.target.value})} style={{flex:1,background:'transparent',border:'none',color:'#F4F6F8',fontSize:13,fontWeight:600}}/>
              <select value={p.role_id||''} onChange={e=>updPerson(p.id,{role_id:e.target.value||null})} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11,padding:'4px 6px'}}>
                <option value="">No role</option>
                {roles.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <TeamSelect value={p.team||''} onChange={(v:any)=>updPerson(p.id,{team:v})}/>
              <DeptSelect value={p.department||''} onChange={(v:any)=>updPerson(p.id,{department:v})}/>
              <VendorSelect value={p.vendor||''} onChange={(v:any)=>updPerson(p.id,{vendor:v})}/>
              <div style={{display:'flex',alignItems:'center',gap:3}} title="Blank = inherit role's rate">
                <span style={{color:'#7A8FA6',fontSize:12}}>$</span>
                <input type="number" value={p.rate_override??''} onChange={e=>updPerson(p.id,{rate_override:e.target.value?parseFloat(e.target.value):null})} placeholder={String(roles.find((r:any)=>r.id===p.role_id)?.hourly_rate||'—')} style={{width:70,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:12,padding:'4px 6px'}}/>
                <span style={{color:'#7A8FA6',fontSize:11}}>/hr</span>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#7A8FA6',cursor:'pointer'}}>
                <input type="checkbox" checked={p.active} onChange={e=>updPerson(p.id,{active:e.target.checked})}/>Active
              </label>
              <button onClick={()=>deletePerson(p.id)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:13,cursor:'pointer'}}>🗑</button>
            </div>
          ))}
          <div style={{display:'flex',gap:6,marginTop:10}}>
            <input value={newPersonName} onChange={e=>setNewPersonName(e.target.value)} placeholder="New person's name" style={{flex:1,background:'#12202F',border:'1px dashed #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'7px 10px'}}/>
            <select value={newPersonRole} onChange={e=>setNewPersonRole(e.target.value)} style={{background:'#12202F',border:'1px dashed #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'7px 10px'}}>
              <option value="">No role</option>
              {roles.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <TeamSelect value={newPersonTeam} onChange={(v:any)=>setNewPersonTeam(v||'')}/>
            <DeptSelect value={newPersonDept} onChange={(v:any)=>setNewPersonDept(v||'')}/>
            <VendorSelect value={newPersonVendor} onChange={(v:any)=>setNewPersonVendor(v||'')}/>
            <input type="number" value={newPersonRate} onChange={e=>setNewPersonRate(e.target.value)} placeholder="$/hr (optional)" style={{width:110,background:'#12202F',border:'1px dashed #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'7px 10px'}}/>
            <button onClick={addPerson} style={{background:'#5DADE2',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:12,fontWeight:700,padding:'0 16px',cursor:'pointer'}}>+ Add</button>
          </div>
          </>
          )
          })()}
        </div>
      )}

      {view==='rf'&&(()=>{
        const thisFY=fyOf(localISO(new Date())).fy
        const[fy,setFy]=[rfFy||thisFY,setRfFy]
        const quarters=[1,2,3,4]
        const{totals:rollup,byProject:rollupByProj}=quarterlyRollup(projects,projectRoles,itemAssignments,items,people,roles)
        const deptOrder=[...new Set([...people.map((p:any)=>p.department).filter(Boolean),...(rfNewDept?[rfNewDept]:[])])]
        const latestBudget=(dept:string,q:number)=>{
          const revs=qBudgets.filter((b:any)=>b.department===dept&&b.fiscal_year===fy&&b.quarter===q).sort((a:any,b:any)=>a.created_at<b.created_at?1:-1)
          return revs[0]||null
        }
        const history=(dept:string,q:number)=>qBudgets.filter((b:any)=>b.department===dept&&b.fiscal_year===fy&&b.quarter===q).sort((a:any,b:any)=>a.created_at<b.created_at?-1:1)
        async function addRevision(){
          if(!rfNewDept.trim()||!rfNewCapex&&!rfNewOpex)return
          const{data,error}=await supabase.from('quarterly_budgets').insert({fiscal_year:fy,quarter:parseInt(rfNewQ),department:rfNewDept.trim(),label:rfNewLabel,capex_approved:parseFloat(rfNewCapex)||0,opex_approved:parseFloat(rfNewOpex)||0}).select().single()
          if(error){alert('Failed to save budget: '+error.message);return}
          if(data){setQBudgets((prev:any[])=>[...prev,data]);setRfNewCapex('');setRfNewOpex('')}
        }
        async function updQBudget(id:any,fields:any){
          setQBudgets((prev:any[])=>prev.map((b:any)=>b.id===id?{...b,...fields}:b))
          await supabase.from('quarterly_budgets').update(fields).eq('id',id)
        }
        async function deleteQBudget(id:any){
          if(!confirm('Delete this revision? If it was the latest one, the previous revision becomes the active ceiling.'))return
          setQBudgets((prev:any[])=>prev.filter((b:any)=>b.id!==id))
          await supabase.from('quarterly_budgets').delete().eq('id',id)
        }
        const barColor=(pct:number)=>pct>100?'#E74C3C':pct>85?'#E8B95A':'#27AE60'
        const sel=rfSel
        const selRow=sel?rollup.get(`${fy}-${sel.q}-${sel.dept}`):null
        const selProjects=sel?[...(rollupByProj.get(`${fy}-${sel.q}-${sel.dept}`)?.values()||[])].sort((a:any,b:any)=>(b.allocCapex+b.allocOpex)-(a.allocCapex+a.allocOpex)):[]
        const selHist=sel?history(sel.dept,sel.q):[]
        return(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <span style={{fontSize:11,color:'#7A8FA6'}}>Fiscal Year</span>
              <select value={fy} onChange={e=>setRfFy(parseInt(e.target.value))} style={{background:'#12202F',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}>
                {[thisFY-1,thisFY,thisFY+1].map(y=><option key={y} value={y}>FY{y}</option>)}
              </select>
              <span style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic'}}>Q1 Apr–Jun · Q2 Jul–Sep · Q3 Oct–Dec · Q4 Jan–Mar. Checkpoints: RF1 (Jul), RF2 (Oct), RF3 (Jan).</span>
            </div>

            {/* Portfolio-wide FY summary — every department's four quarters, summed */}
            {(()=>{
              let sAlloc={capex:0,opex:0},sAct={capex:0,opex:0},sCeil={capex:0,opex:0},anyCeil=false
              for(const dept of deptOrder){
                for(let q=1;q<=4;q++){
                  const r=rollup.get(`${fy}-${q}-${dept}`)
                  if(r){sAlloc.capex+=r.allocCapex;sAlloc.opex+=r.allocOpex;sAct.capex+=r.actCapex;sAct.opex+=r.actOpex}
                  const b=latestBudget(dept,q)
                  if(b){sCeil.capex+=b.capex_approved;sCeil.opex+=b.opex_approved;anyCeil=true}
                }
              }
              return(
                <div style={{background:'#12202F',border:'1px solid #3A4A5E',borderRadius:10,padding:'14px 18px',marginBottom:20}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:'#F4F6F8',marginBottom:10}}>FY{fy} FULL-YEAR SUMMARY — ALL DEPARTMENTS</div>
                  <div style={{display:'flex',gap:32,flexWrap:'wrap' as const}}>
                    <div>
                      <div style={{fontSize:9,color:'#7A8FA6',marginBottom:3}}>CapEx</div>
                      <div style={{fontSize:11,color:'#7A8FA6'}}>Approved Budget <b style={{color:'#F4F6F8'}}>{fmtUSD(sAlloc.capex)}</b></div>
                      <div style={{fontSize:11,color:'#7A8FA6'}}>Actual <b style={{color:sAct.capex>sAlloc.capex&&sAlloc.capex>0?'#E74C3C':'#27AE60'}}>{fmtUSD(sAct.capex)}</b></div>
                      {anyCeil&&<div style={{fontSize:11,color:'#7A8FA6'}}>Finance Ceiling <b style={{color:'#F4F6F8'}}>{fmtUSD(sCeil.capex)}</b></div>}
                    </div>
                    <div>
                      <div style={{fontSize:9,color:'#7A8FA6',marginBottom:3}}>OpEx</div>
                      <div style={{fontSize:11,color:'#7A8FA6'}}>Approved Budget <b style={{color:'#F4F6F8'}}>{fmtUSD(sAlloc.opex)}</b></div>
                      <div style={{fontSize:11,color:'#7A8FA6'}}>Actual <b style={{color:sAct.opex>sAlloc.opex&&sAlloc.opex>0?'#E74C3C':'#27AE60'}}>{fmtUSD(sAct.opex)}</b></div>
                      {anyCeil&&<div style={{fontSize:11,color:'#7A8FA6'}}>Finance Ceiling <b style={{color:'#F4F6F8'}}>{fmtUSD(sCeil.opex)}</b></div>}
                    </div>
                    <div style={{borderLeft:'1px solid #243447',paddingLeft:32}}>
                      <div style={{fontSize:9,color:'#7A8FA6',marginBottom:3}}>Combined</div>
                      <div style={{fontSize:11,color:'#7A8FA6'}}>Approved Budget <b style={{color:'#F4F6F8'}}>{fmtUSD(sAlloc.capex+sAlloc.opex)}</b></div>
                      <div style={{fontSize:11,color:'#7A8FA6'}}>Actual <b style={{color:'#F4F6F8'}}>{fmtUSD(sAct.capex+sAct.opex)}</b></div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {deptOrder.length===0&&<div style={{fontSize:12,color:'#7A8FA6',fontStyle:'italic',marginBottom:16}}>No departments set yet — add a department to people in the Roster tab.</div>}
            {deptOrder.map(dept=>{
              // This department's FY total across all four quarters — its own annual card
              let dAlloc={capex:0,opex:0},dAct={capex:0,opex:0},dCeil={capex:0,opex:0},dAnyCeil=false
              for(let q=1;q<=4;q++){
                const r=rollup.get(`${fy}-${q}-${dept}`)
                if(r){dAlloc.capex+=r.allocCapex;dAlloc.opex+=r.allocOpex;dAct.capex+=r.actCapex;dAct.opex+=r.actOpex}
                const b=latestBudget(dept,q)
                if(b){dCeil.capex+=b.capex_approved;dCeil.opex+=b.opex_approved;dAnyCeil=true}
              }
              return(
              <div key={dept} style={{marginBottom:22}}>
                <div style={{fontSize:12,fontWeight:700,color:'#5DADE2',letterSpacing:1,marginBottom:8}}>{dept.toUpperCase()}</div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap' as const}}>
                  <div style={{background:'#0F1E2E',border:'1px solid #3A4A5E',borderRadius:10,padding:'10px 14px',width:220}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#F4F6F8',marginBottom:6}}>FY{fy} Total</div>
                    <div style={{fontSize:9,color:'#7A8FA6'}}>CapEx</div>
                    <div style={{fontSize:10,color:'#7A8FA6'}}>Budget <b style={{color:'#F4F6F8'}}>{fmtUSD(dAlloc.capex)}</b></div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:6}}>Actual <b style={{color:dAct.capex>dAlloc.capex&&dAlloc.capex>0?'#E74C3C':'#27AE60'}}>{fmtUSD(dAct.capex)}</b></div>
                    <div style={{fontSize:9,color:'#7A8FA6'}}>OpEx</div>
                    <div style={{fontSize:10,color:'#7A8FA6'}}>Budget <b style={{color:'#F4F6F8'}}>{fmtUSD(dAlloc.opex)}</b></div>
                    <div style={{fontSize:10,color:'#7A8FA6'}}>Actual <b style={{color:dAct.opex>dAlloc.opex&&dAlloc.opex>0?'#E74C3C':'#27AE60'}}>{fmtUSD(dAct.opex)}</b></div>
                    {dAnyCeil&&<div style={{fontSize:9,color:'#7A8FA6',marginTop:6,fontStyle:'italic'}}>Ceiling: {fmtUSD(dCeil.capex+dCeil.opex)}</div>}
                  </div>
                  {quarters.map(q=>{
                    const bud=latestBudget(dept,q)
                    const r=rollup.get(`${fy}-${q}-${dept}`)||{allocCapex:0,allocOpex:0,actCapex:0,actOpex:0}
                    // Primary comparison: Actual vs. the Approved (Proposed) Budget — the sum of
                    // project-level approvals, which is bottom-up and always available.
                    // The finance ceiling (if entered) overlays as a reference marker, not the gate.
                    const capexPct=r.allocCapex?Math.round(r.actCapex/r.allocCapex*100):0
                    const opexPct=r.allocOpex?Math.round(r.actOpex/r.allocOpex*100):0
                    const capexCeilPct=bud?.capex_approved&&r.allocCapex?Math.min(150,Math.round(bud.capex_approved/r.allocCapex*100)):null
                    const opexCeilPct=bud?.opex_approved&&r.allocOpex?Math.min(150,Math.round(bud.opex_approved/r.allocOpex*100)):null
                    const hist=history(dept,q)
                    const isSel=sel&&sel.dept===dept&&sel.q===q
                    return(
                      <div key={q} onClick={()=>setRfSel(isSel?null:{dept,q})} title="Click to see contributing projects and edit the finance ceiling"
                        style={{background:'#12202F',border:'1px solid '+(isSel?'#C8973A':'#243447'),borderRadius:10,padding:'10px 14px',width:220,cursor:'pointer'}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                          <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8'}}>Q{q}</span>
                          {bud&&<span style={{fontSize:8,color:'#7A8FA6',border:'1px solid #243447',borderRadius:6,padding:'0 5px'}}>{bud.label}</span>}
                        </div>
                        <>
                        <div style={{fontSize:9,color:'#7A8FA6',marginBottom:2}}>CapEx</div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                          <span style={{color:'#7A8FA6'}}>Approved Budget</span><span style={{color:'#F4F6F8',fontWeight:700}}>{fmtUSD(r.allocCapex)}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                          <span style={{color:'#7A8FA6'}}>Actual</span><span style={{color:r.actCapex>r.allocCapex&&r.allocCapex>0?'#E74C3C':'#27AE60'}}>{fmtUSD(r.actCapex)}</span>
                        </div>
                        {r.allocCapex>0&&(
                          <div style={{background:'#0D1B2A',borderRadius:4,height:5,overflow:'hidden',marginBottom:4,position:'relative' as const}}>
                            <div style={{width:Math.min(100,capexPct)+'%',height:'100%',background:barColor(capexPct)}}/>
                            {capexCeilPct!=null&&<div title={`Finance ceiling: ${fmtUSD(bud.capex_approved)}`} style={{position:'absolute',top:0,bottom:0,left:Math.min(100,capexCeilPct)+'%',width:2,background:'#F4F6F8'}}/>}
                          </div>
                        )}
                        {bud&&<div style={{fontSize:9,color:'#7A8FA6',marginBottom:8}}>Finance ceiling: {fmtUSD(bud.capex_approved)}</div>}
                        {!bud&&<div style={{fontSize:9,color:'#7A8FA6',fontStyle:'italic',marginBottom:8}}>No finance ceiling entered</div>}
                        <div style={{fontSize:9,color:'#7A8FA6',marginBottom:2,marginTop:4}}>OpEx</div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                          <span style={{color:'#7A8FA6'}}>Approved Budget</span><span style={{color:'#F4F6F8',fontWeight:700}}>{fmtUSD(r.allocOpex)}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                          <span style={{color:'#7A8FA6'}}>Actual</span><span style={{color:r.actOpex>r.allocOpex&&r.allocOpex>0?'#E74C3C':'#27AE60'}}>{fmtUSD(r.actOpex)}</span>
                        </div>
                        {r.allocOpex>0&&(
                          <div style={{background:'#0D1B2A',borderRadius:4,height:5,overflow:'hidden',marginBottom:4,position:'relative' as const}}>
                            <div style={{width:Math.min(100,opexPct)+'%',height:'100%',background:barColor(opexPct)}}/>
                            {opexCeilPct!=null&&<div title={`Finance ceiling: ${fmtUSD(bud.opex_approved)}`} style={{position:'absolute',top:0,bottom:0,left:Math.min(100,opexCeilPct)+'%',width:2,background:'#F4F6F8'}}/>}
                          </div>
                        )}
                        {bud&&<div style={{fontSize:9,color:'#7A8FA6'}}>Finance ceiling: {fmtUSD(bud.opex_approved)}</div>}
                        {!bud&&<div style={{fontSize:9,color:'#7A8FA6',fontStyle:'italic'}}>No finance ceiling entered</div>}
                        {r.allocCapex===0&&r.allocOpex===0&&(r.actCapex+r.actOpex)>0&&<div style={{fontSize:9,color:'#E8B95A',marginTop:6,fontStyle:'italic'}}>Spend logged but no approved project budget found — check project approval status.</div>}
                        {((r.allocCapex>0&&r.actCapex>r.allocCapex)||(r.allocOpex>0&&r.actOpex>r.allocOpex))&&<div style={{fontSize:9,color:'#E74C3C',marginTop:6,fontWeight:700}}>⚠ Actual spend exceeds the approved budget</div>}
                        {hist.length>1&&<div style={{fontSize:8,color:'#7A8FA6',marginTop:6}}>{hist.length} finance revisions</div>}
                        </>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })}
            {sel&&(
              <div style={{background:'#12202F',border:'1px solid #C8973A',borderRadius:10,padding:'14px 18px',marginTop:4,marginBottom:20,maxWidth:640}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#F4F6F8'}}>{sel.dept} — Q{sel.q} FY{fy}</span>
                  <button onClick={()=>setRfSel(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:14,cursor:'pointer'}}>✕</button>
                </div>

                <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#5DADE2',marginBottom:6}}>CONTRIBUTING PROJECTS</div>
                {selProjects.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:14}}>No approved projects touch this department/quarter yet.</div>}
                {selProjects.length>0&&(
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,marginBottom:16}}>
                    <thead><tr>
                      <th style={{textAlign:'left',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>Project</th>
                      <th style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>CapEx Alloc</th>
                      <th style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>CapEx Actual</th>
                      <th style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>OpEx Alloc</th>
                      <th style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>OpEx Actual</th>
                    </tr></thead>
                    <tbody>
                    {selProjects.map((p:any,ix:number)=>(
                      <tr key={ix}>
                        <td style={{padding:'4px 6px',color:'#F4F6F8',borderBottom:'1px solid #1A2838'}}><span style={{display:'inline-block',width:7,height:7,borderRadius:2,background:p.color||'#3A4A5E',marginRight:6}}/>{p.name}</td>
                        <td style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #1A2838'}}>{fmtUSD(p.allocCapex)}</td>
                        <td style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #1A2838'}}>{fmtUSD(p.actCapex)}</td>
                        <td style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #1A2838'}}>{fmtUSD(p.allocOpex)}</td>
                        <td style={{textAlign:'right',padding:'4px 6px',color:'#7A8FA6',borderBottom:'1px solid #1A2838'}}>{fmtUSD(p.actOpex)}</td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                )}

                <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:'#5DADE2',marginBottom:6}}>FINANCE CEILING REVISIONS</div>
                {selHist.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:10}}>No ceiling entered for this quarter yet — use the form below.</div>}
                {selHist.map((b:any,ix:number)=>{
                  const isLatest=ix===selHist.length-1
                  return(
                    <div key={b.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,marginBottom:6,padding:'4px 8px',background:isLatest?'#1E3048':'transparent',borderRadius:6}}>
                      <span style={{color:isLatest?'#27AE60':'#7A8FA6',fontWeight:700,width:56}}>{b.label}{isLatest?' ✓':''}</span>
                      <span style={{color:'#7A8FA6',fontSize:9}}>CapEx</span>
                      <input type="number" value={b.capex_approved} onChange={e=>updQBudget(b.id,{capex_approved:parseFloat(e.target.value)||0})} style={{width:80,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 6px'}}/>
                      <span style={{color:'#7A8FA6',fontSize:9}}>OpEx</span>
                      <input type="number" value={b.opex_approved} onChange={e=>updQBudget(b.id,{opex_approved:parseFloat(e.target.value)||0})} style={{width:80,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'3px 6px'}}/>
                      <span style={{color:'#3A4A5E',fontSize:9,marginLeft:'auto'}}>{new Date(b.created_at).toLocaleDateString()}</span>
                      <button onClick={()=>deleteQBudget(b.id)} style={{background:'none',border:'none',color:'#3A4A5E',fontSize:12,cursor:'pointer'}}>🗑</button>
                    </div>
                  )
                })}
                <div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic',marginTop:6,lineHeight:1.5}}>
                  The <b>most recent</b> revision (✓, highlighted) is the active ceiling shown on the card. Edit any row's numbers directly to correct a typo — or, at a real reforecast checkpoint (Jul/Oct/Jan), add a brand-new row below labeled RF1/RF2/RF3 so the history stays intact. Delete a row to remove it entirely; the next-most-recent one takes over.
                </div>
              </div>
            )}
            <div style={{background:'#12202F',border:'1px dashed #243447',borderRadius:10,padding:'12px 16px',maxWidth:520,marginTop:6}}>
              <div style={{fontSize:11,fontWeight:700,color:'#F4F6F8',marginBottom:8}}>+ Enter a budget / reforecast</div>
              <div style={{fontSize:10,color:'#7A8FA6',marginBottom:10,lineHeight:1.5}}>
                Set the department's approved dollar amount for a quarter. First entry of the year → label it <b>Original</b>. If you're revising after burning through the current number → pick <b>RF1</b>, <b>RF2</b>, or <b>RF3</b> for whichever checkpoint this is (Jul/Oct/Jan) — the newest entry always becomes the active ceiling, and older ones stay visible as history (click a quarter card above to see and edit them).
              </div>
              <div style={{display:'flex',gap:6,marginBottom:6,flexWrap:'wrap' as const}}>
                <select value={rfNewDept} onChange={e=>setRfNewDept(e.target.value)} style={{flex:1,minWidth:120,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}>
                  <option value="">Department…</option>
                  {[...new Set(['OMNI Engineering','OMNI Consumer',...people.map((p:any)=>p.department).filter(Boolean)])].map((d:any)=><option key={d} value={d}>{d}</option>)}
                </select>
                <select value={rfNewQ} onChange={e=>setRfNewQ(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}>
                  {[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}
                </select>
                <select value={rfNewLabel} onChange={e=>setRfNewLabel(e.target.value)} style={{background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}>
                  {['Original','RF1','RF2','RF3'].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={{display:'flex',gap:6}}>
                <input type="number" value={rfNewCapex} onChange={e=>setRfNewCapex(e.target.value)} placeholder="CapEx $ approved" style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                <input type="number" value={rfNewOpex} onChange={e=>setRfNewOpex(e.target.value)} placeholder="OpEx $ approved" style={{flex:1,background:'#0D1B2A',border:'1px solid #243447',borderRadius:5,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
                <button onClick={addRevision} style={{background:'#27AE60',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,padding:'5px 14px',cursor:'pointer'}}>Save</button>
              </div>
            </div>
          </div>
        )
      })()}

      {view==='vendor'&&(()=>{
        const thisFY=fyOf(localISO(new Date())).fy
        const vfy=vendorFy||thisFY
        const vr=vendorRollup(projects,itemAssignments,items,people,roles)
        const cellOf=(vendor:string,q:number)=>vr.get(vendor)?.get(`${vfy}-${q}`)||{capex:0,opex:0}
        const yearTotal=(vendor:string)=>{
          let capex=0,opex=0
          for(let q=1;q<=4;q++){const c=cellOf(vendor,q);capex+=c.capex;opex+=c.opex}
          return{capex,opex,total:capex+opex}
        }
        const vendors=[...vr.keys()].map(v=>({vendor:v,...yearTotal(v)})).sort((a,b)=>b.total-a.total)
        const grand={capex:vendors.reduce((s,v)=>s+v.capex,0),opex:vendors.reduce((s,v)=>s+v.opex,0)}
        return(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:11,color:'#7A8FA6'}}>Fiscal Year</span>
              <select value={vfy} onChange={e=>setVendorFy(parseInt(e.target.value))} style={{background:'#12202F',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}>
                {[thisFY-1,thisFY,thisFY+1].map(y=><option key={y} value={y}>FY{y}</option>)}
              </select>
            </div>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:6,lineHeight:1.5}}>Real spend (actual hours × rate) on approved projects, by vendor — CapEx/OpEx split per the role/project-type rule.</div>
            <div style={{display:'flex',gap:14,fontSize:10,color:'#7A8FA6',marginBottom:10}}>
              <span><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'#5DADE2',marginRight:5}}/>CapEx</span>
              <span><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'#7A8FA6',marginRight:5}}/>OpEx</span>
            </div>
            <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',fontSize:12,minWidth:760}}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>Vendor</th>
                {[1,2,3,4].map(q=><th key={q} style={{textAlign:'right',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>Q{q}<div style={{fontSize:8,fontWeight:400,color:'#5A6B7D'}}>CapEx / OpEx</div></th>)}
                <th style={{textAlign:'right',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447'}}>FY{vfy} Total</th>
              </tr></thead>
              <tbody>
              {vendors.map(v=>(
                <tr key={v.vendor}>
                  <td style={{padding:'6px 10px',color:'#F4F6F8',borderBottom:'1px solid #1A2838'}}>{v.vendor}</td>
                  {[1,2,3,4].map(q=>{
                    const c=cellOf(v.vendor,q)
                    return(
                      <td key={q} style={{textAlign:'right',padding:'6px 10px',borderBottom:'1px solid #1A2838'}}>
                        {(c.capex+c.opex)>0?<><div style={{color:'#5DADE2',fontSize:11}}>{fmtUSD(c.capex)} <span style={{color:'#5A6B7D',fontSize:9}}>C</span></div><div style={{color:'#7A8FA6',fontSize:10}}>{fmtUSD(c.opex)} <span style={{color:'#5A6B7D',fontSize:9}}>O</span></div></>:<span style={{color:'#3A4A5E'}}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{textAlign:'right',padding:'6px 10px',color:'#F4F6F8',fontWeight:700,borderBottom:'1px solid #1A2838'}}>{fmtUSD(v.total)}<div style={{fontSize:9,color:'#7A8FA6',fontWeight:400}}>C {fmtUSD(v.capex)} / O {fmtUSD(v.opex)}</div></td>
                </tr>
              ))}
              {vendors.length===0&&<tr><td colSpan={6} style={{padding:10,color:'#7A8FA6',fontStyle:'italic'}}>No vendor-attributed actual spend in FY{vfy}.</td></tr>}
              </tbody>
              {vendors.length>0&&<tfoot><tr>
                <td style={{padding:'8px 10px',color:'#F4F6F8',fontWeight:800,borderTop:'2px solid #243447'}}>FY{vfy} Total</td>
                {[1,2,3,4].map(q=>{
                  const qCapex=vendors.reduce((s,v)=>s+cellOf(v.vendor,q).capex,0)
                  const qOpex=vendors.reduce((s,v)=>s+cellOf(v.vendor,q).opex,0)
                  return(
                    <td key={q} style={{textAlign:'right',padding:'8px 10px',borderTop:'2px solid #243447'}}>
                      <div style={{color:'#5DADE2',fontSize:11,fontWeight:700}}>{fmtUSD(qCapex)} <span style={{color:'#5A6B7D',fontSize:9,fontWeight:400}}>C</span></div>
                      <div style={{color:'#7A8FA6',fontSize:10}}>{fmtUSD(qOpex)} <span style={{color:'#5A6B7D',fontSize:9}}>O</span></div>
                    </td>
                  )
                })}
                <td style={{textAlign:'right',padding:'8px 10px',color:'#F4F6F8',fontWeight:800,borderTop:'2px solid #243447'}}>{fmtUSD(grand.capex+grand.opex)}<div style={{fontSize:9,color:'#7A8FA6',fontWeight:400}}>C {fmtUSD(grand.capex)} / O {fmtUSD(grand.opex)}</div></td>
              </tr></tfoot>}
            </table>
            </div>
          </div>
        )
      })()}

      {view==='capacity'&&(()=>{
        const{perPerson,byProject}=capacityByMonth(projects,projectRoles,people,roles)
        const monthKeys=buildMonthKeys(capWindow)
        const teamOrder=[...new Set([...TEAMS,...people.map((p:any)=>p.team).filter(Boolean)]),'']
        const peopleByTeam=teamOrder.map(t=>({team:t||'No team',people:people.filter((p:any)=>p.active&&(p.team||'')===t)})).filter(g=>g.people.length)
        const pctColor=(pct:number)=>pct>105?'#E74C3C':pct>=85?'#27AE60':pct>=50?'#E8B95A':'#5DADE2'
        const sel=capSel
        const selPerson=sel?people.find((p:any)=>p.id===sel.personId):null
        const selBreakdown=sel?(byProject.get(sel.personId)?.get(sel.key)||[]):[]
        return(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
              <span style={{fontSize:11,color:'#7A8FA6'}}>Window</span>
              <select value={capWindow} onChange={e=>setCapWindow(e.target.value)} style={{background:'#12202F',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}>
                <option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="9">9 months</option><option value="fy">Fiscal year</option><option value="year">Year from now</option>
              </select>
            </div>
            {sel&&(
              <div style={{background:'#12202F',border:'1px solid #C8973A',borderRadius:10,padding:'12px 16px',maxWidth:480,marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8'}}>{selPerson?.name} — {monthLabel(sel.key)}</span>
                  <button onClick={()=>setCapSel(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:14,cursor:'pointer'}}>✕</button>
                </div>
                {selBreakdown.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No contributions found.</div>}
                {[...selBreakdown].sort((a:any,b:any)=>b.pct-a.pct).map((b:any,ix:number)=>(
                  <div key={ix} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'4px 0',borderBottom:ix<selBreakdown.length-1?'1px solid #1A2838':'none'}}>
                    <span style={{width:8,height:8,borderRadius:2,background:b.color||'#3A4A5E',flexShrink:0}}/>
                    <span style={{color:'#F4F6F8',flex:1}}>{b.project}</span>
                    <span style={{color:pctColor(Math.round(b.pct)),fontWeight:700}}>{Math.round(b.pct)}%</span>
                    <span style={{color:'#7A8FA6',width:64,textAlign:'right' as const}}>{fmtUSD(b.cost)}</span>
                  </div>
                ))}
                {selBreakdown.length>0&&(
                  <div style={{display:'flex',fontSize:11,fontWeight:700,paddingTop:6,marginTop:2,borderTop:'1px solid #243447'}}>
                    <span style={{color:'#F4F6F8',flex:1}}>Total</span>
                    <span style={{color:pctColor(Math.round(selBreakdown.reduce((s:number,b:any)=>s+b.pct,0)))}}>{Math.round(selBreakdown.reduce((s:number,b:any)=>s+b.pct,0))}%</span>
                    <span style={{color:'#7A8FA6',width:64,textAlign:'right' as const,marginLeft:8}}>{fmtUSD(selBreakdown.reduce((s:number,b:any)=>s+b.cost,0))}</span>
                  </div>
                )}
              </div>
            )}
          <div style={{overflowX:'auto'}}>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:12,lineHeight:1.5}}>Allocation % per person per month, summed across every project they're named on (only rows linked to a roster person count here — generic/unassigned rows aren't real capacity yet). Click any % to see which projects it's coming from.</div>
            <table style={{borderCollapse:'collapse',fontSize:11,minWidth:640}}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447',position:'sticky' as const,left:0,background:'#0D1B2A'}}>Person</th>
                {monthKeys.map(k=><th key={k} style={{textAlign:'center',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447',minWidth:80}}>{monthLabel(k)}</th>)}
              </tr></thead>
              <tbody>
              {peopleByTeam.map(group=>(
                <Fragment key={group.team}>
                  <tr><td colSpan={monthKeys.length+1} style={{padding:'10px 10px 4px',fontSize:10,fontWeight:700,letterSpacing:1,color:'#5DADE2'}}>{group.team.toUpperCase()}</td></tr>
                  {group.people.map((p:any)=>{
                    const pm=perPerson.get(p.id)
                    return(
                      <tr key={p.id}>
                        <td style={{padding:'4px 10px',color:'#F4F6F8',position:'sticky' as const,left:0,background:'#0D1B2A',whiteSpace:'nowrap' as const}}>{p.name} <span style={{color:'#7A8FA6',fontSize:9}}>· {roles.find((r:any)=>r.id===p.role_id)?.name||'—'}</span></td>
                        {monthKeys.map(k=>{
                          const cell=pm?.get(k)
                          const pct=cell?Math.round(cell.pct):0
                          const isSel=sel&&sel.personId===p.id&&sel.key===k
                          return(
                            <td key={k} style={{textAlign:'center',padding:'4px 10px'}}>
                              {pct>0?(
                                <div onClick={()=>setCapSel(isSel?null:{personId:p.id,key:k})} title="Click for project breakdown"
                                  style={{cursor:'pointer',borderRadius:4,padding:'1px 4px',background:isSel?'#1E3048':'transparent',border:isSel?'1px solid #C8973A':'1px solid transparent'}}>
                                  <span style={{fontWeight:700,color:pctColor(pct)}}>{pct}%</span>
                                </div>
                              ):<span style={{color:'#3A4A5E'}}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{borderTop:'1px solid #243447'}}>
                    <td style={{padding:'4px 10px',color:'#7A8FA6',fontSize:10,fontStyle:'italic',position:'sticky' as const,left:0,background:'#0D1B2A'}}>Team total</td>
                    {monthKeys.map(k=>{
                      const cost=group.people.reduce((sum:number,p:any)=>sum+(perPerson.get(p.id)?.get(k)?.cost||0),0)
                      const pcts=group.people.map((p:any)=>perPerson.get(p.id)?.get(k)?.pct||0)
                      const avgPct=pcts.length?Math.round(pcts.reduce((a:number,b:number)=>a+b,0)/pcts.length):0
                      return<td key={k} style={{textAlign:'center',padding:'4px 10px',fontSize:10}}>
                        {cost>0?<><span style={{color:'#F4F6F8',fontWeight:700}}>{fmtUSD(cost)}</span><div style={{color:'#7A8FA6',fontSize:9}}>avg {avgPct}%</div></>:<span style={{color:'#3A4A5E'}}>—</span>}
                      </td>
                    })}
                  </tr>
                </Fragment>
              ))}
              {peopleByTeam.length===0&&<tr><td style={{padding:10,color:'#7A8FA6',fontStyle:'italic'}}>No roster people have a team set yet — add teams in the Roster tab.</td></tr>}
              </tbody>
            </table>
          </div>
          </div>
        )
      })()}

      {view==='teamcost'&&(()=>{
        const{perPerson,byProject}=capacityByMonth(projects,projectRoles,people,roles)
        const monthKeys=buildMonthKeys(tcWindow)
        const teamOrder=[...new Set([...TEAMS,...people.map((p:any)=>p.team).filter(Boolean)]),'']
        const peopleByTeam=teamOrder.map(t=>({team:t||'No team',people:people.filter((p:any)=>p.active&&(p.team||'')===t)})).filter(g=>g.people.length)
        const fillColor=(pct:number)=>pct>105?'#5DADE2':pct>=85?'#27AE60':pct>=50?'#E8B95A':'#E74C3C'
        const sel=tcSel
        const selPerson=sel?people.find((p:any)=>p.id===sel.personId):null
        const selFull=sel?fullCostForMonth(sel.key,rateOf(selPerson,roles)):0
        const selProjects=sel?[...(byProject.get(sel.personId)?.get(sel.key)||[])].sort((a:any,b:any)=>b.cost-a.cost):[]
        const selAllocated=selProjects.reduce((s:number,p:any)=>s+p.cost,0)
        return(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
              <span style={{fontSize:11,color:'#7A8FA6'}}>Window</span>
              <select value={tcWindow} onChange={e=>setTcWindow(e.target.value)} style={{background:'#12202F',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}>
                <option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="9">9 months</option><option value="fy">Fiscal year</option><option value="year">Year from now</option>
              </select>
            </div>
            {sel&&(
              <div style={{background:'#12202F',border:'1px solid #C8973A',borderRadius:10,padding:'12px 16px',maxWidth:480,marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8'}}>{selPerson?.name} — {monthLabel(sel.key)}</span>
                  <button onClick={()=>setTcSel(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#7A8FA6',fontSize:14,cursor:'pointer'}}>✕</button>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:8,paddingBottom:8,borderBottom:'1px solid #243447'}}>
                  <span style={{color:'#7A8FA6'}}>Full cost this month</span><span style={{color:'#F4F6F8',fontWeight:700}}>{fmtUSD(selFull)}</span>
                </div>
                {selProjects.length===0&&<div style={{fontSize:11,color:'#E74C3C',fontStyle:'italic'}}>Not allocated to any project this month — full cost is unfilled bench time.</div>}
                {selProjects.map((p:any,ix:number)=>(
                  <div key={ix} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'4px 0',borderBottom:ix<selProjects.length-1?'1px solid #1A2838':'none'}}>
                    <span style={{width:8,height:8,borderRadius:2,background:p.color||'#3A4A5E',flexShrink:0}}/>
                    <span style={{color:'#F4F6F8',flex:1}}>{p.project}</span>
                    <span style={{color:'#7A8FA6'}}>{fmtUSD(p.cost)}</span>
                  </div>
                ))}
                {selProjects.length>0&&(
                  <div style={{display:'flex',fontSize:11,fontWeight:700,paddingTop:6,marginTop:2,borderTop:'1px solid #243447'}}>
                    <span style={{color:'#F4F6F8',flex:1}}>Allocated total</span>
                    <span style={{color:'#F4F6F8'}}>{fmtUSD(selAllocated)}</span>
                  </div>
                )}
                <div style={{display:'flex',fontSize:11,fontWeight:700,marginTop:4}}>
                  <span style={{color:selFull-selAllocated>0?'#E74C3C':'#27AE60',flex:1}}>{selFull-selAllocated>0?'Unfilled (bench)':'Fully booked'}</span>
                  <span style={{color:selFull-selAllocated>0?'#E74C3C':'#27AE60'}}>{fmtUSD(Math.max(0,selFull-selAllocated))}</span>
                </div>
              </div>
            )}
          <div style={{overflowX:'auto'}}>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:12,lineHeight:1.5}}>
              What we'd pay each person at full utilization vs. what's actually allocated to projects — the gap is bench cost: paying for capacity that isn't booked to anything. Click a cell for the project breakdown.
            </div>
            <table style={{borderCollapse:'collapse',fontSize:11,minWidth:640}}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447',position:'sticky' as const,left:0,background:'#0D1B2A'}}>Person</th>
                {monthKeys.map(k=><th key={k} style={{textAlign:'center',padding:'6px 10px',color:'#7A8FA6',borderBottom:'1px solid #243447',minWidth:100}}>{monthLabel(k)}</th>)}
              </tr></thead>
              <tbody>
              {peopleByTeam.map(group=>{
                let teamFull=0,teamAlloc=0
                return(
                <Fragment key={group.team}>
                  <tr><td colSpan={monthKeys.length+1} style={{padding:'10px 10px 4px',fontSize:10,fontWeight:700,letterSpacing:1,color:'#5DADE2'}}>{group.team.toUpperCase()}</td></tr>
                  {group.people.map((p:any)=>{
                    const rate=rateOf(p,roles)
                    const pm=perPerson.get(p.id)
                    return(
                      <tr key={p.id}>
                        <td style={{padding:'4px 10px',color:'#F4F6F8',position:'sticky' as const,left:0,background:'#0D1B2A',whiteSpace:'nowrap' as const}}>{p.name} <span style={{color:'#7A8FA6',fontSize:9}}>· {roles.find((r:any)=>r.id===p.role_id)?.name||'—'}</span></td>
                        {monthKeys.map(k=>{
                          const full=fullCostForMonth(k,rate)
                          const alloc=pm?.get(k)?.cost||0
                          teamFull+=full;teamAlloc+=alloc
                          const pct=full>0?Math.round(alloc/full*100):0
                          const isSel=sel&&sel.personId===p.id&&sel.key===k
                          return(
                            <td key={k} style={{textAlign:'center',padding:'4px 10px'}}>
                              {full>0?(
                                <div onClick={()=>setTcSel(isSel?null:{personId:p.id,key:k})} title="Click for project breakdown"
                                  style={{cursor:'pointer',borderRadius:4,padding:'2px 4px',background:isSel?'#1E3048':'transparent',border:isSel?'1px solid #C8973A':'1px solid transparent'}}>
                                  <div style={{fontWeight:700,color:fillColor(pct)}}>{fmtUSD(alloc)}</div>
                                  <div style={{fontSize:9,color:'#7A8FA6'}}>of {fmtUSD(full)}</div>
                                </div>
                              ):<span style={{color:'#3A4A5E'}}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{borderTop:'1px solid #243447'}}>
                    <td style={{padding:'4px 10px',color:'#7A8FA6',fontSize:10,fontStyle:'italic',position:'sticky' as const,left:0,background:'#0D1B2A'}}>Team fill rate</td>
                    <td colSpan={monthKeys.length} style={{padding:'4px 10px',fontSize:10,color:'#7A8FA6'}}>
                      {teamFull>0?<>Filling <b style={{color:fillColor(Math.round(teamAlloc/teamFull*100))}}>{Math.round(teamAlloc/teamFull*100)}%</b> of {fmtUSD(teamFull)} paid over this window — {fmtUSD(teamFull-teamAlloc)} unbooked</>:'—'}
                    </td>
                  </tr>
                </Fragment>
              )})}
              {peopleByTeam.length===0&&<tr><td style={{padding:10,color:'#7A8FA6',fontStyle:'italic'}}>No active roster people yet.</td></tr>}
              </tbody>
            </table>
          </div>
          </div>
        )
      })()}

      {view==='teambudget'&&(()=>{
        const monthKeys=buildMonthKeys(tbWindow)
        const rollup=teamBudgetRollup(projects,projectRoles,people,roles,monthKeys)
        const stClr=(st:string)=>st==='approved'?'#27AE60':st==='requested'?'#5DADE2':'#E8B95A'
        const stLabel=(st:string)=>st==='approved'?'Approved':st==='requested'?'Requested':'Draft'
        const Bar=({segments,total,label}:{segments:{color:string,amount:number,title:string}[],total:number,label:string})=>{
          const over=segments.reduce((s,x)=>s+x.amount,0)>total
          return(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:9,color:'#7A8FA6',marginBottom:3}}>{label}</div>
              <div style={{display:'flex',height:16,borderRadius:4,overflow:'hidden',background:'#0D1B2A',border:'1px solid #243447'}}>
                {segments.map((s,ix)=>s.amount>0&&(
                  <div key={ix} title={`${s.title}: ${fmtUSD(s.amount)}`} style={{width:`${Math.min(100,s.amount/total*100)}%`,background:s.color,flexShrink:0}}/>
                ))}
              </div>
              {over&&<div style={{fontSize:9,color:'#E74C3C',fontWeight:700,marginTop:2}}>⚠ Exceeds team total by {fmtUSD(segments.reduce((s,x)=>s+x.amount,0)-total)}</div>}
            </div>
          )
        }
        return(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <span style={{fontSize:11,color:'#7A8FA6'}}>Window</span>
              <select value={tbWindow} onChange={e=>setTbWindow(e.target.value)} style={{background:'#12202F',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px'}}>
                <option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="9">9 months</option><option value="fy">Fiscal year</option><option value="year">Year from now</option>
              </select>
            </div>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:16,lineHeight:1.5}}>
              Each team's cost is fixed — you're paying for it whether or not it's assigned to a project. <b style={{color:'#27AE60'}}>Approved</b> shows what's actually claimed today; <b style={{color:'#5DADE2'}}>Requested</b> and <b style={{color:'#E8B95A'}}>Draft</b> show what the pipeline would claim if approved. Unclaimed dollars are flagged — they're still OpEx, just not building anything yet.
            </div>
            {[...new Set([...TEAMS,...people.map((p:any)=>p.team).filter(Boolean)])].map(team=>{
              const t=rollup[team]
              if(!t||t.total<=0)return null
              return(
                <div key={team} style={{marginBottom:26}}>
                  <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:10}}>
                    <span style={{fontSize:14,fontWeight:800,color:'#F4F6F8'}}>{team}</span>
                    <span style={{fontSize:12,color:'#7A8FA6'}}>Team Total: <b style={{color:'#F4F6F8'}}>{fmtUSD(t.total)}</b></span>
                  </div>
                  <div style={{display:'flex',gap:14,flexWrap:'wrap' as const}}>
                    {Object.keys(t.depts).map(dept=>{
                      const d=t.depts[dept]
                      const approvedSegs=[
                        ...d.approvedProjects.map((p:any)=>({color:p.color||'#5DADE2',amount:p.capex+p.opex,title:p.name})),
                        {color:'#3A4A5E',amount:d.unallocApproved,title:'Unallocated (OpEx)'},
                      ]
                      const plannedSegs=[
                        ...d.approvedProjects.map((p:any)=>({color:p.color||'#5DADE2',amount:p.capex+p.opex,title:p.name})),
                        ...d.plannedExtra.map((p:any)=>({color:stClr(p.status),amount:p.capex+p.opex,title:`${p.name} (${stLabel(p.status)})`})),
                        {color:'#3A4A5E',amount:Math.max(0,d.unallocPlanned),title:'Unallocated (OpEx)'},
                      ]
                      return(
                        <div key={dept} style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'12px 16px',width:340}}>
                          <div style={{fontSize:12,fontWeight:700,color:'#5DADE2',marginBottom:8}}>{dept} <span style={{color:'#7A8FA6',fontWeight:400}}>· {fmtUSD(d.deptTotal)}</span></div>
                          <Bar segments={approvedSegs} total={d.deptTotal} label="Approved"/>
                          <Bar segments={plannedSegs} total={d.deptTotal} label="Planned (Approved + Requested + Draft)"/>
                          <div style={{fontSize:10,color:'#7A8FA6',marginTop:8,lineHeight:1.6}}>
                            {[...d.approvedProjects,...d.plannedExtra].map((p:any,ix:number)=>(
                              <div key={ix} style={{display:'flex',alignItems:'center',gap:6}}>
                                <span style={{width:7,height:7,borderRadius:2,background:p.status==='approved'?(p.color||'#5DADE2'):stClr(p.status),flexShrink:0}}/>
                                <span style={{flex:1,color:'#F4F6F8'}}>{p.name}</span>
                                <span>{stLabel(p.status)}</span>
                                <span style={{width:60,textAlign:'right' as const}}>{fmtUSD(p.capex+p.opex)}</span>
                              </div>
                            ))}
                            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2,fontStyle:'italic'}}>
                              <span style={{width:7,height:7,borderRadius:2,background:'#3A4A5E',flexShrink:0}}/>
                              <span style={{flex:1}}>Unallocated (flagged OpEx)</span>
                              <span style={{width:60,textAlign:'right' as const,color:d.unallocPlanned<0?'#E74C3C':'#7A8FA6'}}>{fmtUSD(d.unallocPlanned)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {TEAMS.every(t=>!rollup[t]||rollup[t].total<=0)&&<div style={{fontSize:12,color:'#7A8FA6',fontStyle:'italic'}}>No active roster people with a team and department set yet.</div>}
          </div>
        )
      })()}

      {view==='dashboard'&&(
        <div>
          <div style={{display:'flex',gap:14,marginBottom:20}}>
            <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'16px 22px'}}>
              <div style={{fontSize:26,fontWeight:800,color:'#5DADE2'}}>{fmtUSD(portfolioForecast)}</div>
              <div style={{fontSize:11,color:'#7A8FA6'}}>Portfolio Forecast</div>
            </div>
            <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'16px 22px'}}>
              <div style={{fontSize:26,fontWeight:800,color:portfolioActual>portfolioForecast?'#E74C3C':'#27AE60'}}>{fmtUSD(portfolioActual)}</div>
              <div style={{fontSize:11,color:'#7A8FA6'}}>Actual to Date</div>
            </div>
            <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'16px 22px'}}>
              <div style={{fontSize:26,fontWeight:800,color:(portfolioActual-portfolioForecast)>0?'#E74C3C':'#7A8FA6'}}>{(portfolioActual-portfolioForecast)>=0?'+':''}{fmtUSD(portfolioActual-portfolioForecast)}</div>
              <div style={{fontSize:11,color:'#7A8FA6'}}>Delta</div>
            </div>
          </div>
          {rollup.length===0&&<div style={{fontSize:12,color:'#7A8FA6',fontStyle:'italic'}}>No active projects with dates set.</div>}
          {rollup.map(({project,fc,ac,elapsedPct,spentPct}:any)=>{
            const flag=elapsedPct!=null&&spentPct!=null&&spentPct-elapsedPct>15
            return(
              <div key={project.id} style={{background:'#12202F',border:'1px solid '+(flag?'rgba(231,76,60,0.5)':'#243447'),borderRadius:10,padding:'12px 16px',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{width:9,height:9,borderRadius:2,background:project.color||'#3A4A5E'}}/>
                  <span style={{fontSize:14,fontWeight:700,color:'#F4F6F8'}}>{project.name}</span>
                  {flag&&<span style={{fontSize:9,fontWeight:700,color:'#E74C3C',border:'1px solid #E74C3C',borderRadius:8,padding:'1px 7px'}}>BURNING FAST</span>}
                  {fc.unset&&<span style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic'}}>— set project dates to forecast</span>}
                </div>
                {!fc.unset&&(
                  <>
                  <div style={{display:'flex',gap:20,fontSize:12,marginBottom:8}}>
                    <span style={{color:'#7A8FA6'}}>Forecast: <b style={{color:'#5DADE2'}}>{fmtUSD(fc.total)}</b></span>
                    <span style={{color:'#7A8FA6'}}>Actual: <b style={{color:ac.total>fc.total?'#E74C3C':'#27AE60'}}>{fmtUSD(ac.total)}</b></span>
                    <span style={{color:'#7A8FA6'}}>Delta: <b style={{color:(ac.total-fc.total)>0?'#E74C3C':'#7A8FA6'}}>{(ac.total-fc.total)>=0?'+':''}{fmtUSD(ac.total-fc.total)}</b></span>
                  </div>
                  <div style={{display:'flex',gap:6,fontSize:10,color:'#7A8FA6'}}>
                    <div style={{flex:1,background:'#0D1B2A',borderRadius:4,height:6,overflow:'hidden',position:'relative' as const}}>
                      <div style={{width:`${Math.min(100,spentPct||0)}%`,height:'100%',background:flag?'#E74C3C':'#5DADE2'}}/>
                    </div>
                    <span>{spentPct==null?'—':spentPct+'% spent'}</span>
                    <span>·</span>
                    <span>{elapsedPct==null?'—':elapsedPct+'% elapsed'}</span>
                  </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DoneTab({items,setItems,projects,setProjects,ccrs,ccrItems,space}:{items:any[],setItems:any,projects:any[],setProjects:any,ccrs:any[],ccrItems:any[],space:string}) {
  const [ccrSecOpen,setCcrSecOpen]=useState(true)
  const [dnCcrExp,setDnCcrExp]=useState<any>({})
  const ccrOf=(itemId:any)=>{const l=ccrItems.find((x:any)=>x.item_id===itemId);return l?ccrs.find((c:any)=>c.id===l.ccr_id):null}
  const [projOpen,setProjOpen]=useState(true)
  const [itemOpen,setItemOpen]=useState(true)
  const [pSrch,setPSrch]=useState('');const [pTeam,setPTeam]=useState('All');const [pStatus,setPStatus]=useState('All')
  const [iSrch,setISrch]=useState('');const [iTeam,setITeam]=useState('All');const [iPri,setIPri]=useState('All')
  const [iSwim,setISwim]=useState('All');const [iProj,setIProj]=useState('All');const [iStatus,setIStatus]=useState('All')

  const doneProjects=projects.filter(isProjectDone).filter(p=>{
    if(pTeam!=='All'&&p.team!==pTeam) return false
    if(pStatus!=='All'&&p.status!==pStatus) return false
    if(pSrch&&!p.name?.toLowerCase().includes(pSrch.toLowerCase())) return false
    return true
  }).sort((a,b)=>(a.end_date||'')<(b.end_date||'')?1:-1)

  const allDoneItems=items.filter(isItemDone)
  const doneItems=allDoneItems.filter(i=>{
    if(iTeam!=='All'&&i.team!==iTeam) return false
    if(iPri!=='All'&&i.priority!==iPri) return false
    if(iSwim!=='All'&&i.swimlane!==iSwim) return false
    if(iProj!=='All'&&i.parent_project!==iProj) return false
    if(iStatus!=='All'&&i.status!==iStatus) return false
    if(iSrch&&!i.name?.toLowerCase().includes(iSrch.toLowerCase())&&!i.item_id?.toLowerCase().includes(iSrch.toLowerCase())) return false
    return true
  }).sort((a,b)=>(a.end_date||'')<(b.end_date||'')?1:-1)

  const swimOpts=[...new Set(allDoneItems.map(i=>i.swimlane).filter(Boolean))].sort()
  const projOpts=[...new Set(allDoneItems.map(i=>i.parent_project).filter(Boolean))].sort()
  const selS={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'5px 8px',fontSize:11}
  const TDD={padding:'6px 10px',borderBottom:'1px solid #1A2838',fontSize:12,color:'#B8C4D0'}
  const THD={padding:'6px 10px',borderBottom:'1px solid #243447',fontSize:10,fontWeight:700,letterSpacing:0.5,color:'#7A8FA6',textAlign:'left' as const}
  const secBtn=(open:boolean)=>({background:'none',border:'none',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:14,fontWeight:800,color:'#16A085',letterSpacing:1,marginBottom:open?12:0})

  return(
    <div style={{height:'100%',overflowY:'auto',padding:'20px 28px'}}>
      <div style={{fontSize:12,color:'#7A8FA6',marginBottom:18}}>History of completed work — records land here automatically when marked {ITEM_TERMINAL.join(' / ')} (items) or {PROJECT_TERMINAL.join(' / ')} (projects)</div>

      {/* Closed change requests */}
      {space==='work'&&(()=>{
        const closedCcrs=ccrs.filter((c:any)=>c.status==='Closed')
        if(!closedCcrs.length)return null
        return(
          <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'14px 18px',marginBottom:20}}>
            <button onClick={()=>setCcrSecOpen(o=>!o)} style={secBtn(ccrSecOpen) as any}><span style={{fontSize:11}}>{ccrSecOpen?'▾':'▸'}</span>📋 CLOSED CHANGE REQUESTS ({closedCcrs.length})</button>
            {ccrSecOpen&&closedCcrs.map((c:any)=>{
              const pr=projects.find((p:any)=>p.id===c.project_id)
              const linked=ccrItems.filter((l:any)=>l.ccr_id===c.id).map((l:any)=>items.find(x=>x.id===l.item_id)).filter(Boolean)
              const exp=dnCcrExp[c.id]
              return(
                <div key={c.id} style={{borderTop:'1px solid #1A2838',padding:'8px 0'}}>
                  <div onClick={()=>setDnCcrExp((e:any)=>({...e,[c.id]:!e[c.id]}))} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                    <span style={{fontSize:9,color:'#7A8FA6'}}>{exp?'▾':'▸'}</span>
                    <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8'}}>{c.title}</span>
                    {c.ccr_number&&<span style={{fontSize:10,fontFamily:'monospace',color:'#5DADE2',border:'1px solid #24445E',borderRadius:3,padding:'0 5px'}}>{c.ccr_number}</span>}
                    {pr&&<span style={{fontSize:10,color:'#7A8FA6',borderLeft:`3px solid ${pr.color||'#3A4A5E'}`,paddingLeft:5}}>{pr.name}</span>}
                    {c.target_date&&<span style={{fontSize:10,color:'#7A8FA6'}}>{c.target_date}</span>}
                    <span style={{fontSize:10,color:'#7A8FA6',marginLeft:'auto'}}>{linked.length} item{linked.length!==1?'s':''}</span>
                  </div>
                  {exp&&(
                    <div style={{margin:'6px 0 0 22px'}}>
                      {linked.length===0&&<div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic'}}>No items were attached</div>}
                      {linked.map((it:any)=>(
                        <div key={it.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,padding:'2px 0'}}>
                          <span style={{fontFamily:'monospace',fontSize:10,color:'#7A8FA6'}}>{it.item_id}</span>
                          <span style={{color:'#C8C8D4'}}>{rt(it.request_type)} {it.name}</span>
                          <span style={{fontSize:9,fontWeight:700,color:sc(it.status)}}>{it.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
      {/* Projects */}
      <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'14px 18px',marginBottom:20}}>
        <button onClick={()=>setProjOpen(o=>!o)} style={secBtn(projOpen) as any}><span style={{fontSize:11}}>{projOpen?'▾':'▸'}</span>◈ PROJECTS ({doneProjects.length})</button>
        {projOpen&&(
          <>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
            <input placeholder="Search projects..." value={pSrch} onChange={e=>setPSrch(e.target.value)} style={{...selS,width:200}}/>
            <select value={pTeam} onChange={e=>setPTeam(e.target.value)} style={selS}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
            <select value={pStatus} onChange={e=>setPStatus(e.target.value)} style={selS}><option value="All">All Statuses</option>{PROJECT_TERMINAL.map(t=><option key={t}>{t}</option>)}</select>
          </div>
          {doneProjects.length===0&&<div style={{fontSize:12,color:'#7A8FA6',fontStyle:'italic'}}>No completed projects{pSrch||pTeam!=='All'||pStatus!=='All'?' matching filters':''}</div>}
          {doneProjects.length>0&&(
            <table style={{borderCollapse:'collapse',width:'100%'}}>
              <thead><tr><th style={THD}>Project</th><th style={THD}>Status</th><th style={THD}>Priority</th><th style={THD}>Team</th><th style={THD}>Timeline</th><th style={THD}>Items</th></tr></thead>
              <tbody>{doneProjects.map(p=>{
                const pi=items.filter(i=>i.parent_project===p.name)
                return(
                  <tr key={p.id}>
                    <td style={{...TDD,fontWeight:600,color:'#F4F6F8'}}><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:p.color||'#3A4A5E',marginRight:8}}/>{p.name}</td>
                    <td style={TDD}>
                      <select value={p.status} onChange={async e=>{
                        const v=e.target.value
                        setProjects((prev:any[])=>prev.map(x=>x.id===p.id?{...x,status:v}:x))
                        const{error}=await supabase.from('projects').update({status:v}).eq('id',p.id)
                        if(error)alert('Failed to update: '+error.message)
                      }} style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:p.status==='Complete'?'#16A085':'#7A8FA6',fontSize:11,fontWeight:700,padding:'2px 6px',cursor:'pointer',fontFamily:'inherit'}}>
                        {projectStatusesFor(spaceOf(p)).map(st=><option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td style={TDD}>{p.priority}</td>
                    <td style={TDD}>{p.team}</td>
                    <td style={TDD}>{p.start_date&&p.end_date?`${p.start_date} → ${p.end_date}`:'—'}</td>
                    <td style={TDD}>{pi.filter(isItemDone).length} done / {pi.length}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          )}
          </>
        )}
      </div>

      {/* Items */}
      <div style={{background:'#12202F',border:'1px solid #243447',borderRadius:10,padding:'14px 18px'}}>
        <button onClick={()=>setItemOpen(o=>!o)} style={secBtn(itemOpen) as any}><span style={{fontSize:11}}>{itemOpen?'▾':'▸'}</span>≡ ITEMS ({doneItems.length})</button>
        {itemOpen&&(
          <>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
            <input placeholder="Search items..." value={iSrch} onChange={e=>setISrch(e.target.value)} style={{...selS,width:200}}/>
            <select value={iTeam} onChange={e=>setITeam(e.target.value)} style={selS}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
            <select value={iPri} onChange={e=>setIPri(e.target.value)} style={selS}><option value="All">All Priorities</option>{PRIORITIES.map(t=><option key={t}>{t}</option>)}</select>
            <select value={iSwim} onChange={e=>setISwim(e.target.value)} style={selS}><option value="All">All Swimlanes</option>{swimOpts.map(t=><option key={t}>{t}</option>)}</select>
            <select value={iProj} onChange={e=>setIProj(e.target.value)} style={selS}><option value="All">All Projects</option>{projOpts.map(t=><option key={t}>{t}</option>)}</select>
            <select value={iStatus} onChange={e=>setIStatus(e.target.value)} style={selS}><option value="All">All Statuses</option>{ITEM_TERMINAL.map(t=><option key={t}>{t}</option>)}</select>
          </div>
          {doneItems.length===0&&<div style={{fontSize:12,color:'#7A8FA6',fontStyle:'italic'}}>No done items{iSrch||iTeam!=='All'||iPri!=='All'||iSwim!=='All'||iProj!=='All'||iStatus!=='All'?' matching filters':''}</div>}
          {doneItems.length>0&&(
            <table style={{borderCollapse:'collapse',width:'100%'}}>
              <thead><tr><th style={THD}>ID</th><th style={THD}>Item</th><th style={THD}>Status</th><th style={THD}>Priority</th><th style={THD}>Swimlane</th><th style={THD}>Team</th><th style={THD}>Project</th><th style={THD}>CCR</th><th style={THD}>End Date</th></tr></thead>
              <tbody>{doneItems.map(i=>(
                <tr key={i.id}>
                  <td style={{...TDD,fontFamily:'monospace',fontSize:10,color:'#7A8FA6'}}>{i.item_id}</td>
                  <td style={{...TDD,color:'#F4F6F8'}}>{rt(i.request_type)} {i.name}</td>
                  <td style={TDD}>
                    <select value={i.status} onChange={e=>applyItemStatus(items,setItems,i.id,e.target.value)}
                      style={{background:'#1E3048',border:'1px solid #243447',borderRadius:4,color:i.status==='Done'?'#16A085':'#7A8FA6',fontSize:11,fontWeight:700,padding:'2px 6px',cursor:'pointer',fontFamily:'inherit'}}>
                      {statusesFor(spaceOf(i)).map(st=><option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                  <td style={TDD}>{i.priority}</td>
                  <td style={TDD}>{i.swimlane}</td>
                  <td style={TDD}>{i.team}</td>
                  <td style={TDD}>{i.parent_project||'—'}</td>
                  <td style={TDD}>{(()=>{const c=ccrOf(i.id);return c?<span title={c.title} style={{fontFamily:'monospace',fontSize:10,color:'#5DADE2'}}>{c.ccr_number||c.title}</span>:'—'})()}</td>
                  <td style={TDD}>{i.end_date||'—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          </>
        )}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// Assistant — conversational copilot. Client runs the tool loop against
// live app state; /api/assistant proxies Claude and holds the key.
function Assistant({open,setOpen,seed,setSeed,items,setItems,projects,setProjects,milestones,tasks,setTasks,ccrs,setCcrs,ccrItems,setCcrItems,space}:any){
  const [msgs,setMsgs]=useState<any[]>([])       // UI transcript: {role:'user'|'assistant'|'act',text}
  const [apiMsgs,setApiMsgs]=useState<any[]>([]) // raw Anthropic message history
  const [input,setInput]=useState('')
  const [busy,setBusy]=useState(false)
  const [voiceOut,setVoiceOut]=useState(()=>{try{return localStorage.getItem('pg_voice')==='1'}catch{return false}})
  const [listening,setListening]=useState(false)
  const recRef=useRef<any>(null)
  const silenceTimer=useRef<any>(null)
  const scrollRef=useRef<any>(null)
  const mobile=useIsMobile()

  const audioRef=useRef<any>(null)
  const voiceErrShown=useRef(false)
  const handsFree=useRef(false) // last user turn came from the mic → keep the conversation going
  function stopAudio(){try{audioRef.current?.pause();audioRef.current&&(audioRef.current.currentTime=0)}catch{};try{window.speechSynthesis?.cancel()}catch{}}
  async function speak(text:string){
    if(!voiceOut)return
    stopAudio()
    const clean=text.replace(/[*_#`•◈≡→]/g,' ').trim()
    if(!clean)return
    try{
      const r=await fetch('/api/voice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:clean})})
      if(!r.ok&&!voiceErrShown.current){
        voiceErrShown.current=true
        let why='HTTP '+r.status+(r.status===404?' — is the file at app/api/voice/route.ts?':'')
        try{const j=await r.clone().json();if(j?.error)why=j.error+(/quota|billing/i.test(j.error)?' — enable billing at platform.openai.com':'')}catch{}
        setMsgs(m=>[...m,{role:'act',text:'🔇 Using fallback voice — /api/voice failed: '+why}])
      }
      if(r.ok){
        const blob=await r.blob()
        const url=URL.createObjectURL(blob)
        if(!audioRef.current)audioRef.current=new Audio()
        const a=audioRef.current
        a.src=url
        a.onended=()=>{URL.revokeObjectURL(url);if(handsFree.current&&voiceOut)setTimeout(()=>toggleMic(true),250)}
        await a.play()
        return
      }
    }catch{}
    // Fallback: browser voice, so it still talks if the key is missing
    try{
      const u=new SpeechSynthesisUtterance(clean.replace(/RTL-/g,'R T L '))
      u.rate=1.05
      u.onend=()=>{if(handsFree.current&&voiceOut)setTimeout(()=>toggleMic(true),250)}
      window.speechSynthesis.speak(u)
    }catch{}
  }
  function toggleVoice(){
    const v=!voiceOut
    setVoiceOut(v)
    try{localStorage.setItem('pg_voice',v?'1':'0')}catch{}
    if(v){
      // Unlock iOS audio inside this tap, then confirm with the real voice
      try{if(!audioRef.current)audioRef.current=new Audio();audioRef.current.play().catch(()=>{})}catch{}
      speak("Voice is on. I'm listening whenever you tap the mic.")
    }else{handsFree.current=false;stopAudio()}
  }
  function toggleMic(auto?:boolean){
    if(listening){try{recRef.current?.stop()}catch{};setListening(false);if(!auto)handsFree.current=false;return}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition
    if(!SR){if(!auto)alert('Speech input isn\u2019t available in this browser \u2014 use the \ud83c\udfa4 on your keyboard instead.');return}
    stopAudio() // barge-in: talking interrupts the reply
    try{
      const rec=new SR()
      recRef.current=rec
      // continuous + our own silence timer — the browser's built-in end-of-speech
      // detection cuts off after a very short pause; this gives real thinking room.
      rec.lang='en-US';rec.interimResults=true;rec.continuous=true
      let final=''
      const SILENCE_MS=2200
      const clearSilenceTimer=()=>{if(silenceTimer.current){clearTimeout(silenceTimer.current);silenceTimer.current=null}}
      const armSilenceTimer=()=>{
        clearSilenceTimer()
        silenceTimer.current=setTimeout(()=>{try{rec.stop()}catch{}},SILENCE_MS)
      }
      rec.onresult=(e:any)=>{
        armSilenceTimer() // any new speech (interim or final) resets the countdown
        let interim=''
        for(let i=e.resultIndex;i<e.results.length;i++){
          const t=e.results[i][0].transcript
          if(e.results[i].isFinal)final+=t+' ';else interim+=t
        }
        setInput((final+interim).trim())
      }
      rec.onend=()=>{
        clearSilenceTimer()
        setListening(false)
        if(final.trim()){handsFree.current=true;setInput('');send(final.trim())}
        else if(auto)handsFree.current=false // silence ends the hands-free chain quietly
      }
      rec.onerror=(e:any)=>{clearSilenceTimer();setListening(false);if(auto)handsFree.current=false;if(e?.error==='no-speech'&&!auto)alert("Didn't catch anything — tap the mic and try again.")}
      setListening(true)
      armSilenceTimer() // room to start talking before the first result arrives
      rec.start()
    }catch{setListening(false)}
  }
  useEffect(()=>{return()=>{try{stopAudio();recRef.current?.stop()}catch{}}},[])

  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight},[msgs,busy])
  // Seed from the Desk quick bar
  useEffect(()=>{if(open&&seed){const t=seed;setSeed('');send(t)}},[open,seed])
  // Morning brief: first open of the day leads with it
  useEffect(()=>{
    if(!open)return
    try{
      const today=localISO(new Date())
      if(localStorage.getItem('pg_brief_date')!==today&&msgs.length===0){
        localStorage.setItem('pg_brief_date',today)
        send('Good morning — give me my brief.')
      }
    }catch{}
  },[open])

  const findProject=(ref:string)=>{
    if(!ref)return null
    const r=ref.toLowerCase()
    const pool=projects.filter((p:any)=>spaceOf(p)===space)
    return pool.find((p:any)=>p.name.toLowerCase()===r)||pool.find((p:any)=>p.name.toLowerCase().includes(r))||null
  }
  const findItem=(ref:string)=>{
    const r=(ref||'').toLowerCase().trim()
    const pool=items.filter((i:any)=>spaceOf(i)===space)
    return pool.find((i:any)=>(i.item_id||'').toLowerCase()===r)
      ||pool.filter((i:any)=>!ITEM_TERMINAL.includes(i.status)).find((i:any)=>(i.name||'').toLowerCase().includes(r))
      ||pool.find((i:any)=>(i.name||'').toLowerCase().includes(r))||null
  }

  // ── Tool executors: same writes the UI makes, reported back as JSON
  async function execTool(name:string,inp:any):Promise<any>{
    try{
      if(name==='get_overview'){
        const now=Date.now(),in7=now+7*86400000
        const act=items.filter((i:any)=>spaceOf(i)===space&&!ITEM_TERMINAL.includes(i.status))
        const due=act.filter((i:any)=>i.end_date&&+new Date(i.end_date+'T12:00:00')<=in7)
          .map((i:any)=>({id:i.item_id,name:i.name,end:i.end_date,status:i.status,project:i.parent_project,overdue:+new Date(i.end_date+'T12:00:00')<now}))
        const ms=milestones.filter((m:any)=>spaceOf(m)===space&&!m.completed&&+new Date(m.date+'T12:00:00')>=now-86400000&&+new Date(m.date+'T12:00:00')<=now+14*86400000)
          .map((m:any)=>({date:m.date,name:m.name,project:projects.find((p:any)=>p.id===m.project_id)?.name}))
        const openCcrs=ccrs.filter((c:any)=>c.status!=='Closed').map((c:any)=>({title:c.title,status:c.status,number:c.ccr_number,target:c.target_date,project:projects.find((p:any)=>p.id===c.project_id)?.name}))
        const flagsI=act.filter((i:any)=>i.flagged).map((i:any)=>({id:i.item_id,name:i.name,audience:i.flag_audience||'both',notes:i.notes}))
        const flagsP=projects.filter((p:any)=>spaceOf(p)===space&&p.flagged&&!PROJECT_TERMINAL.includes(p.status)).map((p:any)=>({name:p.name,audience:p.flag_audience||'both',notes:p.flag_notes,rag:p.rag}))
        const openTasks=tasks.filter((t:any)=>spaceOf(t)===space&&!t.done).map((t:any)=>({title:t.title,due:t.due_date,project:projects.find((p:any)=>p.id===t.project_id)?.name||'General',overdue:t.due_date&&+new Date(t.due_date+'T12:00:00')<now}))
        return{today:localISO(new Date()),space,counts:{active_items:act.length,projects:projects.filter((p:any)=>spaceOf(p)===space&&!PROJECT_TERMINAL.includes(p.status)).length},due_within_7_days:due,milestones_next_14_days:ms,ccrs_open:openCcrs,flagged_items:flagsI,flagged_projects:flagsP,open_tasks:openTasks}
      }
      if(name==='find_items'){
        const q=(inp.query||'').toLowerCase()
        const hits=items.filter((i:any)=>spaceOf(i)===space&&((i.item_id||'').toLowerCase().includes(q)||(i.name||'').toLowerCase().includes(q)||(i.parent_project||'').toLowerCase().includes(q)||(i.vendor||'').toLowerCase().includes(q)))
          .slice(0,12).map((i:any)=>({id:i.item_id,name:i.name,status:i.status,priority:i.priority,project:i.parent_project,flagged:!!i.flagged}))
        return{matches:hits}
      }
      if(name==='add_item'){
        let team=inp.team||null,parent=null
        if(inp.project){
          const pr=findProject(inp.project)
          if(!pr)return{error:`No project matched "${inp.project}"`,projects:projects.filter((p:any)=>spaceOf(p)===space&&!PROJECT_TERMINAL.includes(p.status)).map((p:any)=>p.name)}
          parent=pr.name;team=team||pr.team||null
        }
        if(team){const t=TEAMS.find(x=>x.toLowerCase().includes(String(team).toLowerCase()));if(t)team=t}
        const payload:any={item_id:nextItemId(items),name:inp.name,description:inp.description||null,
          request_type:inp.request_type||'Enhancement',priority:inp.priority||'P3',
          status:space==='home'?'To Do':'New',effort:inp.effort||'M',swimlane:'POS',region:'',vendor:'',
          flagged:!!inp.flag_audience,flag_audience:inp.flag_audience||null,notes:inp.flag_notes||null,
          parent_project:parent,team,sort_order:items.length,space}
        const{data,error}=await supabase.from('items').insert(payload).select().single()
        if(error)return{error:error.message}
        if(data)setItems((prev:any[])=>[...prev,data])
        return{created:{id:payload.item_id,name:payload.name,project:parent||'none',team:team||'none',priority:payload.priority,type:payload.request_type,flagged:inp.flag_audience||'no'}}
      }
      if(name==='create_ccr'){
        let projectId=null,pname=null
        if(inp.project){
          const pr=findProject(inp.project)
          if(!pr)return{error:`No project matched "${inp.project}"`,projects:projects.filter((p:any)=>spaceOf(p)===space&&!PROJECT_TERMINAL.includes(p.status)).map((p:any)=>p.name)}
          projectId=pr.id;pname=pr.name
        }
        const{data,error}=await supabase.from('ccrs').insert({title:inp.title,project_id:projectId,target_date:inp.target_date||null,status:'To Create'}).select().single()
        if(error)return{error:error.message}
        if(data)setCcrs((prev:any[])=>[...prev,data])
        return{created:{ccr:inp.title,project:pname||'none',target_date:inp.target_date||'none',status:'To Create'}}
      }
      if(name==='add_task'){
        let projectId=null,pname='General',tSpace=space
        if(inp.project){
          const pr=findProject(inp.project)
          if(!pr)return{error:`No project matched "${inp.project}"`,projects:projects.filter((p:any)=>spaceOf(p)===space&&!PROJECT_TERMINAL.includes(p.status)).map((p:any)=>p.name)}
          projectId=pr.id;pname=pr.name;tSpace=spaceOf(pr)
        }
        const ok=await addProjectTask(setTasks,projectId,inp.title,inp.due_date||null,tSpace)
        if(!ok)return{error:'Task insert failed'}
        return{created:{task:inp.title,project:pname,due:inp.due_date||'none'}}
      }
      if(name==='flag_item'){
        const it=findItem(inp.item)
        if(!it)return{error:`No item matched "${inp.item}"`,hint:'Try find_items first'}
        const upd:any=inp.audience==='none'?{flagged:false,flag_audience:null}:{flagged:true,flag_audience:inp.audience}
        if(inp.notes!==undefined&&inp.audience!=='none')upd.notes=inp.notes
        setItems((prev:any[])=>prev.map(x=>x.id===it.id?{...x,...upd}:x))
        const{error}=await supabase.from('items').update(upd).eq('id',it.id)
        if(error)return{error:error.message}
        return{updated:{id:it.item_id,name:it.name,flag:inp.audience,notes:upd.notes??it.notes??null}}
      }
      if(name==='update_item_status'){
        const it=findItem(inp.item)
        if(!it)return{error:`No item matched "${inp.item}"`,hint:'Try find_items first'}
        const st=statusesFor(spaceOf(it)).find(x=>x.toLowerCase()===String(inp.status||'').toLowerCase())
        if(!st)return{error:`"${inp.status}" is not a valid status`,valid:statusesFor(spaceOf(it))}
        await applyItemStatus(items,setItems,it.id,st)
        return{updated:{id:it.item_id,name:it.name,status:st}}
      }
      if(name==='delete_item'){
        const it=findItem(inp.item)
        if(!it)return{error:`No item matched "${inp.item}"`,hint:'Try find_items first'}
        const label=`${it.item_id} — ${it.name}`
        setItems((prev:any[])=>prev.filter(x=>x.id!==it.id))
        const{error}=await supabase.from('items').delete().eq('id',it.id)
        if(error){setItems((prev:any[])=>[...prev,it]);return{error:error.message}}
        return{deleted:{item:label}}
      }
      if(name==='delete_task'){
        const q=(inp.task||'').toLowerCase()
        const pool=tasks.filter((t:any)=>spaceOf(t)===space)
        const t=pool.find((x:any)=>(x.title||'').toLowerCase()===q)||pool.find((x:any)=>(x.title||'').toLowerCase().includes(q))
        if(!t)return{error:`No task matched "${inp.task}"`}
        const label=t.title
        setTasks((prev:any[])=>prev.filter((x:any)=>x.id!==t.id))
        const{error}=await supabase.from('tasks').delete().eq('id',t.id)
        if(error){setTasks((prev:any[])=>[...prev,t]);return{error:error.message}}
        return{deleted:{task:label}}
      }
      return{error:`Unknown tool ${name}`}
    }catch(e:any){return{error:String(e?.message||e)}}
  }

  async function send(text:string){
    if(!text.trim()||busy)return
    setBusy(true)
    setMsgs(m=>[...m,{role:'user',text}])
    setInput('')
    let history=[...apiMsgs,{role:'user',content:text}]
    const context={
      today:localISO(new Date()),space,voice:voiceOut,
      projects:projects.filter((p:any)=>spaceOf(p)===space&&!PROJECT_TERMINAL.includes(p.status)).map((p:any)=>p.name),
      teams:TEAMS,statuses:statusesFor(space),
    }
    try{
      for(let hop=0;hop<6;hop++){
        const r=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:history,context})})
        const data=await r.json()
        if(!r.ok){setMsgs(m=>[...m,{role:'assistant',text:'⚠ '+(data?.error||'Assistant request failed')+(r.status===500?' — check ANTHROPIC_API_KEY in Vercel.':'')}]);break}
        history=[...history,{role:'assistant',content:data.content}]
        const toolUses=(data.content||[]).filter((b:any)=>b.type==='tool_use')
        const texts=(data.content||[]).filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n').trim()
        if(texts){setMsgs(m=>[...m,{role:'assistant',text:texts}]);speak(texts)}
        if(toolUses.length===0)break
        const results:any[]=[]
        for(const tu of toolUses){
          setMsgs(m=>[...m,{role:'act',text:`⚙ ${tu.name.replace(/_/g,' ')}…`}])
          const out=await execTool(tu.name,tu.input||{})
          results.push({type:'tool_result',tool_use_id:tu.id,content:JSON.stringify(out)})
        }
        history=[...history,{role:'user',content:results}]
      }
      setApiMsgs(history)
    }catch(e:any){
      setMsgs(m=>[...m,{role:'assistant',text:'⚠ '+String(e?.message||e)}])
    }
    setBusy(false)
  }

  if(!open)return(
    <button onClick={()=>setOpen(true)} title="Assistant"
      style={{position:'fixed',right:18,bottom:18,zIndex:400,width:48,height:48,borderRadius:24,background:'#C8973A',border:'none',color:'#0D1B2A',fontSize:22,cursor:'pointer',boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}}>💬</button>
  )
  return(
    <div style={{position:'fixed',right:mobile?0:18,bottom:mobile?0:18,top:mobile?0:'auto',left:mobile?0:'auto',zIndex:400,width:mobile?'100%':400,height:mobile?'100%':560,background:'#0F1C2B',border:'1px solid #243447',borderRadius:mobile?0:12,display:'flex',flexDirection:'column' as const,boxShadow:'0 8px 32px rgba(0,0,0,0.6)',boxSizing:'border-box' as const}}>
      <style>{`@keyframes pgPulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:'1px solid #243447',flexShrink:0}}>
        <span style={{fontSize:13,fontWeight:800,color:'#F4F6F8'}}>💬 Assistant</span>
        <span style={{fontSize:9,color:'#7A8FA6',border:'1px solid #243447',borderRadius:8,padding:'1px 7px'}}>{space==='home'?'🏠 Home':'🏢 Work'}</span>
        <button onClick={toggleVoice} title={voiceOut?'Voice replies on — click to mute':'Speak replies aloud'} style={{marginLeft:'auto',background:'none',border:'1px solid '+(voiceOut?'#C8973A':'#243447'),borderRadius:5,color:voiceOut?'#C8973A':'#7A8FA6',fontSize:12,padding:'2px 8px',cursor:'pointer'}}>{voiceOut?'🔊':'🔇'}</button>
        <button onClick={()=>{setMsgs([]);setApiMsgs([])}} title="New conversation" style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:10,padding:'2px 8px',cursor:'pointer'}}>New</button>
        <button onClick={()=>setOpen(false)} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:17,cursor:'pointer',lineHeight:1}}>✕</button>
      </div>
      <div ref={scrollRef} style={{flex:1,minHeight:0,overflowY:'auto',padding:'12px 14px'}}>
        {msgs.length===0&&!busy&&(
          <div style={{fontSize:11,color:'#7A8FA6',lineHeight:1.7}}>
            Try:<br/>“Add backlog item X to Boomi, flag it for dev”<br/>“Create a CCR for POS deployment next Tuesday”<br/>“Task on Peak Prep: reach out to stakeholders Friday”<br/>“What's due this week?” · “Morning brief”
          </div>
        )}
        {msgs.map((m,ix)=>m.role==='act'
          ?<div key={ix} style={{fontSize:10,color:'#5DADE2',margin:'2px 0 8px',fontStyle:'italic'}}>{m.text}</div>
          :<div key={ix} style={{marginBottom:10,display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'88%',background:m.role==='user'?'#C8973A':'#162436',color:m.role==='user'?'#0D1B2A':'#E8ECF1',border:m.role==='user'?'none':'1px solid #243447',borderRadius:10,padding:'8px 11px',fontSize:12,lineHeight:1.55,whiteSpace:'pre-wrap' as const}}>{m.text}</div>
          </div>
        )}
        {busy&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>thinking…</div>}
      </div>
      <div style={{display:'flex',gap:7,padding:'10px 12px',borderTop:'1px solid #243447',flexShrink:0}}>
        <button onClick={()=>toggleMic()} title={listening?'Listening — tap to stop':'Tap and speak'}
          style={{background:listening?'#E74C3C':'#1E3048',border:'1px solid '+(listening?'#E74C3C':'#243447'),borderRadius:8,color:'#fff',fontSize:15,padding:'0 12px',cursor:'pointer',flexShrink:0,animation:listening?'pgPulse 1.2s infinite':'none'}}>🎤</button>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send(input)}}
          placeholder={listening?'Listening…':'Tell me or ask me anything…'}
          style={{flex:1,minWidth:0,background:'#0D1B2A',border:'1px solid '+(listening?'#E74C3C':'#243447'),borderRadius:8,color:'#F4F6F8',fontSize:13,padding:'9px 11px'}}/>
        <button onClick={()=>send(input)} disabled={busy||!input.trim()}
          style={{background:'#C8973A',border:'none',borderRadius:8,color:'#0D1B2A',fontSize:13,fontWeight:800,padding:'0 15px',cursor:'pointer',opacity:busy||!input.trim()?0.5:1}}>➤</button>
      </div>
    </div>
  )
}

export default function PerfectGame() {
  const [items,setItems]=useState([])
  const [projects,setProjects]=useState([])
  const [milestones,setMilestones]=useState([])
  const [tasks,setTasks]=useState<any[]>([])
  const [ccrs,setCcrs]=useState<any[]>([])
  const [ccrItems,setCcrItems]=useState<any[]>([])
  const [roles,setRoles]=useState<any[]>([])
  const [people,setPeople]=useState<any[]>([])
  const [projectRoles,setProjectRoles]=useState<any[]>([])
  const [itemAssignments,setItemAssignments]=useState<any[]>([])
  const [qBudgets,setQBudgets]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [activeTab,setActiveTab]=useState('desk')
  const [space,setSpace]=useState('work')
  const [asstOpen,setAsstOpen]=useState(false)
  const [asstSeed,setAsstSeed]=useState('')
  const mobile=useIsMobile()
  // Space-scoped views: every tab except Desk sees only the current space.
  // Scoped setters merge edits back into the full arrays so cross-space data is never dropped.
  const inSpace=(x:any)=>spaceOf(x)===space
  const scopedSetter=(setAll:any)=>(u:any)=>setAll((prev:any[])=>{
    const others=prev.filter(x=>!inSpace(x))
    const scoped=prev.filter(inSpace)
    const next=typeof u==='function'?u(scoped):u
    return[...others,...next]
  })
  const sItems=items.filter(inSpace),sProjects=projects.filter(inSpace),sMilestones=milestones.filter(inSpace)
  const setSItems=scopedSetter(setItems),setSProjects=scopedSetter(setProjects),setSMilestones=scopedSetter(setMilestones)
  // Teams & Stakeholder are work-only concepts
  useEffect(()=>{if(space==='home'&&(activeTab==='teams'||activeTab==='stakeholder'||activeTab==='budget'))setActiveTab('desk')},[space])

useEffect(()=>{
    async function load(){
      const[{data:itemData},{data:projectData},{data:milestoneData},{data:taskData},{data:ccrData},{data:ccrItemData},{data:roleData},{data:peopleData},{data:projRoleData},{data:itemAsgData},{data:qbData}]=await Promise.all([
      supabase.from('items').select('*').order('sort_order',{ascending:true}),
      supabase.from('projects').select('*').order('sort_order',{ascending:true}),
      supabase.from('milestones').select('*').order('date',{ascending:true}),
      supabase.from('tasks').select('*').order('due_date',{ascending:true}),
      supabase.from('ccrs').select('*').order('created_at',{ascending:true}),
      supabase.from('ccr_items').select('*'),
      supabase.from('roles').select('*').order('sort_order',{ascending:true}),
      supabase.from('people').select('*').order('sort_order',{ascending:true}),
      supabase.from('project_roles').select('*'),
      supabase.from('item_assignments').select('*'),
      supabase.from('quarterly_budgets').select('*').order('created_at',{ascending:true}),
    ])
    if(itemData) setItems(itemData)
    if(milestoneData) setMilestones(milestoneData)
    if(taskData) setTasks(taskData)
    if(ccrData) setCcrs(ccrData)
    if(ccrItemData) setCcrItems(ccrItemData)
    if(roleData) setRoles(roleData)
    if(peopleData) setPeople(peopleData)
    if(projRoleData) setProjectRoles(projRoleData)
    if(itemAsgData) setItemAssignments(itemAsgData)
    if(qbData) setQBudgets(qbData)

    // Auto-create any missing projects from parent_project values
    if(itemData&&projectData){
      const existingNames=new Set(projectData.map(p=>p.name))
      const missingNames=[...new Set(itemData.map(i=>i.parent_project).filter(Boolean))].filter(n=>!existingNames.has(n))
      if(missingNames.length>0){
        const newProjects=missingNames.map((name,i)=>({
          name,
          description:'',
          priority:'P3',
          status:'Planning',
          rag:'Green',
          team:'Consumer Experience',
          color:'#2E86AB',
          sort_order:(projectData.length+i),
        }))
        const{data:created}=await supabase.from('projects').insert(newProjects).select()
        const allProjects=[...projectData,...(created||[])]
        setProjects(allProjects)
      } else {
        setProjects(projectData)
      }
    }
    setLoading(false)
  }
  load()
  const ch1=supabase.channel('items').on('postgres_changes',{event:'INSERT',schema:'public',table:'items'},()=>load()).subscribe()
  // UPDATE events excluded — our own bulk writes (reorders) were triggering a full reload per row
  const ch2=supabase.channel('projects').on('postgres_changes',{event:'INSERT',schema:'public',table:'projects'},()=>load()).on('postgres_changes',{event:'DELETE',schema:'public',table:'projects'},()=>load()).subscribe()
  const ch3=supabase.channel('milestones').on('postgres_changes',{event:'INSERT',schema:'public',table:'milestones'},()=>load()).on('postgres_changes',{event:'DELETE',schema:'public',table:'milestones'},()=>load()).subscribe()
 return()=>{supabase.removeChannel(ch1);supabase.removeChannel(ch2);supabase.removeChannel(ch3)}
  },[])
  const totalViolations=projects.reduce((acc,p)=>{
    if(!p.start_date||!p.end_date) return acc
    const children=items.filter(i=>i.parent_project===p.name&&i.start_date&&i.end_date)
    return acc+children.filter(i=>new Date(i.start_date)<new Date(p.start_date)||new Date(i.end_date)>new Date(p.end_date)).length
  },0)

  const TABS=[
  {key:'desk',label:'Desk',icon:'✎'},
  {key:'projects',label:'Projects',icon:'◈',badge:totalViolations>0?totalViolations:null},
  {key:'backlog',label:'Backlog',icon:'≡'},
  {key:'roadmap',label:'Roadmap',icon:'◫'},
  {key:'teams',label:'Teams',icon:'⬡'},
  {key:'stakeholder',label:'Stakeholder',icon:'◉'},
  {key:'done',label:'Done',icon:'✓'},
  {key:'budget',label:'Budget',icon:'$'},
]

  if(loading) return(
    <div style={{height:'100vh',background:'#0D1B2A',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <div style={{width:40,height:40,borderRadius:'50%',border:'3px solid #243447',borderTopColor:'#C8973A',animation:'spin 0.8s linear infinite'}}/>
      <div style={{color:'#7A8FA6',fontSize:13}}>Loading Perfect Game...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0D1B2A',color:'#F4F6F8',fontFamily:"'Inter','Helvetica Neue',sans-serif",overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',borderBottom:'1px solid #243447',background:'#162436',flexShrink:0}}>
        <div style={{padding:'0 20px',display:'flex',alignItems:'center',gap:10,borderRight:'1px solid #243447',height:50}}>
          <div style={{width:28,height:28,borderRadius:'50%',border:'2px solid #C8973A',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{width:16,height:16,borderRadius:'50%',border:'1.5px solid #C8973A',borderTopColor:'transparent',transform:'rotate(45deg)'}}/>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:2,color:'#F4F6F8',lineHeight:1}}>PERFECT GAME</div>
            <div style={{fontSize:9,color:'#C8973A',letterSpacing:3,lineHeight:1.4}}>TRUST THE PROCESS</div>
          </div>
        </div>
        <div style={{display:'flex',height:'100%',overflowX:'auto' as const,WebkitOverflowScrolling:'touch' as any}}>
          {TABS.filter(tab=>space==='work'||!['teams','stakeholder','budget'].includes(tab.key)).map(tab=>(
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{background:activeTab===tab.key?'#0D1B2A':'transparent',color:activeTab===tab.key?'#F4F6F8':'#7A8FA6',border:'none',borderBottom:activeTab===tab.key?'2px solid #C8973A':'2px solid transparent',padding:mobile?'0 10px':'0 13px',cursor:'pointer',fontSize:12.5,fontWeight:activeTab===tab.key?700:400,display:'flex',alignItems:'center',gap:6,height:'100%',position:'relative',whiteSpace:'nowrap' as const,flexShrink:0}}>
              <span style={{fontSize:mobile?17:15}}>{tab.icon}</span>
              {!mobile&&tab.label}
              {tab.badge&&<span style={{background:'#E74C3C',color:'#fff',borderRadius:10,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:2}}>{tab.badge}</span>}
            </button>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:4,alignItems:'center',padding:'0 10px',flexShrink:0}}>
          {([['work','🏢','Work'],['home','🏠','Home']] as [string,string,string][]).map(([k,icon,label])=>(
            <button key={k} onClick={()=>setSpace(k)}
              style={{background:space===k?'#C8973A':'transparent',color:space===k?'#0D1B2A':'#7A8FA6',border:'1px solid '+(space===k?'#C8973A':'#243447'),borderRadius:14,padding:mobile?'4px 9px':'4px 12px',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' as const}}>
              {icon}{!mobile&&' '+label}
            </button>
          ))}
        </div>
        {!mobile&&<div title="Deckers Brands · Retail Technology" style={{display:'flex',gap:8,padding:'0 16px',alignItems:'center',fontSize:11,color:'#7A8FA6',whiteSpace:'nowrap' as const}}>
          <span>{items.length} items · {projects.length} projects · {milestones.length} milestones</span>
        </div>}
      </div>
      <div style={{flex:1,overflow:'hidden'}}>
        {activeTab==='backlog'&&<Backlog items={sItems} setItems={setSItems} projects={sProjects} setProjects={setSProjects} space={space} ccrs={ccrs} ccrItems={ccrItems} setCcrItems={setCcrItems}/>}
        {activeTab==='projects'&&<Projects items={sItems} setItems={setSItems} projects={sProjects} setProjects={setSProjects} milestones={sMilestones} setMilestones={setSMilestones} tasks={tasks} setTasks={setTasks} space={space} ccrs={ccrs} ccrItems={ccrItems} roles={roles} people={people} projectRoles={projectRoles} setProjectRoles={setProjectRoles} itemAssignments={itemAssignments} setItemAssignments={setItemAssignments}/>}
{activeTab==='roadmap'&&<Roadmap items={sItems} setItems={setSItems} projects={sProjects} setProjects={setSProjects} milestones={sMilestones}/>}
        {activeTab==='teams'&&<Teams items={sItems} projects={sProjects} milestones={sMilestones} ccrs={ccrs} ccrItems={ccrItems}/>}
        {activeTab==='desk'&&<Desk items={items} setItems={setItems} projects={projects} setProjects={setProjects} milestones={milestones} setMilestones={setMilestones} tasks={tasks} setTasks={setTasks} ccrs={ccrs} setCcrs={setCcrs} ccrItems={ccrItems} setCcrItems={setCcrItems} space={space} openAssistant={(t:string)=>{setAsstSeed(t);setAsstOpen(true)}}/>}
        <Assistant open={asstOpen} setOpen={setAsstOpen} seed={asstSeed} setSeed={setAsstSeed} items={items} setItems={setItems} projects={projects} setProjects={setProjects} milestones={milestones} tasks={tasks} setTasks={setTasks} ccrs={ccrs} setCcrs={setCcrs} ccrItems={ccrItems} setCcrItems={setCcrItems} space={space}/>
        {activeTab==='stakeholder'&&<Stakeholder items={sItems} projects={sProjects} milestones={sMilestones}/>}
        {activeTab==='done'&&<DoneTab items={sItems} setItems={setSItems} projects={sProjects} setProjects={setSProjects} ccrs={ccrs} ccrItems={ccrItems} space={space}/>}
        {activeTab==='budget'&&<BudgetTab roles={roles} setRoles={setRoles} people={people} setPeople={setPeople} projects={sProjects} items={sItems} projectRoles={projectRoles} itemAssignments={itemAssignments} qBudgets={qBudgets} setQBudgets={setQBudgets}/>}
      </div>
    </div>
  )
}
