'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// Where an initiative is in the intake process. The stages are your own list (intake_stages:
// name, colour, order), created and edited from the UI. Each initiative has one stage
// (projects.intake_stage_id), shown as a small bubble next to the PRD / Design dots.
// Every change is kept in readiness_log (gate 'intake') with who and when.

const GREY='#5B6B7E'
export const INTAKE_COLORS=['#5DADE2','#9B59B6','#E8B95A','#E07B2A','#27AE60','#E74C3C','#1ABC9C','#7A8FA6']

// One shared copy of the stage list for every bubble on the page
let stages:any[]=[],loaded=false,loading=false
const subs=new Set<()=>void>()
const emit=()=>subs.forEach(f=>f())
function load(){
  if(loading)return;loading=true
  supabase.from('intake_stages').select('*').order('sort_order').order('created_at').then(({data})=>{stages=data||[];loaded=true;loading=false;emit()})
}
function setStages(next:any[]){stages=next;emit()}
export function useIntakeStages(){
  const list=useSyncExternalStore(cb=>{subs.add(cb);if(!loaded)load();return()=>{subs.delete(cb)}},()=>stages,()=>stages)
  return list
}
export const intakeStageOf=(p:any,list:any[])=>list.find(s=>s.id===p?.intake_stage_id)||null

export function IntakeBubble({x,apply,size=11,showEmpty=true}:{x:any,apply?:(fields:any)=>void,size?:number,showEmpty?:boolean}){
  const list=useIntakeStages()
  const [open,setOpen]=useState<DOMRect|null>(null)
  const st=intakeStageOf(x,list),idx=st?list.indexOf(st):-1
  if(!st&&!showEmpty&&!apply)return null
  const c=st?.color||GREY
  const title=st?`Intake: ${st.name} (step ${idx+1} of ${list.length})`:'Intake: not set'
  return(
    <span onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{display:'inline-flex',flexShrink:0}}>
      <span title={title+(apply?'\nClick to update':'')} onClick={apply?(e=>setOpen((e.currentTarget as HTMLElement).getBoundingClientRect())):undefined}
        style={{display:'inline-flex',alignItems:'center',gap:4,height:size+3,padding:'0 6px 0 3px',borderRadius:(size+3)/2,boxSizing:'border-box' as const,
          border:`1px ${st?'solid':'dashed'} ${c}`,background:st?`${c}26`:'transparent',color:st?c:GREY,fontSize:size*0.78,fontWeight:800,lineHeight:1,whiteSpace:'nowrap' as const,cursor:apply?'pointer':'default'}}>
        {/* mini progress: one tick per stage */}
        <span style={{display:'inline-flex',gap:1}}>
          {(list.length?list:[null]).slice(0,8).map((s:any,i:number)=><span key={i} style={{width:3,height:size*0.55,borderRadius:1,background:i<=idx?c:`${GREY}88`}}/>)}
        </span>
        {st?st.name:'Intake'}
      </span>
      {open&&apply&&typeof document!=='undefined'&&createPortal(<IntakePopover x={x} rect={open} apply={apply} onClose={()=>setOpen(null)}/>,document.body)}
    </span>
  )
}

const fmtWhen=(iso:string)=>new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})

