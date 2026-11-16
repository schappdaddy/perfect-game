'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// PRD and Design readiness on initiatives, epics, stories and bugs. Each gate has a status
// (null = not started, draft, review, approved, na = not needed) and a link; every change is
// kept in readiness_log (who, when, from → to, link, note) so it can be audited.
// Shown subtly as two dots, P and D: hollow = not started, amber = draft / in review,
// green = approved, dashed = not needed. Click a dot to change it and see its history.

export type Gate='prd'|'design'
export type Kind='project'|'epic'|'item'
export const GATES:{key:Gate,short:string,label:string}[]=[{key:'prd',short:'P',label:'PRD'},{key:'design',short:'D',label:'Design'}]
export const STATUSES=[{key:'',label:'Not started'},{key:'draft',label:'Draft'},{key:'review',label:'In review'},{key:'approved',label:'Approved'},{key:'na',label:'Not needed'}]
export const statusLabel=(s:any)=>STATUSES.find(x=>x.key===(s||''))?.label||'Not started'
export const isReady=(s:any)=>s==='approved'||s==='na'
const GREEN='#27AE60',AMBER='#E8B95A',GREY='#5B6B7E'
const tableOf=(k:Kind)=>k==='project'?'projects':k==='epic'?'epics':'items'

function pipStyle(s:any,size:number){
  const base={display:'inline-flex',alignItems:'center',justifyContent:'center',width:size,height:size,borderRadius:'50%',fontSize:size*0.62,fontWeight:900,lineHeight:1,flexShrink:0,boxSizing:'border-box' as const}
  if(s==='approved')return{...base,background:GREEN,color:'#0D1B2A',border:`1px solid ${GREEN}`}
  if(s==='draft'||s==='review')return{...base,background:'rgba(232,185,90,0.18)',color:AMBER,border:`1px solid ${AMBER}`}
  if(s==='na')return{...base,background:'transparent',color:GREY,border:`1px dashed ${GREY}`}
  return{...base,background:'transparent',color:GREY,border:`1px solid ${GREY}`}
}

// Save a gate change: the item's current status and link, and a log row
export async function saveGate(kind:Kind,x:any,gate:Gate,next:{status:string|null,link?:string|null,by?:string,note?:string},apply:(fields:any)=>void){
  const f:any={[`${gate}_status`]:next.status||null}
  if(next.link!==undefined)f[`${gate}_link`]=next.link||null
  const prev={[`${gate}_status`]:x[`${gate}_status`]??null,[`${gate}_link`]:x[`${gate}_link`]??null}
  apply(f)
  const{error}=await supabase.from(tableOf(kind)).update(f).eq('id',x.id)
  if(error){apply(prev);alert('Failed to save: '+error.message);return false}
  await supabase.from('readiness_log').insert({entity_type:kind,entity_id:x.id,entity_name:x.name,gate,from_status:x[`${gate}_status`]??null,to_status:next.status||null,
    link:next.link!==undefined?(next.link||null):(x[`${gate}_link`]??null),by_name:next.by||null,note:next.note||null})
  return true
}

const fmtWhen=(iso:string)=>new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})

// The two dots, editable when `apply` is given (apply merges saved fields into local state)
export function ReadinessPips({kind,x,apply,size=13}:{kind:Kind,x:any,apply?:(fields:any)=>void,size?:number}){
  const [open,setOpen]=useState<{gate:Gate,rect:DOMRect}|null>(null)
  return(
    <span onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{display:'inline-flex',gap:2,flexShrink:0}}>
      {GATES.map(g=>{
        const s=x[`${g.key}_status`],link=x[`${g.key}_link`]
        return <span key={g.key} title={`${g.label}: ${statusLabel(s)}${link?`\n${link}`:''}${apply?'\nClick to update':''}`}
          onClick={apply?(e=>setOpen({gate:g.key,rect:(e.currentTarget as HTMLElement).getBoundingClientRect()})):undefined}
          style={{...pipStyle(s,size),cursor:apply?'pointer':'default'}}>{s==='approved'?'✓':g.short}</span>
      })}
      {open&&apply&&typeof document!=='undefined'&&createPortal(<GatePopover kind={kind} x={x} gate={open.gate} rect={open.rect} apply={apply} onClose={()=>setOpen(null)}/>,document.body)}
    </span>
  )
}

