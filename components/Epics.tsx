'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Epics group a project's granular items (stories, bugs) into mid-level chunks of work.
// Progress rolls up from the items: an epic is as done as its items are.
const ITEM_TERMINAL=['Done','Will Not Implement',"Won't Do"]

export function EpicsSection({project,items,setItems,epics,setEpics}:any){
  const projectEpics=(epics as any[]).filter(e=>e.project_id===project.id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0))
  const projectItems=(items as any[]).filter(i=>i.parent_project===project.name)
  const unassigned=projectItems.filter(i=>!i.epic_id||!projectEpics.some(e=>e.id===i.epic_id))
  const [open,setOpen]=useState<any>({})
  const [newName,setNewName]=useState('')
  const [editId,setEditId]=useState<any>(null)
  const [editName,setEditName]=useState('')

  async function addEpic(){
    const name=newName.trim()
    if(!name)return
    const{data,error}=await supabase.from('epics').insert({project_id:project.id,name,sort_order:projectEpics.length,space:project.space||'work'}).select().single()
    if(error){alert('Failed to add epic: '+error.message);return}
    if(data){setEpics((prev:any[])=>[...prev,data]);setNewName('');setOpen((o:any)=>({...o,[data.id]:true}))}
  }
  async function renameEpic(){
    const name=editName.trim()
    if(!editId||!name)return
    setEpics((prev:any[])=>prev.map(e=>e.id===editId?{...e,name}:e))
    setEditId(null)
    const{error}=await supabase.from('epics').update({name}).eq('id',editId)
    if(error)alert('Failed to rename epic: '+error.message)
  }
  async function deleteEpic(epic:any){
    const n=projectItems.filter(i=>i.epic_id===epic.id).length
    if(!confirm(`Delete the epic "${epic.name}"?${n?`\n\nIts ${n} item${n!==1?'s':''} stay in the backlog, just without an epic.`:''}`))return
    setEpics((prev:any[])=>prev.filter(e=>e.id!==epic.id))
    setItems((prev:any[])=>prev.map(i=>i.epic_id===epic.id?{...i,epic_id:null}:i))
    const{error}=await supabase.from('epics').delete().eq('id',epic.id)
    if(error)alert('Failed to delete epic: '+error.message)
  }
  async function setItemEpic(itemId:any,epicId:any){
    setItems((prev:any[])=>prev.map(i=>i.id===itemId?{...i,epic_id:epicId}:i))
    const{error}=await supabase.from('items').update({epic_id:epicId}).eq('id',itemId)
    if(error)alert('Failed to update item: '+error.message)
  }

  return(
    <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:'#E07B2A',letterSpacing:1}}>◆ EPICS ({projectEpics.length})</span>
        {projectItems.length>0&&<span style={{fontSize:10,color:'#7A8FA6'}}>{unassigned.length} of {projectItems.length} items not in an epic</span>}
      </div>
      {projectEpics.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',marginBottom:8}}>No epics yet. Add one to group related items.</div>}
      {projectEpics.map(epic=>{
        const its=projectItems.filter(i=>i.epic_id===epic.id)
        const done=its.filter(i=>ITEM_TERMINAL.includes(i.status)).length
        const pct=its.length?Math.round(done/its.length*100):0
        const exp=!!open[epic.id]
        return(
          <div key={epic.id} style={{background:'#162436',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',marginBottom:6}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <span onClick={()=>setOpen((o:any)=>({...o,[epic.id]:!exp}))} style={{fontSize:9,color:'#7A8FA6',cursor:'pointer'}}>{exp?'▾':'▸'}</span>
              {editId===epic.id?(
                <input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onBlur={renameEpic} onKeyDown={e=>{if(e.key==='Enter')renameEpic();if(e.key==='Escape')setEditId(null)}}
                  style={{flex:1,background:'#0F1C2B',border:'1px solid #E07B2A',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'2px 6px'}}/>
              ):(
                <span onClick={()=>setOpen((o:any)=>({...o,[epic.id]:!exp}))} style={{flex:1,fontSize:11,fontWeight:700,color:'#F4F6F8',cursor:'pointer',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{epic.name}</span>
              )}
              <span style={{fontSize:10,color:'#7A8FA6',flexShrink:0}}>{done}/{its.length}</span>
              <button onClick={()=>{setEditId(epic.id);setEditName(epic.name)}} title="Rename" style={{background:'none',border:'none',color:'#7A8FA6',fontSize:11,cursor:'pointer',padding:0}}>✎</button>
              <button onClick={()=>deleteEpic(epic)} title="Delete epic" style={{background:'none',border:'none',color:'#3A4A5E',fontSize:11,cursor:'pointer',padding:0}}>✕</button>
            </div>
            <div style={{height:3,background:'#243447',borderRadius:2,marginTop:6,overflow:'hidden'}}>
              <div style={{width:pct+'%',height:'100%',background:pct===100?'#27AE60':'#E07B2A'}}/>
            </div>
            {exp&&(
              <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:3}}>
                {its.length===0&&<div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic'}}>No items in this epic yet</div>}
                {its.map(it=>(
                  <div key={it.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:10}}>
                    <span style={{fontFamily:'monospace',color:'#7A8FA6'}}>{it.item_id}</span>
                    <span style={{flex:1,color:ITEM_TERMINAL.includes(it.status)?'#7A8FA6':'#C8C8D4',textDecoration:ITEM_TERMINAL.includes(it.status)?'line-through':'none',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{it.name}</span>
                    <span style={{fontSize:9,color:'#7A8FA6',flexShrink:0}}>{it.status}</span>
                    <button onClick={()=>setItemEpic(it.id,null)} title="Remove from epic" style={{background:'none',border:'none',color:'#3A4A5E',fontSize:10,cursor:'pointer',padding:0}}>✕</button>
                  </div>
                ))}
                {unassigned.length>0&&(
                  <select value="" onChange={e=>{if(e.target.value)setItemEpic(e.target.value,epic.id)}}
                    style={{marginTop:3,background:'#0F1C2B',border:'1px dashed #3A4A5E',borderRadius:4,color:'#7A8FA6',fontSize:10,padding:'3px 4px',cursor:'pointer'}}>
                    <option value="">+ Add an item to this epic…</option>
                    {unassigned.map(it=><option key={it.id} value={it.id}>{it.item_id} · {it.name}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div style={{display:'flex',gap:6,marginTop:4}}>
        <input placeholder="New epic..." value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addEpic()}}
          style={{flex:1,background:'#0F1C2B',border:'1px solid #243447',borderRadius:6,color:'#F4F6F8',fontSize:11,padding:'5px 8px'}}/>
        <button onClick={addEpic} disabled={!newName.trim()} style={{background:'#E07B2A',border:'none',borderRadius:6,color:'#0D1B2A',fontSize:11,fontWeight:700,padding:'5px 12px',cursor:'pointer',opacity:!newName.trim()?0.5:1}}>+ Add</button>
      </div>
    </div>
  )
}
