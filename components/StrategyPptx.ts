// Export strategies to PowerPoint, drawn with native shapes and tables so it stays editable.
// For each strategy: the roadmap by track (title, FY / quarter header, in-flight work, each
// track with its goal per FY and projects, ongoing sustain work, dependency arrows, legend
// and notes), the same roadmap by team, then the budget report: summary, budget by team and
// team cost vs assigned, budget by initiative, and capacity by person. Each strategy is drawn
// from its own sandbox (strategy_items), like the Strategy tab.
import { strategyBudget, reportData } from './StrategyData'

const PROJECT_TERMINAL=['Complete','Cancelled','Done']
const BAD='E74C3C',GROUP='C8973A',NAVY='1F2A3C',STEEL='87A5BF',ORANGE='E07B2A',PROPOSED_FILL='F2C6A0',CREAM='FDFBF0',FREEZE='E4E4E4',GOAL_FILL='F8E9DF',INK='1F2A3C',MUTED='6B7280'
const TEAM_FILL:any={'Consumer Experience':NAVY,'Operational Efficiency':STEEL}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const hex=(c:string|null|undefined,d:string)=>(c||d).replace('#','').toUpperCase()
const TEAM_SHORT:any={'Consumer Experience':'CX','Operational Efficiency':'OE','Retail Program':'RP'}
const teamShort=(t:string)=>t?TEAM_SHORT[t]||t.split(/\s+/).map(w=>w[0]).join('').toUpperCase():''
const parts=(iso:string)=>{const[y,m,d]=iso.split('-').map(Number);return{y,m,d}}
const daysIn=(y:number,m:number)=>new Date(y,m,0).getDate()
const listJoin=(a:string[])=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]

export async function exportStrategiesPptx({strategies,projects,strategyItems,tracks,goals,deps,strategyRoles=[],projectRoles=[],people=[],roles=[],teams=[],fileName}:any){
  const PptxGenJS=(await import('pptxgenjs')).default
  const pptx=new PptxGenJS()
  pptx.layout='LAYOUT_WIDE' // 13.33 × 7.5 in
  for(const s of strategies){
    const ctx={projects,strategyItems,tracks,goals,deps,teams}
    drawSlide(pptx,s,ctx,'tracks')
    drawSlide(pptx,s,ctx,'teams')
    drawBudgetSlides(pptx,s,{projects,strategyItems,tracks,strategyRoles,projectRoles,people,roles,teams})
  }
  await pptx.writeFile({fileName:(fileName||(strategies.length===1?strategies[0].name:'Strategies'))+'.pptx'})
}

