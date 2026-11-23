'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// A Jira link on an initiative, epic, story or bug. Stored as jira_url (items also keep jira_key,
// which the CSV import fills). Paste a full Jira link, or just a key like RTL-123 once your Jira
// site is known (remembered from the first full link you paste).
// Shown as a small blue chip with the issue key: click it to open Jira, ✎ to change it.

export type JiraKind='project'|'epic'|'item'
const BLUE='#4C9AFF'
const tableOf=(k:JiraKind)=>k==='project'?'projects':k==='epic'?'epics':'items'
const KEY=/\b([A-Z][A-Z0-9_]+-\d+)\b/
const BASE_KEY='pg_jira_base'

const getBase=()=>{try{return localStorage.getItem(BASE_KEY)||''}catch{return ''}}
const setBase=(b:string)=>{try{localStorage.setItem(BASE_KEY,b)}catch{}}
const baseOf=(url:string)=>{try{const u=new URL(url);return u.origin}catch{return ''}}
export const jiraKeyOf=(x:any)=>{const m=String(x?.jira_url||'').match(KEY);return m?m[1]:(x?.jira_key?String(x.jira_key).toUpperCase():null)}
export const jiraHrefOf=(x:any)=>{
  if(x?.jira_url)return x.jira_url as string
  const k=x?.jira_key?String(x.jira_key).toUpperCase():null,b=getBase()
  return k&&b?`${b}/browse/${k}`:null
}
export const hasJira=(x:any)=>!!(x?.jira_url||x?.jira_key)

// Work out what to save from what was typed: a full link, or a key (needs the Jira site)
function resolve(input:string,base:string):{url:string|null,key:string|null,needsBase?:boolean}{
  const t=input.trim()
  if(!t)return{url:null,key:null}
  if(/^https?:\/\//i.test(t)){const m=t.match(KEY);return{url:t,key:m?m[1]:null}}
  const m=t.toUpperCase().match(KEY)
  if(m&&t.length<=m[1].length+2){
    const b=base.trim().replace(/\/+$/,'')
    if(!b)return{url:null,key:m[1],needsBase:true}
    return{url:`${/^https?:\/\//i.test(b)?b:'https://'+b}/browse/${m[1]}`,key:m[1]}
  }
  return{url:/^[\w.-]+\.[a-z]{2,}\//i.test(t)?'https://'+t:t,key:null}
}

export function JiraChip({kind,x,apply,size=11,add=false,compact=false}:{kind:JiraKind,x:any,apply?:(fields:any)=>void,size?:number,add?:boolean,compact?:boolean}){
  const [open,setOpen]=useState<DOMRect|null>(null)
  const key=jiraKeyOf(x),href=jiraHrefOf(x),set=hasJira(x)
  if(!set&&!(add&&apply))return null
  const pop=open&&apply&&typeof document!=='undefined'&&createPortal(<JiraPopover kind={kind} x={x} rect={open} apply={apply} onClose={()=>setOpen(null)}/>,document.body)
  const edit=(e:any)=>{e.preventDefault();e.stopPropagation();setOpen((e.currentTarget as HTMLElement).getBoundingClientRect())}
  // Compact: just the ◆ mark (the key is in its tooltip); for tight rows
  if(compact&&set)return(
    <span onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{display:'inline-flex',flexShrink:0}}>
      {href?<a href={href} target="_blank" rel="noreferrer" title={`${key||'Jira'}: open in Jira\n${href}`} style={{color:BLUE,fontSize:size,fontWeight:800,textDecoration:'none',border:`1px solid ${BLUE}66`,background:`${BLUE}1A`,borderRadius:4,padding:'0 4px',lineHeight:1.3}}>◆</a>
        :<span title={key||'Jira'} style={{color:BLUE,fontSize:size,fontWeight:800,border:`1px solid ${BLUE}66`,borderRadius:4,padding:'0 4px',lineHeight:1.3}}>◆</span>}
    </span>)
  if(!set)return(
    <span onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{display:'inline-flex',flexShrink:0}}>
      <button onClick={edit} title="Link this to Jira" style={{background:'none',border:`1px dashed ${BLUE}66`,borderRadius:4,color:BLUE,fontSize:size,fontWeight:700,padding:'1px 6px',cursor:'pointer',lineHeight:1.3}}>＋ Jira</button>
      {pop}
    </span>)
  return(
    <span onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}
      style={{display:'inline-flex',alignItems:'center',flexShrink:0,border:`1px solid ${BLUE}66`,background:`${BLUE}1A`,borderRadius:4,fontSize:size,lineHeight:1.3,whiteSpace:'nowrap' as const}}>
      {href
        ?<a href={href} target="_blank" rel="noreferrer" title={`Open in Jira\n${href}`} style={{color:BLUE,fontWeight:700,textDecoration:'none',padding:'1px 5px'}}>◆ {key||'Jira'} ↗</a>
        :<span onClick={apply?edit:undefined} title="Add your Jira site to open this" style={{color:BLUE,fontWeight:700,padding:'1px 5px',cursor:apply?'pointer':'default'}}>◆ {key||'Jira'}</span>}
      {apply&&<button onClick={edit} title="Change the Jira link" style={{background:'none',border:'none',borderLeft:`1px solid ${BLUE}44`,color:BLUE,fontSize:size-1,padding:'1px 4px',cursor:'pointer',opacity:0.8}}>✎</button>}
      {pop}
    </span>)
}

