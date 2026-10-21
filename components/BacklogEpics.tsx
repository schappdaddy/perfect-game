'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Epics in the Backlog: an epic row that sits in the same table as stories (styled apart),
// the epic side panel, and converting a story into an epic or an epic back into a story.

const ITEM_TERMINAL=['Done','Will Not Implement',"Won't Do"]
const EPIC='#E07B2A'
const PRIORITY_BG:any={P1:'#C00000',P2:'#D4820A',P3:'#2E86AB'}
const STATUS_CLR:any={'New':'#5DADE2','In Progress':'#27AE60','Blocked':'#E74C3C','Done':'#16A085','Testing':'#C8973A','Ready':'#8E44AD','To Do':'#5DADE2','Waiting':'#E8B95A'}
const TD={padding:'8px 12px',borderBottom:'1px solid #243447',fontSize:12,verticalAlign:'middle' as const}
const LABEL={fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}
const INPUT={width:'100%',boxSizing:'border-box' as const,background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13}

export const epicProject=(epic:any,projects:any[])=>epic?.project_id?projects.find((p:any)=>p.id===epic.project_id)||null:null
export function epicWorkType(epic:any,projects:any[]){
  if(epic.work_type==='new'||epic.work_type==='sustain')return epic.work_type
  const pr=epicProject(epic,projects)
  return pr&&(pr.work_type==='sustain'||pr.planning_state==='bau')?'sustain':'new'
}
// Stories that belong to an epic: same project as the epic (an epic with no project takes any)
export function epicStories(epic:any,items:any[],projects:any[]){
  const pr=epicProject(epic,projects)
  return items.filter((i:any)=>i.epic_id===epic.id&&(!pr||i.parent_project===pr.name))
}

