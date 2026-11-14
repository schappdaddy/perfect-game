'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Milestone types, kept in the milestone_types table so new ones can be added from any
// type picker ("+ New type…"). Loaded once and shared by every picker on the page.

const DEFAULTS=[{name:'Milestone',color:'#B07CE0'},{name:'Go-Live',color:'#27AE60'},{name:'Deadline',color:'#E74C3C'},{name:'Review',color:'#5DADE2'},
  {name:'Release',color:'#C8973A'},{name:'Code Freeze',color:'#8FA6BC'},{name:'UAT',color:'#E07B2A'},{name:'Kickoff',color:'#1ABC9C'}]
const PALETTE=['#9B59B6','#2E86AB','#D35400','#16A085','#C0392B','#7F8C8D','#F1C40F','#8E44AD','#2ECC71','#E67E22']
let cache:any[]|null=null
let loading=false
const subs=new Set<()=>void>()
const notify=()=>subs.forEach(f=>f())
async function load(){
  if(loading)return
  loading=true
  const{data}=await supabase.from('milestone_types').select('*').order('sort_order',{ascending:true})
  cache=data&&data.length?data:DEFAULTS
  loading=false
  notify()
}
export function useMilestoneTypes():any[]{
  const [,force]=useState(0)
  useEffect(()=>{const f=()=>force(n=>n+1);subs.add(f);if(cache===null)load();return()=>{subs.delete(f)}},[])
  return cache||DEFAULTS
}
// A type's entry, matched without regard to case (older milestones were saved as 'milestone')
export const findType=(types:any[],name:any)=>types.find(t=>t.name.toLowerCase()===String(name||'Milestone').toLowerCase())
export const typeColor=(types:any[],name:any)=>findType(types,name)?.color||'#B07CE0'
export const typeName=(types:any[],name:any)=>findType(types,name)?.name||name||'Milestone'

export async function addMilestoneType(name:string):Promise<string|null>{
  const n=name.trim()
  if(!n)return null
  const types=cache||DEFAULTS
  const ex=findType(types,n);if(ex)return ex.name
  const row={name:n,color:PALETTE[types.length%PALETTE.length],sort_order:types.length}
  const{data,error}=await supabase.from('milestone_types').insert(row).select().single()
  if(error){alert('Failed to add the milestone type: '+error.message);return null}
  cache=[...types,data||row];notify()
  return n
}

// A type picker with "+ New type…" at the end
export function MilestoneTypeSelect({value,onChange,style}:{value:any,onChange:(v:string)=>void,style?:any}){
  const types=useMilestoneTypes()
  const cur=typeName(types,value)
  return(
    <select value={cur} style={style} onClick={e=>e.stopPropagation()} onChange={async e=>{
      if(e.target.value!=='__new'){onChange(e.target.value);return}
      const n=prompt('Name of the new milestone type')
      const added=n?await addMilestoneType(n):null
      if(added)onChange(added)
    }}>
      {!findType(types,cur)&&<option value={cur}>{cur}</option>}
      {types.map((t:any)=><option key={t.name} value={t.name}>{t.name}</option>)}
      <option value="__new">+ New type…</option>
    </select>
  )
}
