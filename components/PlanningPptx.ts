// Export the Backlog planning board to PowerPoint: one slide of the four quarters and one of
// the monthly releases, each with its milestones, initiative go-lives and planned epics and
// stories, as the board shows them (same team, work type and quarters). Native shapes and
// text, so it stays editable. Everything fits on one slide per view: cards get shorter, then
// one line each, and a column that still overflows ends with "+ N more".

const INK='1F2A3C',MUTED='6B7280',CREAM='FDFBF0',NAVY='1F2A3C',LINE='D9DEE5',FREEZE='E4E4E4'
const KIND:any={
  initiative:{bar:'C8973A',fill:'FBF1DD',label:'INITIATIVE GO-LIVE',glyph:'◈'},
  epic:{bar:'E07B2A',fill:'FCE8D8',label:'EPIC',glyph:'◆'},
  story:{bar:'2E86AB',fill:'E3F1FA',label:'STORY',glyph:'▪'},
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

export type PlanCard={kind:'initiative'|'epic'|'story',name:string,ref?:string,team?:string|null,wt?:string,home?:string|null,release?:string|null,quarter?:string|null,priority?:string|null}
export type PlanMilestone={date:string,name:string,type:string,color?:string|null,team?:string|null,done?:boolean}
export type PlanColumn={title:string,sub?:string,meta?:string[],milestones:PlanMilestone[],cards:PlanCard[],blocked?:boolean,now?:boolean,slimmable?:boolean}

export async function exportPlanningPptx({title,subtitle,quarters,releases,fileName}:{title:string,subtitle:string,quarters:PlanColumn[],releases:PlanColumn[],fileName:string}){
  const PptxGenJS=(await import('pptxgenjs')).default
  const pptx=new PptxGenJS()
  pptx.layout='LAYOUT_WIDE' // 13.33 × 7.5 in
  drawBoard(pptx,title,`Quarter plan · ${subtitle}`,quarters)
  drawBoard(pptx,title,`Release plan · ${subtitle}`,releases)
  await pptx.writeFile({fileName:fileName+'.pptx'})
}

function drawBoard(pptx:any,title:string,subtitle:string,cols:PlanColumn[]){
  const slide=pptx.addSlide()
  slide.background={color:CREAM}
  slide.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  slide.addText(title,{x:0.75,y:0.2,w:12.2,h:0.55,fontSize:26,bold:true,color:INK,fontFace:'Calibri',margin:0})
  slide.addText(subtitle,{x:0.75,y:0.75,w:12.2,h:0.28,fontSize:12,bold:true,color:'E07B2A',margin:0})
  // Legend
  const leg=[['initiative','Initiative go-live'],['epic','Epic'],['story','Story']]
  let lx=0.75
  for(const[k,l]of leg){
    slide.addShape(pptx.ShapeType.rect,{x:lx,y:7.12,w:0.18,h:0.16,fill:{color:KIND[k].fill},line:{color:KIND[k].bar,width:1}})
    slide.addText(l,{x:lx+0.22,y:7.06,w:1.5,h:0.28,fontSize:9,color:INK,margin:0});lx+=0.22+l.length*0.075+0.25
  }
  slide.addShape(pptx.ShapeType.diamond,{x:lx,y:7.12,w:0.16,h:0.16,fill:{color:MS},line:{color:MS,width:0}})
  slide.addText('Milestone (colour = type)',{x:lx+0.22,y:7.06,w:2,h:0.28,fontSize:9,color:INK,margin:0});lx+=2.2
  slide.addText('Team: CX Consumer Experience · OE Operational Efficiency · RP Retail Program',{x:lx,y:7.06,w:13.08-lx,h:0.28,fontSize:9,color:MUTED,margin:0,align:'right'})

  if(!cols.length){slide.addText('Nothing in view.',{x:0.75,y:3.5,w:12,h:0.4,fontSize:14,color:MUTED});return}
  // Column widths: months with no release and nothing in them are slim
  const X0=0.75,X1=13.08,GAP=0.08,TOP=1.15,BOTTOM=6.98
  // Months with nothing in them (no release, or nothing planned yet) are slim strips
  const slim=(c:PlanColumn)=>!!c.slimmable&&!c.cards.length&&!c.milestones.length
  const SLIM_W=0.42,nSlim=cols.filter(slim).length,nFull=cols.length-nSlim
  const fullW=nFull?(X1-X0-GAP*(cols.length-1)-SLIM_W*nSlim)/nFull:0
  let x=X0
  for(const c of cols){
    const w=slim(c)?SLIM_W:fullW
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
  const pad=0.06,iw=w-pad*2
  // Header
  const meta=c.meta||[]
  const hh=0.5+meta.length*0.16
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:bottom-top,fill:{color:c.blocked?'F1F2F4':'FFFFFF'},line:{color:c.now?'C8973A':LINE,width:c.now?1.5:0.75}})
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:hh,fill:{color:c.blocked?'8A94A3':NAVY},line:{color:c.blocked?'8A94A3':NAVY,width:0}})
  const tt=c.title+(c.now?'  · NOW':''),tfs=fitFs(tt,iw,13,true,8)
  slide.addText(trunc(tt,iw,tfs,true),{x:x+pad,y:top+0.04,w:iw,h:0.26,fontSize:tfs,bold:true,color:'FFFFFF',margin:0})
  if(c.sub)slide.addText(trunc(c.sub,iw,9),{x:x+pad,y:top+0.29,w:iw,h:0.18,fontSize:9,color:c.blocked?'F4E3C8':'E8B95A',margin:0})
  meta.forEach((m,i)=>slide.addText(trunc(m,iw,8),{x:x+pad,y:top+0.47+i*0.16,w:iw,h:0.16,fontSize:8,color:'D5DCE5',margin:0}))
  let y=top+hh+0.06
  // Milestones
  if(c.milestones.length){
    const rowH=0.17,maxRows=Math.min(c.milestones.length,7),more=c.milestones.length-maxRows
    const bh=0.22+maxRows*rowH+(more>0?rowH:0)+0.04
    slide.addShape(pptx.ShapeType.rect,{x:x+pad,y,w:iw,h:bh,fill:{color:MS_FILL},line:{color:MS,width:1}})
    const mh=iw<1.6?`◇ ${c.milestones.length} MILESTONE${c.milestones.length!==1?'S':''}`:`◇ MILESTONES · ${c.milestones.length}`
    slide.addText(mh,{x:x+pad+0.06,y:y+0.03,w:iw-0.1,h:0.17,fontSize:Math.min(7.5,fitFs(mh,iw-0.1,7.5,true,6)),bold:true,color:MS,margin:0})
    c.milestones.slice(0,maxRows).forEach((m,i)=>{
      const ry=y+0.22+i*rowH,clr=hex(m.color,MS)
      slide.addShape(pptx.ShapeType.diamond,{x:x+pad+0.07,y:ry+0.035,w:0.1,h:0.1,fill:{color:m.done?'27AE60':clr},line:{color:m.done?'27AE60':clr,width:0}})
      const txt=`${m.date} · ${m.type} · ${m.name}${m.team?` (${m.team})`:''}`
      const tw=iw-0.26
      slide.addText(trunc(txt,tw,7.5),{x:x+pad+0.22,y:ry,w:tw,h:rowH,fontSize:7.5,color:m.done?MUTED:INK,margin:0,strike:m.done?'sngStrike':undefined})
    })
    if(more>0)slide.addText(`+ ${more} more`,{x:x+pad+0.22,y:y+0.22+maxRows*rowH,w:iw-0.26,h:rowH,fontSize:7.5,italic:true,color:MUTED,margin:0})
    y+=bh+0.06
  }
  // Cards: two lines when there's room, one line each when not, then "+ N more"
  const avail=bottom-0.05-y,n=c.cards.length
  if(!n){slide.addText(c.blocked?'No release this month.':'Nothing planned.',{x:x+pad,y,w:iw,h:0.22,fontSize:8,italic:true,color:'9AA3AF',margin:0});return}
  const G=0.04
  let ch=Math.min(0.46,(avail-G*(n-1))/n),shown=n
  const two=ch>=0.36
  if(!two){ch=Math.max(0.19,Math.min(0.24,(avail-G*(n-1))/n));shown=Math.min(n,Math.floor((avail+G)/(ch+G)));if(shown<n)shown=Math.max(0,Math.floor((avail-0.2+G)/(ch+G)))}
  // One name size for the whole column, so cards read evenly
  const tw0=iw-0.12
  const fs=two?Math.max(7.5,Math.min(10,...c.cards.slice(0,shown).map(cd=>fitFs(cd.name,tw0,10,cd.kind!=='story',7.5)))):0
  c.cards.slice(0,shown).forEach((cd,i)=>{
    const k=KIND[cd.kind],cy=y+i*(ch+G)
    slide.addShape(pptx.ShapeType.rect,{x:x+pad,y:cy,w:iw,h:ch,fill:{color:k.fill},line:{color:k.bar,width:0.5}})
    slide.addShape(pptx.ShapeType.rect,{x:x+pad,y:cy,w:0.05,h:ch,fill:{color:k.bar},line:{color:k.bar,width:0}})
    const tx=x+pad+0.09,tw=iw-0.12
    const tags=[cd.team,cd.wt,cd.priority,cd.release?`Rel ${cd.release}`:null,cd.quarter?cd.quarter:null].filter(Boolean).join(' · ')
    if(two){
      const head=[k.label+(cd.ref?` ${cd.ref}`:''),tags].filter(Boolean).join('  ·  ')
      slide.addText(trunc(head,tw,6.5,true),{x:tx,y:cy+0.02,w:tw,h:0.13,fontSize:6.5,bold:true,color:hex(k.bar,'000'),margin:0})
      slide.addText(trunc(cd.name,tw,fs,cd.kind!=='story'),{x:tx,y:cy+0.14,w:tw,h:0.17,fontSize:fs,bold:cd.kind!=='story',color:INK,margin:0})
      if(cd.home&&ch>=0.42)slide.addText(trunc(cd.home,tw,6.5),{x:tx,y:cy+0.30,w:tw,h:0.13,fontSize:6.5,color:MUTED,margin:0})
    }else{
      const suffix=cd.team?`  ${cd.team}`:''
      const f1=Math.max(7,Math.min(8.5,ch*72*0.55))
      slide.addText([{text:k.glyph+' ',options:{color:k.bar,bold:true}},{text:trunc(cd.name,tw-0.35,f1,cd.kind!=='story'),options:{bold:cd.kind!=='story',color:INK}},{text:suffix,options:{color:MUTED,fontSize:f1-1}}],
        {x:tx,y:cy,w:tw,h:ch,fontSize:f1,valign:'middle',margin:0})
    }
  })
  if(shown<n)slide.addText(`+ ${n-shown} more`,{x:x+pad,y:y+shown*(ch+G),w:iw,h:0.2,fontSize:8,italic:true,bold:true,color:MUTED,margin:0})
}
