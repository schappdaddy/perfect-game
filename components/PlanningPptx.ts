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
  bug:{label:'BUG',short:'BUG',bar:'C0392B',fill:'FDEDEC',line:'F1948A',badge:'C0392B',badgeInk:'FFFFFF',name:INK,meta:'922B21',home:MUTED},
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

export type PlanChild={kind:'epic'|'story'|'bug',name:string,ref?:string,status?:string,note?:string}
export type PlanCard={children?:PlanChild[],kind:'initiative'|'epic'|'story'|'bug',name:string,ref?:string,team?:string|null,wt?:string,home?:string|null,release?:string|null,quarter?:string|null,priority?:string|null,status?:string|null,flag?:string|null,prd?:string|null,design?:string|null}
export type PlanMilestone={date:string,name:string,type:string,color?:string|null,team?:string|null,done?:boolean}
export type PlanProgress={n:number,done:number,deployed:number,ready:number,fly:number,pct:number,days:number|null,risk:'red'|'amber'|'green'|'none'}
export type PlanColumn={title:string,sub?:string,meta?:string[],milestones:PlanMilestone[],cards:PlanCard[],blocked?:boolean,now?:boolean,slimmable?:boolean,progress?:PlanProgress|null}

// A release's progress as in the app: the % done (deployed + ready to release) and a bar of
// deployed / ready / in flight / not started. dark = on a dark header.
export function drawProgress(pptx:any,slide:any,x:number,y:number,w:number,p:PlanProgress,dark=false,big=false){
  const riskClr={red:'E74C3C',amber:'D4A017',green:'27AE60',none:dark?'FFFFFF':'1F2A3C'}[p.risk]
  const fs=big?20:11,lw=big?0.9:0.42
  slide.addText(`${p.pct}%`,{x,y,w:lw,h:big?0.36:0.2,fontSize:fs,bold:true,color:riskClr,margin:0,valign:'middle'})
  const days=p.days==null?'':p.days<0?` · ${-p.days}d late`:` · ${p.days}d to go`
  slide.addText(`done · ${p.done}/${p.n}${days}`,{x:x+lw,y,w:Math.max(0.3,w-lw),h:big?0.36:0.2,fontSize:big?11:7.5,color:dark?'D5DCE5':'6B7280',margin:0,valign:'middle'})
  const by=y+(big?0.4:0.21),bh=big?0.12:0.06
  slide.addShape(pptx.ShapeType.rect,{x,y:by,w,h:bh,fill:{color:dark?'4A5563':'DDE3EA'},line:{color:dark?'4A5563':'DDE3EA',width:0}})
  let bx=x
  for(const[n,c] of [[p.deployed,'27AE60'],[p.ready,'7DCEA0'],[p.fly,'5DADE2']] as [number,string][]){
    if(!n||!p.n)continue;const bw=w*n/p.n
    slide.addShape(pptx.ShapeType.rect,{x:bx,y:by,w:bw,h:bh,fill:{color:c},line:{color:c,width:0}});bx+=bw
  }
}

// PRD and Design readiness: two small dots, P and D (green = approved, amber = draft / in
// review, outline = not started, dashed = not needed)
function readinessPips(pptx:any,slide:any,x:number,y:number,cd:PlanCard,d=0.13){
  ;([['P',cd.prd],['D',cd.design]] as [string,any][]).forEach(([l,st],i)=>{
    const ok=st==='approved',wip=st==='draft'||st==='review',na=st==='na'
    slide.addShape(pptx.ShapeType.ellipse,{x:x+i*(d+0.03),y,w:d,h:d,fill:ok?{color:'27AE60'}:wip?{color:'F6E3B4'}:{color:'FFFFFF',transparency:100},line:{color:ok?'27AE60':wip?'D4A017':'9AA3AF',width:0.75,dashType:na?'dash':'solid'}})
    slide.addText(ok?'✓':l,{x:x+i*(d+0.03),y,w:d,h:d,fontSize:5.5,bold:true,color:ok?'FFFFFF':wip?'8A6512':'9AA3AF',align:'center',valign:'middle',margin:0})
  })
}
const PIPS_W=0.32

