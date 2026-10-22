'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Dependency lines for a roadmap. Bars opt in with two attributes:
//   data-dep-key="project:<id>" | "epic:<id>" | "item:<id>"  on the bar's box
//   data-dep-handle="<same key>"                               on a small connector dot inside it
// Drag from a bar's dot onto any other bar to say "that one can't start until this one
// finishes"; click a line to remove it. Bar positions are measured from the DOM, so the
// layer works over any layout as long as it sits inside the positioned container that
// holds the bars.

export type DepRow={id:string,blocker_type:string,blocker_id:string,blocked_type:string,blocked_id:string}
export const depKey=(type:string,id:any)=>`${type}:${id}`
const fromKey=(d:DepRow)=>depKey(d.blocker_type,d.blocker_id)
const toKey=(d:DepRow)=>depKey(d.blocked_type,d.blocked_id)
const LINE='#E07B2A',BAD='#E74C3C'

export async function createDependency(blocker:string,blocked:string,deps:DepRow[],setDeps:any){
  if(blocker===blocked)return
  if(deps.some(d=>fromKey(d)===blocker&&toKey(d)===blocked))return
  if(deps.some(d=>fromKey(d)===blocked&&toKey(d)===blocker)){alert('These two already depend on each other the other way round. Remove that line first.');return}
  const[bt,bi]=blocker.split(':'),[dt,di]=blocked.split(':')
  const{data,error}=await supabase.from('work_dependencies').insert({blocker_type:bt,blocker_id:bi,blocked_type:dt,blocked_id:di}).select().single()
  if(error){alert('Failed to add the dependency: '+error.message);return}
  if(data)setDeps((prev:DepRow[])=>[...prev,data])
}
export async function deleteDependency(dep:DepRow,setDeps:any){
  setDeps((prev:DepRow[])=>prev.filter(d=>d.id!==dep.id))
  const{error}=await supabase.from('work_dependencies').delete().eq('id',dep.id)
  if(error)alert('Failed to remove the dependency: '+error.message)
}

// The connector dot a bar shows on hover. Put it inside the element carrying data-dep-key.
export function DepHandle({k,size=10}:{k:string,size?:number}){
  return <span data-dep-handle={k} title="Drag to another bar: that one can't start until this one finishes"
    style={{position:'absolute',right:-(size+5),top:'50%',width:size,height:size,marginTop:-size/2,borderRadius:'50%',background:LINE,border:'2px solid #0D1B2A',cursor:'crosshair',zIndex:8,touchAction:'none'}}/>
}

type Box={x0:number,x1:number,y:number,top:number,h:number}

