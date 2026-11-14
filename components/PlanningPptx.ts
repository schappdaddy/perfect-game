// Export the Backlog planning board to PowerPoint: one slide of the four quarters, then the
// release plan one slide per quarter (its three months, plus what's planned there without a
// release yet), as the board shows them (same team, work type and quarters). Native shapes
// and text, so it stays editable.
// Each kind of work looks different at a glance: initiatives are solid navy cards, epics
// orange and stories blue, and every card starts with its kind as a coloured label. Wide
// columns lay cards out two across; when a column is full, cards drop to one line each and
// the column ends with "+ N more".

const INK='1F2A3C',MUTED='6B7280',CREAM='FDFBF0',NAVY='1F2A3C',LINE='D9DEE5',FREEZE='E4E4E4'
const KIND:any={
  initiative:{label:'INITIATIVE',short:'INIT',bar:'C8973A',fill:NAVY,line:NAVY,badge:'C8973A',badgeInk:NAVY,name:'FFFFFF',meta:'C9D3DF',home:'E8B95A'},
  epic:{label:'EPIC',short:'EPIC',bar:'D35400',fill:'FDEBDD',line:'E59866',badge:'D35400',badgeInk:'FFFFFF',name:INK,meta:'A04000',home:MUTED},
  story:{label:'STORY',short:'STORY',bar:'2874A6',fill:'E6F2FB',line:'85C1E9',badge:'2874A6',badgeInk:'FFFFFF',name:INK,meta:'1B4F72',home:MUTED},
}
const MS='8E44AD',MS_FILL='F4ECF8'
const hex=(c:string|null|undefined,d:string)=>(c||d).replace('#','').toUpperCase()
// Labels are sized here: PowerPoint only shrinks text to fit once someone edits it
const fitFs=(text:string,w:number,base:number,bold=false,min=6.5)=>{
  const em=0.5+(bold?0.04:0)
  return Math.max(min,Math.min(base,w*72/Math.max(1,String(text||'').length*em)))
}
const trunc=(text:string,w:number,fs:number,bold=false)=>{
  const t=String(text||''),max=Math.floor(w*72/(fs*(0.5+(bold?0.04:0))))
  return t.length<=max?t:t.slice(0,Math.max(1,max-1)).trimEnd()+'…'
}
// Width of a short all-caps label at a size (Calibri capitals run wider)
const capsW=(t:string,fs:number)=>t.length*fs*0.66/72+0.08

export type PlanCard={kind:'initiative'|'epic'|'story',name:string,ref?:string,team?:string|null,wt?:string,home?:string|null,release?:string|null,quarter?:string|null,priority?:string|null,status?:string|null,flag?:string|null}
export type PlanMilestone={date:string,name:string,type:string,color?:string|null,team?:string|null,done?:boolean}
export type PlanColumn={title:string,sub?:string,meta?:string[],milestones:PlanMilestone[],cards:PlanCard[],blocked?:boolean,now?:boolean,slimmable?:boolean}

export async function exportPlanningPptx({title,subtitle,quarters,releaseSlides,fileName}:{title:string,subtitle:string,quarters:PlanColumn[],releaseSlides:{label:string,cols:PlanColumn[]}[],fileName:string}){
  const PptxGenJS=(await import('pptxgenjs')).default
  const pptx=new PptxGenJS()
  pptx.layout='LAYOUT_WIDE' // 13.33 × 7.5 in
  drawBoard(pptx,title,`Quarter plan · ${subtitle}`,quarters)
  for(const r of releaseSlides)drawBoard(pptx,title,`Release plan · ${r.label} · ${subtitle}`,r.cols)
  await pptx.writeFile({fileName:fileName+'.pptx'})
}