export async function exportPlanningPptx({title,subtitle,quarters,releaseSlides,fileName,extra}:{title:string,subtitle:string,quarters:{label:string,cols:PlanColumn[],opts?:BoardOpts}[],releaseSlides:{label:string,cols:PlanColumn[],opts?:BoardOpts}[],fileName:string,extra?:(pptx:any)=>void}){
  const PptxGenJS=(await import('pptxgenjs')).default
  const pptx=new PptxGenJS()
  pptx.layout='LAYOUT_WIDE' // 13.33 × 7.5 in
  for(const q of quarters)drawBoard(pptx,title,`Quarter plan · ${q.label} · ${subtitle}`,q.cols,q.opts||{})
  for(const r of releaseSlides)drawBoard(pptx,title,`Release plan · ${r.label} · ${subtitle}`,r.cols,r.opts||{})
  extra?.(pptx)
  await pptx.writeFile({fileName:fileName+'.pptx'})
}

export type BoardOpts={equal?:boolean,contain?:boolean}
export function drawBoard(pptx:any,title:string,subtitle:string,cols:PlanColumn[],opts:BoardOpts={}){
  const slide=pptx.addSlide()
  slide.background={color:CREAM}
  slide.addShape(pptx.ShapeType.rect,{x:0.25,y:0,w:0.28,h:7.5,fill:{color:'2F3742'},line:{color:'2F3742'}})
  slide.addText(title,{x:0.75,y:0.2,w:12.2,h:0.55,fontSize:26,bold:true,color:INK,fontFace:'Calibri',margin:0})
  slide.addText(subtitle,{x:0.75,y:0.75,w:12.2,h:0.28,fontSize:12,bold:true,color:'E07B2A',margin:0})
  // Legend: the same coloured labels the cards carry
  let lx=0.75
  for(const k of ['initiative','epic','story','bug']){
    const K=KIND[k],bw=capsW(K.label,8)
    slide.addShape(pptx.ShapeType.rect,{x:lx,y:7.1,w:0.3,h:0.2,fill:{color:K.fill},line:{color:K.line,width:0.75}})
    slide.addShape(pptx.ShapeType.rect,{x:lx,y:7.1,w:0.05,h:0.2,fill:{color:K.bar},line:{color:K.bar,width:0}})
    slide.addText(K.label,{x:lx+0.36,y:7.1,w:bw,h:0.2,fontSize:8,bold:true,color:K.badgeInk,fill:{color:K.badge},align:'center',valign:'middle',margin:0})
    lx+=0.36+bw+0.3
  }
  slide.addShape(pptx.ShapeType.diamond,{x:lx,y:7.12,w:0.16,h:0.16,fill:{color:MS},line:{color:MS,width:0}})
  slide.addText('Milestone (colour = type; crossed out = done)',{x:lx+0.22,y:7.06,w:2.85,h:0.28,fontSize:9,color:INK,margin:0});lx+=3.05
  readinessPips(pptx,slide,lx,7.135,{kind:'story',name:'',prd:'approved',design:'review'})
  slide.addText('PRD / Design: ✓ approved · amber in progress · outline not started',{x:lx+0.36,y:7.06,w:13.08-lx-0.36,h:0.28,fontSize:9,color:MUTED,margin:0})

  if(!cols.length){slide.addText('Nothing in view.',{x:0.75,y:3.5,w:12,h:0.4,fontSize:14,color:MUTED});return}
  // Months with nothing in them (no release, or nothing planned yet) are slim strips
  const X0=0.75,X1=13.08,GAP=0.1,TOP=1.15,BOTTOM=6.98
  const slim=(c:PlanColumn)=>!!c.slimmable&&!c.cards.length&&!c.milestones.length
  // Busier columns get more room: width by how much they hold, at least 2 in
  const SLIM_W=0.42,nSlim=cols.filter(slim).length
  const room=X1-X0-GAP*(cols.length-1)-SLIM_W*nSlim
  const weight=(c:PlanColumn)=>opts.equal?1:1+(c.cards.length+c.cards.reduce((a,cd)=>a+Math.min(12,cd.children?.length||0)*0.4,0))/6+Math.min(c.milestones.length,8)/16
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
    else drawColumn(pptx,slide,c,x,w,TOP,BOTTOM,!!opts.contain)
    x+=w+GAP
  }
}