function drawSlide(pptx:any,strategy:any,{projects,strategyItems,tracks,goals,deps,teams=[]}:any,mode:'tracks'|'teams'){
  const slide=pptx.addSlide()
  slide.background={color:CREAM}
  const sRows=(strategyItems as any[]).filter(r=>r.strategy_id===strategy.id&&r.item_type==='project')
  const live=(projects as any[]).filter(p=>(p.space||'work')==='work').map(p=>{
    const r=sRows.find(x=>x.item_id===p.id)
    return r?{...p,track_id:r.track_id,start_date:r.start_date,end_date:r.end_date,planning_state:r.planning_state||(p.planning_state==='proposed'?'proposed':'planned'),team:r.team??p.team,group_name:r.group_name||null}
      :{...p,track_id:null,planning_state:p.planning_state==='proposed'?'proposed':'planned'}
  })
  const sTracks=(tracks as any[]).filter(t=>t.strategy_id===strategy.id).sort((a,b)=>a.sort_order-b.sort_order)
  const trackIds=new Set(sTracks.map(t=>t.id))
  const sustain=(p:any)=>p.work_type==='sustain'||p.planning_state==='bau'

  // Window: from the current quarter (or the strategy's start, if later) to its last FY
  const now=new Date(),curQ=Math.floor((now.getFullYear()*12+now.getMonth())/3)*3
  const stratStart=(strategy.start_fy-1)*12+3
  const startAbs=Math.max(stratStart,curQ),endAbs=strategy.end_fy*12+2 // March of the last FY, inclusive
  const nMonths=endAbs-startAbs+1
  const winStart=`${Math.floor(startAbs/12)}-${String(startAbs%12+1).padStart(2,'0')}-01`
  const winEnd=`${strategy.end_fy}-03-31`

  // Geometry (inches)
  const LX=0.75,LW=3.3,TX=4.15,TW=8.8
  const xAt=(abs:number)=>TX+(abs-startAbs)/nMonths*TW
  const xStart=(iso:string)=>{const{y,m,d}=parts(iso);return xAt(Math.max(startAbs,y*12+m-1+(d-1)/daysIn(y,m)))}
  const xEnd=(iso:string)=>{const{y,m,d}=parts(iso);return xAt(Math.min(endAbs+1,y*12+m-1+d/daysIn(y,m)))}
  const visible=(p:any)=>p.start_date&&p.start_date<=winEnd&&(p.ongoing||!p.end_date||p.end_date>=winStart)
  const byStart=(a:any,b:any)=>(a.start_date||'').localeCompare(b.start_date||'')||a.name.localeCompare(b.name)
  // Sorted by start, with each group's members kept together where its first member falls
  const ordered=(list:any[])=>{
    const sorted=[...list].sort(byStart),out:any[]=[],seen=new Set<string>()
    for(const p of sorted){
      if(!p.group_name){out.push(p);continue}
      if(seen.has(p.group_name))continue
      seen.add(p.group_name);out.push(...sorted.filter(x=>x.group_name===p.group_name))
    }
    return out
  }
  const label=(p:any)=>`${p.name}${p.team?` (${teamShort(p.team)})`:''}`

  // Rows
  type Row={kind:'section'|'goals'|'project'|'group',text?:string,color?:string,style?:string,track?:any,p?:any,members?:any[],inGroup?:boolean}
  const pushList=(list:any[])=>{
    let open:string|null=null
    for(const p of ordered(list)){
      if(p.group_name&&p.group_name!==open)rows.push({kind:'group',text:p.group_name,members:list.filter(x=>x.group_name===p.group_name)})
      open=p.group_name||null
      rows.push({kind:'project',p,inGroup:!!p.group_name})
    }
  }
  const rows:Row[]=[]
  const offTrack=live.filter(p=>!trackIds.has(p.track_id)&&!PROJECT_TERMINAL.includes(p.status)&&visible(p))
  if(mode==='tracks'){
    const inFlight=offTrack.filter(p=>!sustain(p))
    const ongoing=offTrack.filter(sustain)
    if(inFlight.length){rows.push({kind:'section',text:'IN-FLIGHT WORK (roadmap dates)',style:'light'});pushList(inFlight)}
    for(const t of sTracks){
      rows.push({kind:'section',text:`${t.name.toUpperCase()} TRACK${t.description?': '+t.description:''}`,color:hex(t.color,'5B7A99'),style:'band'})
      if((goals as any[]).some(g=>g.track_id===t.id&&g.goal))rows.push({kind:'goals',track:t})
      pushList(live.filter(p=>p.track_id===t.id&&visible(p)))
    }
    if(ongoing.length){rows.push({kind:'section',text:`ONGOING DELIVERABLES: always supported (in the ${Number(strategy.bau_pct)||0}% BAU share)`,color:'6B7280',style:'band'});pushList(ongoing)}
  }else{
    // By team: everything on this roadmap (on a track, or open and in the window), per team
    const all=[...live.filter(p=>trackIds.has(p.track_id)&&visible(p)),...offTrack]
    const names=[...teams,...(all.some(p=>!p.team||!teams.includes(p.team))?['__none']:[])]
    for(const tn of names){
      const list=all.filter(p=>tn==='__none'?(!p.team||!teams.includes(p.team)):p.team===tn)
      if(!list.length)continue
      rows.push({kind:'section',text:`${tn==='__none'?'NO TEAM':tn.toUpperCase()} · ${list.length} initiative${list.length!==1?'s':''}`,color:tn==='__none'?'6B7280':TEAM_FILL[tn]||'5B7A99',style:'band'})
      pushList(list)
    }
  }

  const BODY_TOP=1.85,BODY_BOTTOM=6.5
  const rowH=Math.max(0.11,Math.min(0.24,(BODY_BOTTOM-BODY_TOP)/Math.max(rows.length,1)))
  const fs=Math.max(5.5,Math.min(9,rowH*40))
  const bodyBottom=BODY_TOP+rows.length*rowH

  // Title
  slide.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  slide.addText(strategy.name,{x:LX,y:0.25,w:12.2,h:0.65,fontSize:30,bold:true,color:INK,fontFace:'Calibri'})
  slide.addText(mode==='tracks'?'Roadmap by track':'Roadmap by team',{x:LX,y:0.85,w:12.2,h:0.28,fontSize:13,bold:true,color:ORANGE,margin:0})

  // Header: fiscal years and quarters
  for(let fy=strategy.start_fy;fy<=strategy.end_fy;fy++){
    const a=Math.max(startAbs,(fy-1)*12+3),b=fy*12+3
    if(b<=startAbs)continue
    slide.addText(`FY${String(fy).slice(-2)}`,{x:xAt(a)+0.01,y:1.2,w:xAt(b)-xAt(a)-0.02,h:0.32,fill:{color:NAVY},color:'FFFFFF',bold:true,fontSize:12,align:'center',valign:'middle',margin:0})
  }
  for(let q=startAbs;q<=endAbs;q+=3){
    const m=q%12+1,fq=m>=4?Math.floor((m-4)/3)+1:4
    slide.addText(`Q${fq}`,{x:xAt(q),y:1.55,w:xAt(q+3)-xAt(q),h:0.22,fontSize:9,color:MUTED,align:'center',valign:'middle',margin:0})
  }
  // Code freeze columns and FY dividers, behind everything else in the body
  const freeze:number[]=strategy.freeze_months||[]
  for(let a=startAbs;a<=endAbs;){
    if(!freeze.includes(a%12+1)){a++;continue}
    let b=a;while(b+1<=endAbs&&freeze.includes((b+1)%12+1))b++
    slide.addShape(pptx.ShapeType.rect,{x:xAt(a),y:BODY_TOP,w:xAt(b+1)-xAt(a),h:bodyBottom-BODY_TOP,fill:{color:FREEZE},line:{color:FREEZE,width:0}})
    a=b+1
  }
  for(let fy=strategy.start_fy;fy<=strategy.end_fy;fy++){
    const a=(fy-1)*12+3
    if(a>startAbs&&a<=endAbs)slide.addShape(pptx.ShapeType.line,{x:xAt(a),y:BODY_TOP,w:0,h:bodyBottom-BODY_TOP,line:{color:'B8BEC6',width:0.5}})
  }

  // Body
  const yOf=new Map<string,number>(),barOf=new Map<string,{x0:number,x1:number,s:string,e:string|null}>()
  rows.forEach((r,i)=>{
    const y=BODY_TOP+i*rowH
    if(r.kind==='section'){
      const light=r.style==='light'
      slide.addText(r.text,{x:LX,y:y+rowH*0.08,w:TX+TW-LX,h:rowH*0.84,fill:{color:light?'EEF1F5':r.color},color:light?'4A5568':'FFFFFF',bold:true,fontSize:fs,valign:'middle',margin:[0,4,0,4]})
      return
    }
    if(r.kind==='goals'){
      slide.addText(`${r.track.name} goal at each FY start`,{x:LX,y,w:LW,h:rowH,color:ORANGE,bold:true,fontSize:fs,valign:'middle',margin:[0,4,0,4]})
      for(let fy=strategy.start_fy;fy<=strategy.end_fy;fy++){
        const a=Math.max(startAbs,(fy-1)*12+3),b=fy*12+3
        if(b<=startAbs)continue
        const g=(goals as any[]).find(x=>x.track_id===r.track.id&&x.fy===fy)
        slide.addText(g?.goal||'',{x:xAt(a)+0.02,y:y+rowH*0.06,w:xAt(b)-xAt(a)-0.04,h:rowH*0.88,fill:{color:GOAL_FILL},color:INK,bold:true,fontSize:fs,align:'center',valign:'middle',margin:0})
      }
      return
    }
    if(r.kind==='group'){
      // The group's name, and a bracket over its members' span
      slide.addText(`${r.text!.toUpperCase()} · runs together`,{x:LX+0.06,y,w:LW-0.06,h:rowH,color:GROUP,bold:true,fontSize:fs,valign:'bottom',margin:[0,4,1,4]})
      const xs=r.members!.filter(m=>m.start_date).map(m=>({a:xStart(m.start_date),b:m.ongoing||!m.end_date?xAt(endAbs+1):xEnd(m.end_date)}))
      if(xs.length){
        const a=Math.min(...xs.map(x=>x.a)),b=Math.max(...xs.map(x=>x.b)),yb=y+rowH*0.62,tick=rowH*0.38
        const ln={line:{color:GROUP,width:1.5}}
        slide.addShape(pptx.ShapeType.line,{x:a,y:yb,w:b-a,h:0,...ln})
        slide.addShape(pptx.ShapeType.line,{x:a,y:yb,w:0,h:tick,...ln})
        slide.addShape(pptx.ShapeType.line,{x:b,y:yb,w:0,h:tick,...ln})
      }
      slide.addShape(pptx.ShapeType.line,{x:LX+0.02,y:y+rowH*0.3,w:0,h:rowH*0.7,line:{color:GROUP,width:2}})
      return
    }
    const p=r.p
    if(r.inGroup)slide.addShape(pptx.ShapeType.line,{x:LX+0.02,y,w:0,h:rowH,line:{color:GROUP,width:2}})
    slide.addText(label(p),{x:LX+(r.inGroup?0.1:0),y,w:LW-(r.inGroup?0.1:0),h:rowH,color:INK,fontSize:fs,valign:'middle',margin:[0,4,0,4],fit:'shrink'})
    const x0=xStart(p.start_date),x1=p.ongoing||!p.end_date?xAt(endAbs+1):xEnd(p.end_date)
    if(x1<=x0)return
    const proposed=p.planning_state==='proposed'
    const fill=proposed?PROPOSED_FILL:TEAM_FILL[p.team]||'9AA5B1'
    slide.addShape(pptx.ShapeType.rect,{x:x0,y:y+rowH*0.22,w:x1-x0,h:rowH*0.56,fill:{color:fill},line:{color:proposed?ORANGE:fill,width:proposed?1:0}})
    yOf.set(p.id,y+rowH/2);barOf.set(p.id,{x0,x1,s:p.start_date,e:p.ongoing?null:p.end_date||null})
  })

  // Dependency arrows, as elbow connectors: out of the end of the blocker, along to the
  // row of what waits on it, then into its start. When that work starts before the blocker
  // finishes, its bar is outlined in red instead, as the Strategy tab warns.
  const seg=(xa:number,ya:number,xb:number,yb:number,color:string,arrow:boolean)=>{
    const dx=xb-xa,dy=yb-ya
    slide.addShape(pptx.ShapeType.line,{x:Math.min(xa,xb),y:Math.min(ya,yb),w:Math.abs(dx),h:Math.abs(dy),flipH:dx<0,flipV:dy<0,
      line:{color,width:1.25,...(arrow?{endArrowType:'triangle'}:{})}})
  }
  const barH=rowH*0.56,STUB=0.08
  const late:any[]=[]
  const sDeps=(deps as any[]).filter(d=>d.strategy_id===strategy.id&&d.blocker_type==='project'&&d.blocked_type==='project')
  const drawn:any[]=[]
  for(const d of sDeps){
    const a=barOf.get(d.blocker_id),b=barOf.get(d.blocked_id)
    if(!a||!b)continue
    const x1=a.x1,y1=yOf.get(d.blocker_id)!,x2=b.x0,y2=yOf.get(d.blocked_id)!
    const down=y2>y1,edge=y2+(down?-1:1)*barH/2 // the target bar's top (or bottom) edge
    const onTime=!!a.e&&b.s>a.e
    if(onTime&&x2-x1<0.1){
      // Starts as the blocker ends: straight down (or up) onto the start of its bar
      seg(x2,y1,x2,edge,ORANGE,true)
    }else if(onTime){
      // Starts later: across a little, along the gap to the target's row, then into its start
      const xm=x1+STUB
      seg(x1,y1,xm,y1,ORANGE,false);seg(xm,y1,xm,y2,ORANGE,false);seg(xm,y2,x2,y2,ORANGE,true)
    }else{
      // Starts before the blocker finishes: no arrow (it would cross other bars); the bar is
      // outlined in red and the notes say what it's waiting on
      if(!late.some(x=>x.blocked_id===d.blocked_id))
        slide.addShape(pptx.ShapeType.rect,{x:b.x0-0.03,y:y2-barH/2-0.03,w:b.x1-b.x0+0.06,h:barH+0.06,fill:{type:'none'},line:{color:BAD,width:1.5}})
      late.push(d);continue
    }
    drawn.push(d)
  }

  // Legend
  const LY=Math.min(6.62,bodyBottom+0.12)
  const legend:[string,any][]=[['Consumer Experience (dated)',{fill:{color:NAVY},line:{color:NAVY}}],['Operational Efficiency (dated)',{fill:{color:STEEL},line:{color:STEEL}}],
    ['Proposed, not yet planned',{fill:{color:PROPOSED_FILL},line:{color:ORANGE,width:1}}],
    [`Code freeze${freeze.length?' '+[...freeze].sort((a,b)=>((a+8)%12)-((b+8)%12)).map(m=>MONTHS[m-1]).join(', '):''}`,{fill:{color:FREEZE},line:{color:FREEZE}}]]
  if(rows.some(r=>r.kind==='group'))legend.push(['Group: runs together',{fill:{type:'none'},line:{color:GROUP,width:1.5}}])
  if(late.length)legend.push(['Starts before what it waits on',{fill:{type:'none'},line:{color:BAD,width:1.5}}])
  const step=12.2/legend.length,lfs=legend.length>4?9.5:11
  legend.forEach(([t,st],i)=>{
    const x=LX+i*step
    slide.addShape(pptx.ShapeType.rect,{x,y:LY+0.04,w:0.3,h:0.18,...st})
    slide.addText(t,{x:x+0.38,y:LY,w:step-0.45,h:0.26,fontSize:lfs,color:'4A5568',valign:'middle',margin:0})
  })

  // Notes: the strategy's description and what the arrows mean
  const name=(id:any)=>(projects as any[]).find(p=>p.id===id)?.name||'?'
  const byBlocked=new Map<string,string[]>()
  for(const d of drawn){const k=d.blocked_id;byBlocked.set(k,[...(byBlocked.get(k)||[]),name(d.blocker_id)])}
  const arrows=[...byBlocked.entries()].map(([k,from])=>`${listJoin(from)} → ${name(k)}`)
  const lateText=late.map(d=>`${name(d.blocked_id)} starts before ${name(d.blocker_id)} finishes`)
  const note=[strategy.description,arrows.length?`Arrows: ${arrows.join('; ')}.`:'',lateText.length?`Red outline: ${lateText.join('; ')}.`:'','FY runs Apr to Mar.'].filter(Boolean).join(' ')
  slide.addText(note,{x:LX,y:LY+0.3,w:12.2,h:Math.max(0.3,7.4-(LY+0.3)),fontSize:9,color:MUTED,valign:'top',margin:0,fit:'shrink'})
}

