// The plan as slides, worked out from the data rather than from what's on screen, so it can
// be exported from anywhere: the Planning tab's PPT button uses it for the quarters and
// releases, and the full-plan export puts it all together, top to bottom:
//   strategy (roadmap by track and team, budget) → quarter plan → release plan (one slide
//   per quarter) → sprints (one slide per release: each team's sprints and what's left to
//   schedule) → not planned (initiatives with no dates, epics and stories with no quarter).
import { quarterMonths, quarterKey, quarterLabel, fyQuarterOf, fmtMonthKey, releaseOf, releaseText, monthKeyOf } from './Releases'
import { drawBoard, type PlanColumn, type PlanCard } from './PlanningPptx'
import { addStrategySlides } from './StrategyPptx'
import { typeColor, typeName } from './MilestoneTypes'
import { workTypeOfProject, CLOSED_STATUSES } from './WorkTypes'

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TERMINAL=CLOSED_STATUSES
const INIT_DONE=CLOSED_STATUSES
const EFFORT_POINTS:any={XS:0.5,S:1,M:2,L:3,XL:5}
const PRI:any={P1:1,P2:2,P3:3,P4:4}
const TEAM_SHORT:any={'Consumer Experience':'CX','Operational Efficiency':'OE','Retail Program':'RP'}
const WTS:any={new:'New',sustain:'Sustain',saas:'SaaS'}
const shortOf=(t:any)=>t?TEAM_SHORT[t]||t:null
const pad=(n:number)=>String(n).padStart(2,'0')
const lastDay=(k:string)=>{const[y,m]=k.split('-').map(Number);return `${k}-${pad(new Date(y,m,0).getDate())}`}
const fmtDay=(iso:string)=>{const[,m,d]=iso.split('-').map(Number);return `${MONTHS[m-1]} ${d}`}
const nextQ=(fy:number,q:number,n:number)=>{q+=n;while(q>4){q-=4;fy++}while(q<1){q+=4;fy--}return{fy,q}}
const qInfo=(fy:number,q:number)=>{const months=quarterMonths(fy,q);return{fy,q,qk:quarterKey(fy,q),label:quarterLabel(fy,q),months,qStart:`${months[0]}-01`,qEnd:lastDay(months[2])}}
const localISO=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

export type PlanInput={items:any[],epics:any[],projects:any[],releases:any[],milestones:any[],mTypes:any[],sprints?:any[],
  start:{fy:number,q:number},team:string,wt:string,teams:string[],workTypeOf:(i:any)=>string,epicWorkTypeOf:(e:any)=>string,hideNoRel?:boolean}

