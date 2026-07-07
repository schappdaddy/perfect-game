'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const T = {
  navy:'#0D1B2A',navyMid:'#162436',navyLt:'#1E3048',
  gold:'#C8973A',goldLt:'#E8B95A',white:'#F4F6F8',
  muted:'#7A8FA6',border:'#243447',
  p1:'#C00000',p1Bg:'#2D1515',p2:'#D4820A',p2Bg:'#2D1E0A',
  p3:'#2E86AB',green:'#27AE60',purple:'#8E44AD',
}

const PRIORITIES=['P1','P2','P3','P4','Backlog']
const STATUSES=['Accepted','Testing','Awaiting Vendor Deliverable','Need Requirements','Under Review','In Progress','Will Not Implement','Ready to Score','Triage']
const PROJECT_STATUSES=['Planning','In Progress','Testing','On Hold','Complete','Cancelled']
const TEAMS=['Consumer Experience','Operational Efficiency']
const EFFORTS=['S','M','L','XL']
const REQUEST_TYPES=['Bug','Tech Debt','Enhancement','Strategic Initiative','Business Request']
const SWIMLANES=['POS','Pricing','Tax','Loyalty','WFM','Inventory','Reporting','SafeSize','Product','Clienteling','Integrations']
const PRIORITY_ORDER={P1:0,P2:1,P3:2,P4:3,Backlog:4}
const RAG_COLORS={Green:'#27AE60',Amber:'#D4820A',Red:'#C0392B'}

function pc(p) {
  if(p==='P1') return {bg:'#C00000',text:'#fff'}
  if(p==='P2') return {bg:'#D4820A',text:'#fff'}
  if(p==='P3') return {bg:'#2E86AB',text:'#fff'}
  return {bg:'#1E3048',text:'#7A8FA6'}
}
function sc(s) {
  const m={'In Progress':'#27AE60','Testing':'#C8973A','Need Requirements':'#E74C3C','Under Review':'#E8B95A','Will Not Implement':'#7A8FA6','Ready to Score':'#8E44AD','Accepted':'#2E86AB'}
  return m[s]||'#7A8FA6'
}
function rice(item) {
  if(!item.reach||!item.impact||!item.confidence) return null
  const ew=item.effort==='S'?1:item.effort==='M'?2:item.effort==='L'?3:5
  return ((item.reach*item.impact*item.confidence)/ew).toFixed(2)
}

