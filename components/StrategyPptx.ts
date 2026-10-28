// Export strategies to PowerPoint: one slide per strategy, drawn with native shapes so it
// stays editable. Layout: title, FY / quarter header, in-flight work, each track (band, a
// goal per FY, its projects), ongoing sustain work, dependency arrows, legend and notes.
// Each strategy is drawn from its own sandbox (strategy_items), like the Strategy tab.

const PROJECT_TERMINAL=['Complete','Cancelled','Done']
const BAD='E74C3C',NAVY='1F2A3C',STEEL='87A5BF',ORANGE='E07B2A',PROPOSED_FILL='F2C6A0',CREAM='FDFBF0',FREEZE='E4E4E4',GOAL_FILL='F8E9DF',INK='1F2A3C',MUTED='6B7280'
const TEAM_FILL:any={'Consumer Experience':NAVY,'Operational Efficiency':STEEL}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const hex=(c:string|null|undefined,d:string)=>(c||d).replace('#','').toUpperCase()
const TEAM_SHORT:any={'Consumer Experience':'CX','Operational Efficiency':'OE','Retail Program':'RP'}
const teamShort=(t:string)=>t?TEAM_SHORT[t]||t.split(/\s+/).map(w=>w[0]).join('').toUpperCase():''
const parts=(iso:string)=>{const[y,m,d]=iso.split('-').map(Number);return{y,m,d}}
const daysIn=(y:number,m:number)=>new Date(y,m,0).getDate()
const listJoin=(a:string[])=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]

export async function exportStrategiesPptx({strategies,projects,strategyItems,tracks,goals,deps,fileName}:any){
  const PptxGenJS=(await import('pptxgenjs')).default
  const pptx=new PptxGenJS()
  pptx.layout='LAYOUT_WIDE' // 13.33 × 7.5 in
  for(const s of strategies)drawSlide(pptx,s,{projects,strategyItems,tracks,goals,deps})
  await pptx.writeFile({fileName:(fileName||(strategies.length===1?strategies[0].name:'Strategies'))+'.pptx'})
}