function drawSlim(pptx:any,slide:any,c:PlanColumn,x:number,w:number,top:number,bottom:number){
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:bottom-top,fill:{color:c.blocked?FREEZE:'F4F5F7'},line:{color:'C9CED6',width:0.75}})
  slide.addText(`${c.title} · ${c.blocked?(c.sub||'No release'):`${c.sub||''}${c.sub?' · ':''}nothing planned`}`,{x:x-(bottom-top)/2+w/2,y:top+(bottom-top)/2-w/2,w:bottom-top,h:w,rotate:270,fontSize:9,bold:true,color:MUTED,align:'center',valign:'middle',margin:0})
}

function drawColumn(pptx:any,slide:any,c:PlanColumn,x:number,w:number,top:number,bottom:number,contain=false){
  const pad=0.07,iw=w-pad*2
  // Header
  const meta=c.meta||[]
  const hh=0.52+meta.length*0.17+(c.progress?0.32:0)
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:bottom-top,fill:{color:c.blocked?'F1F2F4':'FFFFFF'},line:{color:c.now?'C8973A':LINE,width:c.now?1.5:0.75}})
  slide.addShape(pptx.ShapeType.rect,{x,y:top,w,h:hh,fill:{color:c.blocked?'8A94A3':'2F3742'},line:{color:c.blocked?'8A94A3':'2F3742',width:0}})
  const tt=c.title+(c.now?'  · NOW':''),tfs=fitFs(tt,iw,14,true,9)
  slide.addText(trunc(tt,iw,tfs,true),{x:x+pad,y:top+0.04,w:iw,h:0.27,fontSize:tfs,bold:true,color:'FFFFFF',margin:0})
  if(c.sub)slide.addText(trunc(c.sub,iw,9.5),{x:x+pad,y:top+0.3,w:iw,h:0.19,fontSize:9.5,color:c.blocked?'F4E3C8':'E8B95A',margin:0})
  meta.forEach((m,i)=>slide.addText(trunc(m,iw,8.5),{x:x+pad,y:top+0.49+i*0.17,w:iw,h:0.17,fontSize:8.5,color:'D5DCE5',margin:0}))
  if(c.progress)drawProgress(pptx,slide,x+pad,top+0.52+meta.length*0.17,iw,c.progress,true)
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
  const cards=[...c.cards.filter(cd=>cd.kind==='initiative'),...c.cards.filter(cd=>cd.kind==='epic'),...c.cards.filter(cd=>cd.kind==='story'||cd.kind==='bug')]
  const n=cards.length,avail=bottom-0.06-y
  if(n&&(contain||cards.some(cd=>cd.children))){drawContainers(pptx,slide,cards,x+pad,y,iw,bottom-0.06,contain?999:12);return}
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
      if(tags)slide.addText(trunc(tags,tw-bw-0.06-PIPS_W,7),{x:tx+bw+0.06,y:cy+0.03,w:tw-bw-0.06-PIPS_W,h:0.17,fontSize:7,bold:true,color:K.meta,margin:0,valign:'middle'})
      readinessPips(pptx,slide,cx+cw-PIPS_W,cy+0.045,cd)
      // Line 2: the name; line 3: the initiative it belongs to
      slide.addText(trunc(cd.name,tw,nameFs,true),{x:tx,y:cy+0.2,w:tw,h:0.2,fontSize:nameFs,bold:true,color:K.name,margin:0,valign:'middle'})
      if(cd.flag)slide.addText(trunc(cd.flag,tw,7,true),{x:tx,y:cy+0.39,w:tw,h:0.14,fontSize:7,bold:true,color:'C0392B',margin:0})
      else if(cd.home&&ch>=0.5)slide.addText(trunc(cd.home,tw,7),{x:tx,y:cy+0.39,w:tw,h:0.14,fontSize:7,color:K.home,margin:0})
    }else{
      const bfs=6,bw=capsW(K.short,bfs)
      slide.addText(K.short,{x:tx,y:cy+(ch-0.14)/2,w:bw,h:0.14,fontSize:bfs,bold:true,color:K.badgeInk,fill:{color:K.badge},align:'center',valign:'middle',margin:0})
      const nw=tw-bw-0.06-PIPS_W,team=(cd.team?`  ${cd.team}`:'')+(cd.flag?`  ⚠ ${cd.flag}`:'')
      readinessPips(pptx,slide,cx+cw-PIPS_W,cy+(ch-0.13)/2,cd)
      slide.addText([{text:trunc(cd.name,nw-0.3,nameFs,true),options:{bold:true,color:K.name}},{text:team,options:{color:K.meta,fontSize:nameFs-1.5}}],
        {x:tx+bw+0.06,y:cy,w:nw,h:ch,fontSize:nameFs,valign:'middle',margin:0})
    }
  })
  if(shown<n)slide.addText(`+ ${n-shown} more`,{x:x+pad,y:y+shownRows*(ch+G),w:iw,h:0.22,fontSize:9,italic:true,bold:true,color:MUTED,margin:0})
}