// Everything the planning board knows, for any team and work type
export function planModel(inp:PlanInput){
  const{items,epics,projects,releases,milestones,mTypes,start,team,wt,teams,workTypeOf,epicWorkTypeOf}=inp
  const ALL=team==='__all'||!teams.includes(team)
  const cur=fyQuarterOf(monthKeyOf(new Date()))
  const quarters=[0,1,2,3].map(n=>{const{fy,q}=nextQ(start.fy,start.q,n);return qInfo(fy,q)})
  const buckets=projects.filter((p:any)=>p.sustain_quarter)
  const bucketFor=(qk:string,t:string)=>buckets.find((p:any)=>p.sustain_quarter===qk&&p.team===t)
  const open=(x:any)=>!TERMINAL.includes(x.status)&&(x.space||'work')==='work'
  const work=(x:any)=>(x.space||'work')==='work'
  const epicById=(id:any)=>epics.find((e:any)=>e.id===id)
  const bucketOf=(kind:string,x:any)=>kind==='epic'?buckets.find((p:any)=>p.id===x.project_id)||null:kind==='item'?buckets.find((p:any)=>p.name===x.parent_project)||null:null
  const qkOf=(kind:string,x:any):string|null=>kind==='project'?(x.plan_quarter||null):(x.plan_quarter||bucketOf(kind,x)?.sustain_quarter||null)
  const homeOf=(kind:string,x:any)=>{
    const p=kind==='epic'?projects.find((p:any)=>p.id===x.project_id):kind==='item'?projects.find((p:any)=>p.name===x.parent_project):null
    return p&&!p.sustain_quarter?p:null
  }
  const teamOf=(kind:string,x:any)=>kind==='project'?x.team||null:bucketOf(kind,x)?.team||x.team||homeOf(kind,x)?.team||null
  const wtOf=(kind:string,x:any)=>kind==='project'?workTypeOfProject(x):kind==='epic'?epicWorkTypeOf(x):workTypeOf(x)
  const teamOk=(kind:string,x:any)=>{if(ALL)return true;const t=teamOf(kind,x);return !t||t===team}
  const wtOk=(kind:string,x:any)=>wt==='all'||wtOf(kind,x)===wt
  const shown=(kind:string,x:any)=>teamOk(kind,x)&&wtOk(kind,x)
  const withItsEpic=(i:any)=>{const e=i.epic_id&&epicById(i.epic_id);return !!e&&work(e)&&(qkOf('item',i)||null)===(qkOf('epic',e)||null)&&(open(e)||!open(i))}
  type Entry={kind:'item'|'epic'|'project',x:any,qk:string|null}
  const ent=(kind:any,x:any):Entry=>({kind,x,qk:qkOf(kind,x)})
  const rank=(a:Entry,b:Entry)=>(a.x.manual_rank??1e9)-(b.x.manual_rank??1e9)||(PRI[a.x.priority]||9)-(PRI[b.x.priority]||9)||(a.x.created_at||'').localeCompare(b.x.created_at||'')
  // Closed work isn't in the plan (it's on the Done tab)
  const planned:Entry[]=[...epics.filter((e:any)=>open(e)&&qkOf('epic',e)&&shown('epic',e)).map((e:any)=>ent('epic',e)),
    ...items.filter((i:any)=>open(i)&&qkOf('item',i)&&!withItsEpic(i)&&shown('item',i)).map((i:any)=>ent('item',i))].sort(rank)
  const inits:Entry[]=projects.filter((p:any)=>!p.sustain_quarter&&work(p)&&!INIT_DONE.includes(p.status)&&(ALL||!p.team||p.team===team)&&wtOk('project',p)).map((p:any)=>ent('project',p))
  const storiesOf=(e:any)=>items.filter((i:any)=>i.epic_id===e.id)
  const ptsOf=(en:Entry):number=>en.kind==='item'?(EFFORT_POINTS[en.x.effort]||0)
    :en.kind==='project'?items.filter((i:any)=>i.parent_project===en.x.name&&open(i)).reduce((s:number,i:any)=>s+(EFFORT_POINTS[i.effort]||0),0)
    :(EFFORT_POINTS[en.x.effort]||storiesOf(en.x).filter(open).reduce((s:number,i:any)=>s+(EFFORT_POINTS[i.effort]||0),0))
  const pts=(list:Entry[])=>list.reduce((s,en)=>s+ptsOf(en),0)
  const isBlocked=(k:string)=>!!releaseOf(releases,k)?.no_release
  const msTeamOk=(m:any)=>{if(ALL)return true;const p=projects.find((x:any)=>x.id===m.project_id);return !p?.team||p.team===team}
  const msIn=(a:string,b:string)=>milestones.filter((m:any)=>m.date&&m.date>=a&&m.date<=b&&work(m)&&msTeamOk(m)).sort((x:any,y:any)=>x.date.localeCompare(y.date))
  const toMs=(m:any)=>{const p=projects.find((x:any)=>x.id===m.project_id);return{date:fmtDay(m.date),name:m.name+(p?` · ${p.name}`:''),type:typeName(mTypes,m.type),color:typeColor(mTypes,m.type),team:shortOf(p?.team),done:!!m.completed}}
  const toCard=(en:Entry,o:{quarter?:boolean,release?:boolean}={}):PlanCard=>{
    const x=en.x
    if(en.kind==='project')return{kind:'initiative',name:x.name,team:shortOf(x.team),release:o.release&&x.release_month?fmtMonthKey(x.release_month):null,prd:x.prd_status||null,design:x.design_status||null}
    const home=homeOf(en.kind,x),bk=bucketOf(en.kind,x)
    return{prd:x.prd_status||null,design:x.design_status||null,kind:en.kind==='epic'?'epic':x.request_type==='Bug'?'bug':'story',name:x.name,ref:en.kind==='item'?x.item_id:undefined,team:shortOf(teamOf(en.kind,x)),wt:WTS[wtOf(en.kind,x)],priority:[x.priority,x.request_type==='Bug'?x.severity:null].filter(Boolean).join(' · ')||null,
      home:home?`◈ ${home.name}`:bk?`Tech debt · ${bk.name}`:null,release:o.release&&x.release_month?fmtMonthKey(x.release_month):null,quarter:o.quarter&&en.qk?en.qk.replace('-',' '):null}
  }
  // Release view range: the months of the quarters shown through the quarter after
  const relMonths:string[]=[];for(let n=0;n<15;n++){const[y,m]=quarters[0].months[0].split('-').map(Number);const a=y*12+m-1+n;relMonths.push(`${Math.floor(a/12)}-${pad(a%12+1)}`)}
  const shownQks=new Set(quarters.map(q=>q.qk))
  const inView=(en:Entry)=>shownQks.has(en.qk as string)||relMonths.includes(en.x.release_month)
  const relCols=relMonths.filter(k=>!(inp.hideNoRel&&isBlocked(k)&&![...planned,...inits].some(en=>en.x.release_month===k)))
  const shownTeams:string[]=ALL?teams:[team]

  const quarterCols:PlanColumn[]=quarters.map(qi=>{
    const list=planned.filter(en=>en.qk===qi.qk),ini=inits.filter(en=>en.qk===qi.qk||(!en.qk&&qi.months.includes(en.x.release_month)))
    const bks=shownTeams.map(t=>bucketFor(qi.qk,t)).filter(Boolean).map((b:any)=>`Tech debt: ${b.name}`)
    return{title:qi.label,sub:`${fmtMonthKey(qi.months[0]).slice(0,3)}–${fmtMonthKey(qi.months[2])}`,now:qi.qk===quarterKey(cur.fy,cur.q),
      meta:[...bks,`${list.length} planned${ini.length?` · ${ini.length} go-live${ini.length!==1?'s':''}`:''} · ${pts(list)} pts`],
      milestones:msIn(qi.qStart,qi.qEnd).map(toMs),cards:[...ini.map(en=>toCard(en,{release:true})),...list.map(en=>toCard(en,{release:true}))]}
  })
  // Stories planned with their epic but shipping in a different release (an epic released in
  // stages) also appear in their own release's month
  const shipsApart=(i:any)=>{if(!i.release_month||!withItsEpic(i))return false;const e=epicById(i.epic_id);return !!e&&i.release_month!==(e.release_month||null)}
  const staged:Entry[]=items.filter((i:any)=>open(i)&&qkOf('item',i)&&shipsApart(i)&&shown('item',i)).map((i:any)=>ent('item',i))
  const monthCol=(k:string):PlanColumn=>{
    const td=[...planned,...staged].filter(en=>en.x.release_month===k&&inView(en)).sort(rank),ini=inits.filter(en=>en.x.release_month===k),r=releaseOf(releases,k),blocked=isBlocked(k)
    return{title:`${fmtMonthKey(k)}`,sub:blocked?`No release${r?.notes?' · '+r.notes:''}`:releaseText(releases,k),blocked,slimmable:true,
      meta:blocked?[]:[`${ini.length?`${ini.length} go-live${ini.length!==1?'s':''} · `:''}${td.length} planned · ${pts(td)} pts`],
      milestones:msIn(`${k}-01`,lastDay(k)).map(toMs),cards:[...ini.map(en=>toCard(en)),...td.map(en=>toCard(en,{quarter:true}))]}
  }
  const releaseSlides=quarters.map(qi=>{
    const noRel=planned.filter(en=>!en.x.release_month&&en.qk===qi.qk)
    const cols:PlanColumn[]=[...(noRel.length?[{title:'Not in a release yet',sub:`Planned in ${qi.label}`,meta:[`${noRel.length} · ${pts(noRel)} pts`],milestones:[],cards:noRel.map(en=>toCard(en))}]:[]),
      ...qi.months.filter(k=>relCols.includes(k)).map(monthCol)]
    return{label:`${qi.label} (${fmtMonthKey(qi.months[0]).slice(0,3)}–${fmtMonthKey(qi.months[2])})`,cols}
  }).filter(r=>r.cols.some(c=>c.cards.length||c.milestones.length))

  // Sprints, one slide per release: each team's sprints in the release window (after the
  // previous release, up to this one) and what's planned for the release but not in a sprint
  const sprints=inp.sprints||[]
  const relList=releases.filter((r:any)=>!r.no_release).map((r:any)=>r.month).sort()
  const relEnd=(k:string)=>releaseOf(releases,k)?.release_date||lastDay(k)
  // The window starts after the previous release; with none before it, from the start of the
  // code-freeze months right before it (work done in a freeze ships in the next release)
  const prevMonth=(k:string)=>{const[y,m]=k.split('-').map(Number);return m===1?`${y-1}-12`:`${y}-${pad(m-1)}`}
  const relStart=(k:string)=>{
    const ix=relList.indexOf(k)
    if(ix>0){const d=new Date(relEnd(relList[ix-1])+'T12:00:00');d.setDate(d.getDate()+1);return localISO(d)}
    let m=k;while(isBlocked(prevMonth(m)))m=prevMonth(m)
    return `${m}-01`
  }
  const sprintTeams=shownTeams
  const sprintSlides=quarters.flatMap(q=>q.months).filter(k=>relList.includes(k)).map(k=>{
    const a=relStart(k),b=relEnd(k)
    const cols:PlanColumn[]=[]
    for(const t of sprintTeams){
      const ts=sprints.filter((s:any)=>s.team===t).sort((x:any,y:any)=>x.start_date<y.start_date?-1:1)
      ts.forEach((sp:any,ix:number)=>{
        if(!(sp.start_date<=b&&sp.end_date>=a))return
        const its=items.filter((i:any)=>i.sprint_id===sp.id&&work(i)&&wtOk('item',i))
        cols.push({title:`${shortOf(t)} · Sprint ${ix+1}`,sub:`${fmtDay(sp.start_date)} – ${fmtDay(sp.end_date)}${sp.closed?' · closed':''}`,
          meta:[`${its.length} item${its.length!==1?'s':''} · ${its.reduce((s:number,i:any)=>s+(EFFORT_POINTS[i.effort]||0),0)} pts`],milestones:[],
          cards:its.map((i:any)=>({...toCard(ent('item',i)),status:i.status,flag:i.release_month===k?null:i.release_month?`Planned for ${fmtMonthKey(i.release_month)}`:'Not in the plan'}))})
      })
    }
    const waiting=items.filter((i:any)=>open(i)&&!i.sprint_id&&i.release_month===k&&shown('item',i))
    if(waiting.length)cols.unshift({title:'Not in a sprint yet',sub:`Planned for ${fmtMonthKey(k)}`,meta:[`${waiting.length} · ${waiting.reduce((s:number,i:any)=>s+(EFFORT_POINTS[i.effort]||0),0)} pts`],milestones:[],
      cards:waiting.map((i:any)=>toCard(ent('item',i)))})
    return{label:`${fmtMonthKey(k)} release · ${releaseText(releases,k)} · sprints ${fmtDay(a)} – ${fmtDay(b)}`,cols}
  }).filter(s=>s.cols.length)

  // Not planned: open initiatives with no dates and no release; open epics and stories with no quarter
  const undatedInits=projects.filter((p:any)=>!p.sustain_quarter&&work(p)&&!INIT_DONE.includes(p.status)&&(ALL||!p.team||p.team===team)&&wtOk('project',p)
    &&!p.release_month&&!(p.start_date&&(p.end_date||p.ongoing)))
  const unplannedWork=[...epics.filter((e:any)=>open(e)&&!qkOf('epic',e)&&shown('epic',e)).map((e:any)=>ent('epic',e)),
    ...items.filter((i:any)=>open(i)&&!qkOf('item',i)&&!withItsEpic(i)&&shown('item',i)).map((i:any)=>ent('item',i))]
  const groupName=(en:Entry)=>homeOf(en.kind,en.x)?.name||'No initiative'
  unplannedWork.sort((a,b)=>{const ga=groupName(a),gb=groupName(b);return(ga==='No initiative'?1:0)-(gb==='No initiative'?1:0)||ga.localeCompare(gb)||(PRI[a.x.priority]||9)-(PRI[b.x.priority]||9)||(a.kind==='epic'?0:1)-(b.kind==='epic'?0:1)})
  const rowOf=(en:Entry,child=false)=>({child,group:groupName(en),kind:en.kind==='epic'?'Epic':en.x.request_type==='Bug'?'Bug':'Story',ref:en.kind==='item'?en.x.item_id||'':'',name:en.x.name,team:shortOf(teamOf(en.kind,en.x))||'',wt:WTS[wtOf(en.kind,en.x)]||'',priority:en.x.priority||'',status:en.x.status||'',stories:null})
  // Each unplanned epic is followed by its own open stories and bugs that aren't planned either
  const unplannedRows=unplannedWork.flatMap(en=>en.kind!=='epic'?[rowOf(en)]:[rowOf(en),
    ...storiesOf(en.x).filter((i:any)=>open(i)&&!qkOf('item',i)&&withItsEpic(i)&&shown('item',i))
      .sort((a:any,b:any)=>(PRI[a.priority]||9)-(PRI[b.priority]||9)||String(a.item_id||'').localeCompare(String(b.item_id||'')))
      .map((i:any)=>rowOf(ent('item',i),true))])

  // The release calendar: for each month of a fiscal year, what ships, by initiative (as on
  // the Roadmap's Release calendar)
  const calendarMonth=(k:string)=>{
    const groups=new Map<string,{p:any,goLive:boolean,epics:any[],stories:any[]}>()
    const g=(p:any)=>{const key=p?.id||'__none';if(!groups.has(key))groups.set(key,{p:p||null,goLive:false,epics:[],stories:[]});return groups.get(key)!}
    for(const p of projects)if(p.release_month===k&&work(p)&&!INIT_DONE.includes(p.status)&&(ALL||!p.team||p.team===team)&&wtOk('project',p))g(p).goLive=true
    for(const e of epics)if(e.release_month===k&&open(e)&&shown('epic',e))g(projects.find((p:any)=>p.id===e.project_id)).epics.push(e)
    for(const i of items){
      if(i.release_month!==k||!open(i)||!shown('item',i))continue
      const ep=i.epic_id&&epicById(i.epic_id);if(ep&&ep.release_month===k)continue
      g(projects.find((p:any)=>p.name===i.parent_project)).stories.push(i)
    }
    return[...groups.values()].sort((a,b)=>(Number(b.goLive)-Number(a.goLive))||(Number(!!a.p?.sustain_quarter)-Number(!!b.p?.sustain_quarter))||(Number(!a.p)-Number(!b.p))||(a.p?.name||'').localeCompare(b.p?.name||''))
  }
  const calendarFys=[...new Set(quarters.map(q=>q.fy))]
  // PRD and Design readiness of the work planned in the quarters shown: initiatives worked or
  // going live in each quarter, and open epics, stories and bugs planned there
  const readiness=quarters.map(qi=>({qi,rows:[
    ...inits.filter(en=>en.qk===qi.qk||(!en.qk&&qi.months.includes(en.x.release_month))).map(en=>({kind:'Initiative',x:en.x,home:'',team:shortOf(en.x.team)})),
    ...planned.filter(en=>en.qk===qi.qk&&open(en.x)).map(en=>({kind:en.kind==='epic'?'Epic':en.x.request_type==='Bug'?'Bug':'Story',x:en.x,home:homeOf(en.kind,en.x)?.name||bucketOf(en.kind,en.x)?.name||'No initiative',team:shortOf(teamOf(en.kind,en.x))}))]}))
  return{quarters,quarterCols,releaseSlides,sprintSlides,undatedInits,unplannedRows,ALL,calendarMonth,calendarFys,isBlocked,storiesOf,readiness}
}