function JiraPopover({kind,x,rect,apply,onClose}:{kind:JiraKind,x:any,rect:DOMRect,apply:(f:any)=>void,onClose:()=>void}){
  const [val,setVal]=useState<string>(x.jira_url||(x.jira_key?String(x.jira_key).toUpperCase():''))
  const [base,setBaseVal]=useState<string>(getBase())
  const [busy,setBusy]=useState(false)
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose])
  const r=resolve(val,base)
  async function save(clear=false){
    const res=clear?{url:null,key:null}:r
    if(res.needsBase)return
    const f:any={jira_url:res.url}
    if(kind==='item')f.jira_key=res.key
    const prev:any={jira_url:x.jira_url??null};if(kind==='item')prev.jira_key=x.jira_key??null
    setBusy(true);apply(f)
    if(res.url){const b=baseOf(res.url);if(b&&res.key)setBase(b)}
    const{error}=await supabase.from(tableOf(kind)).update(f).eq('id',x.id)
    setBusy(false)
    if(error){apply(prev);alert('Failed to save the Jira link: '+error.message);return}
    onClose()
  }
  const W=300,left=Math.min(Math.max(8,rect.left-W/2),window.innerWidth-W-8),below=rect.bottom+6+200<window.innerHeight
  const inp={width:'100%',boxSizing:'border-box' as const,background:'#0F1C2B',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,fontSize:12,padding:'6px 8px'}
  return(
    <div onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:4000}}>
      <div onClick={onClose} style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',left,top:below?rect.bottom+6:undefined,bottom:below?undefined:window.innerHeight-rect.top+6,width:W,background:'#162436',border:'1px solid #3A4A5E',borderRadius:10,padding:12,boxShadow:'0 12px 30px rgba(0,0,0,0.5)'}}>
        <div style={{fontSize:12.5,fontWeight:800,color:'#F4F6F8',marginBottom:2}}>◆ Jira link</div>
        <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{x.item_id?`${x.item_id} · `:''}{x.name}</div>
        <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')save()}}
          placeholder="Paste the Jira link, or a key like RTL-123" style={{...inp,marginBottom:6}}/>
        {r.needsBase&&<>
          <div style={{fontSize:10.5,color:'#E8B95A',marginBottom:4}}>Which Jira site? (asked once, then keys are enough)</div>
          <input value={base} onChange={e=>setBaseVal(e.target.value)} onBlur={()=>{const b=base.trim().replace(/\/+$/,'');if(b)setBase(/^https?:\/\//i.test(b)?b:'https://'+b)}} onKeyDown={e=>{if(e.key==='Enter')save()}}
            placeholder="e.g. yourcompany.atlassian.net" style={{...inp,marginBottom:6,borderColor:'#E8B95A'}}/></>}
        {r.url&&<div style={{fontSize:10.5,color:'#7A8FA6',marginBottom:6,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}} title={r.url}>→ {r.url}</div>}
        <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
          {hasJira(x)&&<button onClick={()=>save(true)} disabled={busy} style={{marginRight:'auto',background:'none',border:'none',color:'#E74C3C',fontSize:11,cursor:'pointer',padding:0}}>Remove link</button>}
          <button onClick={onClose} style={{background:'none',border:'1px solid #243447',borderRadius:5,color:'#7A8FA6',fontSize:11.5,padding:'4px 10px',cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>save()} disabled={busy||!val.trim()||!!r.needsBase&&!base.trim()} style={{background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:11.5,fontWeight:800,padding:'4px 12px',cursor:'pointer',opacity:busy||!val.trim()?0.5:1}}>Save</button>
        </div>
      </div>
    </div>
  )
}