function IntakePopover({x,rect,apply,onClose}:{x:any,rect:DOMRect,apply:(f:any)=>void,onClose:()=>void}){
  const list=useIntakeStages()
  const [manage,setManage]=useState(false)
  const [hist,setHist]=useState<any[]|null>(null)
  const [busy,setBusy]=useState(false)
  const [by,setBy]=useState<string>(()=>{try{return localStorage.getItem('pg_ready_by')||''}catch{return ''}})
  useEffect(()=>{supabase.from('readiness_log').select('*').eq('entity_type','project').eq('entity_id',x.id).eq('gate','intake').order('created_at',{ascending:false}).limit(15).then(({data})=>setHist(data||[]))},[x.id])
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose])
  async function pick(id:string|null){
    if(id===(x.intake_stage_id||null)){onClose();return}
    const from=intakeStageOf(x,list)?.name||null,to=list.find(s=>s.id===id)?.name||null
    setBusy(true);apply({intake_stage_id:id})
    try{if(by.trim())localStorage.setItem('pg_ready_by',by.trim())}catch{}
    const{error}=await supabase.from('projects').update({intake_stage_id:id}).eq('id',x.id)
    if(error){apply({intake_stage_id:x.intake_stage_id??null});setBusy(false);alert('Failed to save: '+error.message);return}
    await supabase.from('readiness_log').insert({entity_type:'project',entity_id:x.id,entity_name:x.name,gate:'intake',from_status:from,to_status:to,by_name:by.trim()||null})
    setBusy(false);onClose()
  }
  const W=300,left=Math.min(Math.max(8,rect.left-W/2),window.innerWidth-W-8),below=rect.bottom+6+380<window.innerHeight
  return(
    <div onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:4000}}>
      <div onClick={onClose} style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',left,top:below?rect.bottom+6:undefined,bottom:below?undefined:window.innerHeight-rect.top+6,width:W,maxHeight:'80vh',overflowY:'auto',background:'#162436',border:'1px solid #3A4A5E',borderRadius:10,padding:12,boxShadow:'0 12px 30px rgba(0,0,0,0.5)'}}>
        <div style={{display:'flex',alignItems:'center',marginBottom:2}}>
          <div style={{fontSize:12.5,fontWeight:800,color:'#F4F6F8',flex:1}}>Intake stage</div>
          <button onClick={()=>setManage(m=>!m)} style={{background:'none',border:'none',color:'#5DADE2',fontSize:11,cursor:'pointer',padding:0}}>{manage?'Done editing':'✎ Edit stages'}</button>
        </div>
        <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{x.name}</div>
        {manage?<StageManager/>:<>
          {!list.length&&<div style={{fontSize:11.5,color:'#7A8FA6',fontStyle:'italic',marginBottom:8}}>No stages yet. Click <b>✎ Edit stages</b> to set up your intake process.</div>}
          <div style={{display:'flex',flexDirection:'column' as const,gap:3,marginBottom:8}}>
            {list.map((s:any,i:number)=>{const on=s.id===x.intake_stage_id;return(
              <button key={s.id} disabled={busy} onClick={()=>pick(s.id)} style={{display:'flex',alignItems:'center',gap:8,textAlign:'left' as const,background:on?'#1E3048':'transparent',border:`1px solid ${on?s.color:'#243447'}`,borderRadius:6,color:'#F4F6F8',fontSize:12,padding:'5px 8px',cursor:'pointer'}}>
                <span style={{fontSize:10,color:'#7A8FA6',width:14}}>{i+1}</span>
                <span style={{width:10,height:10,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                <span style={{flex:1,fontWeight:on?800:500}}>{s.name}</span>{on&&<span style={{color:s.color}}>✓</span>}
              </button>)})}
            {x.intake_stage_id&&<button disabled={busy} onClick={()=>pick(null)} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:11,cursor:'pointer',textAlign:'left' as const,padding:'2px 8px'}}>Clear stage</button>}
          </div>
          <input value={by} onChange={e=>setBy(e.target.value)} placeholder="Your name (for the history)"
            style={{width:'100%',boxSizing:'border-box' as const,background:'#0F1C2B',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,fontSize:11.5,padding:'5px 7px',marginBottom:8}}/>
          <div style={{borderTop:'1px solid #243447',paddingTop:6}}>
            <div style={{fontSize:10,fontWeight:800,color:'#7A8FA6',letterSpacing:0.6,marginBottom:3}}>HISTORY</div>
            {hist===null?<div style={{fontSize:10.5,color:'#5B6B7E'}}>Loading…</div>:!hist.length?<div style={{fontSize:10.5,color:'#5B6B7E',fontStyle:'italic'}}>No changes yet.</div>:
              hist.map(h=><div key={h.id} style={{fontSize:10.5,color:'#C8C8D4',padding:'2px 0'}}>
                <span style={{color:'#7A8FA6'}}>{fmtWhen(h.created_at)}</span> · {h.from_status||'—'} → <b style={{color:'#F4F6F8'}}>{h.to_status||'cleared'}</b>{h.by_name?` · ${h.by_name}`:''}
              </div>)}
          </div>
        </>}
      </div>
    </div>
  )
}