// ── The full-plan deck ───────────────────────────────────────────────────────
const INK='1F2A3C',MUTED='6B7280',CREAM='FDFBF0',ORANGE='E07B2A',HEAD='1F2A3C',SUB='EEF1F5',LINE='D9DEE5'
export type FullPlanSections={roadmap:boolean,budget:boolean,quarters:boolean,releases:boolean,calendar?:boolean,sprints:boolean,unplanned:boolean,readiness?:boolean}

function titleSlide(pptx:any,title:string,lines:string[]){
  const s=pptx.addSlide();s.background={color:'1F2A3C'}
  s.addShape(pptx.ShapeType.rect,{x:0.6,y:2.55,w:0.12,h:1.6,fill:{color:'C8973A'},line:{color:'C8973A',width:0}})
  s.addText(title,{x:0.95,y:2.4,w:11.5,h:0.9,fontSize:38,bold:true,color:'FFFFFF',fontFace:'Calibri',margin:0})
  s.addText(lines.join('\n'),{x:0.95,y:3.3,w:11.5,h:1.4,fontSize:16,color:'C9D3DF',margin:0,valign:'top'})
}
function sectionSlide(pptx:any,n:number,title:string,blurb:string){
  const s=pptx.addSlide();s.background={color:CREAM}
  s.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  s.addText(String(n).padStart(2,'0'),{x:0.9,y:2.3,w:2,h:1,fontSize:54,bold:true,color:'C8973A',margin:0})
  s.addText(title,{x:0.9,y:3.25,w:11.5,h:0.8,fontSize:34,bold:true,color:INK,margin:0})
  s.addText(blurb,{x:0.9,y:4.05,w:11,h:0.9,fontSize:15,color:MUTED,margin:0,valign:'top'})
}
// A long list as table slides, a set number of rows per slide, grouped with band rows
function tableSlides(pptx:any,title:string,subtitle:string,header:string[],colW:number[],rows:{group?:string,cells:string[]}[],boldCol=0,perSlide=17){
  const pages:any[][]=[];let page:any[]=[],last:string|undefined,n=0
  const th=(t:string)=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:HEAD},fontSize:9,valign:'middle'}})
  for(const r of rows){
    if(n>=perSlide){pages.push(page);page=[];n=0;last=undefined}
    if(r.group!==undefined&&r.group!==last){page.push([{text:r.group,options:{colspan:header.length,bold:true,color:INK,fill:{color:SUB},fontSize:9}}]);last=r.group;n++}
    page.push(r.cells.map((c,i)=>({text:c,options:{fontSize:9,color:INK,bold:i===boldCol}})));n++
  }
  if(page.length)pages.push(page)
  pages.forEach((p,ix)=>{
    const s=pptx.addSlide();s.background={color:CREAM}
    s.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
    s.addText(title,{x:0.75,y:0.2,w:12.2,h:0.55,fontSize:26,bold:true,color:INK,margin:0})
    s.addText(subtitle+(pages.length>1?` · ${ix+1} of ${pages.length}`:''),{x:0.75,y:0.75,w:12.2,h:0.28,fontSize:12,bold:true,color:ORANGE,margin:0})
    s.addTable([header.map(th),...p],{x:0.75,y:1.2,colW,border:{type:'solid',pt:0.5,color:LINE},fontFace:'Calibri',margin:[2,4,2,4],rowH:0.3})
  })
  if(!pages.length){
    const s=pptx.addSlide();s.background={color:CREAM}
    s.addText(title,{x:0.75,y:0.2,w:12.2,h:0.55,fontSize:26,bold:true,color:INK,margin:0})
    s.addText('Nothing here: everything is planned.',{x:0.75,y:1.4,w:12,h:0.4,fontSize:14,italic:true,color:MUTED})
  }
}