const sel={background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer'}
const TH={padding:'8px 12px',color:'#7A8FA6',fontSize:11,fontWeight:700,letterSpacing:1,textAlign:'left' as const,borderBottom:'1px solid #243447',whiteSpace:'nowrap' as const}
const TD={padding:'8px 12px',borderBottom:'1px solid #243447',fontSize:12,verticalAlign:'middle' as const}

// ── PROJECTS TAB ─────────────────────────────────────────────────────────
function ViolationRow({v,project,fmt,d}:{v:any,project:any,fmt:any,d:any}) {
  const [open,setOpen]=useState(false)
  const [editStart,setEditStart]=useState(v.start_date||'')
  const [editEnd,setEditEnd]=useState(v.end_date||'')
  const [saving,setSaving]=useState(false)
  const beforeStart=d(v.start_date)&&d(project.start_date)&&d(v.start_date)<d(project.start_date)
  const afterEnd=d(v.end_date)&&d(project.end_date)&&d(v.end_date)>d(project.end_date)
  const startOk=!d(editStart)||!d(project.start_date)||d(editStart)>=d(project.start_date)
  const endOk=!d(editEnd)||!d(project.end_date)||d(editEnd)<=d(project.end_date)
  async function saveItem(){
    setSaving(true)
    await supabase.from('items').update({start_date:editStart,end_date:editEnd}).eq('id',v.id)
    setSaving(false);setOpen(false)
  }
  return(
    <div style={{marginBottom:8,borderRadius:6,overflow:'hidden',border:'1px solid rgba(192,57,43,0.25)'}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',cursor:'pointer',background:open?'rgba(192,57,43,0.12)':'transparent',fontSize:11,flexWrap:'wrap' as const}}
        onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,57,43,0.1)')}
        onMouseLeave={e=>(e.currentTarget.style.background=open?'rgba(192,57,43,0.12)':'transparent')}>
        <span style={{color:'#7A8FA6',fontFamily:'monospace',flexShrink:0}}>{v.item_id}</span>
        <span style={{color:'#F4F6F8',fontWeight:600,flexShrink:0}}>{v.name}</span>
        <span style={{color:'#E74C3C',flex:1}}>
          {beforeStart&&`starts ${fmt(v.start_date)} — before project start`}
          {beforeStart&&afterEnd&&' · '}
          {afterEnd&&`ends ${fmt(v.end_date)} — after project end`}
        </span>
        <span style={{color:'#C8973A',fontSize:11,flexShrink:0,fontWeight:600}}>{open?'▲ Close':'✏️ Fix dates'}</span>
      </div>
      {open&&(
        <div style={{padding:'12px 10px',background:'rgba(0,0,0,0.25)',borderTop:'1px solid rgba(192,57,43,0.2)'}}>
          <div style={{fontSize:10,color:'#7A8FA6',marginBottom:10}}>
            Project window: <span style={{color:'#C8973A',fontWeight:700}}>{fmt(project.start_date)} → {fmt(project.end_date)}</span>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap' as const}}>
            <div>
              <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Start Date</div>
              <input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)}
                style={{background:'#1E3048',color:startOk?'#F4F6F8':'#E74C3C',border:`1px solid ${startOk?'#243447':'#E74C3C'}`,borderRadius:6,padding:'5px 8px',fontSize:12}}/>
            </div>
            <div>
              <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>End Date</div>
              <input type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)}
                style={{background:'#1E3048',color:endOk?'#F4F6F8':'#E74C3C',border:`1px solid ${endOk?'#243447':'#E74C3C'}`,borderRadius:6,padding:'5px 8px',fontSize:12}}/>
            </div>
            <button onClick={saveItem} disabled={saving}
              style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'6px 14px',fontWeight:700,cursor:'pointer',fontSize:12,opacity:saving?0.7:1}}>
              {saving?'Saving...':'Save'}
            </button>
            <button onClick={()=>setOpen(false)}
              style={{background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'6px 10px',fontSize:11,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
          <div style={{marginTop:8,fontSize:10}}>
            {!startOk&&<div style={{color:'#E74C3C'}}>⚠️ Start still before project start ({fmt(project.start_date)})</div>}
            {!endOk&&<div style={{color:'#E74C3C'}}>⚠️ End still after project end ({fmt(project.end_date)})</div>}
            {startOk&&endOk&&editStart&&editEnd&&<div style={{color:'#27AE60'}}>✓ Dates are within the project window</div>}
          </div>
        </div>
      )}
    </div>
  )
}
function ProjectDetail({project,items,setItems,projects,milestones,setMilestones,onClose,d,fmt}:any) {
  const [addingItem,setAddingItem]=useState(false)
  const [savingItem,setSavingItem]=useState(false)
  const [newItem,setNewItem]=useState({name:'',priority:'P3',swimlane:'POS',effort:'M',status:'Ready to Score',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  const [addingMilestone,setAddingMilestone]=useState(false)
  const [savingMilestone,setSavingMilestone]=useState(false)
  const [milestoneForm,setMilestoneForm]=useState({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const MILESTONE_TYPES=['Milestone','Go-Live','Deadline','Review','Release','Code Freeze','UAT','Kickoff']
  const swimlaneOpts=[...new Set([...SWIMLANES,...items.map(i=>i.swimlane).filter(Boolean)])]

  const projectItems=items.filter(i=>i.parent_project===project.name).sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    if(pa!==pb) return pa-pb
    if(a.start_date&&b.start_date) return new Date(a.start_date).getTime()-new Date(b.start_date).getTime()
    if(a.start_date) return -1
    if(b.start_date) return 1
    return 0
  })
  const withDates=projectItems.filter(i=>i.start_date&&i.end_date)
  const noDates=projectItems.filter(i=>!i.start_date||!i.end_date)
  const projectMilestones=milestones.filter(m=>m.project_id===project.id).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
  const ragColor=RAG_COLORS[project.rag]||'#27AE60'

  async function saveNewItem(){
    if(!newItem.name.trim()) return
    setSavingItem(true)
    const iid=`RTL-${String(Math.floor(Math.random()*900)+100)}`
    const{data,error}=await supabase.from('items').insert({
      item_id:iid,name:newItem.name,description:newItem.description,
      priority:newItem.priority,swimlane:newItem.swimlane,team:project.team,
      effort:newItem.effort,status:newItem.status,request_type:newItem.request_type,
      region:newItem.region,vendor:newItem.vendor,parent_project:project.name,
      flagged:false,sort_order:items.length,
    }).select().single()
    if(error){alert('Failed to add item: '+error.message);setSavingItem(false);return}
    if(data) setItems([...items,data])
    setSavingItem(false);setAddingItem(false)
    setNewItem({name:'',priority:'P3',swimlane:'POS',effort:'M',status:'Ready to Score',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  }
  async function saveMilestone(){
    if(!milestoneForm.name.trim()||!milestoneForm.date) return
    setSavingMilestone(true)
    const{data}=await supabase.from('milestones').insert({
      ...milestoneForm,project_id:project.id,
      sort_order:projectMilestones.length,
    }).select().single()
    if(data) setMilestones([...milestones,data])
    setSavingMilestone(false);setAddingMilestone(false)
    setMilestoneForm({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  }

  async function toggleMilestone(m){
    const v=!m.completed
    setMilestones(milestones.map(ms=>ms.id===m.id?{...ms,completed:v}:ms))
    await supabase.from('milestones').update({completed:v}).eq('id',m.id)
  }

  async function deleteMilestone(id){
    if(!confirm('Delete this milestone?')) return
    setMilestones(milestones.filter(m=>m.id!==id))
    await supabase.from('milestones').delete().eq('id',id)
  }

  return(
    <div style={{width:440,flexShrink:0,background:'#0D1B2A',display:'flex',flexDirection:'column',overflow:'hidden',borderLeft:'1px solid #243447'}}>

      {/* Header */}
      <div style={{padding:'14px 16px',borderBottom:'1px solid #243447',background:'#162436',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{width:12,height:12,borderRadius:2,background:project.color||'#2E86AB',flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{project.name}</div>
          <div style={{fontSize:11,color:'#7A8FA6',marginTop:1}}>{projectItems.length} items · {projectMilestones.length} milestones</div>
        </div>
        <span style={{color:ragColor,fontSize:14}}>{project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':'🔴'}</span>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#7A8FA6',padding:'0 4px'}}>×</button>
      </div>

      <div style={{flex:1,overflowY:'auto'}}>

        {/* Milestones */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:'#C8973A',letterSpacing:1}}>🏁 MILESTONES</div>
            <button onClick={()=>setAddingMilestone(a=>!a)}
              style={{background:addingMilestone?'#1E3048':'#C8973A',color:addingMilestone?'#C8973A':'#0D1B2A',border:addingMilestone?'1px solid #C8973A':'none',borderRadius:5,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              {addingMilestone?'Cancel':'+ Add'}
            </button>
          </div>

          {addingMilestone&&(
            <div style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Name *</div>
                  <input value={milestoneForm.name} onChange={e=>setMilestoneForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Go-Live"
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'6px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Date *</div>
                    <input type="date" value={milestoneForm.date} onChange={e=>setMilestoneForm(p=>({...p,date:e.target.value}))}
                      style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'6px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Type</div>
                    <select value={milestoneForm.type} onChange={e=>setMilestoneForm(p=>({...p,type:e.target.value}))}
                      style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'5px 6px',fontSize:12}}>
                      {MILESTONE_TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:5}}>Color</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                    {COLORS.map(c=><div key={c} onClick={()=>setMilestoneForm(p=>({...p,color:c}))} style={{width:22,height:22,borderRadius:4,background:c,cursor:'pointer',border:milestoneForm.color===c?'2px solid #F4F6F8':'2px solid transparent'}}/>)}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Notes</div>
                  <input value={milestoneForm.notes} onChange={e=>setMilestoneForm(p=>({...p,notes:e.target.value}))} placeholder="Optional..."
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'6px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
              </div>
              <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:10}}>
                <button onClick={()=>setAddingMilestone(false)} style={{...sel,fontSize:11,padding:'4px 10px'}}>Cancel</button>
                <button onClick={saveMilestone} disabled={savingMilestone||!milestoneForm.name.trim()||!milestoneForm.date}
                  style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:5,padding:'4px 14px',fontWeight:700,cursor:'pointer',fontSize:11,opacity:savingMilestone?0.7:1}}>
                  {savingMilestone?'Saving...':'Save'}
                </button>
              </div>
            </div>
          )}

          {projectMilestones.length===0&&!addingMilestone&&(
            <div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',textAlign:'center' as const,padding:'10px 0'}}>No milestones yet</div>
          )}

          {projectMilestones.map(m=>{
            const isPast=d(m.date)&&d(m.date)<new Date()
            const daysAway=d(m.date)?Math.round((d(m.date).getTime()-new Date().getTime())/(1000*60*60*24)):null
            return(
              <div key={m.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 10px',background:m.completed?'rgba(39,174,96,0.05)':'#162436',borderRadius:6,marginBottom:5,border:`1px solid ${m.completed?'rgba(39,174,96,0.2)':'#243447'}`,borderLeft:`3px solid ${m.color||'#C8973A'}`}}>
                <button onClick={()=>toggleMilestone(m)}
                  style={{width:16,height:16,borderRadius:3,border:`2px solid ${m.color||'#C8973A'}`,background:m.completed?m.color||'#C8973A':'transparent',cursor:'pointer',flexShrink:0,marginTop:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff'}}>
                  {m.completed&&'✓'}
                </button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:12,color:m.completed?'#7A8FA6':'#F4F6F8',fontWeight:600,textDecoration:m.completed?'line-through':'none'}}>{m.name}</span>
                    <span style={{background:'#1E3048',color:'#7A8FA6',borderRadius:3,padding:'1px 5px',fontSize:9}}>{m.type}</span>
                  </div>
                  <div style={{display:'flex',gap:8,marginTop:3,fontSize:10,alignItems:'center'}}>
                    <span style={{color:isPast&&!m.completed?'#E74C3C':'#7A8FA6',fontWeight:isPast&&!m.completed?700:400}}>{fmt(m.date)}</span>
                    {!m.completed&&daysAway!==null&&daysAway<14&&(
                      <span style={{color:daysAway<0?'#E74C3C':daysAway<7?'#D4820A':'#C8973A',fontWeight:700}}>
                        {daysAway<0?`${Math.abs(daysAway)}d overdue`:daysAway===0?'Today!':`${daysAway}d away`}
                      </span>
                    )}
                    {m.notes&&<span style={{color:'#7A8FA6',fontStyle:'italic',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:150}}>{m.notes}</span>}
                  </div>
                </div>
                <button onClick={()=>deleteMilestone(m.id)}
                  style={{background:'none',border:'none',cursor:'pointer',color:'#7A8FA6',fontSize:14,padding:'0 2px',flexShrink:0}}
                  onMouseEnter={e=>(e.currentTarget.style.color='#E74C3C')}
                  onMouseLeave={e=>(e.currentTarget.style.color='#7A8FA6')}>×</button>
              </div>
            )
          })}
        </div>

        {/* Committed items */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid #243447'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#2E86AB',letterSpacing:1,marginBottom:10}}>📅 COMMITTED ({withDates.length})</div>
          {withDates.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No items with dates assigned</div>}
          {withDates.map(item=>{
            const pclr=pc(item.priority)
            const daysLeft=item.end_date?Math.round((new Date(item.end_date+'T12:00:00').getTime()-new Date().getTime())/(1000*60*60*24)):null
            return(
              <div key={item.id} style={{background:'#162436',border:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexWrap:'wrap' as const}}>
                  <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                  <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                  <span style={{fontSize:11,color:'#F4F6F8',fontWeight:600,flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{item.name}</span>
                  {item.effort&&<span style={{fontSize:9,color:'#7A8FA6'}}>{item.effort}</span>}
                </div>
                <div style={{display:'flex',gap:10,fontSize:10,color:'#7A8FA6',alignItems:'center'}}>
                  <span>📅 {new Date(item.start_date+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric'})} → {new Date(item.end_date+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric',year:'2-digit'})}</span>
                  {daysLeft!==null&&<span style={{color:daysLeft<0?'#E74C3C':daysLeft<14?'#D4820A':'#7A8FA6',fontWeight:daysLeft<14?700:400}}>{daysLeft<0?`${Math.abs(daysLeft)}d overdue`:daysLeft===0?'Due today':`${daysLeft}d left`}</span>}
                  <span style={{color:sc(item.status)}}>{item.status}</span>
                  <button
                    onClick={async()=>{
                      setItems(items.map(i=>i.id===item.id?{...i,start_date:null,end_date:null}:i))
                      await supabase.from('items').update({start_date:null,end_date:null}).eq('id',item.id)
                    }}
                    style={{marginLeft:'auto',background:'none',border:'1px solid #243447',borderRadius:4,padding:'2px 7px',fontSize:9,color:'#7A8FA6',cursor:'pointer',flexShrink:0}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#E74C3C';e.currentTarget.style.color='#E74C3C'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#243447';e.currentTarget.style.color='#7A8FA6'}}>
                    ✕ Uncommit
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Backlog items + add form */}
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:'#7A8FA6',letterSpacing:1}}>📋 BACKLOG ({noDates.length})</div>
            <button onClick={()=>setAddingItem(a=>!a)}
              style={{background:addingItem?'#1E3048':'#C8973A',color:addingItem?'#C8973A':'#0D1B2A',border:addingItem?'1px solid #C8973A':'none',borderRadius:5,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
              {addingItem?'Cancel':'+ Add Item'}
            </button>
          </div>

          {addingItem&&(
            <div style={{background:'#162436',border:'1px solid #C8973A',borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#F4F6F8',marginBottom:10}}>New Item → {project.name}</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Item Name *</div>
                  <input value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} placeholder="Describe the work item..."
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'7px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>Description</div>
                  <textarea value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))} rows={2} placeholder="Optional details..."
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'7px 8px',fontSize:12,boxSizing:'border-box' as const,resize:'vertical' as const,fontFamily:'inherit'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {([
                    ['Priority','priority',PRIORITIES],
                    ['Swimlane','swimlane',swimlaneOpts],
                    ['Effort','effort',EFFORTS],
                    ['Request Type','request_type',REQUEST_TYPES],
                    ['Status','status',STATUSES],
                    ['Vendor','vendor',['Deckers','Salesforce','GreyOrange','Legion','SafeSize','ID.me','Adyen','Agilence','Boomi']],
                  ] as [string,string,string[]][]).map(([label,field,opts])=>(
                    <div key={field}>
                      <div style={{fontSize:10,color:'#7A8FA6',marginBottom:3}}>{label}</div>
                      <select value={newItem[field]} onChange={e=>setNewItem(p=>({...p,[field]:e.target.value}))}
                        style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'5px 6px',fontSize:11}}>
                        {opts.map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{background:'#1E3048',borderRadius:5,padding:'6px 8px',fontSize:10,color:'#7A8FA6'}}>
                  Team: <span style={{color:'#F4F6F8',fontWeight:600}}>{project.team}</span> · Parent: <span style={{color:'#C8973A',fontWeight:600}}>{project.name}</span>
                </div>
              </div>
              <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:12}}>
                <button onClick={()=>setAddingItem(false)} style={{...sel,fontSize:11,padding:'5px 12px'}}>Cancel</button>
                <button onClick={saveNewItem} disabled={savingItem||!newItem.name.trim()}
                  style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:5,padding:'5px 16px',fontWeight:700,cursor:'pointer',fontSize:12,opacity:savingItem?0.7:1}}>
                  {savingItem?'Saving...':'Add to Backlog'}
                </button>
              </div>
            </div>
          )}

          {noDates.length===0&&!addingItem&&(
            <div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',textAlign:'center' as const,padding:'10px 0'}}>No backlog items</div>
          )}

          {noDates.map(item=>{
            const pclr=pc(item.priority)
            return(
              <div key={item.id} style={{background:'#162436',border:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:5}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                  <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                  <span style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                  <span style={{fontSize:11,color:'#C8C8D4',flex:1,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{item.name}</span>
                  <button
                    onClick={async()=>{
                      if(!project.start_date||!project.end_date){
                        alert('Set project dates first before committing items.')
                        return
                      }
                      const updates={start_date:project.start_date,end_date:project.end_date}
                      setItems(items.map(i=>i.id===item.id?{...i,...updates}:i))
                      await supabase.from('items').update(updates).eq('id',item.id)
                    }}
                    style={{background:'#27AE60',color:'#fff',border:'none',borderRadius:4,padding:'2px 8px',fontSize:9,fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap' as const}}>
                    ✓ Commit
                  </button>
                </div>
                {item.description&&<div style={{fontSize:10,color:'#7A8FA6',marginTop:3,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{item.description}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
function Projects({items,setItems,projects,setProjects,milestones,setMilestones}:{items:any[],setItems:any,projects:any[],setProjects:any,milestones:any[],setMilestones:any}) {
  const [adding,setAdding]=useState(false)
  const [editing,setEditing]=useState(null)
  const [saving,setSaving]=useState(false)
  const [filterTeam,setFilterTeam]=useState('All')
  const [filterRAG,setFilterRAG]=useState('All')
  const [selectedProject,setSelectedProject]=useState(null)
  const [dragId,setDragId]=useState(null)
  const [dragOverId,setDragOverId]=useState(null)
  const [addingMilestone,setAddingMilestone]=useState(false)
  const [milestoneForm,setMilestoneForm]=useState({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  const [savingMilestone,setSavingMilestone]=useState(false)
  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const MILESTONE_TYPES=['Milestone','Go-Live','Deadline','Review','Release','Code Freeze','UAT','Kickoff']
  const empty={name:'',description:'',priority:'P3',status:'Planning',rag:'Green',team:'Consumer Experience',start_date:'',end_date:'',color:'#2E86AB'}
  const [form,setForm]=useState({...empty})
  

  const filtered=projects.filter(p=>{
    if(filterTeam!=='All'&&p.team!==filterTeam) return false
    if(filterRAG!=='All'&&p.rag!==filterRAG) return false
    return true
  }).sort((a,b)=>(PRIORITY_ORDER[a.priority]??4)-(PRIORITY_ORDER[b.priority]??4))

  function d(str){return str?new Date(str+'T12:00:00'):null}
  function fmt(str){return d(str)?.toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})||'—'}

  function getViolations(project) {
    if(!project.start_date||!project.end_date) return []
    const children=items.filter(i=>i.parent_project===project.name&&i.start_date&&i.end_date)
    return children.filter(i=>d(i.start_date)<d(project.start_date)||d(i.end_date)>d(project.end_date))
  }

  function getProjectMilestones(project){
    return milestones.filter(m=>m.project_id===project.id).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
  }
  async function dropProject(targetId){
    if(!dragId||dragId===targetId) return
    const arr=[...filtered]
    const fi=arr.findIndex(p=>p.id===dragId)
    const ti=arr.findIndex(p=>p.id===targetId)
    const [moved]=arr.splice(fi,1)
    arr.splice(ti,0,moved)
    const updated=arr.map((p,idx)=>({...p,sort_order:idx}))
    setProjects(projects.map(p=>{const u=updated.find(u=>u.id===p.id);return u||p}))
    setDragId(null);setDragOverId(null)
    for(const p of updated) await supabase.from('projects').update({sort_order:p.sort_order}).eq('id',p.id)
  }

  function getProjectItems(project){
    return items.filter(i=>i.parent_project===project.name).sort((a,b)=>{
      const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
      if(pa!==pb) return pa-pb
      if(a.start_date&&b.start_date) return new Date(a.start_date).getTime()-new Date(b.start_date).getTime()
      if(a.start_date) return -1
      if(b.start_date) return 1
      return 0
    })
  }

  async function saveProject() {
    if(!form.name.trim()) return
    setSaving(true)
    // Empty strings are invalid for Postgres date columns — send null instead
    const payload={...form,start_date:form.start_date||null,end_date:form.end_date||null}
    if(editing) {
      const{data,error}=await supabase.from('projects').update({...payload,updated_at:new Date().toISOString()}).eq('id',editing.id).select().single()
      if(error){alert('Failed to save project: '+error.message);setSaving(false);return}
      if(data) setProjects(projects.map(p=>p.id===editing.id?data:p))
      setEditing(null)
    } else {
      const{data,error}=await supabase.from('projects').insert({...payload,sort_order:projects.length}).select().single()
      if(error){alert('Failed to create project: '+error.message);setSaving(false);return}
      if(data) setProjects([...projects,data])
      setAdding(false)
    }
    setSaving(false);setForm({...empty})
  }

  async function deleteProject(id) {
    if(!confirm('Delete this project?')) return
    setProjects(projects.filter(p=>p.id!==id))
    if(selectedProject?.id===id) setSelectedProject(null)
    await supabase.from('projects').delete().eq('id',id)
  }

  async function updateField(id,field,val) {
    setProjects(projects.map(p=>p.id===id?{...p,[field]:val}:p))
    if(selectedProject?.id===id) setSelectedProject(p=>({...p,[field]:val}))
    await supabase.from('projects').update({[field]:val}).eq('id',id)
  }

  function startEdit(project) {
    setEditing(project)
    setForm({name:project.name,description:project.description||'',priority:project.priority,status:project.status,rag:project.rag,team:project.team,start_date:project.start_date||'',end_date:project.end_date||'',color:project.color||'#2E86AB'})
    setAdding(true)
  }

  async function saveMilestone(){
    if(!milestoneForm.name.trim()||!milestoneForm.date||!selectedProject) return
    setSavingMilestone(true)
    const{data}=await supabase.from('milestones').insert({...milestoneForm,project_id:selectedProject.id,sort_order:milestones.filter(m=>m.project_id===selectedProject.id).length}).select().single()
    if(data) setMilestones([...milestones,data])
    setSavingMilestone(false);setAddingMilestone(false)
    setMilestoneForm({name:'',date:'',type:'Milestone',color:'#C8973A',notes:'',completed:false})
  }

  async function toggleMilestone(m){
    const updated={...m,completed:!m.completed}
    setMilestones(milestones.map(ms=>ms.id===m.id?updated:ms))
    await supabase.from('milestones').update({completed:!m.completed}).eq('id',m.id)
  }

  async function deleteMilestone(id){
    if(!confirm('Delete this milestone?')) return
    setMilestones(milestones.filter(m=>m.id!==id))
    await supabase.from('milestones').delete().eq('id',id)
  }

  const totalViolations=projects.reduce((acc,p)=>acc+getViolations(p).length,0)

  return(
    <div style={{display:'flex',height:'100%',overflow:'hidden'}}>

      {/* Project list */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:selectedProject?'1px solid #243447':'none'}}>

        {/* Controls */}
        <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',alignItems:'center',background:'#162436',flexWrap:'wrap' as const}}>
          <select value={filterTeam} onChange={e=>setFilterTeam(e.target.value)} style={sel}>
            <option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}
          </select>
          <select value={filterRAG} onChange={e=>setFilterRAG(e.target.value)} style={sel}>
            <option value="All">All RAG</option>
            <option value="Green">🟢 Green</option>
            <option value="Amber">🟡 Amber</option>
            <option value="Red">🔴 Red</option>
          </select>
          {totalViolations>0&&(
            <div style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'5px 12px',fontSize:12,color:'#E74C3C'}}>
              ⚠️ {totalViolations} timeline violation{totalViolations!==1?'s':''}
            </div>
          )}
          <div style={{marginLeft:'auto'}}>
            <button onClick={()=>{setAdding(true);setEditing(null);setForm({...empty})}}
              style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
              + New Project
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'flex',gap:12,padding:'10px 20px',borderBottom:'1px solid #243447',background:'#0D1B2A',flexWrap:'wrap' as const}}>
          {[
            ['Total',projects.length,'#7A8FA6'],
            ['🟢 Green',projects.filter(p=>p.rag==='Green').length,'#27AE60'],
            ['🟡 Amber',projects.filter(p=>p.rag==='Amber').length,'#D4820A'],
            ['🔴 Red',projects.filter(p=>p.rag==='Red').length,'#C0392B'],
            ['In Progress',projects.filter(p=>p.status==='In Progress').length,'#2E86AB'],
            ['Planning',projects.filter(p=>p.status==='Planning').length,'#8E44AD'],
          ].map(([label,val,color])=>(
            <div key={label} style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'8px 14px',display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:18,fontWeight:700,color}}>{val}</span>
              <span style={{fontSize:11,color:'#7A8FA6'}}>{label}</span>
            </div>
          ))}
        </div>

        {/* Cards */}
        <div style={{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:10}}>
          {filtered.map(project=>{
            const violations=getViolations(project)
            const children=items.filter(i=>i.parent_project===project.name)
            const projectMilestones=getProjectMilestones(project)
            const ragColor=RAG_COLORS[project.rag]||'#27AE60'
            const pclr=pc(project.priority)
            const ps=d(project.start_date),pe=d(project.end_date)
            const now=new Date()
            const daysTotal=ps&&pe?Math.round((pe.getTime()-ps.getTime())/(1000*60*60*24)):null
            const daysLeft=pe?Math.round((pe.getTime()-now.getTime())/(1000*60*60*24)):null
            const progress=ps&&pe?Math.max(0,Math.min(100,Math.round((now.getTime()-ps.getTime())/(pe.getTime()-ps.getTime())*100))):0
            const isSelected=selectedProject?.id===project.id

            return(
              <div key={project.id}
              draggable
              onDragStart={()=>setDragId(project.id)}
              onDragOver={e=>{e.preventDefault();setDragOverId(project.id)}}
              onDrop={()=>dropProject(project.id)}
              onDragEnd={()=>{setDragId(null);setDragOverId(null)}}
              onClick={()=>setSelectedProject(isSelected?null:project)}
              style={{background:'#162436',border:`1px solid ${dragOverId===project.id?'#C8973A':isSelected?'#C8973A':violations.length>0?'rgba(192,57,43,0.5)':'#243447'}`,borderLeft:`4px solid ${project.color||'#2E86AB'}`,borderRadius:10,padding:'14px 18px',cursor:'grab',transition:'border-color 0.15s',opacity:dragId===project.id?0.5:1}}
              onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.borderColor='rgba(200,151,58,0.4)'}}
              onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.borderColor=dragOverId===project.id?'#C8973A':violations.length>0?'rgba(192,57,43,0.5)':'#243447'}}>
                {/* Header */}
                <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap' as const}}>
                      <span style={{fontSize:15,fontWeight:700,color:'#F4F6F8'}}>{project.name}</span>
                      <span style={{background:pclr.bg,color:'#fff',padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:700}}>{project.priority}</span>
                      <span style={{background:ragColor+'22',color:ragColor,border:`1px solid ${ragColor}44`,padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700}}>
                        {project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':'🔴'} {project.rag}
                      </span>
                      <span style={{color:sc(project.status),fontSize:11,fontWeight:600}}>{project.status}</span>
                      <span style={{fontSize:11,color:'#7A8FA6'}}>{project.team==='Consumer Experience'?'CE':'OE'}</span>
                      {violations.length>0&&<span style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:5,padding:'2px 7px',fontSize:11,color:'#E74C3C'}}>⚠️ {violations.length} violation{violations.length!==1?'s':''}</span>}
                      {projectMilestones.length>0&&<span style={{background:'rgba(200,151,58,0.15)',border:'1px solid rgba(200,151,58,0.3)',borderRadius:5,padding:'2px 7px',fontSize:11,color:'#C8973A'}}>🏁 {projectMilestones.length} milestone{projectMilestones.length!==1?'s':''}</span>}
                    </div>
                    {project.description&&<div style={{fontSize:12,color:'#7A8FA6',lineHeight:1.4}}>{project.description}</div>}
                  </div>
                  <div style={{display:'flex',gap:5,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>startEdit(project)} style={{...sel,fontSize:11,padding:'3px 8px'}}>Edit</button>
                    <button onClick={()=>deleteProject(project.id)} style={{...sel,fontSize:11,padding:'3px 8px',color:'#E74C3C',border:'1px solid #E74C3C'}}>Delete</button>
                  </div>
                </div>

                {/* Timeline */}
                {ps&&pe&&(
                  <div style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#7A8FA6',marginBottom:4}}>
                      <span>{fmt(project.start_date)}</span>
                      <span style={{color:daysLeft!==null&&daysLeft<0?'#E74C3C':daysLeft!==null&&daysLeft<30?'#E74C3C':daysLeft!==null&&daysLeft<60?'#D4820A':'#7A8FA6',fontWeight:daysLeft!==null&&daysLeft<60?700:400}}>
                        {daysLeft!==null&&daysLeft>0?`${daysLeft}d remaining`:daysLeft!==null&&daysLeft<=0?`${Math.abs(daysLeft)}d overdue`:'—'}
                      </span>
                      <span>{fmt(project.end_date)}</span>
                    </div>
                    <div style={{height:6,background:'#1E3048',borderRadius:3,overflow:'hidden',marginBottom:3,position:'relative'}}>
                      <div style={{height:'100%',width:`${progress}%`,background:project.color||'#2E86AB',borderRadius:3}}/>
                      {/* Milestone markers on timeline */}
                      {projectMilestones.map(m=>{
                        if(!d(m.date)) return null
                        const mPct=Math.max(0,Math.min(100,(d(m.date).getTime()-ps.getTime())/(pe.getTime()-ps.getTime())*100))
                        return(
                          <div key={m.id} title={`${m.name} — ${fmt(m.date)}`}
                            style={{position:'absolute',top:-3,left:`${mPct}%`,width:2,height:12,background:m.color||'#C8973A',zIndex:2,transform:'translateX(-50%)'}}/>
                        )
                      })}
                    </div>
                    <div style={{fontSize:10,color:'#7A8FA6'}}>{progress}% · {daysTotal}d total · {children.length} items · {projectMilestones.filter(m=>!m.completed).length} upcoming milestones</div>
                  </div>
                )}

                {/* Quick controls */}
                <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',gap:3,fontSize:11}}>
                    <span style={{color:'#7A8FA6'}}>RAG:</span>
                    {['Green','Amber','Red'].map(r=>(
                      <button key={r} onClick={()=>updateField(project.id,'rag',r)}
                        style={{background:project.rag===r?RAG_COLORS[r]+'33':'transparent',color:RAG_COLORS[r],border:`1px solid ${project.rag===r?RAG_COLORS[r]:'#243447'}`,borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:project.rag===r?700:400}}>
                        {r==='Green'?'🟢':r==='Amber'?'🟡':'🔴'} {r}
                      </button>
                    ))}
                  </div>
                  <select value={project.status} onChange={e=>updateField(project.id,'status',e.target.value)} style={{...sel,fontSize:11,padding:'2px 5px'}}>
                    {PROJECT_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <select value={project.priority} onChange={e=>updateField(project.id,'priority',e.target.value)} style={{...sel,fontSize:11,padding:'2px 5px'}}>
                    {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                  </select>
                  <span style={{fontSize:11,color:'#7A8FA6',marginLeft:4}}>{children.length} items</span>
                  <span style={{fontSize:11,color:'#C8973A',marginLeft:4,cursor:'pointer',fontWeight:600}} onClick={()=>setSelectedProject(isSelected?null:project)}>
                    {isSelected?'▲ Close detail':'▼ View detail'}
                  </span>
                </div>

                {/* Violations */}
                {violations.length>0&&(
                  <div style={{background:'rgba(192,57,43,0.08)',border:'1px solid rgba(192,57,43,0.2)',borderRadius:6,padding:'10px 12px',marginTop:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#E74C3C',marginBottom:8}}>
                      ⚠️ Timeline violations — window: {fmt(project.start_date)} → {fmt(project.end_date)}
                    </div>
                    {violations.map(v=><ViolationRow key={v.id} v={v} project={project} fmt={fmt} d={d}/>)}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length===0&&(
            <div style={{textAlign:'center',padding:60,color:'#7A8FA6'}}>
              <div style={{fontSize:32,marginBottom:12}}>📋</div>
              <div style={{fontSize:16,marginBottom:8}}>No projects yet</div>
              <div style={{fontSize:13}}>Click "+ New Project" to get started</div>
            </div>
          )}
        </div>
      </div>

      {/* Project detail panel */}
      {selectedProject&&(
  <ProjectDetail
    project={projects.find(p=>p.id===selectedProject.id)||selectedProject}
    items={items}
    setItems={setItems}
    projects={projects}
    milestones={milestones}
    setMilestones={setMilestones}
    onClose={()=>setSelectedProject(null)}
    d={d}
    fmt={fmt}
  />
)}

      {/* Add/Edit modal */}
      {adding&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:520,maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:20}}>{editing?'Edit Project':'New Project'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Project Name *</div>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Peak Prep"
                  style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'8px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Description</div>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
                  style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'8px 10px',fontSize:13,boxSizing:'border-box' as const,resize:'vertical' as const,fontFamily:'inherit'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                {([['Priority','priority',PRIORITIES],['Status','status',PROJECT_STATUSES],['Team','team',TEAMS]] as [string,string,string[]][]).map(([label,field,opts])=>(
                  <div key={field}>
                    <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>{label}</div>
                    <select value={form[field]} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))}
                      style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 8px',fontSize:12}}>
                      {opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>RAG Status</div>
                  <select value={form.rag} onChange={e=>setForm(p=>({...p,rag:e.target.value}))}
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 8px',fontSize:12}}>
                    <option value="Green">🟢 Green</option>
                    <option value="Amber">🟡 Amber</option>
                    <option value="Red">🔴 Red</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Start Date</div>
                  <input type="date" value={form.start_date} onChange={e=>setForm(p=>({...p,start_date:e.target.value}))}
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>End Date</div>
                  <input type="date" value={form.end_date} onChange={e=>setForm(p=>({...p,end_date:e.target.value}))}
                    style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8}}>Project Color</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                  {COLORS.map(c=>(
                    <div key={c} onClick={()=>setForm(p=>({...p,color:c}))}
                      style={{width:28,height:28,borderRadius:6,background:c,cursor:'pointer',border:form.color===c?'3px solid #F4F6F8':'3px solid transparent'}}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>{setAdding(false);setEditing(null);setForm({...empty})}} style={sel}>Cancel</button>
              <button onClick={saveProject} disabled={saving||!form.name.trim()}
                style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.7:1}}>
                {saving?'Saving...':(editing?'Save Changes':'Create Project')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// ── BACKLOG ───────────────────────────────────────────────────────────────
// Top-level so its identity is stable across renders — defining it inside
// Backlog remounts the input on every keystroke and drops focus
function PanelField({label,field,type='text',selected,upd}:{label:string,field:string,type?:string,selected:any,upd:any}) {
  if(!selected) return null
  const val=selected[field]??''
  return(
    <div>
      <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}}>{label}</div>
      {type==='textarea'
        ?<textarea value={val} onChange={e=>upd(selected.id,field,e.target.value)} rows={3} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const,resize:'vertical' as const,fontFamily:'inherit'}}/>
        :type==='date'
        ?<input type="date" value={val} onChange={e=>upd(selected.id,field,e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
        :type==='number'
        ?<input type="number" value={val} onChange={e=>upd(selected.id,field,parseFloat(e.target.value)||null)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
        :<input type="text" value={val} onChange={e=>upd(selected.id,field,e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
      }
    </div>
  )
}

function Backlog({items,setItems,projects,setProjects}:{items:any[],setItems:any,projects:any[],setProjects:any}) {
 const [ft,setFt]=useState('All')
  const [fp,setFp]=useState('All')
  const [fs,setFs]=useState('All')
  const [fst,setFst]=useState('All')
  const [fpp,setFpp]=useState('All')
  const [frt,setFrt]=useState('All')
  const [frg,setFrg]=useState('All')
  const [fvn,setFvn]=useState('All')
  const [fef,setFef]=useState('All')
  const [srch,setSrch]=useState('')
  const [sf,setSf]=useState(false)
  const [sortCol,setSortCol]=useState('priority')
  const [sortDir,setSortDir]=useState<'asc'|'desc'>('asc')
  const [did,setDid]=useState(null)
  const [doid,setDoid]=useState(null)
  const [sac,setSac]=useState(false)
  const [ncn,setNcn]=useState('')
  const [cc,setCc]=useState([])
  const [ai,setAi]=useState(false)
  const [sav,setSav]=useState(false)
  const [selected,setSelected]=useState(null)
  const [ni,setNi]=useState({name:'',priority:'P3',swimlane:'POS',team:'Consumer Experience',effort:'M',status:'Ready to Score',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  const [vendors,setVendors]=useState(['Deckers','Salesforce','GreyOrange','Legion','SafeSize','ID.me','Adyen','Agilence','Boomi'])
  const [swimlaneOpts,setSwimOpts]=useState([...SWIMLANES])
  const [statusOpts,setStatusOpts]=useState([...STATUSES])
  const [rtOpts,setRtOpts]=useState([...REQUEST_TYPES])
  const [regionOpts,setRegionOpts]=useState(['North America','EMEA','Japan','China','Global','NA/EMEA/JP'])

  // Parent options driven by projects table
  const parentOpts=projects.map(p=>p.name)

  const fc=items.filter(i=>i.flagged).length

  function sortVal(item,col){
    switch(col){
      case 'priority': return PRIORITY_ORDER[item.priority]??4
      case 'item_id': return item.item_id||''
      case 'name': return item.name?.toLowerCase()||''
      case 'swimlane': return item.swimlane?.toLowerCase()||''
      case 'status': return item.status?.toLowerCase()||''
      case 'team': return item.team?.toLowerCase()||''
      case 'effort': return ['S','M','L','XL'].indexOf(item.effort)
      case 'parent_project': return item.parent_project?.toLowerCase()||'zzz'
      case 'request_type': return item.request_type?.toLowerCase()||''
      case 'region': return item.region?.toLowerCase()||''
      case 'vendor': return item.vendor?.toLowerCase()||''
      case 'wsjf': return parseFloat(item.wsjf)||0
      case 'rice': return rice(item)||0
      case 'reach': return item.reach||0
      case 'impact': return item.impact||0
      case 'confidence': return item.confidence||0
      case 'start_date': return item.start_date||'9999'
      case 'end_date': return item.end_date||'9999'
      case 'committed_priority': return item.committed_priority??999
      case 'vendor_delivery_date': return item.vendor_delivery_date||'9999'
      case 'owner': return item.owner?.toLowerCase()||'zzz'
      default: return item.sort_order
    }
  }

const sorted=[...items].sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    // P1/P2 always stay at top
    if(pa<=1&&pb>1) return -1
    if(pa>1&&pb<=1) return 1
    if(pa<=1&&pb<=1) return pa-pb
    // For all other sorts — use committed_priority as tiebreaker
    if(sortCol==='priority'){
      if(pa!==pb) return sortDir==='asc'?pa-pb:pb-pa
      const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
      return am-bm
    }
    const av=sortVal(a,sortCol),bv=sortVal(b,sortCol)
    const dir=sortDir==='asc'?1:-1
    if(av<bv) return -1*dir
    if(av>bv) return 1*dir
    // Tiebreaker — committed_priority
    const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
    return am-bm
  })

  // Manual rank entry — place item at typed position, renumber everything else
  function setRank(item,target){
    if(item.priority==='P1'||item.priority==='P2') return
    const nonP12=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2')
      .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
    const without=nonP12.filter(i=>i.id!==item.id)
    const pos=Math.max(0,Math.min(isNaN(target)?0:target,without.length))
    const reordered=[...without.slice(0,pos),item,...without.slice(pos)]
    const updated=reordered.map((i,idx)=>({...i,committed_priority:idx}))
    const changed=updated.filter(u=>{const o=items.find(i=>i.id===u.id);return o&&o.committed_priority!==u.committed_priority})
    setItems(prev=>prev.map(i=>{const u=changed.find(u=>u.id===i.id);return u?{...i,committed_priority:u.committed_priority}:i}))
    Promise.all(changed.map(u=>supabase.from('items').update({committed_priority:u.committed_priority}).eq('id',u.id))).then()
  }


  const filtered=sorted.filter(item=>{
    if(ft!=='All'&&item.team!==ft) return false
    if(fp!=='All'&&item.priority!==fp) return false
    if(fs!=='All'&&item.swimlane!==fs) return false
    if(fst!=='All'&&item.status!==fst) return false
    if(fpp!=='All'&&item.parent_project!==fpp) return false
    if(frt!=='All'&&item.request_type!==frt) return false
    if(frg!=='All'&&item.region!==frg) return false
    if(fvn!=='All'&&item.vendor!==fvn) return false
    if(fef!=='All'&&item.effort!==fef) return false
    if(sf&&!item.flagged) return false
    if(srch&&!item.name?.toLowerCase().includes(srch.toLowerCase())&&!item.item_id?.toLowerCase().includes(srch.toLowerCase())) return false
    return true
  })

  // Export current filtered view to Excel, always in ranked order (P1/P2 first, then committed rank)
  function exportExcel(){
    const ordered=[...filtered].sort((a,b)=>{
      const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
      if(pa<=1&&pb>1) return -1
      if(pa>1&&pb<=1) return 1
      if(pa<=1&&pb<=1) return pa-pb
      const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
      return am-bm
    })
    const rows=ordered.map(i=>({
      'ID':i.item_id,'Item Name':i.name,'Description':i.description||'',
      'Priority':i.priority,'Rank':i.committed_priority??'',
      'Swimlane':i.swimlane||'','Status':i.status||'','Team':i.team||'',
      'Effort':i.effort||'','Parent Project':i.parent_project||'',
      'Request Type':i.request_type||'','Region':i.region||'','Vendor':i.vendor||'',
      'Vendor Date':i.vendor_delivery_date||'','WSJF':i.wsjf?parseFloat(i.wsjf):'',
      'RICE':rice(i)||'','Reach':i.reach||'','Impact':i.impact||'','Confidence':i.confidence??'',
      'Owner':i.owner||'','Start Date':i.start_date||'','End Date':i.end_date||'',
      'Flagged':i.flagged?'Yes':'','Notes':i.notes||'',
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    ws['!cols']=[{wch:9},{wch:42},{wch:50},{wch:8},{wch:6},{wch:12},{wch:22},{wch:20},{wch:7},{wch:24},{wch:16},{wch:14},{wch:12},{wch:12},{wch:7},{wch:7},{wch:7},{wch:7},{wch:10},{wch:14},{wch:11},{wch:11},{wch:8},{wch:50}]
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Backlog')
    XLSX.writeFile(wb,`backlog-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  // Timeline violation check per item
  function hasViolation(item) {
    if(!item.parent_project||!item.start_date||!item.end_date) return false
    const project=projects.find(p=>p.name===item.parent_project)
    if(!project||!project.start_date||!project.end_date) return false
    return new Date(item.start_date)<new Date(project.start_date)||new Date(item.end_date)>new Date(project.end_date)
  }

  async function upd(id,field,val) {
    setItems(items.map(i=>i.id===id?{...i,[field]:val}:i))
    if(selected?.id===id) setSelected(s=>({...s,[field]:val}))
    await supabase.from('items').update({[field]:val}).eq('id',id)
  }
  async function flag(id) {
    const item=items.find(i=>i.id===id)
    if(!item) return
    const v=!item.flagged
    setItems(items.map(i=>i.id===id?{...i,flagged:v}:i))
    if(selected?.id===id) setSelected(s=>({...s,flagged:v}))
    await supabase.from('items').update({flagged:v}).eq('id',id)
  }
  function ds(e,id){setDid(id);e.dataTransfer.effectAllowed='move'}
  function dov(e,id){e.preventDefault();setDoid(id)}
 function drop(e,tid) {
    e.preventDefault()
    if(!did||did===tid){setDid(null);setDoid(null);return}
    const dragged=items.find(i=>i.id===did)
    if(!dragged||dragged.priority==='P1'||dragged.priority==='P2'){setDid(null);setDoid(null);return}
    const visibleIds=filtered.map(i=>i.id)
    const fi=visibleIds.indexOf(did)
    const ti=visibleIds.indexOf(tid)
    if(fi===-1||ti===-1){setDid(null);setDoid(null);return}
    const down=fi<ti
    // Splice into the GLOBAL rank order — never renumber just the filtered subset
    const nonP12=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2')
      .sort((a,b)=>(a.committed_priority??a.sort_order??999)-(b.committed_priority??b.sort_order??999))
    const without=nonP12.filter(i=>i.id!==did)
    const gIdx=without.findIndex(i=>i.id===tid)
    const pos=gIdx===-1?0:(down?gIdx+1:gIdx) // target is P1/P2 → move to top
    const reordered=[...without.slice(0,pos),dragged,...without.slice(pos)]
    const updated=reordered.map((item,idx)=>({...item,committed_priority:idx}))
    const changed=updated.filter(u=>{const o=items.find(i=>i.id===u.id);return o&&o.committed_priority!==u.committed_priority})
    setItems(items.map(i=>{const u=changed.find(u=>u.id===i.id);return u?{...i,committed_priority:u.committed_priority}:i}))
    setDid(null);setDoid(null)
    Promise.all(changed.map(u=>supabase.from('items').update({committed_priority:u.committed_priority}).eq('id',u.id))).then()
  }
  
  
  async function addIt() {
    if(!ni.name.trim()) return
    setSav(true)
    const iid=`RTL-${String(Math.floor(Math.random()*900)+100)}`
    const{data,error}=await supabase.from('items').insert({item_id:iid,name:ni.name,description:ni.description,priority:ni.priority,swimlane:ni.swimlane,team:ni.team,effort:ni.effort,status:ni.status,request_type:ni.request_type,region:ni.region,vendor:ni.vendor,flagged:false,sort_order:items.length}).select().single()
    if(error){alert('Failed to add item: '+error.message);setSav(false);return}
    if(data) setItems([...items,data])
    setSav(false);setAi(false)
    setNi({name:'',priority:'P3',swimlane:'POS',team:'Consumer Experience',effort:'M',status:'Ready to Score',request_type:'Bug',region:'',vendor:'Deckers',description:''})
  }
  async function deleteItem(id) {
    if(!confirm('Delete this item?')) return
    setItems(items.filter(i=>i.id!==id))
    setSelected(null)
    await supabase.from('items').delete().eq('id',id)
  }

  function EditableDropdown({field,value,options,setOptions,label}:{field:string,value:string,options:string[],setOptions:any,label:string}) {
    const [open,setOpen]=useState(false)
    const [search,setSearch]=useState('')
    const ref=useRef(null)
    const filtered2=options.filter(o=>o.toLowerCase().includes(search.toLowerCase()))
    const canAdd=search.trim()&&!options.find(o=>o.toLowerCase()===search.toLowerCase())&&setOptions!==null
    useEffect(()=>{
      function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false)}
      document.addEventListener('mousedown',h)
      return()=>document.removeEventListener('mousedown',h)
    },[])
    return(
      <div ref={ref} style={{position:'relative'}}>
        <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4,letterSpacing:0.5}}>{label}</div>
        <div onClick={()=>setOpen(o=>!o)} style={{background:'#1E3048',border:`1px solid ${open?'#C8973A':'#243447'}`,borderRadius:6,padding:'7px 10px',fontSize:13,color:value?'#F4F6F8':'#7A8FA6',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',userSelect:'none' as const}}>
          <span>{value||'—'}</span>
          <span style={{fontSize:10,color:'#7A8FA6',transition:'transform 0.15s',transform:open?'rotate(180deg)':'none'}}>▾</span>
        </div>
        {open&&(
          <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:999,background:'#162436',border:'1px solid #243447',borderRadius:8,marginTop:4,boxShadow:'0 8px 24px rgba(0,0,0,0.5)',maxHeight:220,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'6px 6px 4px'}}>
              <input autoFocus placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==='Escape'){setOpen(false);setSearch('')}
                  if(e.key==='Enter'&&canAdd&&setOptions){setOptions(p=>[...p,search.trim()]);upd(selected.id,field,search.trim());setOpen(false);setSearch('')}
                  if(e.key==='Enter'&&!canAdd&&filtered2.length===1){upd(selected.id,field,filtered2[0]);setOpen(false);setSearch('')}
                }}
                style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:5,padding:'5px 8px',fontSize:12,boxSizing:'border-box' as const}}/>
            </div>
            <div style={{overflowY:'auto',maxHeight:160}}>
              {filtered2.map(o=>(
                <div key={o} onClick={()=>{upd(selected.id,field,o);setOpen(false);setSearch('')}}
                  style={{padding:'8px 12px',fontSize:13,color:o===value?'#C8973A':'#F4F6F8',background:o===value?'rgba(200,151,58,0.12)':'transparent',cursor:'pointer',fontWeight:o===value?700:400,borderLeft:o===value?'3px solid #C8973A':'3px solid transparent'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}
                  onMouseLeave={e=>(e.currentTarget.style.background=o===value?'rgba(200,151,58,0.12)':'transparent')}>
                  {o}
                </div>
              ))}
              {canAdd&&setOptions&&(
                <div onClick={()=>{setOptions(p=>[...p,search.trim()]);upd(selected.id,field,search.trim());setOpen(false);setSearch('')}}
                  style={{padding:'8px 12px',fontSize:13,color:'#27AE60',cursor:'pointer',borderTop:'1px solid #243447',display:'flex',alignItems:'center',gap:8,fontWeight:600}}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(39,174,96,0.1)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span style={{fontSize:16,lineHeight:'1'}}>+</span> Add "{search.trim()}"
                </div>
              )}
              {filtered2.length===0&&!canAdd&&<div style={{padding:'8px 12px',fontSize:12,color:'#7A8FA6',fontStyle:'italic'}}>No matches</div>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',flexWrap:'wrap',alignItems:'center',background:'#162436'}}>
        <input placeholder="Search..." value={srch} onChange={e=>setSrch(e.target.value)} style={{...sel,width:160}}/>
        <select value={ft} onChange={e=>setFt(e.target.value)} style={sel}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        <select value={fp} onChange={e=>setFp(e.target.value)} style={sel}><option value="All">All Priorities</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
        <select value={fs} onChange={e=>setFs(e.target.value)} style={sel}><option value="All">All Swimlanes</option>{swimlaneOpts.map(s=><option key={s}>{s}</option>)}</select>
        <select value={fst} onChange={e=>setFst(e.target.value)} style={sel}><option value="All">All Statuses</option>{statusOpts.map(s=><option key={s}>{s}</option>)}</select>
        <select value={fpp} onChange={e=>setFpp(e.target.value)} style={sel}><option value="All">All Projects</option>{[...new Set(items.map(i=>i.parent_project).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select>
        <select value={frt} onChange={e=>setFrt(e.target.value)} style={sel}><option value="All">All Types</option>{rtOpts.map(r=><option key={r}>{r}</option>)}</select>
        <select value={frg} onChange={e=>setFrg(e.target.value)} style={sel}><option value="All">All Regions</option>{regionOpts.map(r=><option key={r}>{r}</option>)}</select>
        <select value={fvn} onChange={e=>setFvn(e.target.value)} style={sel}><option value="All">All Vendors</option>{vendors.map(v=><option key={v}>{v}</option>)}</select>
        <select value={fef} onChange={e=>setFef(e.target.value)} style={sel}><option value="All">All Efforts</option>{EFFORTS.map(e=><option key={e}>{e}</option>)}</select>
        <button onClick={()=>setSf(f=>!f)} style={{...sel,background:sf?'#7D2D00':'#1E3048',color:sf?'#FF8C42':'#7A8FA6',border:`1px solid ${sf?'#FF8C42':'#243447'}`}}>
          🚩{fc>0&&<span style={{background:'#C8973A',color:'#0D1B2A',borderRadius:10,padding:'0 5px',fontSize:10,fontWeight:700,marginLeft:3}}>{fc}</span>}
        </button>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={exportExcel} title="Export current view to Excel in ranked order" style={{...sel,color:'#27AE60',border:'1px solid rgba(39,174,96,0.4)'}}>⬇ Excel</button>
          <button onClick={()=>setSac(true)} style={{...sel,color:'#7A8FA6'}}>+ Column</button>
          <button onClick={()=>setAi(true)} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Item</button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div data-backlog-table="true" style={{flex:1,overflowX:'auto',overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1400}}>
            <thead style={{position:'sticky',top:0,zIndex:10,background:'#162436'}}>
          <tr>
                <th style={{...TH,width:32}}></th>
                {[
                  ['item_id','ID',85],['name','Item Name',200],['priority','Priority',70],['committed_priority','Rank',55],
                  ['swimlane','Swimlane',110],['status','Status',130],['team','Team',50],
                  ['effort','Effort',55],['parent_project','Parent Project',130],
                  ['request_type','Request Type',110],['region','Region',100],
                  ['vendor','Vendor',90],['vendor_delivery_date','Vendor Date',100],
                  ['wsjf','WSJF',65],['rice','RICE',65],['reach','Reach',55],
                  ['impact','Impact',55],['confidence','Confidence',80],
                  ['owner','Owner',90],['start_date','Start Date',95],['end_date','End Date',95],
                ].map(([col,label,w])=>(
                  <th key={col} style={{...TH,width:w,cursor:'pointer',userSelect:'none' as const}}
                    onClick={()=>{
                      if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc')
                      else{setSortCol(col);setSortDir('asc')}
                    }}>
                    <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'space-between'}}>
                      <span>{label}</span>
                      <span style={{fontSize:9,color:sortCol===col?'#C8973A':'#243447',fontWeight:700}}>
                        {sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕'}
                      </span>
                    </div>
                  </th>
                ))}
                <th style={{...TH,width:30}}>⚠️</th>
                <th style={{...TH,width:50}}>🚩</th>
                {cc.map(c=><th key={c.key} style={TH}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item,idx)=>{
                const r=rice(item)
                const p12=item.priority==='P1'||item.priority==='P2'
                const isSel=selected?.id===item.id
                const violation=hasViolation(item)
                const bg=isSel?'#1E3048':doid===item.id?'#1E3048':violation?'rgba(192,57,43,0.05)':item.flagged?'rgba(200,151,58,0.07)':p12?(item.priority==='P1'?'#2D1515':'#2D1E0A'):idx%2===0?'#0D1B2A':'#162436'
                const pclr=pc(item.priority)
                return(
                  <tr key={item.id} draggable
                    onDragStart={e=>ds(e,item.id)} onDragOver={e=>dov(e,item.id)}
                    onDrop={e=>drop(e,item.id)} onDragEnd={()=>{setDid(null);setDoid(null)}}
                    onClick={()=>setSelected(isSel?null:item)}
                    style={{background:bg,cursor:'pointer',borderLeft:isSel?'3px solid #C8973A':violation?'3px solid #E74C3C':'3px solid transparent'}}>
                    <td style={{...TD,color:'#243447',textAlign:'center' as const,cursor:'grab',padding:'0 4px'}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                        <span>⠿</span>
                        {item.priority!=='P1'&&item.priority!=='P2'&&(
                          <button
                            title="Move to top of backlog"
                      onClick={e=>{
                              e.stopPropagation()
                              setRank(item,0)
                            }}
                            style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:'#C8973A',padding:0,lineHeight:1,opacity:0.6}}
                            onMouseEnter={e=>(e.currentTarget.style.opacity='1')}
                            onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}>
                            ⬆
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{...TD,color:'#7A8FA6',fontFamily:'monospace',fontSize:10}}>{item.item_id}</td>
                    <td style={TD}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{fontSize:12,color:'#F4F6F8',fontWeight:isSel?700:400}}>{item.name}</div>
                        {item.start_date&&item.end_date&&(
                          <span title={`Committed: ${item.start_date} → ${item.end_date}`}
                            style={{background:'rgba(39,174,96,0.15)',color:'#27AE60',border:'1px solid rgba(39,174,96,0.4)',borderRadius:4,padding:'1px 6px',fontSize:9,fontWeight:700,flexShrink:0}}>
                            ✓ committed
                          </span>
                        )}
                      </div>
                      {item.description&&<div style={{color:'#7A8FA6',fontSize:10,marginTop:1,maxWidth:220,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{item.description}</div>}
                    </td>
                    <td style={TD}><span style={{background:pclr.bg,color:pclr.text,borderRadius:4,padding:'2px 8px',fontSize:10,fontWeight:700,whiteSpace:'nowrap' as const}}>{item.priority}</span></td>
                    <td style={{...TD,textAlign:'center' as const,padding:'0 4px'}} onClick={e=>e.stopPropagation()}>
                      {(item.priority==='P1'||item.priority==='P2')
                        ? <span style={{fontSize:11,color:'#7A8FA6'}}>—</span>
                        : <input key={`rk-${item.id}-${item.committed_priority}`} type="number" min={0} defaultValue={item.committed_priority??''}
                            onKeyDown={e=>{if(e.key==='Enter'){setRank(item,parseInt(e.currentTarget.value,10));e.currentTarget.blur()}}}
                            onBlur={e=>{const v=parseInt(e.target.value,10);if(!isNaN(v)&&v!==item.committed_priority)setRank(item,v)}}
                            style={{width:44,background:'transparent',border:'1px solid #243447',borderRadius:4,color:'#C8973A',fontWeight:700,fontSize:11,textAlign:'center' as const,padding:'2px 0'}}/>}
                    </td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.swimlane}</td>
                    <td style={TD}><span style={{color:sc(item.status),fontSize:11,fontWeight:600}}>{item.status}</span></td>
                    <td style={{...TD,fontSize:10,color:'#7A8FA6'}}>{item.team==='Consumer Experience'?'CE':'OE'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11}}>{item.effort}</td>
                    <td style={{...TD,fontSize:11,color:item.parent_project?'#F4F6F8':'#7A8FA6'}}>{item.parent_project||'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.request_type}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.region}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.vendor}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.vendor_delivery_date||'—'}</td>
                    <td style={{...TD,color:item.wsjf?'#E8B95A':'#7A8FA6',fontWeight:item.wsjf?700:400,fontSize:11}}>{item.wsjf?parseFloat(item.wsjf).toFixed(1):'—'}</td>
                    <td style={{...TD,color:r?'#27AE60':'#7A8FA6',fontWeight:r?700:400,fontSize:11}}>{r||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11,color:'#7A8FA6'}}>{item.reach||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11,color:'#7A8FA6'}}>{item.impact||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const,fontSize:11,color:'#7A8FA6'}}>{item.confidence?`${Math.round(item.confidence*100)}%`:'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.owner||'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.start_date||'—'}</td>
                    <td style={{...TD,fontSize:11,color:'#7A8FA6'}}>{item.end_date||'—'}</td>
                    <td style={{...TD,textAlign:'center' as const}}>
                      {violation&&<span title="Outside project timeline" style={{fontSize:14}}>⚠️</span>}
                    </td>
                    <td style={{...TD,textAlign:'center' as const}} onClick={e=>{e.stopPropagation();flag(item.id)}}>
                      <button style={{background:'none',border:'none',cursor:'pointer',fontSize:15,opacity:item.flagged?1:0.25}}>🚩</button>
                    </td>
                    {cc.map(c=><td key={c.key} style={TD}><input placeholder="—" style={{background:'transparent',color:'#F4F6F8',border:'none',fontSize:12,width:70}}/></td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{textAlign:'center',padding:60,color:'#7A8FA6'}}>No items match your filters.</div>}
        </div>

        {selected&&(
          <div style={{width:320,borderLeft:'1px solid #243447',background:'#162436',overflowY:'auto',flexShrink:0,display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px',borderBottom:'1px solid #243447',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{selected.item_id}</div>
                <div style={{fontSize:13,fontWeight:700,color:'#F4F6F8',marginTop:2,lineHeight:1.3}}>{selected.name}</div>
              </div>
              {hasViolation(selected)&&<span title="Outside project timeline" style={{fontSize:16}}>⚠️</span>}
              <button onClick={()=>flag(selected.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,opacity:selected.flagged?1:0.3}}>🚩</button>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#7A8FA6'}}>×</button>
            </div>
            {hasViolation(selected)&&(()=>{
              const proj=projects.find(p=>p.name===selected.parent_project)
              return proj?(
                <div style={{padding:'8px 16px',background:'rgba(192,57,43,0.1)',borderBottom:'1px solid rgba(192,57,43,0.3)',fontSize:11,color:'#E74C3C'}}>
                  ⚠️ Outside project window: {proj.start_date} → {proj.end_date}
                </div>
              ):null
            })()}
            <div style={{padding:16,display:'flex',flexDirection:'column',gap:14,flex:1}}>
              <PanelField selected={selected} upd={upd} label="Item Name" field="name"/>
              <PanelField selected={selected} upd={upd} label="Description" field="description" type="textarea"/>
              <EditableDropdown field="priority" value={selected.priority} options={PRIORITIES} setOptions={null} label="Priority"/>
              <EditableDropdown field="team" value={selected.team} options={TEAMS} setOptions={null} label="Dev Team"/>
              <EditableDropdown field="swimlane" value={selected.swimlane} options={swimlaneOpts} setOptions={setSwimOpts} label="Swimlane"/>
              <EditableDropdown field="status" value={selected.status} options={statusOpts} setOptions={setStatusOpts} label="Status"/>
              <EditableDropdown field="effort" value={selected.effort} options={EFFORTS} setOptions={null} label="Effort"/>
              <EditableDropdown field="request_type" value={selected.request_type} options={rtOpts} setOptions={setRtOpts} label="Request Type"/>
              <EditableDropdown field="region" value={selected.region} options={regionOpts} setOptions={setRegionOpts} label="Region"/>
              <EditableDropdown field="vendor" value={selected.vendor} options={vendors} setOptions={setVendors} label="Vendor"/>
              <EditableDropdown field="parent_project" value={selected.parent_project} options={parentOpts} setOptions={null} label="Parent Project"/>
              <PanelField selected={selected} upd={upd} label="Owner" field="owner"/>
              <PanelField selected={selected} upd={upd} label="Dependency" field="dependency"/>
              <PanelField selected={selected} upd={upd} label="Vendor Delivery Date" field="vendor_delivery_date" type="date"/>
              <PanelField selected={selected} upd={upd} label="Notes" field="notes" type="textarea"/>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>RICE SCORING</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <PanelField selected={selected} upd={upd} label="Reach (1-5)" field="reach" type="number"/>
                  <PanelField selected={selected} upd={upd} label="Impact (1-5)" field="impact" type="number"/>
                </div>
                <div style={{marginTop:10}}>
                  <EditableDropdown field="confidence" value={selected.confidence?`${Math.round(selected.confidence*100)}%`:''} options={['20%','50%','80%','100%']} setOptions={null} label="Confidence"/>
                </div>
                {rice(selected)&&(
                  <div style={{marginTop:10,background:'#1E3048',borderRadius:8,padding:'10px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:12,color:'#7A8FA6'}}>RICE Score</span>
                    <span style={{fontSize:18,fontWeight:700,color:'#27AE60'}}>{rice(selected)}</span>
                  </div>
                )}
              </div>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>ROADMAP</div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <PanelField selected={selected} upd={upd} label="Start Date" field="start_date" type="date"/>
                  <PanelField selected={selected} upd={upd} label="End Date" field="end_date" type="date"/>
                </div>
              </div>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>SCORING</div>
                <PanelField selected={selected} upd={upd} label="Manual Rank" field="manual_rank" type="number"/>
              </div>
            </div>
            <div style={{padding:'12px 16px',borderTop:'1px solid #243447',flexShrink:0}}>
              <button onClick={()=>deleteItem(selected.id)} style={{width:'100%',background:'transparent',border:'1px solid #C0392B',color:'#C0392B',borderRadius:6,padding:'8px',fontSize:12,cursor:'pointer',fontWeight:600}}>Delete Item</button>
            </div>
          </div>
        )}
      </div>

      <div style={{display:'flex',gap:24,padding:'8px 20px',borderTop:'1px solid #243447',background:'#162436',fontSize:12,color:'#7A8FA6',flexShrink:0}}>
        <span>{filtered.length} of {items.length} items</span>
        <span>P1: {items.filter(i=>i.priority==='P1').length}</span>
        <span>P2: {items.filter(i=>i.priority==='P2').length}</span>
        <span style={{color:fc>0?'#C8973A':'#7A8FA6'}}>🚩 {fc} flagged</span>
        {selected&&<span style={{marginLeft:'auto',color:'#C8973A'}}>Editing: {selected.item_id}</span>}
      </div>

      {sac&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:24,width:320}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:16}}>Add Custom Column</div>
            <input autoFocus placeholder="Column name..." value={ncn} onChange={e=>setNcn(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&ncn.trim()){setCc(p=>[...p,{key:ncn.toLowerCase().replace(/\s+/g,'_'),label:ncn}]);setNcn('');setSac(false)};if(e.key==='Escape')setSac(false)}}
              style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
            <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}>
              <button onClick={()=>setSac(false)} style={sel}>Cancel</button>
              <button onClick={()=>{if(ncn.trim()){setCc(p=>[...p,{key:ncn.toLowerCase().replace(/\s+/g,'_'),label:ncn}]);setNcn('');setSac(false)}}} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'6px 16px',fontWeight:700,cursor:'pointer'}}>Add</button>
            </div>
          </div>
        </div>
      )}

      {ai&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:480,maxHeight:'80vh',overflowY:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:20}}>New Backlog Item</div>
            {[['Item Name','name'],['Description','description']].map(([label,field])=>(
              <div key={field} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>{label}</div>
                <input value={ni[field]} onChange={e=>setNi(p=>({...p,[field]:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
            ))}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              {[['Priority','priority',PRIORITIES],['Team','team',TEAMS],['Swimlane','swimlane',swimlaneOpts],['Status','status',statusOpts],['Effort','effort',EFFORTS],['Request Type','request_type',rtOpts],['Region','region',regionOpts],['Vendor','vendor',vendors]].map(([label,field,opts])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>{label}</div>
                  <select value={ni[field]} onChange={e=>setNi(p=>({...p,[field]:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'6px 8px',fontSize:12}}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button onClick={()=>setAi(false)} style={sel}>Cancel</button>
              <button onClick={addIt} disabled={sav} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>{sav?'Saving...':'Add Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ROADMAP ───────────────────────────────────────────────────────────────
function Roadmap({items,setItems,projects,setProjects,milestones}:{items:any[],projects:any[],setItems:any,setProjects:any,milestones:any[]}) {
  const [view,setView]=useState('quarter')
  const [ft,setFt]=useState('All')
  const [zoom,setZoom]=useState(1)
  const [editing,setEditing]=useState(null)
  const [editForm,setEditForm]=useState({name:'',start_date:'',end_date:'',roadmap_color:''})
  const [saving,setSaving]=useState(false)
  const [sortBy,setSortBy]=useState('start_date')
  const [sortDir,setSortDir]=useState('asc')
  const [collapsed,setCollapsed]=useState(null)
  const [showSettings,setShowSettings]=useState(false)
  const [codeFreezeStart,setCodeFreezeStart]=useState('2026-10-01')
  const [codeFreezeEnd,setCodeFreezeEnd]=useState('2026-12-31')
  const [backlogOpen,setBacklogOpen]=useState(true)
  const [discussionOpen,setDiscussionOpen]=useState(true)
  const [discussNoteId,setDiscussNoteId]=useState(null)
  const [discussNoteDraft,setDiscussNoteDraft]=useState('')
  const [projectsPanelOpen,setProjectsPanelOpen]=useState(true)
  const [backlogSectionOpen,setBacklogSectionOpen]=useState(true)
  const [dragOverProject,setDragOverProject]=useState(null)
  const [dragOverCol,setDragOverCol]=useState(null)
  const [draggingBar,setDraggingBar]=useState(null)
  const [draggingEdge,setDraggingEdge]=useState(null)
  const [draggingProjectOver,setDraggingProjectOver]=useState(false)
  const [dragTooltip,setDragTooltip]=useState(null)
  const [backlogHover,setBacklogHover]=useState(false)
  const ganttRef=useRef(null)
  const labelRef=useRef(null)
  const barDragState=useRef(null)
  const today=new Date()

  const filteredItems=items.filter(i=>ft==='All'||i.team===ft)
  const withDates=filteredItems.filter(i=>i.start_date&&i.end_date)
  const noDates=filteredItems.filter(i=>!i.start_date||!i.end_date)
  const uncommitted=[...noDates].sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    // P1/P2 always stay at top
    if(pa<=1&&pb>1) return -1
    if(pa>1&&pb<=1) return 1
    if(pa<=1&&pb<=1) return pa-pb
    // Everything else — committed rank order
    const am=a.committed_priority??a.sort_order??999,bm=b.committed_priority??b.sort_order??999
    return am-bm
  })
  const filteredProjects=projects.filter(p=>ft==='All'||p.team===ft)
  const flaggedItems=items.filter(i=>i.flagged)

  async function saveDiscussNote(item){
    setItems((prev:any[])=>prev.map(i=>i.id===item.id?{...i,notes:discussNoteDraft}:i))
    setDiscussNoteId(null)
    await supabase.from('items').update({notes:discussNoteDraft}).eq('id',item.id)
  }

  function ragColor(rag){return rag==='Red'?'#C0392B':rag==='Amber'?'#D4820A':'#27AE60'}
  function ragBg(rag){return rag==='Red'?'rgba(192,57,43,0.14)':rag==='Amber'?'rgba(212,130,10,0.14)':'rgba(39,174,96,0.08)'}
  function ragBorder(rag){return rag==='Red'?'rgba(192,57,43,0.6)':rag==='Amber'?'rgba(212,130,10,0.6)':'rgba(39,174,96,0.4)'}

  const groups=filteredProjects.map(project=>{
    const children=withDates.filter(i=>i.parent_project===project.name)
    const violations=children.filter(i=>{
      if(!project.start_date||!project.end_date) return false
      return new Date(i.start_date+'T12:00:00')<new Date(project.start_date+'T12:00:00')||new Date(i.end_date+'T12:00:00')>new Date(project.end_date+'T12:00:00')
    })
    return{...project,items:children,violations,bar_start:project.start_date,bar_end:project.end_date}
  }).filter((g:any)=>g.items.length>0||(g.bar_start&&g.bar_end)).sort((a:any,b:any)=>{
    let av,bv
    if(sortBy==='start_date'){av=new Date((a.bar_start||'9999')+'T12:00:00');bv=new Date((b.bar_start||'9999')+'T12:00:00')}
    else if(sortBy==='end_date'){av=new Date((a.bar_end||'9999')+'T12:00:00');bv=new Date((b.bar_end||'9999')+'T12:00:00')}
    else if(sortBy==='name'){av=a.name.toLowerCase();bv=b.name.toLowerCase()}
    else if(sortBy==='rag'){av=['Red','Amber','Green'].indexOf(a.rag);bv=['Red','Amber','Green'].indexOf(b.rag)}
    else{av=new Date((a.bar_start||'9999')+'T12:00:00');bv=new Date((b.bar_start||'9999')+'T12:00:00')}
    if(av<bv) return sortDir==='asc'?-1:1
    if(av>bv) return sortDir==='asc'?1:-1
    return 0
  })

  const orphans=withDates.filter(i=>!i.parent_project||!projects.find(p=>p.name===i.parent_project))
  const totalViolations=groups.reduce((acc,g:any)=>acc+g.violations.length,0)

  function getCollapsed(){
    if(collapsed===null){
      const all={}
      groups.forEach((g:any)=>all[g.id]=true)
      all['__nodates']=true;all['__orphans']=true
      return all
    }
    return collapsed
  }
  function toggleCollapse(key){const c=getCollapsed();setCollapsed({...c,[key]:!c[key]})}
  function collapseAll(){const all={};groups.forEach((g:any)=>all[g.id]=true);all['__nodates']=true;all['__orphans']=true;setCollapsed(all)}
  function expandAll(){setCollapsed({})}

  function buildCols(){
    const cfStart=new Date(codeFreezeStart+'T12:00:00'),cfEnd=new Date(codeFreezeEnd+'T12:00:00')
    function isCF(s,e){return s<=cfEnd&&e>=cfStart}
    const allDates=[
      ...items.filter(i=>i.start_date).map(i=>new Date(i.start_date+'T12:00:00')),
      ...items.filter(i=>i.end_date).map(i=>new Date(i.end_date+'T12:00:00')),
      ...projects.filter(p=>p.start_date).map(p=>new Date(p.start_date+'T12:00:00')),
      ...projects.filter(p=>p.end_date).map(p=>new Date(p.end_date+'T12:00:00')),
    ]
    const earliest=allDates.length>0?new Date(Math.min(...allDates.map(d=>d.getTime()))):new Date()
    const latest=allDates.length>0?new Date(Math.max(...allDates.map(d=>d.getTime()))):new Date()
    const rangeStart=new Date(earliest);rangeStart.setMonth(rangeStart.getMonth()-3)
    const rangeEnd=new Date(latest);rangeEnd.setMonth(rangeEnd.getMonth()+3)
    const qStart=new Date(rangeStart.getFullYear(),Math.floor(rangeStart.getMonth()/3)*3,1)
    const qEnd=new Date(rangeEnd.getFullYear(),Math.floor(rangeEnd.getMonth()/3)*3+3,0)
    if(view==='week'){
      const cols=[];let d=new Date(qStart)
      while(d<=qEnd){const we=new Date(d);we.setDate(we.getDate()+6);cols.push({key:d.toISOString(),label:`${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`,start:new Date(d),end:we,isCodeFreeze:isCF(new Date(d),we)});d.setDate(d.getDate()+7)}
      return cols
    }else if(view==='month'){
      const cols=[];let d=new Date(qStart.getFullYear(),qStart.getMonth(),1)
      while(d<=qEnd){const ms=new Date(d.getFullYear(),d.getMonth(),1);const me=new Date(d.getFullYear(),d.getMonth()+1,0);cols.push({key:`${d.getFullYear()}-${d.getMonth()}`,label:d.toLocaleString('default',{month:'short',year:'2-digit'}),start:ms,end:me,isCodeFreeze:isCF(ms,me)});d.setMonth(d.getMonth()+1)}
      return cols
    }else if(view==='quarter'){
      const cols=[];let y=qStart.getFullYear();let q=Math.floor(qStart.getMonth()/3)
      const endY=qEnd.getFullYear();const endQ=Math.floor(qEnd.getMonth()/3)
      while(y<endY||(y===endY&&q<=endQ)){
        const ms=new Date(y,q*3,1);const me=new Date(y,q*3+3,0)
        const fy=ms.getMonth()<3?y:y+1
        const fyq=q===0?4:q===1?1:q===2?2:3
        const qLabel=`Q${fyq} FY${String(fy).slice(2)}`;const cf=isCF(ms,me)
        cols.push({key:`${y}-Q${q}`,label:cf?`${qLabel} 🔒`:qLabel,start:ms,end:me,isCodeFreeze:cf})
        q++;if(q>3){q=0;y++}
      }
      return cols
    }else{
      const cols=[];let y=qStart.getFullYear()
      while(y<=qEnd.getFullYear()+1){
        const ms=new Date(y,3,1);const me=new Date(y+1,2,31)
        if(me>=qStart&&ms<=qEnd){cols.push({key:`FY${y+1}`,label:`FY ${y+1}`,start:ms,end:me,isCodeFreeze:false})}
        y++
      }
      return cols
    }
  }

  const cols=buildCols()
  const totalStart=cols[0]?.start
  const totalEnd=cols[cols.length-1]?.end
  const totalMs=totalEnd.getTime()-totalStart.getTime()
  const COL_W=view==='week'?60*zoom:view==='month'?100*zoom:view==='quarter'?200*zoom:300*zoom
  const TOTAL_W=cols.length*COL_W

  function pct(dateStr){return(new Date(dateStr+'T12:00:00').getTime()-totalStart.getTime())/totalMs*TOTAL_W}
  function barPx(s,e){return Math.max(2,(new Date(e+'T12:00:00').getTime()-totalStart.getTime())/totalMs*TOTAL_W-pct(s))}
  function todayPx(){return Math.max(0,Math.min(TOTAL_W,(today.getTime()-totalStart.getTime())/totalMs*TOTAL_W))}
  function dateToStr(d){return d.toISOString().split('T')[0]}
  function fmtD(str){return new Date(str+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})}

  function handleGanttDragOver(e,projectName,col){e.preventDefault();setDragOverProject(projectName);setDragOverCol(col.key)}
  function handleGanttDragLeave(){setDragOverProject(null);setDragOverCol(null)}
  async function handleGanttDrop(e,projectName,col){
    e.preventDefault()
    const draggedProjectId=e.dataTransfer.getData('projectId')
    if(draggedProjectId){
      const updates={start_date:dateToStr(col.start),end_date:dateToStr(col.end)}
      setProjects((prev:any[])=>prev.map(p=>p.id===draggedProjectId?{...p,...updates}:p))
      await supabase.from('projects').update(updates).eq('id',draggedProjectId)
      setDragOverProject(null);setDragOverCol(null);return
    }
    const itemId=e.dataTransfer.getData('itemId')
    if(!itemId){setDragOverProject(null);setDragOverCol(null);return}
    const updates={start_date:dateToStr(col.start),end_date:dateToStr(col.end),parent_project:projectName}
    setItems(items.map(i=>i.id===itemId?{...i,...updates}:i))
    await supabase.from('items').update(updates).eq('id',itemId)
    setDragOverProject(null);setDragOverCol(null)
  }

  function startBarDrag(e,item,type){
    e.preventDefault();e.stopPropagation()
    const gantt=ganttRef.current as any;if(!gantt) return
    barDragState.current={item,type,startX:e.clientX,origStart:item.start_date,origEnd:item.end_date,containerWidth:TOTAL_W}
    setDraggingBar(item.id);if(type!=='move') setDraggingEdge(type)
  }
  function startProjectBarDrag(e,project,type){
    e.preventDefault();e.stopPropagation()
    barDragState.current={item:project,type,startX:e.clientX,origStart:project.start_date,origEnd:project.end_date,containerWidth:TOTAL_W,isProject:true}
    setDraggingBar(project.id);if(type!=='move') setDraggingEdge(type)
  }

  useEffect(()=>{
    function onMouseMove(e){
      const state=barDragState.current;if(!state) return
      const dx=e.clientX-state.startX
      const daysTotal=totalMs/(1000*60*60*24)
      const pxPerDay=state.containerWidth/daysTotal
      const daysDelta=Math.round(dx/pxPerDay)
      const origStartMs=new Date(state.origStart+'T12:00:00').getTime()
      const origEndMs=new Date(state.origEnd+'T12:00:00').getTime()
      const DAY=1000*60*60*24
      let newStart=state.origStart,newEnd=state.origEnd
      if(state.type==='move'){newStart=dateToStr(new Date(origStartMs+daysDelta*DAY));newEnd=dateToStr(new Date(origEndMs+daysDelta*DAY))}
      else if(state.type==='left'){const ns=new Date(origStartMs+daysDelta*DAY);if(ns<new Date(state.origEnd+'T12:00:00'))newStart=dateToStr(ns)}
      else if(state.type==='right'){const ne=new Date(origEndMs+daysDelta*DAY);if(ne>new Date(state.origStart+'T12:00:00'))newEnd=dateToStr(ne)}
      if(state.isProject){setProjects((prev:any[])=>prev.map(p=>p.id===state.item.id?{...p,start_date:newStart,end_date:newEnd}:p))}
      else{setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,start_date:newStart,end_date:newEnd}:i))}
      setDragTooltip({x:e.clientX,y:e.clientY,start:newStart,end:newEnd})
      const el=document.elementFromPoint(e.clientX,e.clientY)
      setBacklogHover(!!el?.closest('[data-backlog-panel]'))
    }
    async function onMouseUp(e){
      const state=barDragState.current;if(!state) return
      const el=document.elementFromPoint(e.clientX,e.clientY)
      const overBacklog=el?.closest('[data-backlog-panel]')
      if(state.isProject){
        if(overBacklog){
          setProjects((prev:any[])=>prev.map(p=>p.id===state.item.id?{...p,start_date:null,end_date:null}:p))
          await supabase.from('projects').update({start_date:null,end_date:null}).eq('id',state.item.id)
        }else{
          const cp=projects.find(p=>p.id===state.item.id)
          if(cp) await supabase.from('projects').update({start_date:cp.start_date,end_date:cp.end_date}).eq('id',state.item.id)
        }
        barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false);return
      }
      const currentItem=items.find(i=>i.id===state.item.id)
      if(!currentItem){barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false);return}
      if(overBacklog){
        setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,start_date:null,end_date:null}:i))
        await supabase.from('items').update({start_date:null,end_date:null}).eq('id',state.item.id)
        barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false);return
      }
      const projectRow=el?.closest('[data-project-name]')
      const newProjectName=projectRow?.getAttribute('data-project-name')
      const updates:any={start_date:currentItem.start_date,end_date:currentItem.end_date}
      if(newProjectName&&newProjectName!==currentItem.parent_project){
        updates.parent_project=newProjectName
        setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,parent_project:newProjectName}:i))
      }
      await supabase.from('items').update(updates).eq('id',state.item.id)
      barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);setDragTooltip(null);setBacklogHover(false)
    }
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp)}
  },[items,projects,totalMs,TOTAL_W])

  async function saveEdit(){
    if(!editing) return;setSaving(true)
    await supabase.from('items').update({start_date:editForm.start_date,end_date:editForm.end_date,roadmap_color:editForm.roadmap_color,name:editForm.name}).eq('id',editing.id)
    setSaving(false);setEditing(null)
  }

  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const ROW_H=40,PARENT_H=52

  function CfShading(){
    return(
      <>{cols.map((col,ci)=>col.isCodeFreeze&&(
        <div key={`cf-${col.key}`} style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,background:'rgba(192,57,43,0.07)',zIndex:0,borderLeft:'1px dashed rgba(192,57,43,0.3)',borderRight:'1px dashed rgba(192,57,43,0.3)',pointerEvents:'none'}}/>
      ))}</>
    )
  }

  function GanttBar({item,groupColor,isViolation}:{item:any,groupColor:string,isViolation:boolean}){
    const isDragging=draggingBar===item.id
    const itemColor=item.roadmap_color||groupColor
    const leftPx=pct(item.start_date)
    const widthPx=barPx(item.start_date,item.end_date)
    return(
      <div style={{position:'absolute',top:6,height:28,left:leftPx,width:widthPx,zIndex:3,minWidth:8,opacity:isDragging?0.6:1}}>
        <div onMouseDown={e=>startBarDrag(e,item,'left')} style={{position:'absolute',left:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'4px 0 0 4px'}}/>
        <div draggable onDragStart={e=>{e.dataTransfer.setData('itemId',item.id);e.dataTransfer.effectAllowed='move'}}
          onMouseDown={e=>startBarDrag(e,item,'move')}
          onClick={()=>{if(!draggingBar){setEditing(item);setEditForm({name:item.name,start_date:item.start_date,end_date:item.end_date,roadmap_color:item.roadmap_color||groupColor})}}}
          style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:isViolation?'#C0392B':itemColor,borderRadius:5,display:'flex',alignItems:'center',padding:'0 12px',fontSize:10,fontWeight:600,color:'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,cursor:isDragging?'grabbing':'grab',border:isViolation?'1px dashed #ff6b6b':'none',boxShadow:isDragging?'0 4px 12px rgba(0,0,0,0.5)':'none'}}>
          {item.name}
        </div>
        <div onMouseDown={e=>startBarDrag(e,item,'right')} style={{position:'absolute',right:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'0 4px 4px 0'}}/>
      </div>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      {/* Controls */}
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',alignItems:'center',background:'#162436',flexWrap:'wrap' as const}}>
        <select value={ft} onChange={e=>setFt(e.target.value)} style={sel}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        <div style={{display:'flex',gap:3}}>
          {[['week','Week'],['month','Month'],['quarter','Quarter'],['year','Year']].map(([k,label])=>(
            <button key={k} onClick={()=>setView(k)} style={{background:view===k?'#C8973A':'#1E3048',color:view===k?'#0D1B2A':'#7A8FA6',border:`1px solid ${view===k?'#C8973A':'#243447'}`,borderRadius:6,padding:'4px 12px',fontSize:12,cursor:'pointer',fontWeight:view===k?700:400}}>{label}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:12,color:'#7A8FA6'}}>Sort</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...sel,fontSize:11,padding:'4px 8px'}}>
            <option value="start_date">Start Date</option>
            <option value="end_date">End Date</option>
            <option value="name">Name</option>
            <option value="rag">RAG Status</option>
          </select>
          <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} style={{...sel,fontSize:13,padding:'3px 10px'}}>{sortDir==='asc'?'↑':'↓'}</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:12,color:'#7A8FA6'}}>Zoom</span>
          <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={e=>setZoom(parseFloat(e.target.value))} style={{width:90,accentColor:'#C8973A'}}/>
          <button onClick={()=>setZoom(1)} style={{...sel,fontSize:11,padding:'3px 8px'}}>Fit</button>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={expandAll} style={{...sel,fontSize:11,padding:'3px 10px'}}>Expand All</button>
          <button onClick={collapseAll} style={{...sel,fontSize:11,padding:'3px 10px'}}>Collapse All</button>
        </div>
        <button onClick={()=>setShowSettings(true)} style={{...sel,fontSize:11,padding:'4px 10px',color:'#E74C3C',border:'1px solid #E74C3C'}}>🔒 Code Freeze</button>
        {totalViolations>0&&<div style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'4px 10px',fontSize:11,color:'#E74C3C'}}>⚠️ {totalViolations} violation{totalViolations!==1?'s':''}</div>}
        <div style={{display:'flex',gap:10,fontSize:11,marginLeft:'auto',color:'#7A8FA6',alignItems:'center'}}>
          <span>{groups.length} projects · {withDates.length} committed · {uncommitted.length} backlog</span>
          <span style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:2,height:10,background:'#E74C3C',display:'inline-block'}}/> Today</span>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Discussion panel */}
        <div style={{borderRight:'1px solid #243447',background:'#162436',flexShrink:0,display:'flex',flexDirection:'column',transition:'width 0.2s',width:discussionOpen?(discussNoteId?300:200):32,minWidth:32,overflow:'hidden'}}>
          <button onClick={()=>setDiscussionOpen(o=>!o)} style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 8px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,whiteSpace:'nowrap' as const,width:'100%',flexShrink:0}}>
            <span style={{fontSize:12}}>{discussionOpen?'◀':'▶'}</span>
            {discussionOpen&&<span>🚩 DISCUSSION ({flaggedItems.length})</span>}
          </button>
          {discussionOpen&&(
            <div style={{overflowY:'auto',flex:1,padding:10}}>
              {flaggedItems.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',padding:4}}>No flagged items</div>}
              {flaggedItems.map(item=>{
                const noteOpen=discussNoteId===item.id
                return(
                <div key={item.id}
                  onClick={()=>{if(!noteOpen){setDiscussNoteId(item.id);setDiscussNoteDraft(item.notes||'')}}}
                  style={{background:'#1E3048',border:noteOpen?'1px solid #C8973A':'1px solid rgba(200,151,58,0.3)',borderRadius:6,padding:'6px 8px',marginBottom:6,cursor:noteOpen?'default':'pointer'}}>
                  <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                  <div style={{fontSize:11,color:'#F4F6F8',marginTop:2,lineHeight:1.3}}>{item.name}</div>
                  <div style={{marginTop:4,display:'flex',alignItems:'center',gap:6}}>
                    <span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 6px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                    {item.notes&&!noteOpen&&<span title="Has notes" style={{fontSize:10}}>📝</span>}
                  </div>
                  {item.notes&&!noteOpen&&(
                    <div style={{fontSize:10,color:'#7A8FA6',fontStyle:'italic',marginTop:4,lineHeight:1.35,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical' as const}}>{item.notes}</div>
                  )}
                  {noteOpen&&(
                    <div style={{marginTop:6}} onClick={e=>e.stopPropagation()}>
                      <textarea value={discussNoteDraft} onChange={e=>setDiscussNoteDraft(e.target.value)} rows={5} autoFocus placeholder="Discussion notes..."
                        style={{width:'100%',boxSizing:'border-box' as const,background:'#0D1B2A',border:'1px solid #243447',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:6,resize:'vertical' as const,fontFamily:'inherit',lineHeight:1.4}}/>
                      <div style={{display:'flex',gap:6,marginTop:4,justifyContent:'flex-end'}}>
                        <button onClick={()=>setDiscussNoteId(null)} style={{background:'none',border:'1px solid #243447',borderRadius:4,color:'#7A8FA6',fontSize:10,padding:'3px 8px',cursor:'pointer'}}>Cancel</button>
                        <button onClick={()=>saveDiscussNote(item)} style={{background:'#C8973A',border:'none',borderRadius:4,color:'#0D1B2A',fontSize:10,fontWeight:700,padding:'3px 10px',cursor:'pointer'}}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Gantt — frozen label + scrollable bars */}
        <div style={{flex:1,display:'flex',overflow:'hidden',position:'relative',userSelect:draggingBar?'none':'auto' as const}}>

          {/* Frozen label column */}
          <div ref={labelRef} style={{width:220,flexShrink:0,overflowY:'hidden',borderRight:'1px solid #243447',zIndex:6,background:'#0D1B2A',boxShadow:'4px 0 12px rgba(0,0,0,0.6)',display:'flex',flexDirection:'column'}}>
            <div style={{height:36,flexShrink:0,background:'#162436',borderBottom:'1px solid #243447',padding:'0 12px',fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,display:'flex',alignItems:'center'}}>
              PROJECT / ITEM
            </div>
            <div style={{flex:1,overflowY:'hidden'}}>
              {groups.map((group:any)=>{
                const isCollapsed=getCollapsed()[group.id]
                const childItems=[...group.items].sort((a,b)=>(!a.start_date?1:!b.start_date?-1:new Date(a.start_date+'T12:00:00').getTime()-new Date(b.start_date+'T12:00:00').getTime()))
                const rc=ragColor(group.rag)
                const rb=ragBg(group.rag)
                const rbd=ragBorder(group.rag)
                return(
                  <div key={group.id}>
                    <div style={{height:PARENT_H,background:rb,borderBottom:'1px solid #243447',borderTop:`2px solid ${rbd}`,display:'flex',alignItems:'center',padding:'0 8px',gap:6}}>
                      <button onClick={()=>toggleCollapse(group.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#C8973A',fontSize:14,padding:'2px 4px',lineHeight:1,flexShrink:0}}>
                        {isCollapsed?'▶':'▼'}
                      </button>
                      <div style={{overflow:'hidden',flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
                          <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:110}}>{group.name}</span>
                          <span style={{fontSize:10,color:rc,fontWeight:700,flexShrink:0}}>{group.rag==='Green'?'🟢':group.rag==='Amber'?'🟡':'🔴'}</span>
                          {group.violations.length>0&&<span style={{fontSize:9,color:'#E74C3C',flexShrink:0}}>⚠️</span>}
                        </div>
                        <div style={{fontSize:9,color:'#7A8FA6'}}>{childItems.length} committed · {group.status}</div>
                      </div>
                    </div>
                    {!isCollapsed&&childItems.map((item,idx)=>{
                      const isViolation=!!group.violations.find((v:any)=>v.id===item.id)
                      return(
                        <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:isViolation?'rgba(192,57,43,0.05)':idx%2===0?'#0D1B2A':'#111D2C',display:'flex',alignItems:'center',padding:'0 8px 0 28px',gap:6}}>
                          <div style={{width:1,height:20,background:'#243447',flexShrink:0}}/>
                          <span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700,flexShrink:0}}>{item.priority}</span>
                          <div style={{overflow:'hidden'}}>
                            <div style={{fontSize:11,color:isViolation?'#E74C3C':'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:130}}>{item.name}{isViolation?' ⚠️':''}</div>
                            <div style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {orphans.length>0&&(
                <div>
                  <div style={{height:PARENT_H,background:'rgba(122,143,166,0.08)',borderBottom:'1px solid #243447',borderTop:'2px solid #243447',display:'flex',alignItems:'center',padding:'0 8px',gap:8}}>
                    <button onClick={()=>toggleCollapse('__orphans')} style={{background:'none',border:'none',cursor:'pointer',color:'#7A8FA6',fontSize:14,padding:'2px 4px',lineHeight:1,flexShrink:0}}>
                      {getCollapsed()['__orphans']?'▶':'▼'}
                    </button>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:'#7A8FA6'}}>No Project Assigned</div>
                      <div style={{fontSize:10,color:'#7A8FA6'}}>{orphans.length} items</div>
                    </div>
                  </div>
                  {!getCollapsed()['__orphans']&&orphans.map((item,idx)=>(
                    <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:idx%2===0?'#0D1B2A':'#111D2C',display:'flex',alignItems:'center',padding:'0 8px 0 28px',gap:6}}>
                      <span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                      <div style={{overflow:'hidden'}}>
                        <div style={{fontSize:11,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:140}}>{item.name}</div>
                        <div style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{height:28,borderTop:'1px solid #243447',background:'#162436'}}/>
            </div>
          </div>

          {/* Scrollable bar area */}
          <div ref={ganttRef}
            style={{flex:1,overflowX:'auto',overflowY:'auto',position:'relative'}}
            onScroll={e=>{if(labelRef.current)(labelRef.current as any).scrollTop=e.currentTarget.scrollTop}}
            onDragOver={e=>{e.preventDefault();setDraggingProjectOver(true)}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDraggingProjectOver(false)}}
            onDrop={async e=>{
              e.preventDefault();setDraggingProjectOver(false)
              const draggedProjectId=e.dataTransfer.getData('projectId')
              if(!draggedProjectId) return
              const gantt=ganttRef.current as any
              const rect=gantt.getBoundingClientRect()
              const x=e.clientX-rect.left+gantt.scrollLeft
              const colIdx=Math.max(0,Math.min(cols.length-1,Math.floor(x/COL_W)))
              const col=cols[colIdx]
              const updates={start_date:dateToStr(col.start),end_date:dateToStr(col.end)}
              setProjects((prev:any[])=>prev.map(p=>p.id===draggedProjectId?{...p,...updates}:p))
              await supabase.from('projects').update(updates).eq('id',draggedProjectId)
            }}>
            {draggingProjectOver&&(
              <div style={{position:'absolute',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(46,134,171,0.08)',border:'3px dashed #2E86AB',borderRadius:8,pointerEvents:'none'}}>
                <div style={{background:'#162436',border:'2px solid #2E86AB',borderRadius:12,padding:'16px 32px',fontSize:14,fontWeight:700,color:'#2E86AB',textAlign:'center' as const}}>
                  <div style={{fontSize:24,marginBottom:8}}>◈</div>Drop to place on roadmap
                </div>
              </div>
            )}
            <div style={{minWidth:TOTAL_W,position:'relative'}}>

              {/* Header */}
              <div style={{display:'flex',position:'sticky',top:0,zIndex:10,background:'#162436',borderBottom:'1px solid #243447',height:36}}>
                {cols.map(col=>(
                  <div key={col.key} style={{width:COL_W,flexShrink:0,borderRight:'1px solid #243447',padding:'6px 4px',fontSize:10,fontWeight:700,color:col.isCodeFreeze?'#E74C3C':'#C8973A',textAlign:'center' as const,overflow:'hidden',whiteSpace:'nowrap' as const,background:col.isCodeFreeze?'rgba(192,57,43,0.12)':'transparent',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                    {col.label}
                    {col.isCodeFreeze&&<div style={{fontSize:8,color:'#E74C3C',marginTop:1}}>CODE FREEZE</div>}
                  </div>
                ))}
              </div>

              {/* Project groups */}
              {groups.map((group:any)=>{
                const isCollapsed=getCollapsed()[group.id]
                const childItems=[...group.items].sort((a,b)=>(!a.start_date?1:!b.start_date?-1:new Date(a.start_date+'T12:00:00').getTime()-new Date(b.start_date+'T12:00:00').getTime()))
                const rc=ragColor(group.rag)
                const rb=ragBg(group.rag)
                const rbd=ragBorder(group.rag)
                return(
                  <div key={group.id} data-project-id={group.id} data-project-name={group.name}>
                    {/* Parent bar row */}
                    <div style={{height:PARENT_H,background:rb,borderBottom:'1px solid #243447',borderTop:`2px solid ${rbd}`,position:'relative'}}>
                      <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.5,zIndex:4,pointerEvents:'none'}}/>
                      <CfShading/>
                      {cols.map((col,ci)=>(
                        <div key={col.key}
                          style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,zIndex:2,background:dragOverProject===group.name&&dragOverCol===col.key?'rgba(200,151,58,0.2)':'transparent'}}
                          onDragOver={e=>handleGanttDragOver(e,group.name,col)}
                          onDragLeave={handleGanttDragLeave}
                          onDrop={e=>handleGanttDrop(e,group.name,col)}/>
                      ))}
                      {group.bar_start&&group.bar_end&&(
                        <div style={{position:'absolute',top:10,height:32,left:pct(group.bar_start),width:barPx(group.bar_start,group.bar_end),zIndex:3,minWidth:8}}>
                          <div onMouseDown={e=>startProjectBarDrag(e,group,'left')} style={{position:'absolute',left:0,top:0,bottom:0,width:10,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'4px 0 0 4px'}}/>
                          <div draggable onDragStart={e=>{e.dataTransfer.setData('projectId',group.id);e.dataTransfer.effectAllowed='move'}}
                            onMouseDown={e=>startProjectBarDrag(e,group,'move')}
                            style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:rc,borderRadius:6,display:'flex',alignItems:'center',padding:'0 14px',fontSize:11,fontWeight:700,color:'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,opacity:draggingBar===group.id?0.7:0.9,border:group.violations.length>0?'2px dashed rgba(255,255,255,0.5)':'none',boxShadow:`0 2px 8px ${rc}55`,cursor:draggingBar===group.id?'grabbing':'grab'}}>
                            {group.rag==='Red'?'🔴':group.rag==='Amber'?'🟡':'🟢'} {group.name}
                            {group.violations.length>0&&<span style={{marginLeft:6,fontSize:10}}>⚠️</span>}
                          </div>
                          <div onMouseDown={e=>startProjectBarDrag(e,group,'right')} style={{position:'absolute',right:0,top:0,bottom:0,width:10,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.2)',borderRadius:'0 4px 4px 0'}}/>
                        </div>
                      )}
                      {milestones.filter(m=>m.project_id===group.id&&m.date).map(m=>{
                        const mPx=pct(m.date)
                        const isPast=new Date(m.date+'T12:00:00')<today
                        return(
                          <div key={m.id} title={`${m.name} — ${fmtD(m.date)}${m.notes?' · '+m.notes:''}`}
                            style={{position:'absolute',top:4,left:mPx,transform:'translateX(-50%)',zIndex:6,pointerEvents:'none'}}>
                            <div style={{width:12,height:12,background:m.completed?'#27AE60':isPast&&!m.completed?'#E74C3C':m.color||'#C8973A',transform:'rotate(45deg)',border:'2px solid #0D1B2A',opacity:isPast&&!m.completed?0.6:1}}/>
                            <div style={{position:'absolute',top:16,left:'50%',transform:'translateX(-50%)',background:'#0D1B2A',border:`1px solid ${m.color||'#C8973A'}`,borderRadius:3,padding:'1px 5px',fontSize:8,color:m.completed?'#27AE60':m.color||'#C8973A',whiteSpace:'nowrap' as const,fontWeight:700,maxWidth:80,overflow:'hidden',textOverflow:'ellipsis'}}>
                              {m.completed?'✓ ':''}{m.name}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Child rows */}
                    {!isCollapsed&&childItems.map((item,idx)=>{
                      const isViolation=!!group.violations.find((v:any)=>v.id===item.id)
                      return(
                        <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:isViolation?'rgba(192,57,43,0.05)':idx%2===0?'#0D1B2A':'#111D2C',position:'relative'}}>
                          <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4,pointerEvents:'none'}}/>
                          <CfShading/>
                          {cols.map((col,ci)=>(
                            <div key={col.key}
                              style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,borderRight:'1px solid rgba(36,52,71,0.4)',background:dragOverProject===group.name&&dragOverCol===col.key?'rgba(200,151,58,0.1)':'transparent'}}
                              onDragOver={e=>handleGanttDragOver(e,group.name,col)}
                              onDragLeave={handleGanttDragLeave}
                              onDrop={e=>handleGanttDrop(e,group.name,col)}/>
                          ))}
                          <GanttBar item={item} groupColor={ragColor(group.rag)} isViolation={isViolation}/>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Orphans */}
              {orphans.length>0&&(
                <div>
                  <div style={{height:PARENT_H,background:'rgba(122,143,166,0.08)',borderBottom:'1px solid #243447',borderTop:'2px solid #243447',position:'relative'}}>
                    <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4,pointerEvents:'none'}}/>
                    {cols.map((col,ci)=>(
                      <div key={col.key}
                        style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,background:dragOverProject===''&&dragOverCol===col.key?'rgba(200,151,58,0.15)':'transparent'}}
                        onDragOver={e=>handleGanttDragOver(e,'',col)}
                        onDragLeave={handleGanttDragLeave}
                        onDrop={e=>handleGanttDrop(e,'',col)}/>
                    ))}
                  </div>
                  {!getCollapsed()['__orphans']&&orphans.map((item,idx)=>(
                    <div key={item.id} style={{height:ROW_H,borderBottom:'1px solid #243447',background:idx%2===0?'#0D1B2A':'#111D2C',position:'relative'}}>
                      <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4,pointerEvents:'none'}}/>
                      <CfShading/>
                      {cols.map((col,ci)=>(
                        <div key={col.key}
                          style={{position:'absolute',top:0,bottom:0,left:ci*COL_W,width:COL_W,borderRight:'1px solid rgba(36,52,71,0.4)',background:dragOverProject===''&&dragOverCol===col.key?'rgba(200,151,58,0.1)':'transparent'}}
                          onDragOver={e=>handleGanttDragOver(e,'',col)}
                          onDragLeave={handleGanttDragLeave}
                          onDrop={e=>handleGanttDrop(e,'',col)}/>
                      ))}
                      <GanttBar item={item} groupColor='#7A8FA6' isViolation={false}/>
                    </div>
                  ))}
                </div>
              )}

              {/* Today footer */}
              <div style={{height:28,borderTop:'1px solid #243447',background:'#162436',position:'relative'}}>
                <div style={{position:'absolute',top:0,bottom:0,left:todayPx(),width:2,background:'#E74C3C',opacity:0.6}}/>
                <div style={{position:'absolute',top:4,left:todayPx()+6,fontSize:10,color:'#E74C3C',fontWeight:700,whiteSpace:'nowrap' as const}}>Today — {today.toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Planning Panel */}
        <div
          data-backlog-panel="true"
          style={{borderLeft:'1px solid #243447',background:backlogHover?'rgba(200,151,58,0.05)':'#162436',flexShrink:0,display:'flex',flexDirection:'column',transition:'width 0.2s, background 0.2s',width:backlogOpen?280:32,minWidth:32,overflow:'hidden',outline:backlogHover?'2px dashed #C8973A':'none'}}
          onDragOver={e=>{e.preventDefault();setBacklogHover(true)}}
          onDragLeave={()=>setBacklogHover(false)}
          onDrop={async e=>{
            e.preventDefault();setBacklogHover(false)
            const itemId=e.dataTransfer.getData('itemId')
            if(itemId){setItems((prev:any[])=>prev.map(i=>i.id===itemId?{...i,start_date:null,end_date:null}:i));await supabase.from('items').update({start_date:null,end_date:null}).eq('id',itemId);return}
            const projectId=e.dataTransfer.getData('projectId')
            if(projectId){setProjects((prev:any[])=>prev.map(p=>p.id===projectId?{...p,start_date:null,end_date:null}:p));await supabase.from('projects').update({start_date:null,end_date:null}).eq('id',projectId)}
          }}>
          <button onClick={()=>setBacklogOpen(o=>!o)} style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 8px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,whiteSpace:'nowrap' as const,width:'100%',flexShrink:0}}>
            <span style={{fontSize:12}}>{backlogOpen?'▶':'◀'}</span>
            {backlogOpen&&<span>PLANNING PANEL</span>}
          </button>
          {backlogOpen&&(
            <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>
              {backlogHover&&<div style={{background:'rgba(200,151,58,0.15)',border:'2px dashed #C8973A',borderRadius:8,padding:'10px 8px',textAlign:'center' as const,margin:8,fontSize:11,color:'#C8973A',fontWeight:700}}>Drop here to remove from roadmap</div>}
              {/* Projects */}
              <div style={{borderBottom:'1px solid #243447',flexShrink:0}}>
                <button onClick={()=>setProjectsPanelOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',padding:'10px 12px',display:'flex',alignItems:'center',gap:6,color:'#2E86AB',fontSize:11,fontWeight:700,letterSpacing:1,width:'100%',whiteSpace:'nowrap' as const}}>
                  <span style={{fontSize:10}}>{projectsPanelOpen?'▼':'▶'}</span>
                  <span>◈ PROJECTS ({filteredProjects.filter(p=>!p.start_date||!p.end_date).length})</span>
                  <span style={{marginLeft:'auto',fontSize:9,color:'#7A8FA6',fontWeight:400}}>drag to set dates</span>
                </button>
                {projectsPanelOpen&&(
                  <div style={{padding:'0 8px 10px'}}>
                    {filteredProjects.filter(p=>!p.start_date||!p.end_date).map(project=>{
                      const rc=ragColor(project.rag)
                      const pclr=pc(project.priority)
                      const childCount=withDates.filter(i=>i.parent_project===project.name).length
                      const totalCount=items.filter(i=>i.parent_project===project.name).length
                      return(
                        <div key={project.id} draggable
                          onDragStart={e=>{e.dataTransfer.setData('projectId',project.id);e.dataTransfer.setData('projectName',project.name);e.dataTransfer.effectAllowed='copy'}}
                          style={{background:'#1E3048',border:'1px solid #243447',borderLeft:`3px solid ${rc}`,borderRadius:6,padding:'8px 10px',marginBottom:6,cursor:'grab',userSelect:'none' as const,transition:'border-color 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor='#2E86AB')}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor='#243447')}>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                            <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{project.priority}</span>
                            <span style={{fontSize:10,color:rc,fontWeight:700}}>{project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':'🔴'}</span>
                            <span style={{fontSize:9,color:'#7A8FA6',marginLeft:'auto'}}>{project.team==='Consumer Experience'?'CE':'OE'}</span>
                          </div>
                          <div style={{fontSize:11,color:'#F4F6F8',fontWeight:600,lineHeight:1.3,marginBottom:3}}>{project.name}</div>
                          <div style={{display:'flex',gap:8,fontSize:9,color:'#7A8FA6'}}>
                            <span>{childCount} committed · {totalCount-childCount} backlog</span>
                            {project.start_date&&project.end_date?<span style={{color:'#27AE60',marginLeft:'auto'}}>✓ dated</span>:<span style={{color:'#D4820A',marginLeft:'auto'}}>no dates</span>}
                          </div>
                        </div>
                      )
                    })}
                    {filteredProjects.filter(p=>!p.start_date||!p.end_date).length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic',padding:'8px 4px'}}>All projects dated ✓</div>}
                  </div>
                )}
              </div>
              {/* Backlog */}
              <div style={{flexShrink:0}}>
                <button onClick={()=>setBacklogSectionOpen(o=>!o)} style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 12px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,width:'100%',whiteSpace:'nowrap' as const}}>
                  <span style={{fontSize:10}}>{backlogSectionOpen?'▼':'▶'}</span>
                  <span>📋 BACKLOG ({uncommitted.length})</span>
                  <span style={{marginLeft:'auto',fontSize:9,color:'#7A8FA6',fontWeight:400}}>drag to commit</span>
                </button>
                {backlogSectionOpen&&(
                  <div style={{padding:'8px 8px 10px'}}>
                    <div style={{fontSize:10,color:'#7A8FA6',marginBottom:8,lineHeight:1.5}}>Drag onto a project row · Drag roadmap bars here to remove</div>
                    {uncommitted.length===0&&!backlogHover&&<div style={{textAlign:'center' as const,padding:16,color:'#7A8FA6',fontSize:11}}><div style={{fontSize:18,marginBottom:6}}>🎯</div>All items committed!</div>}
                    {uncommitted.map(item=>{
                      const pclr=pc(item.priority)
                      const r=rice(item)
                      return(
                        <div key={item.id} draggable
                          onDragStart={e=>{e.dataTransfer.setData('itemId',item.id);e.dataTransfer.effectAllowed='copy'}}
                          style={{background:'#1E3048',border:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:6,cursor:'grab',userSelect:'none' as const,transition:'border-color 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor='#C8973A')}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor='#243447')}>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                            <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                            <span style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</span>
                            {item.effort&&<span style={{fontSize:9,color:'#7A8FA6',marginLeft:'auto'}}>{item.effort}</span>}
                          </div>
                          <div style={{fontSize:11,color:'#F4F6F8',lineHeight:1.3,marginBottom:3}}>{item.name}</div>
                          <div style={{display:'flex',gap:8,fontSize:9,color:'#7A8FA6'}}>
                            {item.wsjf&&<span>WSJF: <span style={{color:'#E8B95A',fontWeight:700}}>{parseFloat(item.wsjf).toFixed(1)}</span></span>}
                            {r&&<span>RICE: <span style={{color:'#27AE60',fontWeight:700}}>{r}</span></span>}
                            {item.swimlane&&<span style={{marginLeft:'auto'}}>{item.swimlane}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag tooltip */}
      {dragTooltip&&(
        <div style={{position:'fixed',left:dragTooltip.x+16,top:dragTooltip.y-44,background:'#0D1B2A',border:'1px solid #C8973A',borderRadius:8,padding:'6px 12px',fontSize:12,color:'#F4F6F8',zIndex:2000,pointerEvents:'none',whiteSpace:'nowrap' as const,boxShadow:'0 4px 16px rgba(0,0,0,0.6)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#C8973A',fontWeight:700}}>{fmtD(dragTooltip.start)}</span>
            <span style={{color:'#7A8FA6'}}>→</span>
            <span style={{color:'#C8973A',fontWeight:700}}>{fmtD(dragTooltip.end)}</span>
            <span style={{color:'#7A8FA6',fontSize:10,marginLeft:4}}>{Math.round((new Date(dragTooltip.end+'T12:00:00').getTime()-new Date(dragTooltip.start+'T12:00:00').getTime())/(1000*60*60*24))}d</span>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:460}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>Edit Item</div>
            <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace',marginBottom:20}}>{editing.item_id} · {editing.parent_project||'No project'}</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Name</div>
              <input value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Start Date</div>
                <input type="date" value={editForm.start_date} onChange={e=>setEditForm(p=>({...p,start_date:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>End Date</div>
                <input type="date" value={editForm.end_date} onChange={e=>setEditForm(p=>({...p,end_date:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:12,boxSizing:'border-box' as const}}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Assign to Project</div>
              <select value={editing.parent_project||''} onChange={async e=>{
                const v=e.target.value
                setEditing({...editing,parent_project:v})
                setItems(items.map(i=>i.id===editing.id?{...i,parent_project:v}:i))
                await supabase.from('items').update({parent_project:v}).eq('id',editing.id)
              }} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 8px',fontSize:12}}>
                <option value="">— No project —</option>
                {projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8}}>Bar Color</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                {COLORS.map(c=><div key={c} onClick={()=>setEditForm(p=>({...p,roadmap_color:c}))} style={{width:28,height:28,borderRadius:6,background:c,cursor:'pointer',border:editForm.roadmap_color===c?'3px solid #F4F6F8':'3px solid transparent'}}/>)}
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'space-between'}}>
              <button onClick={async()=>{
                if(confirm('Remove from roadmap?')){
                  setItems(items.map(i=>i.id===editing.id?{...i,start_date:null,end_date:null}:i))
                  await supabase.from('items').update({start_date:null,end_date:null}).eq('id',editing.id)
                  setEditing(null)
                }
              }} style={{...sel,color:'#E74C3C',border:'1px solid #E74C3C',fontSize:11}}>Remove from Roadmap</button>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setEditing(null)} style={sel}>Cancel</button>
                <button onClick={saveEdit} disabled={saving} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.7:1}}>{saving?'Saving...':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Code freeze settings */}
      {showSettings&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:420}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>🔒 Code Freeze Window</div>
            <div style={{fontSize:12,color:'#7A8FA6',marginBottom:20}}>All views will highlight this date range in red.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Start Date</div>
                <input type="date" value={codeFreezeStart} onChange={e=>setCodeFreezeStart(e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>End Date</div>
                <input type="date" value={codeFreezeEnd} onChange={e=>setCodeFreezeEnd(e.target.value)} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
            </div>
            <div style={{background:'#1E3048',borderRadius:8,padding:12,marginBottom:16,fontSize:12,color:'#7A8FA6'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span>Current window</span>
                <span style={{color:'#E74C3C',fontWeight:700}}>{fmtD(codeFreezeStart)} → {fmtD(codeFreezeEnd)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>Duration</span>
                <span style={{color:'#F4F6F8',fontWeight:700}}>{Math.round((new Date(codeFreezeEnd+'T12:00:00').getTime()-new Date(codeFreezeStart+'T12:00:00').getTime())/(1000*60*60*24))} days</span>
              </div>
            </div>
            <div style={{fontSize:11,color:'#7A8FA6',marginBottom:8}}>Quick set</div>
            <div style={{display:'flex',gap:8,marginBottom:20}}>
              {[['Q3 FY27 (Oct-Dec 26)','2026-10-01','2026-12-31'],['Q3 FY28 (Oct-Dec 27)','2027-10-01','2027-12-31']].map(([label,s,e])=>(
                <button key={label} onClick={()=>{setCodeFreezeStart(s);setCodeFreezeEnd(e)}} style={{flex:1,background:'#1E3048',color:'#7A8FA6',border:'1px solid #243447',borderRadius:6,padding:'6px 8px',fontSize:11,cursor:'pointer'}}>{label}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowSettings(false)} style={sel}>Cancel</button>
              <button onClick={()=>setShowSettings(false)} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function Scoring({items}:{items:any[]}) {
  const [session,setSession]=useState(null)
  const [scores,setScores]=useState({})
  const [method,setMethod]=useState('wsjf')
  const [ft,setFt]=useState('All')
  const [cp,setCp]=useState(false)
  const scorers=['Jos Nazareth','Kurt Lipson','Shaina Groves','Cara Trevino','Nick Mancini','Kirty Ginman']
  const sc2=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2'&&(ft==='All'||i.team===ft))
  function avg(id,field){
    const s=scores[id];if(!s) return null
    const v=Object.values(s).map((x:any)=>parseFloat(x[field])).filter(x=>!isNaN(x))
    if(!v.length) return null
    return(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)
  }
  if(!session) return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:24}}>
      <div style={{fontSize:24,fontWeight:700,color:'#F4F6F8'}}>Start a Scoring Session</div>
      <div style={{color:'#7A8FA6',maxWidth:440,textAlign:'center' as const,lineHeight:1.6}}>Configure your session then share the link with stakeholders.</div>
      <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:400,display:'flex',flexDirection:'column',gap:16}}>
        <div>
          <div style={{fontSize:11,color:'#7A8FA6',marginBottom:6,letterSpacing:1}}>SCORING METHOD</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
            {[['wsjf','WSJF'],['rice','RICE'],['vote','Simple Vote'],['combo','WSJF + RICE']].map(([k,label])=>(
              <button key={k} onClick={()=>setMethod(k)} style={{background:method===k?'#C8973A':'#1E3048',color:method===k?'#0D1B2A':'#7A8FA6',border:`1px solid ${method===k?'#C8973A':'#243447'}`,borderRadius:6,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:method===k?700:400}}>{label}</button>
            ))}
          </div>
        </div>
        <select value={ft} onChange={e=>setFt(e.target.value)} style={{...sel,width:'100%'}}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        <div style={{background:'#1E3048',borderRadius:8,padding:12,fontSize:12,color:'#7A8FA6'}}>{sc2.length} items · P1/P2 excluded</div>
        <button onClick={()=>setSession({method,startedAt:new Date().toLocaleString()})} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:8,padding:12,fontSize:14,fontWeight:700,cursor:'pointer'}}>Start Session →</button>
      </div>
    </div>
  )
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{display:'flex',alignItems:'center',gap:16,padding:'12px 20px',borderBottom:'1px solid #243447',background:'#162436'}}>
        <span style={{fontSize:11,color:'#C8973A',fontWeight:700,letterSpacing:1}}>ACTIVE SESSION</span>
        <span style={{fontSize:12,color:'#7A8FA6'}}>{session.method.toUpperCase()} · {session.startedAt}</span>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={()=>{setCp(true);setTimeout(()=>setCp(false),2000)}} style={{...sel,background:cp?'#27AE60':'#1E3048',color:cp?'#fff':'#7A8FA6'}}>{cp?'✓ Copied!':'📋 Copy Link'}</button>
          <button onClick={()=>setSession(null)} style={{...sel,color:'#E74C3C',border:'1px solid #E74C3C'}}>End</button>
        </div>
      </div>
      <div style={{overflowX:'auto',overflowY:'auto',flex:1}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
          <thead style={{position:'sticky',top:0,zIndex:5,background:'#162436'}}>
            <tr>
              <th style={{...TH,minWidth:200}}>Item</th>
              <th style={{...TH,width:70}}>Pri</th>
              {scorers.map(s=><th key={s} style={{...TH,minWidth:80,textAlign:'center' as const,color:'#C8973A'}}>{s.split(' ')[0]}</th>)}
              <th style={{...TH,width:60,textAlign:'center' as const}}>Avg BV</th>
              <th style={{...TH,width:60,textAlign:'center' as const}}>Avg Urg</th>
              <th style={{...TH,width:60,textAlign:'center' as const,color:'#27AE60'}}>WSJF</th>
            </tr>
          </thead>
          <tbody>
            {sc2.map((item,idx)=>{
              const ab=avg(item.id,'bv'),au=avg(item.id,'urg')
              const ew=item.effort==='S'?1:item.effort==='M'?2:item.effort==='L'?3:5
              const wsjf=ab&&au?((parseFloat(ab)+parseFloat(au))/ew).toFixed(2):null
              const pclr=pc(item.priority)
              return(
                <tr key={item.id} style={{background:idx%2===0?'#0D1B2A':'#162436'}}>
                  <td style={{padding:'8px 12px',borderBottom:'1px solid #243447'}}><div style={{fontSize:11,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div><div style={{fontSize:12,color:'#F4F6F8',marginTop:2}}>{item.name}</div></td>
                  <td style={{padding:'8px 12px',borderBottom:'1px solid #243447'}}><span style={{background:pclr.bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{item.priority}</span></td>
                  {scorers.map(scorer=>(
                    <td key={scorer} style={{padding:'4px 6px',borderBottom:'1px solid #243447',textAlign:'center' as const}}>
                      <div style={{display:'flex',gap:3,justifyContent:'center'}}>
                        {['bv','urg'].map(field=>(
                          <input key={field} type="number" min={1} max={5} value={scores[item.id]?.[scorer]?.[field]||''} onChange={e=>setScores(prev=>({...prev,[item.id]:{...(prev[item.id]||{}),[scorer]:{...(prev[item.id]?.[scorer]||{}),[field]:e.target.value}}}))} style={{width:30,background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:4,padding:3,textAlign:'center' as const,fontSize:12}} placeholder="—"/>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td style={{padding:'8px 6px',borderBottom:'1px solid #243447',textAlign:'center' as const,color:'#E8B95A',fontWeight:700}}>{ab||'—'}</td>
                  <td style={{padding:'8px 6px',borderBottom:'1px solid #243447',textAlign:'center' as const,color:'#E8B95A',fontWeight:700}}>{au||'—'}</td>
                  <td style={{padding:'8px 6px',borderBottom:'1px solid #243447',textAlign:'center' as const,color:wsjf?'#27AE60':'#7A8FA6',fontWeight:700,fontSize:13}}>{wsjf||'—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
// ── STAKEHOLDER ───────────────────────────────────────────────────────────
function Stakeholder({items,projects}:{items:any[],projects:any[]}) {
  const [fl,setFl]=useState({})
  const p1=items.filter(i=>i.priority==='P1')
  const p2=items.filter(i=>i.priority==='P2')
  const bl=items.filter(i=>i.priority!=='P1'&&i.priority!=='P2').slice(0,10)
  const disc=items.filter(i=>i.flagged)
  const redProjects=projects.filter(p=>p.rag==='Red')
  const amberProjects=projects.filter(p=>p.rag==='Amber')
  return(
    <div style={{maxWidth:960,margin:'0 auto',padding:'24px 20px',overflowY:'auto',height:'100%',boxSizing:'border-box' as const}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:22,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>Retail Technology — Program Status</div>
        <div style={{fontSize:13,color:'#7A8FA6'}}>Read-only · Flag items for discussion</div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
        {[['P1 Active',p1.length,'#C00000'],['P2 Active',p2.length,'#D4820A'],['Projects',projects.length,'#2E86AB'],['For Discussion',disc.length,'#C8973A']].map(([label,val,color])=>(
          <div key={label} style={{background:'#162436',border:'1px solid #243447',borderRadius:10,padding:'16px 20px'}}>
            <div style={{fontSize:28,fontWeight:700,color,lineHeight:1}}>{val}</div>
            <div style={{fontSize:12,color:'#7A8FA6',marginTop:4}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Project RAG summary */}
      {(redProjects.length>0||amberProjects.length>0)&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:10}}>PROJECT HEALTH</div>
          {[...redProjects,...amberProjects].map(project=>{
            const ragColor=RAG_COLORS[project.rag]
            const pclr=pc(project.priority)
            return(
              <div key={project.id} style={{background:`${ragColor}11`,border:`1px solid ${ragColor}33`,borderLeft:`4px solid ${ragColor}`,borderRadius:8,padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:16}}>{project.rag==='Red'?'🔴':'🟡'}</span>
                <span style={{background:pclr.bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{project.priority}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#F4F6F8'}}>{project.name}</div>
                  <div style={{fontSize:11,color:'#7A8FA6'}}>{project.status} · {project.team==='Consumer Experience'?'CE':'OE'} · {project.start_date} → {project.end_date}</div>
                </div>
                <span style={{fontSize:11,color:ragColor,fontWeight:700}}>{project.rag}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* P1/P2 items */}
      {[...p1,...p2].map(item=>(
        <div key={item.id} style={{background:item.priority==='P1'?'#2D1515':'#2D1E0A',border:`1px solid ${(item.priority==='P1'?'#C00000':'#D4820A')}44`,borderRadius:8,padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
          <span style={{background:pc(item.priority).bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{item.priority}</span>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#F4F6F8'}}>{item.name}</div><div style={{fontSize:11,color:'#7A8FA6'}}>{item.item_id} · {item.swimlane} · {item.status}</div></div>
          <button onClick={()=>setFl(p=>({...p,[item.id]:!p[item.id]}))} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,opacity:fl[item.id]||item.flagged?1:0.3}}>🚩</button>
        </div>
      ))}

      <div style={{fontSize:13,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:10,marginTop:20}}>TOP PRIORITY BACKLOG</div>
      {bl.map((item,idx)=>(
        <div key={item.id} style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'10px 16px',marginBottom:6,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:11,color:'#7A8FA6',width:20,textAlign:'center' as const}}>{idx+1}</span>
          <span style={{background:pc(item.priority).bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{item.priority}</span>
          <div style={{flex:1}}><div style={{fontSize:13,color:'#F4F6F8'}}>{item.name}</div><div style={{fontSize:11,color:'#7A8FA6'}}>{item.item_id} · {item.swimlane} · {item.team}</div></div>
          <span style={{fontSize:11,color:sc(item.status)}}>{item.status}</span>
          <button onClick={()=>setFl(p=>({...p,[item.id]:!p[item.id]}))} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,opacity:fl[item.id]?1:0.25}}>🚩</button>
        </div>
      ))}

      {disc.length>0&&(
        <>
          <div style={{fontSize:13,fontWeight:700,color:'#C8973A',letterSpacing:1,marginBottom:10,marginTop:20}}>🚩 FLAGGED FOR DISCUSSION</div>
          {disc.map(item=>(
            <div key={item.id} style={{background:'rgba(200,151,58,0.1)',border:'1px solid rgba(200,151,58,0.3)',borderRadius:8,padding:'10px 16px',marginBottom:6}}>
              <div style={{fontSize:13,color:'#F4F6F8'}}>{item.name}</div>
              <div style={{fontSize:11,color:'#7A8FA6'}}>{item.item_id} · {item.priority}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── MAIN APP ──────────────────────────────────────────────────────────────
export default function PerfectGame() {
  const [items,setItems]=useState([])
  const [projects,setProjects]=useState([])
  const [milestones,setMilestones]=useState([])
  const [loading,setLoading]=useState(true)
  const [activeTab,setActiveTab]=useState('projects')

useEffect(()=>{
    async function load(){
      const[{data:itemData},{data:projectData},{data:milestoneData}]=await Promise.all([
      supabase.from('items').select('*').order('sort_order',{ascending:true}),
      supabase.from('projects').select('*').order('sort_order',{ascending:true}),
      supabase.from('milestones').select('*').order('date',{ascending:true}),
    ])
    if(itemData) setItems(itemData)
    if(milestoneData) setMilestones(milestoneData)

    // Auto-create any missing projects from parent_project values
    if(itemData&&projectData){
      const existingNames=new Set(projectData.map(p=>p.name))
      const missingNames=[...new Set(itemData.map(i=>i.parent_project).filter(Boolean))].filter(n=>!existingNames.has(n))
      if(missingNames.length>0){
        const newProjects=missingNames.map((name,i)=>({
          name,
          description:'',
          priority:'P3',
          status:'Planning',
          rag:'Green',
          team:'Consumer Experience',
          color:'#2E86AB',
          sort_order:(projectData.length+i),
        }))
        const{data:created}=await supabase.from('projects').insert(newProjects).select()
        const allProjects=[...projectData,...(created||[])]
        setProjects(allProjects)
      } else {
        setProjects(projectData)
      }
    }
    setLoading(false)
  }
  load()
  const ch1=supabase.channel('items').on('postgres_changes',{event:'INSERT',schema:'public',table:'items'},()=>load()).subscribe()
  const ch2=supabase.channel('projects').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>load()).subscribe()
  const ch3=supabase.channel('milestones').on('postgres_changes',{event:'*',schema:'public',table:'milestones'},()=>load()).subscribe()
 return()=>{supabase.removeChannel(ch1);supabase.removeChannel(ch2);supabase.removeChannel(ch3)}
  },[])
  const totalViolations=projects.reduce((acc,p)=>{
    if(!p.start_date||!p.end_date) return acc
    const children=items.filter(i=>i.parent_project===p.name&&i.start_date&&i.end_date)
    return acc+children.filter(i=>new Date(i.start_date)<new Date(p.start_date)||new Date(i.end_date)>new Date(p.end_date)).length
  },0)

  const TABS=[
  {key:'projects',label:'Projects',icon:'◈',badge:totalViolations>0?totalViolations:null},
  {key:'backlog',label:'Backlog',icon:'≡'},
  {key:'roadmap',label:'Roadmap',icon:'◫'},
  {key:'scoring',label:'Scoring',icon:'◎'},
  {key:'stakeholder',label:'Stakeholder View',icon:'◉'},
]

  if(loading) return(
    <div style={{height:'100vh',background:'#0D1B2A',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <div style={{width:40,height:40,borderRadius:'50%',border:'3px solid #243447',borderTopColor:'#C8973A',animation:'spin 0.8s linear infinite'}}/>
      <div style={{color:'#7A8FA6',fontSize:13}}>Loading Perfect Game...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0D1B2A',color:'#F4F6F8',fontFamily:"'Inter','Helvetica Neue',sans-serif",overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',borderBottom:'1px solid #243447',background:'#162436',flexShrink:0}}>
        <div style={{padding:'0 20px',display:'flex',alignItems:'center',gap:10,borderRight:'1px solid #243447',height:50}}>
          <div style={{width:28,height:28,borderRadius:'50%',border:'2px solid #C8973A',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{width:16,height:16,borderRadius:'50%',border:'1.5px solid #C8973A',borderTopColor:'transparent',transform:'rotate(45deg)'}}/>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:2,color:'#F4F6F8',lineHeight:1}}>PERFECT GAME</div>
            <div style={{fontSize:9,color:'#C8973A',letterSpacing:3,lineHeight:1.4}}>TRUST THE PROCESS</div>
          </div>
        </div>
        <div style={{display:'flex',height:'100%'}}>
          {TABS.map(tab=>(
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{background:activeTab===tab.key?'#0D1B2A':'transparent',color:activeTab===tab.key?'#F4F6F8':'#7A8FA6',border:'none',borderBottom:activeTab===tab.key?'2px solid #C8973A':'2px solid transparent',padding:'0 20px',cursor:'pointer',fontSize:13,fontWeight:activeTab===tab.key?700:400,display:'flex',alignItems:'center',gap:8,height:'100%',position:'relative'}}>
              <span style={{fontSize:16}}>{tab.icon}</span>
              {tab.label}
              {tab.badge&&<span style={{background:'#E74C3C',color:'#fff',borderRadius:10,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:2}}>{tab.badge}</span>}
            </button>
          ))}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:16,padding:'0 20px',alignItems:'center',fontSize:12,color:'#7A8FA6'}}>
          <span>Deckers Brands · Retail Technology</span>
          <span style={{color:'#C8973A',fontWeight:700}}>●</span>
          <span>{items.length} items · {projects.length} projects · {milestones.length} milestones</span>
        </div>
      </div>
      <div style={{flex:1,overflow:'hidden'}}>
        {activeTab==='backlog'&&<Backlog items={items} setItems={setItems} projects={projects} setProjects={setProjects}/>}
        {activeTab==='projects'&&<Projects items={items} setItems={setItems} projects={projects} setProjects={setProjects} milestones={milestones} setMilestones={setMilestones}/>}
{activeTab==='roadmap'&&<Roadmap items={items} setItems={setItems} projects={projects} setProjects={setProjects} milestones={milestones}/>}
        {activeTab==='scoring'&&<Scoring items={items}/>}
        {activeTab==='stakeholder'&&<Stakeholder items={items} projects={projects}/>}
      </div>
    </div>
  )
}