// One table row for an epic. Cells line up with the Backlog columns:
// drag · ID · Item Name · Project · Epic · Work · Priority · Rank · Swimlane · Status · Team · Effort ·
// Request Type · (Region … Owner: 9) · Start · End · ⚠ · 🚩 · custom columns
export function EpicRow({epic,projects,items,isSel,onSelect,ccCount=0}:any){
  const pr=epicProject(epic,projects)
  const its=epicStories(epic,items,projects)
  const done=its.filter((i:any)=>ITEM_TERMINAL.includes(i.status)).length
  const pct=its.length?Math.round(done/its.length*100):0
  const wt=epicWorkType(epic,projects)
  const dim={...TD,fontSize:11,color:'#3A4A5E'}
  return(
    <tr onClick={onSelect} style={{background:isSel?'#2A2418':'rgba(224,123,42,0.07)',cursor:'pointer',borderLeft:`3px solid ${EPIC}`}}>
      <td style={{...TD,textAlign:'center' as const,color:EPIC}}>◆</td>
      <td style={{...TD,fontSize:9,fontWeight:800,color:EPIC,letterSpacing:1}}>EPIC</td>
      <td style={{...TD,minWidth:240}}>
        <div style={{fontSize:12.5,fontWeight:800,color:'#F4F6F8'}}>{epic.name}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
          <div style={{width:90,height:4,borderRadius:2,background:'#243447',overflow:'hidden'}}><div style={{width:pct+'%',height:'100%',background:pct===100?'#27AE60':EPIC}}/></div>
          <span style={{fontSize:10,color:'#7A8FA6'}}>{done}/{its.length} stories done</span>
        </div>
      </td>
      <td style={{...TD,fontSize:11,color:pr?'#F4F6F8':'#7A8FA6',minWidth:110}}>{pr?.name||'—'}</td>
      <td style={dim}>—</td>
      <td style={TD}>{wt==='sustain'
        ?<span style={{fontSize:10,fontWeight:700,color:'#C8D4E0',background:'#4A5D72',borderRadius:4,padding:'2px 7px',whiteSpace:'nowrap' as const}}>⟳ Sustain</span>
        :<span style={{fontSize:10,fontWeight:700,color:'#C8973A',border:'1px solid rgba(200,151,58,0.5)',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap' as const}}>✦ New</span>}</td>
      <td style={TD}><span style={{background:PRIORITY_BG[epic.priority]||'#1E3048',color:PRIORITY_BG[epic.priority]?'#fff':'#7A8FA6',borderRadius:4,padding:'2px 8px',fontSize:10,fontWeight:700}}>{epic.priority||'P3'}</span></td>
      <td style={dim}/>
      <td style={dim}/>
      <td style={TD}><span style={{color:STATUS_CLR[epic.status]||'#7A8FA6',fontSize:11,fontWeight:600}}>{epic.status||'New'}</span></td>
      <td style={{...TD,fontSize:10,color:'#7A8FA6'}}>{epic.team==='Consumer Experience'?'CE':epic.team==='Operational Efficiency'?'OE':''}</td>
      <td style={{...TD,textAlign:'center' as const,fontSize:11}}>{epic.effort||''}</td>
      <td style={{...TD,fontSize:11,color:EPIC,fontWeight:700}}>Epic</td>
      <td colSpan={9} style={TD}/>
      <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{epic.start_date||'—'}</td>
      <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{epic.end_date||'—'}</td>
      <td style={TD}/><td style={TD}/>
      {ccCount>0&&<td colSpan={ccCount} style={TD}/>}
    </tr>
  )
}

// Story → epic: the story's fields carry over and the story row is removed (its assignments
// and CCR links go with it, so the confirm says so).
export async function convertStoryToEpic(item:any,{projects,setItems,setEpics,epics}:any){
  if(!confirm(`Turn "${item.name}" into an epic?\n\nIts name, description, priority, status, dates, effort and team carry over. The story ${item.item_id} is removed, along with any people assigned to it and CCR links.`))return null
  const pr=projects.find((p:any)=>p.name===item.parent_project)
  const{data,error}=await supabase.from('epics').insert({
    name:item.name,description:item.description||null,project_id:pr?.id||null,
    priority:['P1','P2','P3','P4'].includes(item.priority)?item.priority:'P3',status:item.status||'New',
    start_date:item.start_date||null,end_date:item.end_date||null,effort:item.effort||null,team:item.team||null,
    work_type:item.work_type||null,space:item.space||'work',sort_order:epics.filter((e:any)=>e.project_id===(pr?.id||null)).length,
  }).select().single()
  if(error||!data){alert('Could not create the epic: '+(error?.message||'no row returned'));return null}
  const{error:delErr}=await supabase.from('items').delete().eq('id',item.id)
  if(delErr)alert('The epic was created, but removing the story failed: '+delErr.message+'\nDelete '+item.item_id+' by hand.')
  setEpics((prev:any[])=>[...prev,data])
  if(!delErr)setItems((prev:any[])=>prev.filter((i:any)=>i.id!==item.id))
  return data
}

// Epic → story: becomes a normal backlog item with a new RTL id; its stories stay in the
// backlog without an epic.
export async function convertEpicToStory(epic:any,{projects,items,setItems,setEpics,nextId}:any){
  const its=items.filter((i:any)=>i.epic_id===epic.id)
  if(!confirm(`Turn the epic "${epic.name}" into a story?${its.length?`\n\nIts ${its.length} stor${its.length!==1?'ies':'y'} stay in the backlog without an epic.`:''}`))return null
  const pr=epicProject(epic,projects)
  const{data,error}=await supabase.from('items').insert({
    item_id:nextId,name:epic.name,description:epic.description||null,parent_project:pr?.name||null,
    priority:epic.priority||'P3',status:epic.status||'New',start_date:epic.start_date||null,end_date:epic.end_date||null,
    effort:epic.effort||'M',team:epic.team||pr?.team||null,work_type:epic.work_type||null,request_type:'Enhancement',
    swimlane:'POS',region:'',vendor:'',flagged:false,sort_order:items.length,space:epic.space||'work',
  }).select().single()
  if(error||!data){alert('Could not create the story: '+(error?.message||'no row returned'));return null}
  if(its.length){
    const{error:e2}=await supabase.from('items').update({epic_id:null}).eq('epic_id',epic.id)
    if(e2)alert('Could not detach the epic\'s stories: '+e2.message)
  }
  const{error:delErr}=await supabase.from('epics').delete().eq('id',epic.id)
  if(delErr)alert('The story was created, but removing the epic failed: '+delErr.message)
  setItems((prev:any[])=>[...prev.map((i:any)=>i.epic_id===epic.id?{...i,epic_id:null}:i),data])
  if(!delErr)setEpics((prev:any[])=>prev.filter((e:any)=>e.id!==epic.id))
  return data
}

export function EpicPanel({epic,projects,items,setItems,setEpics,statusOpts,priorities,teams,efforts,onClose,onConvert,onDelete}:any){
  const pr=epicProject(epic,projects)
  const its=epicStories(epic,items,projects)
  const candidates=items.filter((i:any)=>i.epic_id!==epic.id&&!ITEM_TERMINAL.includes(i.status)&&(!pr||i.parent_project===pr.name))
    .sort((a:any,b:any)=>(a.item_id||'').localeCompare(b.item_id||''))
  const [name,setName]=useState(epic.name)
  const [desc,setDesc]=useState(epic.description||'')

  async function upd(fields:any){
    setEpics((prev:any[])=>prev.map((e:any)=>e.id===epic.id?{...e,...fields}:e))
    const{error}=await supabase.from('epics').update(fields).eq('id',epic.id)
    if(error)alert('Failed to save epic: '+error.message)
  }
  async function setProject(projectId:string){
    const next=projects.find((p:any)=>p.id===projectId)
    await upd({project_id:projectId||null})
    // Stories outside the epic's new project can't stay in it
    const leaving=next?items.filter((i:any)=>i.epic_id===epic.id&&i.parent_project!==next.name):[]
    if(leaving.length){
      const ids=leaving.map((i:any)=>i.id)
      setItems((prev:any[])=>prev.map((i:any)=>ids.includes(i.id)?{...i,epic_id:null}:i))
      const{error}=await supabase.from('items').update({epic_id:null}).in('id',ids)
      if(error)alert('Failed to update stories: '+error.message)
    }
  }
  async function setStoryEpic(itemId:any,epicId:any){
    setItems((prev:any[])=>prev.map((i:any)=>i.id===itemId?{...i,epic_id:epicId}:i))
    const{error}=await supabase.from('items').update({epic_id:epicId}).eq('id',itemId)
    if(error)alert('Failed to update story: '+error.message)
  }
  const sel=(field:string,opts:string[],blank?:string)=>(
    <select value={epic[field]||''} onChange={e=>upd({[field]:e.target.value||null})} style={{...INPUT,cursor:'pointer'}}>
      {blank!==undefined&&<option value="">{blank}</option>}
      {opts.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  )
  return(
    <div style={{width:320,borderLeft:'1px solid #243447',background:'#162436',overflowY:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
      <div style={{padding:'14px 16px',borderBottom:'1px solid #243447',borderTop:`3px solid ${EPIC}`,display:'flex',alignItems:'center',gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:EPIC,fontWeight:800,letterSpacing:1}}>◆ EPIC</div>
          <div style={{fontSize:13,fontWeight:700,color:'#F4F6F8',marginTop:2,lineHeight:1.3}}>{epic.name}</div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#7A8FA6'}}>×</button>
      </div>
      <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
        <div><div style={LABEL}>EPIC NAME</div>
          <input value={name} onChange={e=>setName(e.target.value)} onBlur={()=>name.trim()&&name!==epic.name&&upd({name:name.trim()})} style={INPUT}/></div>
        <div><div style={LABEL}>DESCRIPTION</div>
          <textarea value={desc} rows={3} onChange={e=>setDesc(e.target.value)} onBlur={()=>desc!==(epic.description||'')&&upd({description:desc||null})} style={{...INPUT,resize:'vertical' as const,fontFamily:'inherit'}}/></div>
        <div><div style={LABEL}>PROJECT</div>
          <select value={epic.project_id||''} onChange={e=>setProject(e.target.value)} style={{...INPUT,cursor:'pointer'}}>
            <option value="">No project yet</option>
            {[...projects].sort((a:any,b:any)=>a.name.localeCompare(b.name)).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div><div style={LABEL}>PRIORITY</div>{sel('priority',priorities)}</div>
          <div><div style={LABEL}>STATUS</div>{sel('status',statusOpts)}</div>
          <div><div style={LABEL}>TEAM</div>{sel('team',teams,'—')}</div>
          <div><div style={LABEL}>EFFORT</div>{sel('effort',efforts,'—')}</div>
        </div>
        <div><div style={LABEL}>WORK TYPE</div>
          <select value={epic.work_type||''} onChange={e=>upd({work_type:e.target.value||null})} style={{...INPUT,cursor:'pointer'}}>
            <option value="">Automatic: {epicWorkType({...epic,work_type:null},projects)==='sustain'?'Sustain':'New project'}{pr?' (from project)':''}</option>
            <option value="new">New project</option>
            <option value="sustain">Sustain (tech debt, stabilization & enhancements)</option>
          </select></div>
        <div><div style={LABEL}>DATES (SHOWN ON THE STRATEGY ROADMAP)</div>
          <div style={{display:'flex',gap:6}}>
            <input type="date" value={epic.start_date||''} onChange={e=>upd({start_date:e.target.value||null})} style={INPUT}/>
            <input type="date" value={epic.end_date||''} onChange={e=>upd({end_date:e.target.value||null})} style={INPUT}/>
          </div>
          {!epic.start_date&&<div style={{fontSize:10,color:'#7A8FA6',marginTop:4}}>No dates: the roadmap uses the span of its stories&apos; dates.</div>}
        </div>
        <div>
          <div style={LABEL}>STORIES ({its.length})</div>
          {its.length===0&&<div style={{fontSize:11,color:'#3A4A5E',fontStyle:'italic'}}>No stories yet</div>}
          {its.map((i:any)=>(
            <div key={i.id} style={{display:'flex',alignItems:'center',gap:6,fontSize:11,padding:'3px 0'}}>
              <span style={{fontFamily:'monospace',fontSize:10,color:'#7A8FA6'}}>{i.item_id}</span>
              <span style={{flex:1,color:ITEM_TERMINAL.includes(i.status)?'#7A8FA6':'#C8C8D4',textDecoration:ITEM_TERMINAL.includes(i.status)?'line-through':'none',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{i.name}</span>
              <button onClick={()=>setStoryEpic(i.id,null)} title="Remove from epic" style={{background:'none',border:'none',color:'#7A8FA6',cursor:'pointer',fontSize:11}}>✕</button>
            </div>
          ))}
          {candidates.length>0&&<select value="" onChange={e=>e.target.value&&setStoryEpic(e.target.value,epic.id)} style={{...INPUT,marginTop:6,fontSize:11,color:'#7A8FA6',borderStyle:'dashed'}}>
            <option value="">+ Add a story to this epic…</option>
            {candidates.map((i:any)=><option key={i.id} value={i.id}>{i.item_id} · {i.name}</option>)}
          </select>}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6,borderTop:'1px solid #243447',paddingTop:14}}>
          <button onClick={onConvert} style={{background:'none',border:'1px solid #3A4A5E',borderRadius:6,color:'#C8C8D4',fontSize:12,padding:'7px 0',cursor:'pointer'}}>↓ Convert to a story</button>
          <button onClick={onDelete} style={{background:'none',border:'1px solid #5C2B2B',borderRadius:6,color:'#E74C3C',fontSize:12,padding:'7px 0',cursor:'pointer'}}>Delete epic</button>
        </div>
      </div>
    </div>
  )
}