// A fiscal year as a 4 × 3 calendar of monthly releases, each listing what ships
function calendarSlide(pptx:any,m:any,fy:number,releases:any[],sub:string){
  const s=pptx.addSlide();s.background={color:CREAM}
  s.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  s.addText(`Release calendar · FY${String(fy).slice(-2)}`,{x:0.75,y:0.2,w:12.2,h:0.55,fontSize:26,bold:true,color:INK,margin:0})
  s.addText(`Apr ${fy-1} – Mar ${fy} · ${sub}`,{x:0.75,y:0.75,w:12.2,h:0.28,fontSize:12,bold:true,color:ORANGE,margin:0})
  const X0=1.15,TOP=1.15,GAP=0.08,W=(13.08-X0-GAP*2)/3,H=(7.05-TOP-GAP*3)/4
  const now=monthKeyOf(new Date())
  for(let q=1;q<=4;q++){
    const y=TOP+(q-1)*(H+GAP)
    s.addShape(pptx.ShapeType.rect,{x:0.75,y,w:0.34,h:H,fill:{color:'2F3742'},line:{color:'2F3742',width:0}})
    s.addText(`Q${q}`,{x:0.75,y,w:0.34,h:H,fontSize:11,bold:true,color:'FFFFFF',align:'center',valign:'middle',margin:0})
    quarterMonths(fy,q).forEach((k:string,i:number)=>{
      const x=X0+i*(W+GAP),r=releaseOf(releases,k),blocked=!!r?.no_release
      s.addShape(pptx.ShapeType.rect,{x,y,w:W,h:H,fill:{color:blocked?'ECEDEF':'FFFFFF'},line:{color:k===now?'C8973A':LINE,width:k===now?1.5:0.75}})
      s.addShape(pptx.ShapeType.rect,{x,y,w:W,h:0.26,fill:{color:blocked?'8A94A3':'2F3742'},line:{color:blocked?'8A94A3':'2F3742',width:0}})
      s.addText([{text:fmtMonthKey(k),options:{bold:true,color:'FFFFFF'}},{text:`   ${blocked?'No release'+(r?.notes?' · '+r.notes:''):r?.release_date?'Release '+releaseText(releases,k):'Date not set'}`,options:{color:blocked?'F4E3C8':'E8B95A',fontSize:8.5}}],
        {x:x+0.06,y,w:W-0.1,h:0.26,fontSize:10.5,valign:'middle',margin:0})
      if(blocked)return
      // Lines: initiative (GO-LIVE when it goes live), then its epics and stories
      const lines:any[]=[]
      for(const g of m.calendarMonth(k)){
        const name=g.p?.name||'No initiative',td=!!g.p?.sustain_quarter
        lines.push({t:name,kind:g.goLive?'golive':td?'td':'init'})
        for(const e of g.epics){const n=m.storiesOf(e).length;lines.push({t:`◆ ${e.name}${n?` · ${n} stor${n===1?'y':'ies'}`:''}`,kind:'epic'})}
        for(const it of g.stories)lines.push({t:`▪ ${it.item_id?it.item_id+' ':''}${it.name}`,kind:'story'})
      }
      const LH=0.155,maxL=Math.floor((H-0.32)/LH)
      if(!lines.length){s.addText('Nothing tagged to this release yet.',{x:x+0.08,y:y+0.3,w:W-0.15,h:0.2,fontSize:8,italic:true,color:'9AA3AF',margin:0});return}
      const shownL=lines.length>maxL?lines.slice(0,maxL-1):lines
      const maxCh=Math.floor((W-0.2)*72/(7.5*0.5))
      const tr=(t:string,n:number)=>t.length>n?t.slice(0,n-1)+'…':t
      s.addText(shownL.map((l:any,ix:number)=>{
        const last=ix===shownL.length-1&&shownL.length===lines.length
        const opt:any=l.kind==='golive'?{bold:true,color:'8A6512'}:l.kind==='td'?{bold:true,color:'4A5D72'}:l.kind==='init'?{bold:true,color:INK}:l.kind==='epic'?{color:'A04000'}:{color:'1B4F72'}
        const text=(l.kind==='golive'?'◈ GO-LIVE  ':l.kind==='td'?'⟳ ':'')+l.t
        return{text:tr(text,l.kind==='epic'||l.kind==='story'?maxCh-2:maxCh),options:{...opt,indentLevel:l.kind==='epic'||l.kind==='story'?1:0,breakLine:!last}}
      }).concat(lines.length>shownL.length?[{text:`+ ${lines.length-shownL.length} more`,options:{italic:true,color:MUTED}}]:[]),
        {x:x+0.08,y:y+0.3,w:W-0.15,h:H-0.34,fontSize:7.5,valign:'top',margin:0,paraSpaceAfter:0,lineSpacing:10.5})
    })
  }
  // Legend
  s.addText([{text:'◈ GO-LIVE',options:{bold:true,color:'8A6512'}},{text:' initiative goes live   '},{text:'◆',options:{color:'A04000'}},{text:' epic   '},{text:'▪',options:{color:'1B4F72'}},{text:' story   '},{text:'⟳',options:{bold:true,color:'4A5D72'}},{text:' tech debt initiative   Stories going out with their epic are counted under it.'}],
    {x:0.75,y:7.1,w:12.3,h:0.25,fontSize:8.5,color:MUTED,margin:0})
}