// Add, rename, recolour, reorder and delete the stages (shared by every initiative)
function StageManager(){
  const list=useIntakeStages()
  const [name,setName]=useState('')
  const inp={background:'#0F1C2B',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,fontSize:12,padding:'4px 7px'}
  async function add(){
    const n=name.trim();if(!n)return
    const color=INTAKE_COLORS[list.length%INTAKE_COLORS.length]
    const{data,error}=await supabase.from('intake_stages').insert({name:n,color,sort_order:list.length}).select().single()
    if(error){alert('Failed to add stage: '+error.message);return}
    setStages([...list,data]);setName('')
  }
  async function upd(s:any,f:any){
    setStages(list.map(x=>x.id===s.id?{...x,...f}:x))
    const{error}=await supabase.from('intake_stages').update(f).eq('id',s.id)
    if(error)alert('Failed to save stage: '+error.message)
  }
  async function move(i:number,d:number){
    const j=i+d;if(j<0||j>=list.length)return
    const next=[...list];[next[i],next[j]]=[next[j],next[i]]
    setStages(next.map((s,k)=>({...s,sort_order:k})))
    await Promise.all(next.map((s,k)=>supabase.from('intake_stages').update({sort_order:k}).eq('id',s.id)))
  }
  async function del(s:any){
    if(!confirm(`Delete the stage “${s.name}”? Initiatives in it will have no intake stage.`))return
    setStages(list.filter(x=>x.id!==s.id))
    const{error}=await supabase.from('intake_stages').delete().eq('id',s.id)
    if(error)alert('Failed to delete stage: '+error.message)
  }
  return(
    <div>
      <div style={{fontSize:10.5,color:'#7A8FA6',marginBottom:6}}>These stages are shared by all initiatives, in order.</div>
      {list.map((s:any,i:number)=>(
        <div key={s.id} style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
          <span style={{display:'flex',flexDirection:'column' as const}}>
            <button onClick={()=>move(i,-1)} disabled={i===0} title="Move up" style={{background:'none',border:'none',color:'#7A8FA6',fontSize:8,cursor:'pointer',padding:0,lineHeight:1,opacity:i===0?0.3:1}}>▲</button>
            <button onClick={()=>move(i,1)} disabled={i===list.length-1} title="Move down" style={{background:'none',border:'none',color:'#7A8FA6',fontSize:8,cursor:'pointer',padding:0,lineHeight:1,opacity:i===list.length-1?0.3:1}}>▼</button>
          </span>
          <button onClick={()=>upd(s,{color:INTAKE_COLORS[(INTAKE_COLORS.indexOf(s.color)+1)%INTAKE_COLORS.length]})} title="Change colour"
            style={{width:14,height:14,borderRadius:'50%',background:s.color,border:'none',cursor:'pointer',flexShrink:0}}/>
          <input defaultValue={s.name} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==s.name)upd(s,{name:v})}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}}
            style={{...inp,flex:1,minWidth:0}}/>
          <button onClick={()=>del(s)} title="Delete stage" style={{background:'none',border:'none',color:'#E74C3C',fontSize:12,cursor:'pointer',padding:'0 2px'}}>🗑</button>
        </div>))}
      <div style={{display:'flex',gap:5,marginTop:6}}>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}} placeholder="New stage, e.g. Submitted" style={{...inp,flex:1,minWidth:0}}/>
        <button onClick={add} disabled={!name.trim()} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:11.5,fontWeight:800,padding:'4px 10px',cursor:'pointer',opacity:name.trim()?1:0.5}}>+ Add</button>
      </div>
    </div>
  )
}