// Status colours, as in the app
const ST_CLR:any={'Backlog':'2874A6','Ready':'7D3C98','In Progress':'1E8449','Blocked':'C0392B','Code Review':'B7950B','Ready for Test':'B9770E','In Test':'AF601A',
  'Ready for Acceptance':'1F618D','Ready to Release':'239B56','Hypercare':'138D75','Done':'117A65','Killed':'7B7D7D'}
const CHILD:any={epic:{mark:'◆',clr:'D35400'},story:{mark:'▪',clr:'2874A6'},bug:{mark:'●',clr:'C0392B'}}
// Cards with what's inside them listed underneath, stacked into as many sub-columns as fit
function drawContainers(pptx:any,slide:any,cards:PlanCard[],x:number,y0:number,w:number,bottom:number,MAXR=12){
  const G=CG,subs=subsFor(w),cw=(w-G*(subs-1))/subs
  const ys=Array(subs).fill(y0);let skipped=0,col=0
  const limit=MAXR>=999?bottom+0.01:bottom-0.24
  for(const cd of cards){
    const tw=cw-0.17,h=cardHt(cd,cw,MAXR)
    // reading order: down this sub-column, then the next one to the right
    while(ys[col]+h>limit&&ys[col]>y0&&col<subs-1)col++
    if(ys[col]+h>limit&&ys[col]>y0){skipped++;continue}
    const cx=x+col*(cw+G),cy=ys[col],K=KIND[cd.kind]
    slide.addShape(pptx.ShapeType.rect,{x:cx,y:cy,w:cw,h,fill:{color:K.fill},line:{color:K.line,width:0.75}})
    slide.addShape(pptx.ShapeType.rect,{x:cx,y:cy,w:0.06,h,fill:{color:K.bar},line:{color:K.bar,width:0}})
    const tx=cx+0.12,bfs=7,bw=capsW(K.label,bfs)
    slide.addText(K.label,{x:tx,y:cy+0.05,w:bw,h:0.16,fontSize:bfs,bold:true,color:K.badgeInk,fill:{color:K.badge},align:'center',valign:'middle',margin:0})
    const tags=[cd.ref,cd.team,cd.status,cd.release?`Release ${cd.release}`:null,cd.quarter].filter(Boolean).join(' · ')
    if(tags)slide.addText(trunc(tags,tw-bw-0.06-PIPS_W,7.5),{x:tx+bw+0.06,y:cy+0.04,w:tw-bw-0.06-PIPS_W,h:0.18,fontSize:7.5,bold:true,color:K.meta,margin:0,valign:'middle'})
    readinessPips(pptx,slide,cx+cw-PIPS_W,cy+0.055,cd)
    // The name in full, wrapping onto more lines if it needs them
    const nl=nameLines(cd,tw)
    slide.addText(cd.name,{x:tx,y:cy+0.23,w:tw,h:nl*NAME_LH,fontSize:NAME_FS,bold:true,color:K.name,margin:0,valign:'top',fit:'none'})
    const kids=(cd.children||[]).slice(0,MAXR),more=(cd.children?.length||0)-kids.length
    if(kids.length){
      const ry0=cy+headHt(cd,tw),dark=cd.kind==='initiative'
      const boxH=kids.reduce((a,k)=>a+kidH(k,tw),0)+(more>0?CROW:0)+0.04
      slide.addShape(pptx.ShapeType.rect,{x:tx-0.04,y:ry0-0.02,w:tw+0.02,h:boxH,fill:{color:dark?'2C3A4E':'FFFFFF'},line:{color:dark?'2C3A4E':'F0D9C8',width:0}})
      let ry=ry0
      for(const ch of kids){
        const C=CHILD[ch.kind],stw=statusW(ch.status),rh=kidH(ch,tw)
        // Each row in full: it wraps rather than being cut off
        const left=[{text:`${C.mark} `,options:{color:C.clr,bold:true}},...(ch.ref?[{text:`${ch.ref}  `,options:{color:dark?'9FB0C3':MUTED,fontSize:7.5}}]:[]),
          {text:ch.name+(ch.note?` · ${ch.note}`:''),options:{color:dark?'F4F6F8':INK}}]
        slide.addText(left,{x:tx,y:ry+0.02,w:tw-stw-0.04,h:rh-0.02,fontSize:KID_FS,margin:0,valign:'top',fit:'none',lineSpacing:KID_FS*1.15})
        if(ch.status)slide.addText(ch.status,{x:tx+tw-stw,y:ry+0.02,w:stw,h:KID_LH,fontSize:7.5,bold:true,color:dark?'E8B95A':(ST_CLR[ch.status]||MUTED),align:'right',margin:0,valign:'top'})
        ry+=rh
      }
      if(more>0)slide.addText(`+ ${more} more`,{x:tx,y:ry,w:tw,h:CROW,fontSize:8,italic:true,color:dark?'C9D3DF':MUTED,margin:0,valign:'middle'})
    }
    ys[col]+=h+G
  }
  if(skipped)slide.addText(`+ ${skipped} more not shown`,{x,y:bottom-0.22,w,h:0.22,fontSize:9,italic:true,bold:true,color:MUTED,margin:0})
}