function GatePopover({kind,x,gate,rect,apply,onClose}:{kind:Kind,x:any,gate:Gate,rect:DOMRect,apply:(f:any)=>void,onClose:()=>void}){
  const g=GATES.find(z=>z.key===gate)!
  const [status,setStatus]=useState<string>(x[`${gate}_status`]||'')
  const [link,setLink]=useState<string>(x[`${gate}_link`]||'')
  const [by,setBy]=useState<string>(()=>{try{return localStorage.getItem('pg_ready_by')||''}catch{return ''}})
  const [note,setNote]=useState('')
  const [hist,setHist]=useState<any[]|null>(null)
  const [busy,setBusy]=useState(false)
  useEffect(()=>{supabase.from('readiness_log').select('*').eq('entity_type',kind).eq('entity_id',x.id).eq('gate',gate).order('created_at',{ascending:false}).limit(20).then(({data})=>setHist(data||[]))},[kind,x.id,gate])
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose])
  const changed=status!==(x[`${gate}_status`]||'')||link!==(x[`${gate}_link`]||'')
  async function save(){
    if(status==='approved'&&!by.trim()){alert('Who approved it? Add a name so the approval can be audited.');return}
    setBusy(true)
    try{localStorage.setItem('pg_ready_by',by.trim())}catch{}
    const ok=await saveGate(kind,x,gate,{status:status||null,link,by:by.trim(),note:note.trim()},apply)
    setBusy(false);if(ok)onClose()
  }
  const W=300,left=Math.min(Math.max(8,rect.left-W/2),window.innerWidth-W-8),below=rect.bottom+6+340<window.innerHeight
  const inp={width:'100%',boxSizing:'border-box' as const,background:'#0F1C2B',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,fontSize:12,padding:'5px 7px'}
  return(
    <div onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:4000}}>
      <div onClick={onClose} style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',left,top:below?rect.bottom+6:undefined,bottom:below?undefined:window.innerHeight-rect.top+6,width:W,background:'#162436',border:'1px solid #3A4A5E',borderRadius:10,padding:12,boxShadow:'0 12px 30px rgba(0,0,0,0.5)'}}>
        <div style={{fontSize:12.5,fontWeight:800,color:'#F4F6F8',marginBottom:2}}>{g.label} readiness</div>
        <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{x.item_id?`${x.item_id} · `:''}{x.name}</div>
        <div style={{display:'flex',flexWrap:'wrap' as const,gap:4,marginBottom:8}}>
          {STATUSES.map(st=>{const on=status===st.key;return(
            <button key={st.key} onClick={()=>setStatus(st.key)} style={{display:'inline-flex',alignItems:'center',gap:5,background:on?'#1E3048':'transparent',border:`1px solid ${on?'#C8973A':'#243447'}`,borderRadius:12,color:'#F4F6F8',fontSize:11,padding:'2px 8px',cursor:'pointer'}}>
              <span style={pipStyle(st.key,10)}/>{st.label}</button>)})}
        </div>
        <input value={link} onChange={e=>setLink(e.target.value)} placeholder={`Link to the ${g.label} (optional)`} style={{...inp,marginBottom:6}}/>
        <div style={{display:'flex',gap:6,marginBottom:6}}>
          <input value={by} onChange={e=>setBy(e.target.value)} placeholder={status==='approved'?'Approved by (required)':'Your name'} style={{...inp,flex:1,borderColor:status==='approved'&&!by.trim()?'#E8B95A':'#243447'}}/>
        </div>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional)" style={{...inp,marginBottom:8}}/>
        <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginBottom:8}}>
          {x[`${gate}_link`]&&<a href={x[`${gate}_link`]} target="_blank" rel="noreferrer" style={{marginRight:'auto',fontSize:11,color:'#5DADE2',alignSelf:'center'}}>Open {g.label} ↗</a>}
          <button onClick={onClose} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11.5,padding:'4px 10px',cursor:'pointer'}}>Cancel</button>
          <button onClick={save} disabled={busy||(!changed&&!note.trim())} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:11.5,fontWeight:800,padding:'4px 12px',cursor:'pointer',opacity:busy||(!changed&&!note.trim())?0.5:1}}>{busy?'Saving…':'Save'}</button>
        </div>
        <div style={{borderTop:'1px solid #243447',paddingTop:6,maxHeight:130,overflowY:'auto'}}>
          <div style={{fontSize:10,fontWeight:800,color:'#7A8FA6',letterSpacing:0.6,marginBottom:3}}>HISTORY</div>
          {hist===null?<div style={{fontSize:10.5,color:'#5B6B7E'}}>Loading…</div>:!hist.length?<div style={{fontSize:10.5,color:'#5B6B7E',fontStyle:'italic'}}>No changes yet.</div>:
            hist.map(h=><div key={h.id} style={{fontSize:10.5,color:'#C8C8D4',padding:'2px 0'}}>
              <span style={{color:'#7A8FA6'}}>{fmtWhen(h.created_at)}</span> · {statusLabel(h.from_status)} → <b style={{color:h.to_status==='approved'?GREEN:'#F4F6F8'}}>{statusLabel(h.to_status)}</b>{h.by_name?` · ${h.by_name}`:''}{h.note?<span style={{color:'#7A8FA6'}}> · “{h.note}”</span>:''}
            </div>)}
        </div>
      </div>
    </div>
  )
}