export function DependencyLayer({containerRef,deps,isBad,onCreate,onDelete,label}:{containerRef:any,deps:DepRow[],isBad?:(d:DepRow)=>boolean,onCreate:(blocker:string,blocked:string)=>void,onDelete:(d:DepRow)=>void,label?:(key:string)=>string}){
  const [boxes,setBoxes]=useState<Record<string,Box>>({})
  const [link,setLink]=useState<any>(null) // {from,x,y,over}
  const [hover,setHover]=useState<string|null>(null)
  const linkRef=useRef<any>(null)
  const onCreateRef=useRef(onCreate)
  const measureRef=useRef<()=>void>(()=>{})
  const svgRef=useRef<SVGSVGElement>(null)

  // Measure every bar after each render; only update state when something actually moved
  function measure(){
    const c=containerRef.current as HTMLElement|null
    const svg=svgRef.current
    if(!c||!svg)return
    // Positions are taken from the drawing surface itself, so lines line up wherever the
    // layer sits inside the container (e.g. below a sticky header)
    const cr=svg.getBoundingClientRect()
    const next:Record<string,Box>={}
    c.querySelectorAll<HTMLElement>('[data-dep-key]').forEach(el=>{
      const r=el.getBoundingClientRect()
      if(!r.width&&!r.height)return
      // Whole pixels, so sub-pixel jitter can't trigger another render
      next[el.dataset.depKey!]={x0:Math.round(r.left-cr.left),x1:Math.round(r.right-cr.left),y:Math.round(r.top-cr.top+r.height/2),top:Math.round(r.top-cr.top),h:Math.round(r.height)}
    })
    const sig=JSON.stringify(next)
    setBoxes(prev=>JSON.stringify(prev)===sig?prev:next)
  }
  useLayoutEffect(()=>{
    linkRef.current=link
    onCreateRef.current=onCreate
    measureRef.current=measure
    measure()
  })
  useEffect(()=>{
    const c=containerRef.current as HTMLElement|null
    if(!c)return
    const ro=new ResizeObserver(()=>measureRef.current())
    ro.observe(c)
    return()=>ro.disconnect()
  },[containerRef])

  // Start a link from a connector dot. Capture phase, so the bar's own drag never starts.
  useEffect(()=>{
    const c=containerRef.current as HTMLElement|null
    if(!c)return
    const pos=(e:PointerEvent)=>{const cr=(svgRef.current||c).getBoundingClientRect();return{x:e.clientX-cr.left,y:e.clientY-cr.top}}
    const targetKey=(e:PointerEvent)=>{
      const el=document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null
      const bar=el?.closest('[data-dep-key]') as HTMLElement|null
      return bar&&c.contains(bar)?bar.dataset.depKey!:null
    }
    function onDown(e:PointerEvent){
      const h=(e.target as HTMLElement).closest?.('[data-dep-handle]') as HTMLElement|null
      if(!h||!c!.contains(h))return
      e.preventDefault();e.stopPropagation()
      setLink({from:h.dataset.depHandle,...pos(e),over:null})
      const move=(ev:PointerEvent)=>{const k=targetKey(ev);setLink((l:any)=>l&&{...l,...pos(ev),over:k&&k!==l.from?k:null})}
      const up=(ev:PointerEvent)=>{
        window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc)
        const k=targetKey(ev),from=linkRef.current?.from
        setLink(null)
        if(from&&k&&k!==from)onCreateRef.current(from,k)
      }
      const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc);setLink(null)}}
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('keydown',esc)
    }
    // A dot sits inside a draggable bar on some views; never let it start an HTML drag
    function onDragStart(e:DragEvent){if((e.target as HTMLElement).closest?.('[data-dep-handle]'))e.preventDefault()}
    c.addEventListener('pointerdown',onDown,true)
    c.addEventListener('dragstart',onDragStart,true)
    return()=>{c.removeEventListener('pointerdown',onDown,true);c.removeEventListener('dragstart',onDragStart,true)}
  },[containerRef])

  const path=(x1:number,y1:number,x2:number,y2:number)=>{
    const dx=Math.max(24,Math.abs(x2-x1)/2)
    return `M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`
  }
  const lines=deps.map(d=>{
    const a=boxes[fromKey(d)],b=boxes[toKey(d)]
    if(!a||!b)return null
    return{d,dPath:path(a.x1,a.y,b.x0,b.y),bad:!!isBad?.(d)}
  }).filter(Boolean) as {d:DepRow,dPath:string,bad:boolean}[]
  const over=link?.over?boxes[link.over]:null
  const src=link?boxes[link.from]:null

  return(
    <>
      <style>{`[data-dep-handle]{opacity:0;transition:opacity .12s}[data-dep-key]:hover [data-dep-handle],[data-dep-handle]:hover{opacity:1}`}</style>
      {/* Sized to the container rather than measured, so drawing never changes what's measured */}
      <svg ref={svgRef} style={{position:'absolute',left:0,top:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:7,overflow:'visible'}}>
        <defs>
          <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={LINE}/></marker>
          <marker id="dep-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={BAD}/></marker>
        </defs>
        {lines.map(({d,dPath,bad})=>(
          <g key={d.id} onMouseEnter={()=>setHover(d.id)} onMouseLeave={()=>setHover(h=>h===d.id?null:h)}
            onClick={()=>onDelete(d)} style={{cursor:'pointer',pointerEvents:'auto'}}>
            <title>{(label?`${label(fromKey(d))} → ${label(toKey(d))}\n`:'')+(bad?'Starts before what it depends on finishes. ':'')+'Click to remove'}</title>
            <path d={dPath} fill="none" stroke="transparent" strokeWidth={12} style={{pointerEvents:'stroke'}}/>
            <path d={dPath} fill="none" stroke={bad?BAD:LINE} strokeWidth={hover===d.id?2.6:1.5} strokeOpacity={0.9} strokeDasharray={hover===d.id?'5 3':undefined}
              markerEnd={`url(#${bad?'dep-arrow-bad':'dep-arrow'})`}/>
          </g>
        ))}
        {link&&src&&<path d={path(src.x1,src.y,over?over.x0:link.x,over?over.y:link.y)} fill="none" stroke={LINE} strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#dep-arrow)"/>}
        {over&&<rect x={over.x0-3} y={over.top-3} width={over.x1-over.x0+6} height={over.h+6} rx={5} fill="none" stroke={LINE} strokeWidth={2}/>}
      </svg>
    </>
  )
}
