'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// Free-form tags (e.g. "Japan") on stories, bugs and epics. Create them as you type in the
// picker; filter the Backlog by them. Stored as a list of names on each record (items.tags,
// epics.tags), with name and colour in the tags table. Renaming or deleting a tag updates every
// record that has it (database functions rename_tag / delete_tag).

export type Tag={id?:string,name:string,color:string}
export const TAG_COLORS=['#5DADE2','#E8B95A','#9B59B6','#1ABC9C','#E07B2A','#E74C3C','#27AE60','#C8973A','#EC7EBD','#7A8FA6']

let tags:Tag[]=[],loaded=false,loading=false
const subs=new Set<()=>void>()
const publish=(next:Tag[])=>{tags=[...next].sort((a,b)=>a.name.localeCompare(b.name));subs.forEach(f=>f())}
function load(){
  if(loading)return;loading=true
  supabase.from('tags').select('*').then(({data})=>{loading=false;loaded=true;publish((data||[]) as Tag[])})
}
export function useTags():Tag[]{
  return useSyncExternalStore(cb=>{subs.add(cb);if(!loaded)load();return()=>{subs.delete(cb)}},()=>tags,()=>tags)
}
export const tagColor=(name:string)=>tags.find(t=>t.name===name)?.color||'#7A8FA6'

export async function createTag(name:string):Promise<Tag|null>{
  const n=name.trim();if(!n)return null
  const have=tags.find(t=>t.name.toLowerCase()===n.toLowerCase());if(have)return have
  const color=TAG_COLORS[tags.length%TAG_COLORS.length]
  const{data,error}=await supabase.from('tags').insert({name:n,color}).select().single()
  if(error){alert('Failed to create the tag: '+error.message);return null}
  publish([...tags,data as Tag]);return data as Tag
}
export async function recolorTag(t:Tag){
  const color=TAG_COLORS[(TAG_COLORS.indexOf(t.color)+1)%TAG_COLORS.length]
  publish(tags.map(x=>x.name===t.name?{...x,color}:x))
  await supabase.from('tags').update({color}).eq('name',t.name)
}
// Rename or delete everywhere; onRecords lets the caller update its own records in memory
export async function renameTag(t:Tag,to:string,onRecords?:(from:string,to:string)=>void){
  const n=to.trim();if(!n||n===t.name)return
  if(tags.some(x=>x.name.toLowerCase()===n.toLowerCase()&&x.name!==t.name)){alert(`There's already a tag called "${n}".`);return}
  const{error}=await supabase.rpc('rename_tag',{old_name:t.name,new_name:n})
  if(error){alert('Failed to rename the tag: '+error.message);return}
  publish(tags.map(x=>x.name===t.name?{...x,name:n}:x));onRecords?.(t.name,n)
}
export async function deleteTag(t:Tag,uses:number,onRecords?:(name:string)=>void){
  if(!confirm(`Delete the tag "${t.name}"?${uses?`\n\nIt comes off the ${uses} stor${uses===1?'y':'ies'} and epics that have it.`:''}`))return
  const{error}=await supabase.rpc('delete_tag',{tag_name:t.name})
  if(error){alert('Failed to delete the tag: '+error.message);return}
  publish(tags.filter(x=>x.name!==t.name));onRecords?.(t.name)
}