// Card measurements, shared by the drawing and the page packing so they always agree.
// Names and rows wrap onto as many lines as they need instead of being cut off.
const NAME_FS=11,NAME_LH=0.2,KID_FS=8.5,KID_LH=0.155
const txtW=(t:string,fs:number,bold=false)=>t.length*fs*(bold?0.48:0.4)/72
const statusW=(st?:string)=>st?Math.min(1,st.length*0.054+0.08):0
const kidLines=(ch:PlanChild,tw:number)=>{
  const avail=Math.max(0.6,tw-statusW(ch.status)-0.06-0.14-(ch.ref?txtW(ch.ref+'  ',7.5):0))
  return Math.max(1,Math.ceil(txtW(ch.name+(ch.note?` · ${ch.note}`:''),KID_FS)/avail))
}
const kidH=(ch:PlanChild,tw:number)=>0.05+kidLines(ch,tw)*KID_LH
const nameLines=(cd:PlanCard,tw:number)=>Math.min(4,Math.max(1,Math.ceil(txtW(cd.name,NAME_FS,true)/tw)))
const headHt=(cd:PlanCard,tw:number)=>0.26+nameLines(cd,tw)*NAME_LH
const cardHt=(cd:PlanCard,cw:number,maxr=999)=>{
  const tw=cw-0.17,all=cd.children||[],kids=all.slice(0,maxr)
  return headHt(cd,tw)+(kids.length?kids.reduce((a,k)=>a+kidH(k,tw),0)+0.05+(all.length>maxr?CROW:0):0)
}