export async function exportFullPlanPptx({strategy,strategyCtx,plan,sections,fileName}:{strategy:any,strategyCtx:any,plan:PlanInput,sections:FullPlanSections,fileName:string}){
  const PptxGenJS=(await import('pptxgenjs')).default
  const pptx=new PptxGenJS()
  pptx.layout='LAYOUT_WIDE'
  const m=planModel(plan)
  // A team's plan: the strategy and budget slides cover only its initiatives and people
  if(!m.ALL){
    const t=plan.team
    strategyCtx={...strategyCtx,projects:(strategyCtx.projects||[]).filter((p:any)=>p.team===t),teams:[t],people:(strategyCtx.people||[]).filter((p:any)=>p.team===t)}
  }
  const range=`${m.quarters[0].label} – ${m.quarters[3].label}`
  const who=m.ALL?'All teams':plan.team,wtl=plan.wt==='all'?'All work':WTS[plan.wt]||plan.wt
  const stamp=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  const sub=`${who} · ${wtl} · ${stamp}`
  const parts:string[]=[]
  if(strategy&&(sections.roadmap||sections.budget))parts.push('Strategy')
  if(sections.quarters)parts.push('Quarter plan');if(sections.releases)parts.push('Release plan');if(sections.calendar)parts.push('Release calendar');if(sections.sprints)parts.push('Sprints');if(sections.unplanned)parts.push('Not planned yet');if(sections.readiness)parts.push('Readiness')
  titleSlide(pptx,m.ALL?'The plan':`${plan.team} plan`,[strategy?`Strategy: ${strategy.name}`:'',`Planning ${range} · ${who} · ${wtl}`,parts.join('  →  '),`Exported ${stamp}`].filter(Boolean))
  let n=0
  if(strategy&&(sections.roadmap||sections.budget)){
    sectionSlide(pptx,++n,'Strategy',`${strategy.name}: ${[sections.roadmap?'the roadmap by track and by team':'',sections.budget?'the budget and capacity':''].filter(Boolean).join(', and ')}.`)
    addStrategySlides(pptx,strategy,strategyCtx,{roadmap:sections.roadmap,budget:sections.budget})
  }
  if(sections.quarters){
    sectionSlide(pptx,++n,'Quarter plan',`What's worked on in each quarter, ${range}: milestones, initiative go-lives, and the epics and stories planned.`)
    drawBoard(pptx,'Quarter plan',`${range} · ${sub}`,m.quarterCols)
  }
  if(sections.releases){
    sectionSlide(pptx,++n,'Release plan','What ships in each monthly release, one slide per quarter, and what is planned but not in a release yet.')
    if(m.releaseSlides.length)m.releaseSlides.forEach(r=>drawBoard(pptx,'Release plan',`${r.label} · ${sub}`,r.cols))
    else drawBoard(pptx,'Release plan',sub,[])
  }
  if(sections.calendar){
    sectionSlide(pptx,++n,'Release calendar','Each month\'s release across the fiscal year: initiatives going live, and the epics and stories shipping in it.')
    for(const fy of m.calendarFys)calendarSlide(pptx,m,fy,plan.releases,sub)
  }
  if(sections.sprints){
    sectionSlide(pptx,++n,'Sprints','For each release, each team\'s sprints and what\'s in them, and what\'s planned for the release but not in a sprint yet. Work in a sprint that isn\'t planned for that release is flagged.')
    if(m.sprintSlides.length)m.sprintSlides.forEach(s=>drawBoard(pptx,'Sprints',`${s.label} · ${sub}`,s.cols))
    else drawBoard(pptx,'Sprints',`No sprints in ${range}`,[])
  }
  if(sections.unplanned){
    sectionSlide(pptx,++n,'Not planned yet',`${m.undatedInits.length} initiative${m.undatedInits.length!==1?'s':''} with no dates or release, and ${m.unplannedRows.length} epic${m.unplannedRows.length!==1?'s':''} and stor${m.unplannedRows.length===1?'y':'ies'} with no quarter.`)
    tableSlides(pptx,'Initiatives not on the roadmap',`No dates or release · ${sub}`,['Initiative','Team','Work type','Status','Priority','Epics','Stories'],[4.6,1.1,1.3,1.6,1.1,1.1,1.1],
      m.undatedInits.map((p:any)=>({cells:[p.name,shortOf(p.team)||'',WTS[workTypeOfProject(p)]||'',p.status||'',p.priority||'',String(plan.epics.filter((e:any)=>e.project_id===p.id&&!TERMINAL.includes(e.status)).length),String(plan.items.filter((i:any)=>i.parent_project===p.name&&!TERMINAL.includes(i.status)).length)]})))
    tableSlides(pptx,'Work with no quarter',`Epics and stories not planned yet, by initiative and priority · ${sub}`,['Kind','ID','Name','Team','Work type','Priority','Status'],[0.8,1.0,5.6,0.8,1.2,0.9,1.6],
      m.unplannedRows.map(r=>({group:r.group,cells:[r.kind,r.ref,(r.child?'   ↳ ':'')+r.name,r.team,r.wt,r.priority,r.status]})),2)
  }
  if(sections.readiness){
    const ready=(st:any)=>st==='approved'||st==='na'
    const SL:any={'':'Not started',draft:'Draft',review:'In review',approved:'Approved',na:'Not needed'}
    const all=m.readiness.flatMap((r:any)=>r.rows)
    const both=all.filter((r:any)=>ready(r.x.prd_status)&&ready(r.x.design_status)).length
    sectionSlide(pptx,++n,'Readiness',`PRD and Design approvals of the planned work: ${both} of ${all.length} ready (${all.length?Math.round(both/all.length*100):100}%). Approved or not needed counts as ready.`)
    const pctS=(a:number,b:number)=>b?`${Math.round(a/b*100)}%`:'—'
    tableSlides(pptx,'Readiness by quarter',`PRD and Design approved · ${sub}`,['Quarter','Planned','PRD ready','Design ready','Both ready','Not ready'],[2.2,1.6,2,2,2,2],
      m.readiness.map((r:any)=>{const t=r.rows.length,p=r.rows.filter((z:any)=>ready(z.x.prd_status)).length,d=r.rows.filter((z:any)=>ready(z.x.design_status)).length,b=r.rows.filter((z:any)=>ready(z.x.prd_status)&&ready(z.x.design_status)).length
        return{cells:[r.qi.label,String(t),`${p} · ${pctS(p,t)}`,`${d} · ${pctS(d,t)}`,`${b} · ${pctS(b,t)}`,String(t-b)]}}),0)
    tableSlides(pptx,'Not ready yet',`Planned work whose PRD or Design isn't approved, by quarter · ${sub}`,['Kind','Name','Initiative','Team','PRD','Design'],[0.9,4.6,2.6,0.7,1.25,1.25],
      m.readiness.flatMap((r:any)=>r.rows.filter((z:any)=>!ready(z.x.prd_status)||!ready(z.x.design_status)).map((z:any)=>({group:r.qi.label,
        cells:[z.kind,`${z.x.item_id?z.x.item_id+' ':''}${z.x.name}`,z.home,z.team||'',SL[z.x.prd_status||''],SL[z.x.design_status||'']]}))),1)
  }
  await pptx.writeFile({fileName:fileName+'.pptx'})
}