// Small coloured chips
export function TagChips({names,size=10,max=3}:{names:string[],size?:number,max?:number}){
  useTags()
  if(!names?.length)return null
  const shown=names.slice(0,max)
  return(
    <span style={{display:'inline-flex',gap:3,flexWrap:'wrap' as const,alignItems:'center',minWidth:0}}>
      {shown.map(n=>{const c=tagColor(n);return(
        <span key={n} title={`Tag: ${n}`} style={{fontSize:size,fontWeight:700,color:c,background:`${c}22`,border:`1px solid ${c}66`,borderRadius:8,padding:'0 6px',whiteSpace:'nowrap' as const,lineHeight:1.5}}># {n}</span>)})}
      {names.length>max&&<span title={names.slice(max).join(', ')} style={{fontSize:size,color:'#7A8FA6'}}>+{names.length-max}</span>}
    </span>)
}

// Chips you click to edit: a popover to tick tags, type to create one, and manage the list
export function TagEditor({value,onChange,size=10,max=3,placeholder='+ Tag',uses,onRenamed,onDeleted}:{value:string[],onChange:(next:string[])=>void,size?:number,max?:number,placeholder?:string,
  uses?:(name:string)=>number,onRenamed?:(from:string,to:string)=>void,onDeleted?:(name:string)=>void}){
  const [open,setOpen]=useState<DOMRect|null>(null)
  const names=value||[]
  return(
    <span onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} style={{display:'inline-flex',minWidth:0}}>
      <span onClick={e=>setOpen((e.currentTarget as HTMLElement).getBoundingClientRect())} title="Click to add or change tags" style={{cursor:'pointer',display:'inline-flex',minWidth:0}}>
        {names.length?<TagChips names={names} size={size} max={max}/>
          :<span style={{fontSize:size,color:'#5B6B7E',border:'1px dashed #3A4A5E',borderRadius:8,padding:'0 6px',whiteSpace:'nowrap' as const,lineHeight:1.5}}>{placeholder}</span>}
      </span>
      {open&&typeof document!=='undefined'&&createPortal(<TagPopover rect={open} value={names} onChange={onChange} onClose={()=>setOpen(null)} uses={uses} onRenamed={onRenamed} onDeleted={onDeleted}/>,document.body)}
    </span>)
}

function TagPopover({rect,value,onChange,onClose,uses,onRenamed,onDeleted}:{rect:DOMRect,value:string[],onChange:(n:string[])=>void,onClose:()=>void,
  uses?:(n:string)=>number,onRenamed?:(f:string,t:string)=>void,onDeleted?:(n:string)=>void}){
  const list=useTags()
  const [q,setQ]=useState('')
  const [manage,setManage]=useState(false)
  const [sel,setSel]=useState<string[]>(value)
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose])
  const toggle=(n:string)=>{const next=sel.includes(n)?sel.filter(x=>x!==n):[...sel,n];setSel(next);onChange(next)}
  const match=list.filter(t=>t.name.toLowerCase().includes(q.trim().toLowerCase()))
  const exact=list.some(t=>t.name.toLowerCase()===q.trim().toLowerCase())
  async function create(){const t=await createTag(q);if(t){if(!sel.includes(t.name))toggle(t.name);setQ('')}}
  const W=260,left=Math.min(Math.max(8,rect.left),window.innerWidth-W-8),below=rect.bottom+6+300<window.innerHeight
  const inp={width:'100%',boxSizing:'border-box' as const,background:'#0F1C2B',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,fontSize:12,padding:'5px 8px'}
  return(
    <div onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{position:'fixed',inset:0,zIndex:4000}}>
      <div onClick={onClose} style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',left,top:below?rect.bottom+6:undefined,bottom:below?undefined:window.innerHeight-rect.top+6,width:W,background:'#162436',border:'1px solid #3A4A5E',borderRadius:10,padding:10,boxShadow:'0 12px 30px rgba(0,0,0,0.5)'}}>
        <div style={{display:'flex',alignItems:'center',marginBottom:6}}>
          <div style={{fontSize:12,fontWeight:800,color:'#F4F6F8',flex:1}}># Tags</div>
          <button onClick={()=>setManage(m=>!m)} style={{background:'none',border:'none',color:'#5DADE2',fontSize:11,cursor:'pointer',padding:0}}>{manage?'Done':'✎ Manage'}</button>
        </div>
        {!manage&&<input autoFocus value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){if(q.trim()&&!exact)create();else if(match.length===1)toggle(match[0].name)}}}
          placeholder="Search or create a tag…" style={{...inp,marginBottom:6}}/>}
        <div style={{maxHeight:200,overflowY:'auto',display:'flex',flexDirection:'column' as const,gap:2}}>
          {(manage?list:match).map(t=>manage?(
            <div key={t.name} style={{display:'flex',alignItems:'center',gap:5}}>
              <button onClick={()=>recolorTag(t)} title="Change colour" style={{width:14,height:14,borderRadius:'50%',background:t.color,border:'none',cursor:'pointer',flexShrink:0}}/>
              <input defaultValue={t.name} onBlur={e=>{if(e.target.value.trim()!==t.name)renameTag(t,e.target.value,onRenamed)}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}} style={{...inp,padding:'3px 6px',flex:1}}/>
              {uses&&<span style={{fontSize:10,color:'#7A8FA6',flexShrink:0}}>{uses(t.name)}</span>}
              <button onClick={()=>deleteTag(t,uses?uses(t.name):0,onDeleted)} title="Delete this tag everywhere" style={{background:'none',border:'none',color:'#E74C3C',cursor:'pointer',fontSize:11,padding:0}}>🗑</button>
            </div>
          ):(
            <label key={t.name} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:'#F4F6F8',cursor:'pointer',padding:'3px 4px',borderRadius:5,background:sel.includes(t.name)?'#1E3048':'transparent'}}>
              <input type="checkbox" checked={sel.includes(t.name)} onChange={()=>toggle(t.name)} style={{accentColor:t.color}}/>
              <span style={{width:8,height:8,borderRadius:'50%',background:t.color,flexShrink:0}}/>{t.name}
              {uses&&<span style={{marginLeft:'auto',fontSize:10,color:'#7A8FA6'}}>{uses(t.name)}</span>}
            </label>))}
          {!manage&&!list.length&&!q&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',padding:4}}>No tags yet. Type one to create it.</div>}
        </div>
        {!manage&&q.trim()&&!exact&&<button onClick={create} style={{marginTop:6,width:'100%',background:'#C8973A',border:'none',borderRadius:5,color:'#0D1B2A',fontSize:11.5,fontWeight:800,padding:'5px 0',cursor:'pointer'}}>+ Create “{q.trim()}”</button>}
      </div>
    </div>)
}