// ── Release slides that show everything: two months a slide, or one busy month a slide
// (continued over more slides if needed), with every card and every row in it ──
const CG=0.06,CROW=0.2
const subsFor=(w:number)=>Math.max(1,Math.min(3,Math.floor((w+CG)/3.6)))
const B_X0=0.75,B_X1=13.08,B_GAP=0.1,B_TOP=1.15,B_BOTTOM=6.98
const headH=(c:PlanColumn)=>0.52+(c.meta||[]).length*0.17+(c.progress?0.32:0)
const msH=(c:PlanColumn,iw:number)=>{const n=c.milestones.length;if(!n)return 0;const mc=iw>=4.6?2:1,rows=Math.min(Math.ceil(n/mc),mc===2?4:6),more=n-rows*mc;return 0.24+rows*0.19+(more>0?0.19:0)+0.04+0.08}
// Room for cards in a column of width w
const cardArea=(c:PlanColumn,w:number,first=true)=>B_BOTTOM-0.06-(B_TOP+headH(c)+0.07+(first?msH(c,w-0.14):0))
// Split cards into pages that each fit; a card too tall for a page continues as "(cont.)"
export function packCards(cards:PlanCard[],w:number,H:number,H2=H):PlanCard[][]{
  const subs=subsFor(w),cw=(w-CG*(subs-1))/subs,tw=cw-0.17,pages:PlanCard[][]=[];let page:PlanCard[]=[],col=0,y=0,cap=H
  const cont=(cd:PlanCard)=>cd.name.replace(/ \(cont\.\)$/,'')+' (cont.)'
  const advance=()=>{if(col<subs-1){col++;y=0}else{pages.push(page);page=[];col=0;y=0;cap=H2}}
  // How many of a card's rows fit in the room left
  const rowsFitting=(cd:PlanCard,room:number)=>{let used=headHt(cd,tw)+0.05,n=0;for(const k of cd.children||[]){used+=kidH(k,tw);if(used>room)break;n++}return n}
  const queue=[...cards]
  while(queue.length){
    const cd=queue.shift()!,h=cardHt(cd,cw),room=cap-y
    if(h<=room){page.push(cd);y+=h+CG;continue}
    const kids=cd.children||[],fit=rowsFitting(cd,room)
    // Split a long card here if a fair share of it fits; otherwise carry it to the next sub-column
    if(kids.length&&(fit>=3||(y===0&&fit>=1))){
      page.push({...cd,children:kids.slice(0,fit)});queue.unshift({...cd,name:cont(cd),children:kids.slice(fit)});advance();continue
    }
    if(y===0&&(!kids.length||fit<1)){page.push(cd);advance();continue} // taller than a column on its own: place it anyway
    advance();queue.unshift(cd)
  }
  if(page.length||!pages.length)pages.push(page)
  return pages
}
// Lay columns out two to a slide; a column that doesn't fit half a slide gets slides of its own
export function paginateColumns(cols:PlanColumn[],keepEmpty=false):PlanColumn[][]{
  const full=B_X1-B_X0,half=(full-B_GAP)/2
  const slides:PlanColumn[][]=[];let pending:PlanColumn|null=null
  for(const c of cols){
    if(!keepEmpty&&!c.cards.length&&!c.milestones.length)continue // nothing in it (e.g. a month with no release)
    const h=packCards(c.cards,half-0.14,cardArea(c,half))
    if(h.length===1){if(pending){slides.push([pending,c]);pending=null}else pending=c;continue}
    if(pending){slides.push([pending]);pending=null}
    const f=packCards(c.cards,full-0.14,cardArea(c,full),cardArea(c,full,false))
    f.forEach((cards,i)=>slides.push([{...c,title:f.length>1?`${c.title} (${i+1} of ${f.length})`:c.title,cards,milestones:i?[]:c.milestones}]))
  }
  if(pending)slides.push([pending])
  return slides
}