// ── The audit panel: gaps in the planned work, and every change ──
export function ReadinessAudit({rows,onClose,onOpen}:{rows:{kind:Kind,x:any,where:string,team?:string|null}[],onClose:()=>void,onOpen?:(kind:Kind,x:any)=>void}){
  const [tab,setTab]=useState<'gaps'|'log'>('gaps')
  const [log,setLog]=useState<any[]|null>(null)
  useEffect(()=>{if(tab==='log'&&log===null)supabase.from('readiness_log').select('*').order('created_at',{ascending:false}).limit(300).then(({data})=>setLog(data||[]))},[tab,log])
  const gaps=rows.filter(r=>!isReady(r.x.prd_status)||!isReady(r.x.design_status))
  const ready=rows.length-gaps.length
  const KL:any={project:['◈ INITIATIVE','#C8973A'],epic:['◆ EPIC','#E07B2A'],item:['▪ STORY','#5DADE2']}
  const kindL=(r:any)=>r.kind==='item'&&r.x.request_type==='Bug'?['🐞 BUG','#E74C3C']:KL[r.kind]
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(5,10,18,0.6)',zIndex:3000,display:'flex',justifyContent:'flex-end'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:620,maxWidth:'100vw',height:'100%',background:'#12202F',borderLeft:'1px solid #243447',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 18px',borderBottom:'1px solid #243447'}}>
          <div style={{display:'flex',alignItems:'center'}}><span style={{fontSize:16,fontWeight:800,color:'#F4F6F8',flex:1}}>✓ Readiness audit</span>
            <button onClick={onClose} style={{background:'none',border:'none',color:'#7A8FA6',fontSize:18,cursor:'pointer'}}>×</button></div>
          <div style={{fontSize:11.5,color:'#7A8FA6',marginTop:2}}>PRD and Design approvals for the work planned in view: {ready} of {rows.length} ready ({rows.length?Math.round(ready/rows.length*100):100}%).</div>
          <div style={{display:'flex',gap:4,marginTop:10}}>
            {([['gaps',`Gaps · ${gaps.length}`],['log','Activity log']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{background:tab===k?'#C8973A':'#1E3048',color:tab===k?'#0D1B2A':'#C8C8D4',border:'none',borderRadius:5,fontSize:11.5,fontWeight:700,padding:'4px 10px',cursor:'pointer'}}>{l}</button>))}
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'8px 18px 20px'}}>
          {tab==='gaps'?(gaps.length?gaps.map((r,i)=>{const[kl,kc]=kindL(r);return(
            <div key={i} onClick={()=>onOpen?.(r.kind,r.x)} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid #1C2C3F',cursor:onOpen?'pointer':'default'}}>
              <span style={{fontSize:9,fontWeight:800,color:kc,width:78,flexShrink:0}}>{kl}</span>
              <span style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{r.x.item_id?<span style={{color:'#7A8FA6',fontFamily:'monospace',fontSize:10.5}}>{r.x.item_id} </span>:null}{r.x.name}</div>
                <div style={{fontSize:10.5,color:'#7A8FA6'}}>{r.where}{r.team?` · ${r.team}`:''}</div>
              </span>
              <ReadinessPips kind={r.kind} x={r.x}/>
              <span style={{fontSize:10.5,color:'#E8B95A',width:120,textAlign:'right' as const}}>{[!isReady(r.x.prd_status)&&`PRD ${statusLabel(r.x.prd_status).toLowerCase()}`,!isReady(r.x.design_status)&&`Design ${statusLabel(r.x.design_status).toLowerCase()}`].filter(Boolean).join(' · ')}</span>
            </div>)}):<div style={{fontSize:12,color:'#27AE60',padding:'12px 0'}}>Everything planned in view has its PRD and Design approved (or not needed).</div>)
          :(log===null?<div style={{fontSize:12,color:'#7A8FA6',padding:12}}>Loading…</div>:!log.length?<div style={{fontSize:12,color:'#7A8FA6',padding:12,fontStyle:'italic'}}>No changes yet.</div>:
            log.map(h=>(
              <div key={h.id} style={{fontSize:11.5,color:'#C8C8D4',padding:'6px 0',borderBottom:'1px solid #1C2C3F'}}>
                <div><span style={{color:'#7A8FA6'}}>{fmtWhen(h.created_at)}</span> · <b style={{color:'#F4F6F8'}}>{h.gate==='prd'?'PRD':'Design'}</b> · {h.entity_name||h.entity_id} <span style={{color:'#5B6B7E'}}>({h.entity_type==='project'?'initiative':h.entity_type})</span></div>
                <div>{statusLabel(h.from_status)} → <b style={{color:h.to_status==='approved'?GREEN:'#F4F6F8'}}>{statusLabel(h.to_status)}</b>{h.by_name?<> · by <b>{h.by_name}</b></>:''}{h.note?<span style={{color:'#7A8FA6'}}> · “{h.note}”</span>:''}{h.link?<> · <a href={h.link} target="_blank" rel="noreferrer" style={{color:'#5DADE2'}}>link ↗</a></>:''}</div>
              </div>)))}
        </div>
      </div>
    </div>
  )
}