export function drawBoard(pptx:any,title:string,subtitle:string,cols:PlanColumn[]){
  const slide=pptx.addSlide()
  slide.background={color:CREAM}
  slide.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  slide.addText(title,{x:0.75,y:0.2,w:12.2,h:0.55,fontSize:26,bold:true,color:INK,fontFace:'Calibri',margin:0})
  slide.addText(subtitle,{x:0.75,y:0.75,w:12.2,h:0.28,fontSize:12,bold:true,color:'E07B2A',margin:0})
  // Legend: the same coloured labels the cards carry
  let lx=0.75
  for(const k of ['initiative','epic','story']){
    const K=KIND[k],bw=capsW(K.label,8)
    slide.addShape(pptx.ShapeType.rect,{x:lx,y:7.1,w:0.3,h:0.2,fill:{color:K.fill},line:{color:K.line,width:0.75}})
    slide.addShape(pptx.ShapeType.rect,{x:lx,y:7.1,w:0.05,h:0.2,fill:{color:K.bar},line:{color:K.bar,width:0}})
    slide.addText(K.label,{x:lx+0.36,y:7.1,w:bw,h:0.2,fontSize:8,bold:true,color:K.badgeInk,fill:{color:K.badge},align:'center',valign:'middle',margin:0})
    lx+=0.36+bw+0.3
  }
  slide.addShape(pptx.ShapeType.diamond,{x:lx,y:7.12,w:0.16,h:0.16,fill:{color:MS},line:{color:MS,width:0}})
  slide.addText('Milestone (colour = type; crossed out = done)',{x:lx+0.22,y:7.06,w:3.2,h:0.28,fontSize:9,color:INK,margin:0});lx+=3.4
  slide.addText('CX Consumer Experience · OE Operational Efficiency · RP Retail Program',{x:lx,y:7.06,w:13.08-lx,h:0.28,fontSize:9,color:MUTED,margin:0,align:'right'})

  if(!cols.length){slide.addText('Nothing in view.',{x:0.75,y:3.5,w:12,h:0.4,fontSize:14,color:MUTED});return}
  // Months with nothing in them (no release, or nothing planned yet) are slim strips
  const X0=0.75,X1=13.08,GAP=0.1,TOP=1.15,BOTTOM=6.98
  const slim=(c:PlanColumn)=>!!c.slimmable&&!c.cards.length&&!c.milestones.length
  // Busier columns get more room: width by how much they hold, at least 2 in
  const SLIM_W=0.42,nSlim=cols.filter(slim).length
  const room=X1-X0-GAP*(cols.length-1)-SLIM_W*nSlim
  const weight=(c:PlanColumn)=>1+c.cards.length/6+Math.min(c.milestones.length,8)/16
  const full=cols.filter(c=>!slim(c)),MIN_W=Math.min(2,room/Math.max(1,full.length))
  const widths=new Map<PlanColumn,number>()
  let left=room,pool=[...full]
  // Hand out width by weight; any column under the minimum is pinned to it and the rest re-shared
  for(;;){
    const tw=pool.reduce((a,c)=>a+weight(c),0),under=pool.filter(c=>left*weight(c)/tw<MIN_W)
    if(!under.length||under.length===pool.length){pool.forEach(c=>widths.set(c,under.length===pool.length?left/pool.length:left*weight(c)/tw));break}
    under.forEach(c=>{widths.set(c,MIN_W);left-=MIN_W});pool=pool.filter(c=>!under.includes(c))
  }
  let x=X0
  for(const c of cols){
    const w=slim(c)?SLIM_W:widths.get(c)||MIN_W
    if(slim(c))drawSlim(pptx,slide,c,x,w,TOP,BOTTOM)
    else drawColumn(pptx,slide,c,x,w,TOP,BOTTOM)
    x+=w+GAP
  }
}

function drawSlim(pptx:any,slide:any,c:PlanColumn,x:number,w:number,top:number,bottom:number){
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:bottom-top,fill:{color:c.blocked?FREEZE:'F4F5F7'},line:{color:'C9CED6',width:0.75}})
  slide.addText(`${c.title} · ${c.blocked?(c.sub||'No release'):`${c.sub||''}${c.sub?' · ':''}nothing planned`}`,{x:x-(bottom-top)/2+w/2,y:top+(bottom-top)/2-w/2,w:bottom-top,h:w,rotate:270,fontSize:9,bold:true,color:MUTED,align:'center',valign:'middle',margin:0})
}

