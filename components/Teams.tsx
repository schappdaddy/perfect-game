'use client'
import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'

// Delivery teams (the `teams` table): name, short code, colour, and whether the team is
// active or proposed (planned to spin up, from a fiscal year). Managed in Strategy settings
// and used everywhere a team is picked, grouped, coloured or abbreviated.
// Records refer to a team by its name, so renaming a team renames it on every record.

export type Team={id?:string,name:string,short:string|null,color:string,status:'active'|'proposed',start_fy:number|null,notes:string|null,sort_order:number}
const DEFAULTS:Team[]=[
  {name:'Consumer Experience',short:'CX',color:'#D9E2EC',status:'active',start_fy:null,notes:null,sort_order:0},
  {name:'Operational Efficiency',short:'OE',color:'#6FA6CB',status:'active',start_fy:null,notes:null,sort_order:1},
]
export const TEAM_COLORS_PICK=['#D9E2EC','#6FA6CB','#E8B95A','#9B59B6','#1ABC9C','#E07B2A','#E74C3C','#27AE60','#5DADE2','#C8973A']

let teams:Team[]=DEFAULTS
// The team names in order. The same array is updated in place, so code that kept a reference
// to it (e.g. a TEAMS constant) always sees the current list.
export const TEAM_NAMES:string[]=DEFAULTS.map(t=>t.name)
let loaded=false,loading=false
const subs=new Set<()=>void>()
function publish(next:Team[]){
  teams=[...next].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name))
  TEAM_NAMES.splice(0,TEAM_NAMES.length,...teams.map(t=>t.name))
  subs.forEach(f=>f())
}
function load(){
  if(loading)return;loading=true
  supabase.from('teams').select('*').then(({data,error})=>{loading=false;loaded=true;if(!error&&data&&data.length)publish(data as Team[]);else subs.forEach(f=>f())})
}
export function useTeams():Team[]{
  return useSyncExternalStore(cb=>{subs.add(cb);if(!loaded)load();return()=>{subs.delete(cb)}},()=>teams,()=>teams)
}
export const teamsNow=()=>teams
export const teamOf=(name:any)=>teams.find(t=>t.name===name)||null
const initials=(n:string)=>n.split(/[\s-]+/).filter(Boolean).map(w=>w[0]).join('').slice(0,3).toUpperCase()
export const teamShort=(name:any):string=>{if(!name)return '';const t=teamOf(name);return t?.short||(name==='Retail Program'?'RP':initials(String(name)))}
export const teamColor=(name:any,fallback='#7A8FA6'):string=>teamOf(name)?.color||fallback
// Dark or light text on a team's colour
export const teamInk=(name:any)=>{const c=teamColor(name).replace('#','');const n=parseInt(c.length===3?c.split('').map(x=>x+x).join(''):c,16);const l=(0.299*((n>>16)&255)+0.587*((n>>8)&255)+0.114*(n&255))/255;return l>0.55?'#0D1B2A':'#F4F6F8'}
export const isProposedTeam=(name:any)=>teamOf(name)?.status==='proposed'

export async function addTeam(f:{name:string,short?:string,color?:string,status?:'active'|'proposed',start_fy?:number|null}){
  const name=f.name.trim();if(!name)return null
  if(teams.some(t=>t.name.toLowerCase()===name.toLowerCase())){alert(`There's already a team called "${name}".`);return null}
  const row={name,short:(f.short||initials(name)).trim()||null,color:f.color||TEAM_COLORS_PICK[teams.length%TEAM_COLORS_PICK.length],status:f.status||'proposed',start_fy:f.start_fy??null,sort_order:teams.length}
  const{data,error}=await supabase.from('teams').insert(row).select().single()
  if(error){alert('Failed to add the team: '+error.message);return null}
  publish([...teams,data as Team]);return data as Team
}
// Records that name a team (to rename them along with it, or to warn before deleting)
const TEAM_TABLES=['projects','items','epics','people','sprints','strategy_items']
export async function teamUsage(name:string){
  const counts=await Promise.all(TEAM_TABLES.map(tb=>supabase.from(tb).select('id',{count:'exact',head:true}).eq('team',name).then(r=>r.count||0)))
  return counts.reduce((a,b)=>a+b,0)
}
export async function updateTeam(t:Team,f:Partial<Team>,onRenamed?:(from:string,to:string)=>void){
  const next={...f}
  if(next.name!==undefined){
    next.name=next.name.trim()
    if(!next.name||next.name===t.name)delete next.name
    else if(teams.some(x=>x!==t&&x.name.toLowerCase()===next.name!.toLowerCase())){alert(`There's already a team called "${next.name}".`);return false}
  }
  if(!Object.keys(next).length)return true
  publish(teams.map(x=>x===t?{...x,...next}:x))
  const{error}=await supabase.from('teams').update(next).eq('id',t.id)
  if(error){publish(teams.map(x=>x.id===t.id?t:x));alert('Failed to save the team: '+error.message);return false}
  if(next.name){
    for(const tb of TEAM_TABLES){const{error:e}=await supabase.from(tb).update({team:next.name}).eq('team',t.name);if(e)alert(`Renamed the team, but updating ${tb} failed: ${e.message}`)}
    onRenamed?.(t.name,next.name)
  }
  return true
}
export async function deleteTeam(t:Team){
  const used=await teamUsage(t.name)
  if(used){alert(`"${t.name}" is still on ${used} record${used!==1?'s':''} (initiatives, stories, people or sprints). Move them to another team first.`);return false}
  if(!confirm(`Delete the team "${t.name}"?`))return false
  publish(teams.filter(x=>x!==t))
  const{error}=await supabase.from('teams').delete().eq('id',t.id)
  if(error){alert('Failed to delete the team: '+error.message);load();return false}
  return true
}
export async function moveTeam(t:Team,d:number){
  const i=teams.indexOf(t),j=i+d;if(i<0||j<0||j>=teams.length)return
  const next=[...teams];[next[i],next[j]]=[next[j],next[i]]
  const re=next.map((x,k)=>({...x,sort_order:k}));publish(re)
  await Promise.all(re.map(x=>supabase.from('teams').update({sort_order:x.sort_order}).eq('id',x.id)))
}