// ── Budget report slides ─────────────────────────────────────────────────────
const fmtUSD=(n:number)=>'$'+Math.round(n).toLocaleString('en-US')
const fmtK=(n:number)=>!n?'—':n>=1e6?'$'+(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'k':'$'+Math.round(n)
const fyLabel=(fy:number)=>'FY'+String(fy).slice(-2)
const fmtMon=(iso:string)=>{const[y,m]=iso.split('-').map(Number);return `${MONTHS[m-1]} ${String(y).slice(-2)}`}
const pctOf=(a:number,b:number)=>b?Math.round(a/b*100)+'%':'—'
const LINE='D9DEE5',HEAD='1F2A3C',SUB='EEF1F5'

function baseSlide(pptx:any,strategy:any,subtitle:string){
  const slide=pptx.addSlide()
  slide.background={color:CREAM}
  slide.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  slide.addText(strategy.name,{x:0.75,y:0.25,w:12.2,h:0.65,fontSize:30,bold:true,color:INK,fontFace:'Calibri'})
  slide.addText(subtitle,{x:0.75,y:0.85,w:12.2,h:0.28,fontSize:13,bold:true,color:ORANGE,margin:0})
  return slide
}
// Table cells
const th=(text:string,o:any={})=>({text,options:{bold:true,color:'FFFFFF',fill:{color:HEAD},align:o.align||'right',valign:'middle',fontSize:o.fontSize||9,...o}})
const td=(text:any,o:any={})=>({text,options:{color:INK,align:'right',valign:'middle',fontSize:9,...o}})
const band=(text:string,cols:number,o:any={})=>({text,options:{colspan:cols,bold:true,color:INK,fill:{color:SUB},fontSize:9,align:'left',...o}})
// An FY amount with its CapEx / OpEx underneath
const fyCellRuns=(t:number,cx:number,ox:number,bold=false)=>t?[{text:fmtK(t),options:{bold,breakLine:true}},{text:`C ${fmtK(cx)}`,options:{fontSize:7,color:MUTED,breakLine:true}},{text:`O ${fmtK(ox)}`,options:{fontSize:7,color:MUTED}}]:'—'
function table(slide:any,rows:any[],x:number,y:number,colW:number[]){
  slide.addTable(rows,{x,y,colW,border:{type:'solid',pt:0.5,color:LINE},fontFace:'Calibri',margin:[2,4,2,4]})
}
function note(slide:any,text:string,y=6.95){slide.addText(text,{x:0.75,y,w:12.2,h:0.4,fontSize:9,color:MUTED,valign:'top',margin:0,fit:'shrink'})}

function drawBudgetSlides(pptx:any,strategy:any,{projects,strategyItems,tracks,strategyRoles,projectRoles,people,roles,teams}:any){
  if(!people.length||!roles.length)return
  const b=strategyBudget(strategy,{projects,strategyItems,tracks,strategyRoles,projectRoles,people,roles})
  const fys:number[]=b.fys
  const r=reportData({...b,people,roles,teams})
  const{costed,sumFy,sumAll,fyOf}=r
  const total=sumAll(costed)
  const cols=fys.length

  // 1 · Summary: headline numbers, full budget vs contractors, CapEx vs OpEx
  {
    const slide=baseSlide(pptx,strategy,'Budget summary')
    const planned=costed.filter((x:any)=>x.state==='planned'),proposed=costed.filter((x:any)=>x.state==='proposed')
    const nw=costed.filter((x:any)=>x.workType!=='sustain'),su=costed.filter((x:any)=>x.workType==='sustain')
    const bau=Number(strategy.bau_pct)||0
    const cards:[string,string,string][]=[
      ['TOTAL BUDGET',fmtUSD(total),`${costed.length} costed initiative${costed.length!==1?'s':''}`],
      ...fys.map(fy=>[fyLabel(fy),fmtK(sumFy(costed,fy)),total?pctOf(sumFy(costed,fy),total)+' of total':''] as [string,string,string]),
      ['PLANNED · PROPOSED',`${fmtK(sumAll(planned))} · ${fmtK(sumAll(proposed))}`,`${planned.length} planned, ${proposed.length} proposed`],
      ['NEW · SUSTAIN',`${pctOf(sumAll(nw),total)} · ${pctOf(sumAll(su),total)}`,`target ${100-bau}/${bau}`],
      ['CAPEX · OPEX',`${pctOf(sumAll(costed,'capex'),total)} · ${pctOf(sumAll(costed,'opex'),total)}`,`${fmtK(sumAll(costed,'capex'))} · ${fmtK(sumAll(costed,'opex'))}`],
      ['CONTRACTORS',pctOf(sumAll(costed,'contractor'),total),`${fmtK(sumAll(costed,'contractor'))} of the budget`],
    ]
    const cw=12.2/cards.length
    cards.forEach(([l,v,sub],i)=>{
      const x=0.75+i*cw
      slide.addShape(pptx.ShapeType.rect,{x:x+0.03,y:1.3,w:cw-0.08,h:0.95,fill:{color:'FFFFFF'},line:{color:LINE,width:0.75}})
      slide.addText(l,{x:x+0.1,y:1.34,w:cw-0.2,h:0.22,fontSize:8,bold:true,color:MUTED,margin:0})
      slide.addText(v,{x:x+0.1,y:1.56,w:cw-0.2,h:0.36,fontSize:i===0?16:14,bold:true,color:i===0?ORANGE:INK,margin:0,fit:'shrink'})
      slide.addText(sub,{x:x+0.1,y:1.93,w:cw-0.2,h:0.26,fontSize:8,color:MUTED,margin:0,fit:'shrink'})
    })
    if(!costed.length){note(slide,'Nothing is costed yet: assign people (Developer, QA, Product Owner) to initiatives in this strategy.',2.5);return}
    const cw2=[2.6,...fys.map(()=>(12.2-2.6-1.4-0.8)/cols),1.4,0.8]
    const rows:any[]=[[th('Full budget vs contractors',{align:'left'}),...fys.map(fy=>th(fyLabel(fy))),th('Total'),th('Share')]]
    rows.push([td('Full budget',{align:'left',bold:true,color:ORANGE}),...fys.map(fy=>td(fmtUSD(sumFy(costed,fy)),{bold:true,color:ORANGE})),td(fmtUSD(total),{bold:true,color:ORANGE}),td('100%')])
    rows.push([td('Contractors',{align:'left',bold:true}),...fys.map(fy=>td(fmtUSD(sumFy(costed,fy,'contractor')))),td(fmtUSD(sumAll(costed,'contractor')),{bold:true}),td(pctOf(sumAll(costed,'contractor'),total))])
    for(const v of r.vendorRows)rows.push([td(`   ${v.v}`,{align:'left',color:MUTED}),...fys.map(fy=>td(fmtK(v.byFy[fy]||0),{color:MUTED})),td(fmtUSD(v.total),{color:MUTED}),td(pctOf(v.total,total),{color:MUTED})])
    rows.push([td('FTE',{align:'left',bold:true}),...fys.map(fy=>td(fmtUSD(sumFy(costed,fy,'fte')))),td(fmtUSD(sumAll(costed,'fte')),{bold:true}),td(pctOf(sumAll(costed,'fte'),total))])
    rows.push([th('CapEx vs OpEx',{align:'left'}),...fys.map(()=>th('')),th(''),th('')])
    const capRows=(label:string,list:any[],strong=false)=>{
      const t=sumAll(list)
      rows.push([band(`${label} · ${fmtUSD(t)}`,cols+3,{color:strong?ORANGE:INK})])
      for(const m of ['capex','opex'] as const)rows.push([td(m==='capex'?'   CapEx':'   OpEx',{align:'left',bold:m==='capex'}),...fys.map(fy=>td(fmtK(sumFy(list,fy,m)))),td(fmtUSD(sumAll(list,m)),{bold:true}),td(pctOf(sumAll(list,m),t))])
    }
    capRows('All teams',costed,true)
    for(const g of r.byTeam){const c=g.list.filter((x:any)=>x.cost?.total>0);if(c.length)capRows(g.team,c)}
    table(slide,rows,0.75,2.45,cw2)
    note(slide,'Contractor or FTE comes from each person\'s type in the roster. CapEx is the CapEx-eligible roles\' share of time on build initiatives; support initiatives and other roles are OpEx. Ongoing initiatives are costed to the end of the strategy.')
  }

  // 2 · Budget by team, and team cost vs assigned
  {
    const slide=baseSlide(pptx,strategy,'Budget by team')
    const rows:any[]=[[th('Team',{align:'left'}),th('Costed'),...fys.map(fy=>th(fyLabel(fy))),th('Total'),th('CapEx'),th('OpEx'),th('Share'),th('Contractor %')]]
    for(const g of r.byTeam){
      const c=g.list.filter((x:any)=>x.cost?.total>0),t=sumAll(c)
      rows.push([td(g.team,{align:'left',bold:true}),td(`${c.length}/${g.list.length}`),...fys.map(fy=>td(fyCellRuns(sumFy(c,fy),sumFy(c,fy,'capex'),sumFy(c,fy,'opex')))),td(fmtUSD(t),{bold:true}),td(fmtK(sumAll(c,'capex'))),td(fmtK(sumAll(c,'opex'))),td(pctOf(t,total)),td(pctOf(sumAll(c,'contractor'),t))])
    }
    rows.push([td('Total',{align:'left',bold:true,color:ORANGE}),td(''),...fys.map(fy=>td(fyCellRuns(sumFy(costed,fy),sumFy(costed,fy,'capex'),sumFy(costed,fy,'opex'),true),{color:ORANGE})),td(fmtUSD(total),{bold:true,color:ORANGE}),td(fmtK(sumAll(costed,'capex')),{bold:true}),td(fmtK(sumAll(costed,'opex')),{bold:true}),td(''),td(pctOf(sumAll(costed,'contractor'),total),{bold:true})])
    const fw=(12.2-2.4-0.7-1.1-0.8-0.8-0.6-0.9)/cols
    table(slide,rows,0.75,1.3,[2.4,0.7,...fys.map(()=>fw),1.1,0.8,0.8,0.6,0.9])
    note(slide,'C = CapEx, O = OpEx. A project\'s cost counts toward the team that owns it, including Retail Program people working on it.')
  }

  // 3 · Team cost vs assigned, by FY
  {
    const fyIdx=(fy:number)=>b.quarters.map((q:any,i:number)=>q.fy===fy?i:-1).filter((i:number)=>i>=0)
    const sumQ=(cells:any[],idx:number[],k:'full'|'assigned'|'capex')=>idx.reduce((s,i)=>s+cells[i][k],0)
    const all=b.quarters.map((_:any,i:number)=>i)
    const capRowsT:any[]=[[th('Team cost vs assigned',{align:'left'}),...fys.map(fy=>th(fyLabel(fy))),th('Total')]]
    const capTotals=b.quarters.map((_:any,i:number)=>({full:r.teamCap.reduce((s:number,t:any)=>s+t.cells[i].full,0),assigned:r.teamCap.reduce((s:number,t:any)=>s+t.cells[i].assigned,0),capex:r.teamCap.reduce((s:number,t:any)=>s+t.cells[i].capex,0)}))
    for(const t of [...r.teamCap,...(r.teamCap.length>1?[{team:'All teams',heads:r.teamCap.reduce((s:number,x:any)=>s+x.heads,0),cells:capTotals}]:[])]){
      capRowsT.push([band(`${t.team} · ${t.heads} ${t.heads===1?'person':'people'}`,cols+2,{color:t.team==='All teams'?ORANGE:INK})])
      const line=(label:string,fn:(idx:number[])=>string,o:any={})=>capRowsT.push([td(label,{align:'left',...o}),...fys.map(fy=>td(fn(fyIdx(fy)),o)),td(fn(all),{bold:true,...o})])
      line('   Team cost',idx=>fmtK(sumQ(t.cells,idx,'full')))
      line('   Assigned (CapEx · OpEx)',idx=>{const a=sumQ(t.cells,idx,'assigned'),c=sumQ(t.cells,idx,'capex');return a?`${fmtK(a)} (${fmtK(c)} · ${fmtK(a-c)})`:'—'})
      line('   Unassigned',idx=>{const u=sumQ(t.cells,idx,'full')-sumQ(t.cells,idx,'assigned');return u>1?fmtK(u):'—'},{color:'B9770E'})
      line('   % assigned',idx=>pctOf(sumQ(t.cells,idx,'assigned'),sumQ(t.cells,idx,'full')))
    }
    // Each team is 5 rows; split across slides so the table never runs off the page
    const colW=[3,...fys.map(()=>(12.2-3-1.6)/cols),1.6]
    const blocks:any[][]=[];for(let i=1;i<capRowsT.length;i+=5)blocks.push(capRowsT.slice(i,i+5))
    for(let i=0,n=1;i<blocks.length;i+=4,n++){
      const slide=baseSlide(pptx,strategy,`Team cost vs assigned${n>1?' (continued)':''}`)
      table(slide,[capRowsT[0],...blocks.slice(i,i+4).flat()],0.75,1.3,colW)
      note(slide,'Team cost is every active person on the team at 520 hours a quarter (2,080 a year) × their rate. Assigned is the share of that time on initiatives in this strategy, split into CapEx and OpEx; unassigned time is OpEx. People count under their own team.')
    }
  }

  // 4 · Budget by initiative, grouped by team (continues over as many slides as needed)
  {
    const header=[th('Initiative',{align:'left'}),th('Dates',{align:'left'}),th('Dev · QA · PO',{align:'left'}),...fys.map(fy=>th(fyLabel(fy))),th('Total'),th('CapEx'),th('OpEx')]
    const body:any[]=[]
    for(const g of r.byTeam){
      body.push({h:0.28,cells:[band(g.team.toUpperCase(),cols+6)]})
      for(const x of g.list){
        const names=r.slotNames(x).map((n:any)=>n||'—').join(' · ')
        const tag=(x.state==='proposed'?' (proposed)':'')+(x.workType==='sustain'?' · sustain':'')
        const dates=x.s&&x.e?`${fmtMon(x.s)} – ${fmtMon(x.e)}`:'No dates'
        const costedRow=x.cost?.total>0
        body.push({h:costedRow?0.5:0.28,cells:[td(x.p.name+tag,{align:'left',bold:true}),td(dates,{align:'left',color:MUTED}),td(names,{align:'left',color:MUTED,fontSize:8}),
          ...(costedRow?[...fys.map(fy=>td(fyCellRuns(fyOf(x,fy,'cost'),fyOf(x,fy,'capex'),fyOf(x,fy,'opex')))),td(fmtUSD(sumAll([x])),{bold:true}),td(fmtK(sumAll([x],'capex'))),td(fmtK(sumAll([x],'opex')))]
            :[td(`Not costed: ${x.reason||'no cost'}`,{colspan:cols+3,align:'center',color:'B9770E'})])]})
      }
      body.push({h:0.3,cells:[td(`${g.team} subtotal`,{align:'left',bold:true,color:MUTED,colspan:3}),...fys.map(fy=>td(fmtK(sumFy(g.list,fy)),{bold:true})),td(fmtUSD(sumAll(g.list)),{bold:true}),td(fmtK(sumAll(g.list,'capex')),{bold:true}),td(fmtK(sumAll(g.list,'opex')),{bold:true})]})
    }
    const fw=(12.2-3.1-1.5-2.1-1.0-0.75-0.75)/cols
    const colW=[3.1,1.5,2.1,...fys.map(()=>fw),1.0,0.75,0.75]
    let page:any[]=[],h=0,n=0
    const flush=()=>{if(!page.length)return;n++;const slide=baseSlide(pptx,strategy,`Budget by initiative${n>1?' (continued)':''}`);table(slide,[header,...page.map(p=>p.cells)],0.75,1.3,colW);page=[];h=0}
    for(const row of body){if(h+row.h>5.4)flush();page.push(row);h+=row.h}
    flush()
  }

  // 5 · Capacity by person, by FY (continues over as many slides as needed)
  {
    const fyIdx=(fy:number)=>b.quarters.map((q:any,i:number)=>q.fy===fy?i:-1).filter((i:number)=>i>=0)
    const header=[th('Person',{align:'left'}),th('Role',{align:'left'}),...fys.map(fy=>th(fyLabel(fy))),th('Cost'),th('Working on',{align:'left'})]
    const body:any[]=[]
    for(const g of r.staff){
      body.push([band(g.team.toUpperCase(),cols+4)])
      for(const x of g.list){
        const role=x.role+(x.person.type==='contractor'?` · contractor${x.person.vendor?` (${x.person.vendor})`:''}`:'')
        const leaves=x.person.termination_date?` · leaves ${fmtMon(x.person.termination_date)}`:''
        body.push([td(x.person.name+leaves,{align:'left',bold:true}),td(role,{align:'left',color:MUTED,fontSize:8}),
          ...fys.map(fy=>{const idx=fyIdx(fy);const v=idx.reduce((s:number,i:number)=>s+x.cells[i],0)/idx.length;return td(v<1?'·':Math.round(v)+'%',{bold:v>=1,color:v<1?'B8BEC6':v>=99.5?'1E8449':'B9770E'})}),
          td(x.cost?fmtUSD(x.cost):'—'),td(x.projects.join(', ')||'Available',{align:'left',fontSize:8,color:x.projects.length?INK:MUTED})])
      }
    }
    const fw=(12.2-2.3-2.2-1.0-3.2)/cols
    const colW=[2.3,2.2,...fys.map(()=>fw),1.0,3.2]
    const per=19
    for(let i=0,n=1;i<body.length;i+=per,n++){
      const slide=baseSlide(pptx,strategy,`Capacity by person${n>1?' (continued)':''}`)
      table(slide,[header,...body.slice(i,i+per)],0.75,1.3,colW)
      note(slide,'Share of each fiscal year\'s working days the person is assigned to initiatives in this strategy. A person on two overlapping initiatives is 50% on each for that time.')
    }
  }
}