function drawColumn(pptx:any,slide:any,c:PlanColumn,x:number,w:number,top:number,bottom:number){
  const pad=0.07,iw=w-pad*2
  // Header
  const meta=c.meta||[]
  const hh=0.52+meta.length*0.17
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:bottom-top,fill:{color:c.blocked?'F1F2F4':'FFFFFF'},line:{color:c.now?'C8973A':LINE,width:c.now?1.5:0.75}})
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:hh,fill:{color:c.blocked?'8A94A3':'2F3742'},line:{color:c.blocked?'8A94A3':'2F3742',width:0}})
  const tt=c.title+(c.now?'  · NOW':''),tfs=fitFs(tt,iw,14,true,9)
  slide.addText(trunc(tt,iw,tfs,true),{x:x+pad,y:top+0.04,w:iw,h:0.27,fontSize:tfs,bold:true,color:'FFFFFF',margin:0})
  if(c.sub)slide.addText(trunc(c.sub,iw,9.5),{x:x+pad,y:top+0.3,w:iw,h:0.19,fontSize:9.5,color:c.blocked?'F4E3C8':'E8B95A',margin:0})
  meta.forEach((m,i)=>slide.addText(trunc(m,iw,8.5),{x:x+pad,y:top+0.49+i*0.17,w:iw,h:0.17,fontSize:8.5,color:'D5DCE5',margin:0}))
  let y=top+hh+0.07
  // Milestones, two across in a wide column
  if(c.milestones.length){
    const mcols=iw>=4.6?2:1,rowH=0.19,maxRows=Math.min(Math.ceil(c.milestones.length/mcols),mcols===2?4:6)
    const shownMs=Math.min(c.milestones.length,maxRows*mcols),more=c.milestones.length-shownMs
    const bh=0.24+maxRows*rowH+(more>0?rowH:0)+0.04
    slide.addShape(pptx.ShapeType.rect,{x:x+pad,y,w:iw,h:bh,fill:{color:MS_FILL},line:{color:MS,width:1}})
    slide.addText(`◇ MILESTONES · ${c.milestones.length}`,{x:x+pad+0.07,y:y+0.03,w:iw-0.1,h:0.18,fontSize:Math.min(8,fitFs(`◇ MILESTONES · ${c.milestones.length}`,iw-0.1,8,true,6)),bold:true,color:MS,margin:0})
    const mw=(iw-0.1)/mcols
    c.milestones.slice(0,shownMs).forEach((m,i)=>{
      const col=Math.floor(i/maxRows),row=i%maxRows,mx=x+pad+0.07+col*mw,ry=y+0.24+row*rowH,clr=hex(m.color,MS)
      slide.addShape(pptx.ShapeType.diamond,{x:mx,y:ry+0.04,w:0.11,h:0.11,fill:{color:m.done?'27AE60':clr},line:{color:m.done?'27AE60':clr,width:0}})
      const tw=mw-0.2
      slide.addText([{text:`${m.date} `,options:{bold:true}},{text:trunc(`${m.type} · ${m.name}${m.team?` (${m.team})`:''}`,tw-0.45,8)}],
        {x:mx+0.16,y:ry,w:tw,h:rowH,fontSize:8,color:m.done?MUTED:INK,margin:0,valign:'middle',strike:m.done?'sngStrike':undefined})
    })
    if(more>0)slide.addText(`+ ${more} more`,{x:x+pad+0.23,y:y+0.24+maxRows*rowH,w:iw-0.3,h:rowH,fontSize:8,italic:true,color:MUTED,margin:0})
    y+=bh+0.08
  }
  // Cards: initiatives, then epics, then stories; two across when the column is wide
  const cards=[...c.cards.filter(cd=>cd.kind==='initiative'),...c.cards.filter(cd=>cd.kind==='epic'),...c.cards.filter(cd=>cd.kind==='story')]
  const n=cards.length,avail=bottom-0.06-y
  if(!n){slide.addText(c.blocked?'No release this month.':'Nothing planned.',{x:x+pad,y,w:iw,h:0.24,fontSize:9,italic:true,color:'9AA3AF',margin:0});return}
  // Cards two or three across in a wide column, never narrower than about 2.3 in
  const G=0.05,subs=Math.max(1,Math.min(3,Math.floor((iw+G)/2.35),n)),cw=(iw-G*(subs-1))/subs
  const rows=Math.ceil(n/subs)
  let ch=Math.min(0.56,(avail-G*(rows-1))/rows),shown=n
  const two=ch>=0.42
  if(!two){
    ch=Math.max(0.22,Math.min(0.28,(avail-G*(rows-1))/rows))
    const fitRows=Math.floor((avail+G)/(ch+G))
    if(fitRows*subs<n)shown=Math.max(0,(Math.floor((avail-0.22+G)/(ch+G)))*subs)
  }
  const shownRows=Math.ceil(shown/subs)
  // One name size per column, so cards read evenly
  const nameFs=two?Math.max(8.5,Math.min(11,...cards.slice(0,shown).map(cd=>fitFs(cd.name,cw-0.16,11,true,8.5)))):Math.max(7.5,Math.min(9,ch*72*0.5))
  cards.slice(0,shown).forEach((cd,i)=>{
    const K=KIND[cd.kind],col=Math.floor(i/shownRows),row=i%shownRows
    const cx=x+pad+col*(cw+G),cy=y+row*(ch+G)
    slide.addShape(pptx.ShapeType.rect,{x:cx,y:cy,w:cw,h:ch,fill:{color:K.fill},line:{color:K.line,width:0.75}})
    slide.addShape(pptx.ShapeType.rect,{x:cx,y:cy,w:0.06,h:ch,fill:{color:K.bar},line:{color:K.bar,width:0}})
    const tx=cx+0.11,tw=cw-0.15
    if(two){
      // Line 1: the kind label, then id, team, work type, priority, release / quarter
      const bfs=6.5,bw=capsW(K.label,bfs)
      slide.addText(K.label,{x:tx,y:cy+0.04,w:bw,h:0.15,fontSize:bfs,bold:true,color:K.badgeInk,fill:{color:K.badge},align:'center',valign:'middle',margin:0})
      const tags=[cd.ref,cd.team,cd.wt,cd.priority,cd.status,cd.release?`Release ${cd.release}`:null,cd.quarter].filter(Boolean).join(' · ')
      if(tags)slide.addText(trunc(tags,tw-bw-0.06,7),{x:tx+bw+0.06,y:cy+0.03,w:tw-bw-0.06,h:0.17,fontSize:7,bold:true,color:K.meta,margin:0,valign:'middle'})
      // Line 2: the name; line 3: the initiative it belongs to
      slide.addText(trunc(cd.name,tw,nameFs,true),{x:tx,y:cy+0.2,w:tw,h:0.2,fontSize:nameFs,bold:true,color:K.name,margin:0,valign:'middle'})
      if(cd.flag)slide.addText(trunc(cd.flag,tw,7,true),{x:tx,y:cy+0.39,w:tw,h:0.14,fontSize:7,bold:true,color:'C0392B',margin:0})
      else if(cd.home&&ch>=0.5)slide.addText(trunc(cd.home,tw,7),{x:tx,y:cy+0.39,w:tw,h:0.14,fontSize:7,color:K.home,margin:0})
    }else{
      const bfs=6,bw=capsW(K.short,bfs)
      slide.addText(K.short,{x:tx,y:cy+(ch-0.14)/2,w:bw,h:0.14,fontSize:bfs,bold:true,color:K.badgeInk,fill:{color:K.badge},align:'center',valign:'middle',margin:0})
      const nw=tw-bw-0.06,team=(cd.team?`  ${cd.team}`:'')+(cd.flag?`  ⚠ ${cd.flag}`:'')
      slide.addText([{text:trunc(cd.name,nw-0.3,nameFs,true),options:{bold:true,color:K.name}},{text:team,options:{color:K.meta,fontSize:nameFs-1.5}}],
        {x:tx+bw+0.06,y:cy,w:nw,h:ch,fontSize:nameFs,valign:'middle',margin:0})
    }
  })
  if(shown<n)slide.addText(`+ ${n-shown} more`,{x:x+pad,y:y+shownRows*(ch+G),w:iw,h:0.22,fontSize:9,italic:true,bold:true,color:MUTED,margin:0})
}