function drawSlide(pptx:any,strategy:any,{projects,strategyItems,tracks,goals,deps}:any){
  const slide=pptx.addSlide()
  slide.background={color:CREAM}
  const sRows=(strategyItems as any[]).filter(r=>r.strategy_id===strategy.id&&r.item_type==='project')
  const live=(projects as any[]).filter(p=>(p.space||'work')==='work').map(p=>{
    const r=sRows.find(x=>x.item_id===p.id)
    return r?{...p,track_id:r.track_id,start_date:r.start_date,end_date:r.end_date,planning_state:r.planning_state||(p.planning_state==='proposed'?'proposed':'planned'),team:r.team??p.team}
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
  const label=(p:any)=>`${p.name}${p.team?` (${teamShort(p.team)})`:''}`

  // Rows
  type Row={kind:'section'|'goals'|'project',text?:string,color?:string,style?:string,track?:any,p?:any}
  const rows:Row[]=[]
  const offTrack=live.filter(p=>!trackIds.has(p.track_id)&&!PROJECT_TERMINAL.includes(p.status)&&visible(p))
  const inFlight=offTrack.filter(p=>!sustain(p)).sort(byStart)
  const ongoing=offTrack.filter(sustain).sort(byStart)
  if(inFlight.length){rows.push({kind:'section',text:'IN-FLIGHT WORK (roadmap dates)',style:'light'});inFlight.forEach(p=>rows.push({kind:'project',p}))}
  for(const t of sTracks){
    rows.push({kind:'section',text:`${t.name.toUpperCase()} TRACK${t.description?': '+t.description:''}`,color:hex(t.color,'5B7A99'),style:'band'})
    if((goals as any[]).some(g=>g.track_id===t.id&&g.goal))rows.push({kind:'goals',track:t})
    live.filter(p=>p.track_id===t.id&&visible(p)).sort(byStart).forEach(p=>rows.push({kind:'project',p}))
  }
  if(ongoing.length){rows.push({kind:'section',text:`ONGOING DELIVERABLES: always supported (in the ${Number(strategy.bau_pct)||0}% BAU share)`,color:'6B7280',style:'band'});ongoing.forEach(p=>rows.push({kind:'project',p}))}

  const BODY_TOP=1.85,BODY_BOTTOM=6.5
  const rowH=Math.max(0.11,Math.min(0.24,(BODY_BOTTOM-BODY_TOP)/Math.max(rows.length,1)))
  const fs=Math.max(5.5,Math.min(9,rowH*40))
  const bodyBottom=BODY_TOP+rows.length*rowH

  // Title
  slide.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  slide.addText(strategy.name,{x:LX,y:0.3,w:12.2,h:0.7,fontSize:30,bold:true,color:INK,fontFace:'Calibri'})

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
    const p=r.p
    slide.addText(label(p),{x:LX,y,w:LW,h:rowH,color:INK,fontSize:fs,valign:'middle',margin:[0,4,0,4],fit:'shrink'})
    const x0=xStart(p.start_date),x1=p.ongoing||!p.end_date?xAt(endAbs+1):xEnd(p.end_date)
    if(x1<=x0)return
    const proposed=p.planning_state==='proposed'
    const fill=proposed?PROPOSED_FILL:TEAM_FILL[p.team]||'9AA5B1'
    slide.addShape(pptx.ShapeType.rect,{x:x0,y:y+rowH*0.22,w:x1-x0,h:rowH*0.56,fill:{color:fill},line:{color:proposed?ORANGE:fill,width:proposed?1:0}})
    yOf.set(p.id,y+rowH/2);barOf.set(p.id,{x0,x1,s:p.start_date,e:p.ongoing?null:p.end_date||null})
  })

  // Dependency arrows, as elbow connectors: out of the end of the blocker, along to the
  // row of what waits on it, then into its start. When that work starts before the blocker
  // finishes, the arrow drops straight onto its bar instead, in red, as on the Strategy tab.
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
    }else if(x1<=b.x1){
      // Starts too early: drop from the blocker's end onto the target bar
      seg(x1,y1,x1,edge,BAD,true);late.push(d)
    }else{
      // The target is over before the blocker ends: down to its row, back to its end
      seg(x1,y1,x1,y2,BAD,false);seg(x1,y2,b.x1,y2,BAD,true);late.push(d)
    }
    drawn.push(d)
  }

  // Legend
  const LY=Math.min(6.62,bodyBottom+0.12)
  const legend:[string,any][]=[['Consumer Experience (dated)',{fill:{color:NAVY},line:{color:NAVY}}],['Operational Efficiency (dated)',{fill:{color:STEEL},line:{color:STEEL}}],
    ['Proposed, not yet planned',{fill:{color:PROPOSED_FILL},line:{color:ORANGE,width:1}}],
    [`Code freeze${freeze.length?' '+[...freeze].sort((a,b)=>((a+8)%12)-((b+8)%12)).map(m=>MONTHS[m-1]).join(', '):''}`,{fill:{color:FREEZE},line:{color:FREEZE}}]]
  legend.forEach(([t,st],i)=>{
    const x=LX+i*3.05
    slide.addShape(pptx.ShapeType.rect,{x,y:LY+0.04,w:0.3,h:0.18,...st})
    slide.addText(t,{x:x+0.38,y:LY,w:2.6,h:0.26,fontSize:11,color:'4A5568',valign:'middle',margin:0})
  })

  // Notes: the strategy's description and what the arrows mean
  const name=(id:any)=>(projects as any[]).find(p=>p.id===id)?.name||'?'
  const byBlocked=new Map<string,string[]>()
  for(const d of drawn){const k=d.blocked_id;byBlocked.set(k,[...(byBlocked.get(k)||[]),name(d.blocker_id)])}
  const arrows=[...byBlocked.entries()].map(([k,from])=>`${listJoin(from)} → ${name(k)}`)
  const lateText=late.map(d=>`${name(d.blocked_id)} starts before ${name(d.blocker_id)} finishes`)
  const note=[strategy.description,arrows.length?`Arrows: ${arrows.join('; ')}.`:'',lateText.length?`Red arrows: ${lateText.join('; ')}.`:'','FY runs Apr to Mar.'].filter(Boolean).join(' ')
  slide.addText(note,{x:LX,y:LY+0.3,w:12.2,h:Math.max(0.3,7.4-(LY+0.3)),fontSize:9,color:MUTED,valign:'top',margin:0,fit:'shrink'})
}
