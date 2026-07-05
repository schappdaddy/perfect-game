'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

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

function Projects({items,projects,setProjects}:{items:any[],projects:any[],setProjects:any}) {
  const [adding,setAdding]=useState(false)
  const [editing,setEditing]=useState(null)
  const [saving,setSaving]=useState(false)
  const [filterTeam,setFilterTeam]=useState('All')
  const [filterRAG,setFilterRAG]=useState('All')
  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
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

  async function saveProject() {
    if(!form.name.trim()) return
    setSaving(true)
    if(editing) {
      const{data}=await supabase.from('projects').update({...form,updated_at:new Date().toISOString()}).eq('id',editing.id).select().single()
      if(data) setProjects(projects.map(p=>p.id===editing.id?data:p))
      setEditing(null)
    } else {
      const{data}=await supabase.from('projects').insert({...form,sort_order:projects.length}).select().single()
      if(data) setProjects([...projects,data])
      setAdding(false)
    }
    setSaving(false)
    setForm({...empty})
  }

  async function deleteProject(id) {
    if(!confirm('Delete this project? Items assigned to it will keep their parent project label.')) return
    setProjects(projects.filter(p=>p.id!==id))
    await supabase.from('projects').delete().eq('id',id)
  }

  async function updateField(id,field,val) {
    setProjects(projects.map(p=>p.id===id?{...p,[field]:val}:p))
    await supabase.from('projects').update({[field]:val}).eq('id',id)
  }

  function startEdit(project) {
    setEditing(project)
    setForm({name:project.name,description:project.description||'',priority:project.priority,status:project.status,rag:project.rag,team:project.team,start_date:project.start_date||'',end_date:project.end_date||'',color:project.color||'#2E86AB'})
    setAdding(true)
  }

  const totalViolations=projects.reduce((acc,p)=>acc+getViolations(p).length,0)

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>

      {/* Controls */}
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',alignItems:'center',background:'#162436',flexWrap:'wrap'}}>
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
          <div style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'5px 12px',fontSize:12,color:'#E74C3C',display:'flex',alignItems:'center',gap:6}}>
            ⚠️ {totalViolations} timeline violation{totalViolations!==1?'s':''} — child items outside project dates
          </div>
        )}
        <div style={{marginLeft:'auto'}}>
          <button onClick={()=>{setAdding(true);setEditing(null);setForm({...empty})}}
            style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
            + New Project
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{display:'flex',gap:12,padding:'12px 20px',borderBottom:'1px solid #243447',background:'#0D1B2A',flexWrap:'wrap'}}>
        {[
          ['Total',projects.length,'#7A8FA6'],
          ['🟢 Green',projects.filter(p=>p.rag==='Green').length,'#27AE60'],
          ['🟡 Amber',projects.filter(p=>p.rag==='Amber').length,'#D4820A'],
          ['🔴 Red',projects.filter(p=>p.rag==='Red').length,'#C0392B'],
          ['In Progress',projects.filter(p=>p.status==='In Progress').length,'#2E86AB'],
          ['Planning',projects.filter(p=>p.status==='Planning').length,'#8E44AD'],
        ].map(([label,val,color])=>(
          <div key={label} style={{background:'#162436',border:'1px solid #243447',borderRadius:8,padding:'10px 16px',display:'flex',gap:10,alignItems:'center'}}>
            <span style={{fontSize:20,fontWeight:700,color}}>{val}</span>
            <span style={{fontSize:11,color:'#7A8FA6'}}>{label}</span>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div style={{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:12}}>
        {filtered.map(project=>{
          const violations=getViolations(project)
          const children=items.filter(i=>i.parent_project===project.name)
          const ragColor=RAG_COLORS[project.rag]||'#27AE60'
          const pclr=pc(project.priority)
          const ps=d(project.start_date),pe=d(project.end_date)
          const now=new Date()
          const daysTotal=ps&&pe?Math.round((pe.getTime()-ps.getTime())/(1000*60*60*24)):null
          const daysLeft=pe?Math.round((pe.getTime()-now.getTime())/(1000*60*60*24)):null
          const progress=ps&&pe?Math.max(0,Math.min(100,Math.round((now.getTime()-ps.getTime())/(pe.getTime()-ps.getTime())*100))):0

          return(
            <div key={project.id} style={{background:'#162436',border:`1px solid ${violations.length>0?'rgba(192,57,43,0.5)':'#243447'}`,borderLeft:`4px solid ${project.color||'#2E86AB'}`,borderRadius:10,padding:'16px 20px'}}>

              {/* Header */}
              <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:16,fontWeight:700,color:'#F4F6F8'}}>{project.name}</span>
                    <span style={{background:pclr.bg,color:'#fff',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700}}>{project.priority}</span>
                    <span style={{background:ragColor+'22',color:ragColor,border:`1px solid ${ragColor}44`,padding:'2px 10px',borderRadius:12,fontSize:11,fontWeight:700}}>
                      {project.rag==='Green'?'🟢':project.rag==='Amber'?'🟡':'🔴'} {project.rag}
                    </span>
                    <span style={{color:sc(project.status),fontSize:11,fontWeight:600}}>{project.status}</span>
                    <span style={{fontSize:11,color:'#7A8FA6'}}>{project.team==='Consumer Experience'?'CE':'OE'}</span>
                    {violations.length>0&&(
                      <span style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'2px 8px',fontSize:11,color:'#E74C3C'}}>
                        ⚠️ {violations.length} item{violations.length!==1?'s':''} outside timeline
                      </span>
                    )}
                  </div>
                  {project.description&&<div style={{fontSize:12,color:'#7A8FA6',lineHeight:1.5}}>{project.description}</div>}
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={()=>startEdit(project)} style={{...sel,fontSize:11,padding:'4px 10px'}}>Edit</button>
                  <button onClick={()=>deleteProject(project.id)} style={{...sel,fontSize:11,padding:'4px 10px',color:'#E74C3C',border:'1px solid #E74C3C'}}>Delete</button>
                </div>
              </div>

              {/* Timeline bar */}
              {ps&&pe&&(
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#7A8FA6',marginBottom:6}}>
                    <span>{fmt(project.start_date)}</span>
                    <span style={{color:daysLeft!==null&&daysLeft<0?'#E74C3C':daysLeft!==null&&daysLeft<30?'#E74C3C':daysLeft!==null&&daysLeft<60?'#D4820A':'#7A8FA6',fontWeight:daysLeft!==null&&daysLeft<60?700:400}}>
                      {daysLeft!==null&&daysLeft>0?`${daysLeft} days remaining`:daysLeft!==null&&daysLeft<=0?`${Math.abs(daysLeft)} days overdue`:'—'}
                    </span>
                    <span>{fmt(project.end_date)}</span>
                  </div>
                  <div style={{height:8,background:'#1E3048',borderRadius:4,overflow:'hidden',marginBottom:4}}>
                    <div style={{height:'100%',width:`${progress}%`,background:project.color||'#2E86AB',borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:10,color:'#7A8FA6'}}>{progress}% through timeline · {daysTotal} days total</div>
                </div>
              )}

              {/* Quick controls */}
              <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,alignItems:'center',marginBottom:violations.length>0?12:0}}>
                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                  <span style={{color:'#7A8FA6'}}>RAG:</span>
                  {['Green','Amber','Red'].map(r=>(
                    <button key={r} onClick={()=>updateField(project.id,'rag',r)}
                      style={{background:project.rag===r?RAG_COLORS[r]+'33':'transparent',color:RAG_COLORS[r],border:`1px solid ${project.rag===r?RAG_COLORS[r]:'#243447'}`,borderRadius:4,padding:'2px 8px',fontSize:11,cursor:'pointer',fontWeight:project.rag===r?700:400}}>
                      {r==='Green'?'🟢':r==='Amber'?'🟡':'🔴'} {r}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                  <span style={{color:'#7A8FA6'}}>Status:</span>
                  <select value={project.status} onChange={e=>updateField(project.id,'status',e.target.value)} style={{...sel,fontSize:11,padding:'2px 6px'}}>
                    {PROJECT_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                  <span style={{color:'#7A8FA6'}}>Priority:</span>
                  <select value={project.priority} onChange={e=>updateField(project.id,'priority',e.target.value)} style={{...sel,fontSize:11,padding:'2px 6px'}}>
                    {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                  <span style={{color:'#7A8FA6'}}>Items:</span>
                  <span style={{color:'#F4F6F8',fontWeight:700}}>{children.length}</span>
                </div>
              </div>

              {/* Violations */}
              {violations.length>0&&(
                <div style={{background:'rgba(192,57,43,0.08)',border:'1px solid rgba(192,57,43,0.2)',borderRadius:6,padding:'10px 12px'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#E74C3C',marginBottom:10}}>
                    ⚠️ Timeline violations — project window: {fmt(project.start_date)} → {fmt(project.end_date)}
                  </div>
                  {violations.map(v=>(
                    <ViolationRow key={v.id} v={v} project={project} fmt={fmt} d={d}/>
                  ))}
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
function Backlog({items,setItems,projects}:{items:any[],setItems:any,projects:any[]}) {
  const [ft,setFt]=useState('All')
  const [fp,setFp]=useState('All')
  const [fs,setFs]=useState('All')
  const [fst,setFst]=useState('All')
  const [srch,setSrch]=useState('')
  const [sf,setSf]=useState(false)
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

  const sorted=[...items].sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    if(pa!==pb) return pa-pb
    if(a.manual_rank&&b.manual_rank) return a.manual_rank-b.manual_rank
    if(a.manual_rank) return -1
    if(b.manual_rank) return 1
    if(a.wsjf&&b.wsjf) return b.wsjf-a.wsjf
    return a.sort_order-b.sort_order
  })

  const filtered=sorted.filter(item=>{
    if(ft!=='All'&&item.team!==ft) return false
    if(fp!=='All'&&item.priority!==fp) return false
    if(fs!=='All'&&item.swimlane!==fs) return false
    if(fst!=='All'&&item.status!==fst) return false
    if(sf&&!item.flagged) return false
    if(srch&&!item.name.toLowerCase().includes(srch.toLowerCase())&&!item.item_id.toLowerCase().includes(srch.toLowerCase())) return false
    return true
  })

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
  async function drop(e,tid) {
    e.preventDefault()
    if(!did||did===tid){setDid(null);setDoid(null);return}
    const arr=[...items]
    const fi=arr.findIndex(i=>i.id===did),ti=arr.findIndex(i=>i.id===tid)
    const [m]=arr.splice(fi,1)
    arr.splice(ti,0,m)
    const upd2=arr.map((item,idx)=>({...item,sort_order:idx}))
    setItems(upd2);setDid(null);setDoid(null)
    for(const item of upd2) await supabase.from('items').update({sort_order:item.sort_order}).eq('id',item.id)
  }
  async function addIt() {
    if(!ni.name.trim()) return
    setSav(true)
    const iid=`RTL-${String(Math.floor(Math.random()*900)+100)}`
    const{data}=await supabase.from('items').insert({item_id:iid,name:ni.name,description:ni.description,priority:ni.priority,swimlane:ni.swimlane,team:ni.team,effort:ni.effort,status:ni.status,request_type:ni.request_type,region:ni.region,vendor:ni.vendor,flagged:false,sort_order:items.length}).select().single()
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

  function PanelField({label,field,type='text'}:{label:string,field:string,type?:string}) {
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

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',flexWrap:'wrap',alignItems:'center',background:'#162436'}}>
        <input placeholder="Search..." value={srch} onChange={e=>setSrch(e.target.value)} style={{...sel,width:160}}/>
        <select value={ft} onChange={e=>setFt(e.target.value)} style={sel}><option value="All">All Teams</option>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        <select value={fp} onChange={e=>setFp(e.target.value)} style={sel}><option value="All">All Priorities</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
        <select value={fs} onChange={e=>setFs(e.target.value)} style={sel}><option value="All">All Swimlanes</option>{swimlaneOpts.map(s=><option key={s}>{s}</option>)}</select>
        <select value={fst} onChange={e=>setFst(e.target.value)} style={sel}><option value="All">All Statuses</option>{statusOpts.map(s=><option key={s}>{s}</option>)}</select>
        <button onClick={()=>setSf(f=>!f)} style={{...sel,background:sf?'#7D2D00':'#1E3048',color:sf?'#FF8C42':'#7A8FA6',border:`1px solid ${sf?'#FF8C42':'#243447'}`}}>
          🚩{fc>0&&<span style={{background:'#C8973A',color:'#0D1B2A',borderRadius:10,padding:'0 5px',fontSize:10,fontWeight:700,marginLeft:3}}>{fc}</span>}
        </button>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={()=>setSac(true)} style={{...sel,color:'#7A8FA6'}}>+ Column</button>
          <button onClick={()=>setAi(true)} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Item</button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,overflowX:'auto',overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:1400}}>
            <thead style={{position:'sticky',top:0,zIndex:10,background:'#162436'}}>
              <tr>
                <th style={{...TH,width:32}}></th>
                <th style={{...TH,width:85}}>ID</th>
                <th style={{...TH,minWidth:200}}>Item Name</th>
                <th style={{...TH,width:70}}>Priority</th>
                <th style={{...TH,width:110}}>Swimlane</th>
                <th style={{...TH,width:130}}>Status</th>
                <th style={{...TH,width:50}}>Team</th>
                <th style={{...TH,width:55}}>Effort</th>
                <th style={{...TH,width:130}}>Parent Project</th>
                <th style={{...TH,width:110}}>Request Type</th>
                <th style={{...TH,width:100}}>Region</th>
                <th style={{...TH,width:90}}>Vendor</th>
                <th style={{...TH,width:100}}>Vendor Date</th>
                <th style={{...TH,width:65}}>WSJF</th>
                <th style={{...TH,width:65}}>RICE</th>
                <th style={{...TH,width:55}}>Reach</th>
                <th style={{...TH,width:55}}>Impact</th>
                <th style={{...TH,width:80}}>Confidence</th>
                <th style={{...TH,width:90}}>Owner</th>
                <th style={{...TH,width:95}}>Start Date</th>
                <th style={{...TH,width:95}}>End Date</th>
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
                    <td style={{...TD,color:'#243447',textAlign:'center' as const,cursor:'grab'}} onClick={e=>e.stopPropagation()}>⠿</td>
                    <td style={{...TD,color:'#7A8FA6',fontFamily:'monospace',fontSize:10}}>{item.item_id}</td>
                    <td style={TD}>
                      <div style={{fontSize:12,color:'#F4F6F8',fontWeight:isSel?700:400}}>{item.name}</div>
                      {item.description&&<div style={{color:'#7A8FA6',fontSize:10,marginTop:1,maxWidth:220,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{item.description}</div>}
                    </td>
                    <td style={TD}><span style={{background:pclr.bg,color:pclr.text,padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:700}}>{item.priority}</span></td>
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
              <PanelField label="Item Name" field="name"/>
              <PanelField label="Description" field="description" type="textarea"/>
              <EditableDropdown field="priority" value={selected.priority} options={PRIORITIES} setOptions={null} label="Priority"/>
              <EditableDropdown field="team" value={selected.team} options={TEAMS} setOptions={null} label="Dev Team"/>
              <EditableDropdown field="swimlane" value={selected.swimlane} options={swimlaneOpts} setOptions={setSwimOpts} label="Swimlane"/>
              <EditableDropdown field="status" value={selected.status} options={statusOpts} setOptions={setStatusOpts} label="Status"/>
              <EditableDropdown field="effort" value={selected.effort} options={EFFORTS} setOptions={null} label="Effort"/>
              <EditableDropdown field="request_type" value={selected.request_type} options={rtOpts} setOptions={setRtOpts} label="Request Type"/>
              <EditableDropdown field="region" value={selected.region} options={regionOpts} setOptions={setRegionOpts} label="Region"/>
              <EditableDropdown field="vendor" value={selected.vendor} options={vendors} setOptions={setVendors} label="Vendor"/>
              <EditableDropdown field="parent_project" value={selected.parent_project} options={parentOpts} setOptions={null} label="Parent Project"/>
              <PanelField label="Owner" field="owner"/>
              <PanelField label="Dependency" field="dependency"/>
              <PanelField label="Vendor Delivery Date" field="vendor_delivery_date" type="date"/>
              <PanelField label="Notes" field="notes" type="textarea"/>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>RICE SCORING</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <PanelField label="Reach (1-5)" field="reach" type="number"/>
                  <PanelField label="Impact (1-5)" field="impact" type="number"/>
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
                  <PanelField label="Start Date" field="start_date" type="date"/>
                  <PanelField label="End Date" field="end_date" type="date"/>
                </div>
              </div>
              <div style={{borderTop:'1px solid #243447',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1,marginBottom:12}}>SCORING</div>
                <PanelField label="Manual Rank" field="manual_rank" type="number"/>
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
function Roadmap({items,setItems,projects}:{items:any[],projects:any[],setItems:any}) {
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
  const [dragOverProject,setDragOverProject]=useState(null)
  const [dragOverCol,setDragOverCol]=useState(null)
  const [draggingBar,setDraggingBar]=useState(null)
  const [draggingEdge,setDraggingEdge]=useState(null)
  const ganttRef=useRef(null)
  const today=new Date()

  const filteredItems=items.filter(i=>ft==='All'||i.team===ft)
  const withDates=filteredItems.filter(i=>i.start_date&&i.end_date)
  const noDates=filteredItems.filter(i=>!i.start_date||!i.end_date)
  const uncommitted=noDates.sort((a,b)=>{
    const pa=PRIORITY_ORDER[a.priority]??4,pb=PRIORITY_ORDER[b.priority]??4
    if(pa!==pb) return pa-pb
    if(a.wsjf&&b.wsjf) return parseFloat(b.wsjf)-parseFloat(a.wsjf)
    return 0
  })
  const filteredProjects=projects.filter(p=>ft==='All'||p.team===ft)
  const flaggedItems=items.filter(i=>i.flagged)

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
    const cols=[]
    const start=new Date('2026-04-01'),end=new Date('2028-04-01')
    if(view==='week'){
      let d=new Date(start)
      while(d<end){const we=new Date(d);we.setDate(we.getDate()+6);cols.push({key:d.toISOString(),label:`${d.getMonth()+1}/${d.getDate()}`,start:new Date(d),end:we,isCodeFreeze:isCF(new Date(d),we)});d.setDate(d.getDate()+7)}
    }else if(view==='month'){
      let d=new Date(start)
      while(d<end){const ms=new Date(d.getFullYear(),d.getMonth(),1);const me=new Date(d.getFullYear(),d.getMonth()+1,0);cols.push({key:`${d.getFullYear()}-${d.getMonth()}`,label:d.toLocaleString('default',{month:'short',year:'2-digit'}),start:ms,end:me,isCodeFreeze:isCF(ms,me)});d.setMonth(d.getMonth()+1)}
    }else if(view==='quarter'){
      const qs=[
        {key:'Q1-FY27',label:'Q1 FY27',start:new Date('2026-04-01'),end:new Date('2026-06-30')},
        {key:'Q2-FY27',label:'Q2 FY27',start:new Date('2026-07-01'),end:new Date('2026-09-30')},
        {key:'Q3-FY27',label:'Q3 FY27',start:new Date('2026-10-01'),end:new Date('2026-12-31')},
        {key:'Q4-FY27',label:'Q4 FY27',start:new Date('2027-01-01'),end:new Date('2027-03-31')},
        {key:'Q1-FY28',label:'Q1 FY28',start:new Date('2027-04-01'),end:new Date('2027-06-30')},
        {key:'Q2-FY28',label:'Q2 FY28',start:new Date('2027-07-01'),end:new Date('2027-09-30')},
        {key:'Q3-FY28',label:'Q3 FY28',start:new Date('2027-10-01'),end:new Date('2027-12-31')},
        {key:'Q4-FY28',label:'Q4 FY28',start:new Date('2028-01-01'),end:new Date('2028-03-31')},
      ]
      return qs.map(q=>({...q,isCodeFreeze:isCF(q.start,q.end),label:isCF(q.start,q.end)?`${q.label} 🔒`:q.label}))
    }else{
      return[
        {key:'FY27',label:'FY 2027',start:new Date('2026-04-01'),end:new Date('2027-03-31'),isCodeFreeze:isCF(new Date('2026-04-01'),new Date('2027-03-31'))},
        {key:'FY28',label:'FY 2028',start:new Date('2027-04-01'),end:new Date('2028-03-31'),isCodeFreeze:isCF(new Date('2027-04-01'),new Date('2028-03-31'))},
      ]
    }
    return cols
  }

  const cols=buildCols()
  const totalStart=cols[0]?.start
  const totalEnd=cols[cols.length-1]?.end
  const totalMs=totalEnd.getTime()-totalStart.getTime()
  const COL_W=view==='week'?60*zoom:view==='month'?100*zoom:view==='quarter'?200*zoom:300*zoom
  const GANTT_W=cols.length*COL_W

  function pct(dateStr){return Math.max(0,(new Date(dateStr+'T12:00:00').getTime()-totalStart.getTime())/totalMs*100)}
  function barW(s,e){return Math.max(0.5,Math.min(100,(new Date(e+'T12:00:00').getTime()-totalStart.getTime())/totalMs*100)-pct(s))}
  function todayPos(){return`${Math.max(0,Math.min(100,(today.getTime()-totalStart.getTime())/totalMs*100))}%`}
  function pxToDate(px,containerWidth){
    const ratio=px/containerWidth
    const ms=totalStart.getTime()+ratio*totalMs
    return new Date(ms)
  }
  function dateToStr(d){return d.toISOString().split('T')[0]}

  // ── Drop from backlog panel onto gantt ──────────────────────────────
  function handleGanttDragOver(e,projectName,col){
    e.preventDefault()
    setDragOverProject(projectName)
    setDragOverCol(col.key)
  }
  function handleGanttDragLeave(){setDragOverProject(null);setDragOverCol(null)}
  async function handleGanttDrop(e,projectName,col){
    e.preventDefault()
    const itemId=e.dataTransfer.getData('itemId')
    if(!itemId){setDragOverProject(null);setDragOverCol(null);return}
    const item=items.find(i=>i.id===itemId)
    if(!item){setDragOverProject(null);setDragOverCol(null);return}
    const startStr=dateToStr(col.start)
    const endStr=dateToStr(col.end)
    const updates={start_date:startStr,end_date:endStr,parent_project:projectName}
    setItems(items.map(i=>i.id===itemId?{...i,...updates}:i))
    await supabase.from('items').update(updates).eq('id',itemId)
    setDragOverProject(null);setDragOverCol(null)
  }

  // ── Bar drag to move ────────────────────────────────────────────────
  const barDragState=useRef<any>(null)
  function startBarDrag(e,item,type:'move'|'left'|'right'){
    e.preventDefault()
    e.stopPropagation()
    const gantt=ganttRef.current as any
    if(!gantt) return
    const rect=gantt.getBoundingClientRect()
    const scrollLeft=gantt.scrollLeft
    barDragState.current={
      item,type,
      startX:e.clientX,
      startScrollLeft:scrollLeft,
      origStart:item.start_date,
      origEnd:item.end_date,
      containerWidth:gantt.scrollWidth-220,
      containerLeft:rect.left+220-scrollLeft,
    }
    setDraggingBar(item.id)
    if(type!=='move') setDraggingEdge(type)
  }

  useEffect(()=>{
    function onMouseMove(e){
      const state=barDragState.current
      if(!state) return
      const dx=e.clientX-state.startX
      const daysTotal=totalMs/(1000*60*60*24)
      const pxPerDay=state.containerWidth/daysTotal
      const daysDelta=Math.round(dx/pxPerDay)
      if(daysDelta===0) return
      const origStartMs=new Date(state.origStart+'T12:00:00').getTime()
      const origEndMs=new Date(state.origEnd+'T12:00:00').getTime()
      const DAY=1000*60*60*24
      let newStart=state.origStart,newEnd=state.origEnd
      if(state.type==='move'){
        newStart=dateToStr(new Date(origStartMs+daysDelta*DAY))
        newEnd=dateToStr(new Date(origEndMs+daysDelta*DAY))
      }else if(state.type==='left'){
        const ns=new Date(origStartMs+daysDelta*DAY)
        if(ns<new Date(state.origEnd+'T12:00:00')) newStart=dateToStr(ns)
      }else if(state.type==='right'){
        const ne=new Date(origEndMs+daysDelta*DAY)
        if(ne>new Date(state.origStart+'T12:00:00')) newEnd=dateToStr(ne)
      }
      setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,start_date:newStart,end_date:newEnd}:i))
    }
    async function onMouseUp(e){
      const state=barDragState.current
      if(!state) return
      // Check if dropped on a different project row
      const el=document.elementFromPoint(e.clientX,e.clientY)
      const projectRow=el?.closest('[data-project-id]')
      const newProjectId=projectRow?.getAttribute('data-project-id')
      const newProjectName=projectRow?.getAttribute('data-project-name')
      const item=items.find(i=>i.id===state.item.id)
      if(!item){barDragState.current=null;setDraggingBar(null);setDraggingEdge(null);return}
      const updates:any={start_date:item.start_date,end_date:item.end_date}
      if(newProjectName&&newProjectName!==item.parent_project){
        updates.parent_project=newProjectName
        setItems((prev:any[])=>prev.map(i=>i.id===state.item.id?{...i,parent_project:newProjectName}:i))
      }
      await supabase.from('items').update(updates).eq('id',state.item.id)
      barDragState.current=null;setDraggingBar(null);setDraggingEdge(null)
    }
    window.addEventListener('mousemove',onMouseMove)
    window.addEventListener('mouseup',onMouseUp)
    return()=>{window.removeEventListener('mousemove',onMouseMove);window.removeEventListener('mouseup',onMouseUp)}
  },[items,totalMs])

  async function saveEdit(){
    if(!editing) return
    setSaving(true)
    await supabase.from('items').update({start_date:editForm.start_date,end_date:editForm.end_date,roadmap_color:editForm.roadmap_color,name:editForm.name}).eq('id',editing.id)
    setSaving(false);setEditing(null)
  }

  const COLORS=['#C0392B','#D4820A','#2E86AB','#27AE60','#8E44AD','#E74C3C','#C8973A','#1ABC9C','#2C3E50','#E67E22']
  const ROW_H=40,PARENT_H=52

  function CfShading(){
    return(
      <>{cols.map((col,ci)=>col.isCodeFreeze&&(
        <div key={`cf-${col.key}`} style={{position:'absolute',top:0,bottom:0,left:`${ci/cols.length*100}%`,width:`${1/cols.length*100}%`,background:'rgba(192,57,43,0.07)',zIndex:0,borderLeft:'1px dashed rgba(192,57,43,0.3)',borderRight:'1px dashed rgba(192,57,43,0.3)',pointerEvents:'none'}}/>
      ))}</>
    )
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>

      {/* Controls */}
      <div style={{display:'flex',gap:8,padding:'10px 20px',borderBottom:'1px solid #243447',alignItems:'center',background:'#162436',flexWrap:'wrap'}}>
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
        {totalViolations>0&&(
          <div style={{background:'rgba(192,57,43,0.15)',border:'1px solid rgba(192,57,43,0.4)',borderRadius:6,padding:'4px 10px',fontSize:11,color:'#E74C3C'}}>
            ⚠️ {totalViolations} violation{totalViolations!==1?'s':''}
          </div>
        )}
        <div style={{display:'flex',gap:10,fontSize:11,marginLeft:'auto',color:'#7A8FA6',alignItems:'center'}}>
          <span>{groups.length} projects · {withDates.length} committed · {uncommitted.length} backlog</span>
          <span style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:2,height:10,background:'#E74C3C',display:'inline-block'}}/> Today</span>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Discussion panel — left, collapsible */}
        <div style={{borderRight:'1px solid #243447',background:'#162436',flexShrink:0,display:'flex',flexDirection:'column',transition:'width 0.2s',width:discussionOpen?196:32,overflow:'hidden'}}>
          <button onClick={()=>setDiscussionOpen(o=>!o)}
            style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 8px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,whiteSpace:'nowrap' as const,width:'100%'}}>
            <span style={{transform:discussionOpen?'none':'rotate(-90deg)',transition:'transform 0.2s',display:'inline-block'}}>▼</span>
            {discussionOpen&&'🚩 DISCUSSION'}
            {!discussionOpen&&<span style={{transform:'rotate(90deg)',display:'inline-block',fontSize:10}}>🚩</span>}
          </button>
          {discussionOpen&&(
            <div style={{overflowY:'auto',flex:1,padding:12}}>
              {flaggedItems.length===0&&<div style={{fontSize:11,color:'#7A8FA6',fontStyle:'italic'}}>No flagged items</div>}
              {flaggedItems.map(item=>(
                <div key={item.id} style={{background:'#1E3048',border:'1px solid rgba(200,151,58,0.3)',borderRadius:6,padding:'6px 8px',marginBottom:6}}>
                  <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                  <div style={{fontSize:11,color:'#F4F6F8',marginTop:2,lineHeight:1.3}}>{item.name}</div>
                  <div style={{marginTop:4}}><span style={{background:pc(item.priority).bg,color:'#fff',padding:'1px 6px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gantt */}
        <div ref={ganttRef} style={{flex:1,overflowX:'auto',overflowY:'auto',position:'relative',userSelect:draggingBar?'none':'auto'}}>
          <div style={{minWidth:cols.length*COL_W+220}}>

            {/* Header */}
            <div style={{display:'flex',position:'sticky',top:0,zIndex:10,background:'#162436',borderBottom:'1px solid #243447'}}>
              <div style={{width:220,flexShrink:0,borderRight:'1px solid #243447',padding:'8px 12px',fontSize:11,fontWeight:700,color:'#7A8FA6',letterSpacing:1}}>PROJECT / ITEM</div>
              <div style={{display:'flex',flex:1}}>
                {cols.map(col=>(
                  <div key={col.key} style={{width:COL_W,flexShrink:0,borderRight:'1px solid #243447',padding:'6px 4px',fontSize:10,fontWeight:700,color:col.isCodeFreeze?'#E74C3C':'#C8973A',textAlign:'center' as const,overflow:'hidden',whiteSpace:'nowrap' as const,background:col.isCodeFreeze?'rgba(192,57,43,0.12)':'transparent'}}>
                    {col.label}
                    {col.isCodeFreeze&&<div style={{fontSize:8,color:'#E74C3C',marginTop:1}}>CODE FREEZE</div>}
                  </div>
                ))}
              </div>
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
                  {/* Parent row */}
                  <div style={{display:'flex',height:PARENT_H,background:rb,borderBottom:'1px solid #243447',borderTop:`2px solid ${rbd}`,position:'sticky',top:36,zIndex:5}}>
                    <div style={{width:220,flexShrink:0,borderRight:'1px solid #243447',display:'flex',alignItems:'center',padding:'0 8px',gap:6}}>
                      <button onClick={()=>toggleCollapse(group.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#C8973A',fontSize:14,padding:'2px 4px',lineHeight:1,flexShrink:0}}>
                        {isCollapsed?'▶':'▼'}
                      </button>
                      <div style={{overflow:'hidden',flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
                          <span style={{fontSize:12,fontWeight:700,color:'#F4F6F8',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:120}}>{group.name}</span>
                          <span style={{fontSize:10,color:rc,fontWeight:700,flexShrink:0}}>{group.rag==='Green'?'🟢':group.rag==='Amber'?'🟡':'🔴'}</span>
                          {group.violations.length>0&&<span style={{fontSize:9,color:'#E74C3C',flexShrink:0}}>⚠️</span>}
                        </div>
                        <div style={{fontSize:9,color:'#7A8FA6'}}>{childItems.length} committed · {group.status}</div>
                      </div>
                    </div>
                    {/* Parent bar drop zone */}
                    <div style={{flex:1,position:'relative',overflow:'hidden',display:'flex'}}>
                      <div style={{position:'absolute',top:0,bottom:0,left:todayPos(),width:2,background:'#E74C3C',opacity:0.5,zIndex:4}}/>
                      <CfShading/>
                      {cols.map(col=>(
                        <div key={col.key}
                          style={{width:COL_W,flexShrink:0,height:'100%',position:'relative',zIndex:1,background:dragOverProject===group.name&&dragOverCol===col.key?'rgba(200,151,58,0.15)':'transparent',borderRight:'1px solid transparent'}}
                          onDragOver={e=>handleGanttDragOver(e,group.name,col)}
                          onDragLeave={handleGanttDragLeave}
                          onDrop={e=>handleGanttDrop(e,group.name,col)}/>
                      ))}
                      {group.bar_start&&group.bar_end&&(
                        <div style={{position:'absolute',top:10,height:32,left:`${pct(group.bar_start)}%`,width:`${barW(group.bar_start,group.bar_end)}%`,background:rc,borderRadius:6,display:'flex',alignItems:'center',padding:'0 10px',fontSize:11,fontWeight:700,color:'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,opacity:0.9,zIndex:2,minWidth:8,border:group.violations.length>0?'2px dashed rgba(255,255,255,0.5)':'none',boxShadow:`0 2px 8px ${rc}55`,pointerEvents:'none'}}>
                          {group.rag==='Red'?'🔴':group.rag==='Amber'?'🟡':'🟢'} {group.name}
                          {group.violations.length>0&&<span style={{marginLeft:6,fontSize:10}}>⚠️</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Child rows */}
                  {!isCollapsed&&childItems.map((item,idx)=>{
                    const pclr=pc(item.priority)
                    const itemColor=item.roadmap_color||rc
                    const isViolation=group.violations.find((v:any)=>v.id===item.id)
                    const isDragging=draggingBar===item.id
                    return(
                      <div key={item.id} style={{display:'flex',height:ROW_H,borderBottom:'1px solid #243447',background:isViolation?'rgba(192,57,43,0.05)':idx%2===0?'#0D1B2A':'#111D2C'}}>
                        <div style={{width:220,flexShrink:0,borderRight:`1px solid ${isViolation?'rgba(192,57,43,0.3)':'#243447'}`,display:'flex',alignItems:'center',padding:'0 8px 0 28px',gap:6}}>
                          <div style={{width:1,height:20,background:'#243447',flexShrink:0}}/>
                          <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700,flexShrink:0}}>{item.priority}</span>
                          <div style={{overflow:'hidden'}}>
                            <div style={{fontSize:11,color:isViolation?'#E74C3C':'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:130}}>{item.name}{isViolation?' ⚠️':''}</div>
                            <div style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                          </div>
                        </div>
                        {/* Bar area with drop zones per column */}
                        <div style={{flex:1,position:'relative',overflow:'hidden',display:'flex'}}>
                          <div style={{position:'absolute',top:0,bottom:0,left:todayPos(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4}}/>
                          <CfShading/>
                          {cols.map((col,ci)=>(
                            <div key={col.key}
                              style={{width:COL_W,flexShrink:0,height:'100%',borderRight:'1px solid rgba(36,52,71,0.4)',position:'relative',zIndex:1,background:dragOverProject===group.name&&dragOverCol===col.key?'rgba(200,151,58,0.1)':'transparent'}}
                              onDragOver={e=>handleGanttDragOver(e,group.name,col)}
                              onDragLeave={handleGanttDragLeave}
                              onDrop={e=>handleGanttDrop(e,group.name,col)}/>
                          ))}
                          {/* The draggable bar */}
                          <div
                            style={{position:'absolute',top:6,height:28,left:`${pct(item.start_date)}%`,width:`${barW(item.start_date,item.end_date)}%`,zIndex:3,minWidth:8,opacity:isDragging?0.7:1}}
                          >
                            {/* Left resize handle */}
                            <div
                              onMouseDown={e=>startBarDrag(e,item,'left')}
                              style={{position:'absolute',left:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.15)',borderRadius:'4px 0 0 4px'}}/>
                            {/* Main bar — drag to move */}
                            <div
                              onMouseDown={e=>startBarDrag(e,item,'move')}
                              onClick={()=>{if(!draggingBar){setEditing(item);setEditForm({name:item.name,start_date:item.start_date,end_date:item.end_date,roadmap_color:item.roadmap_color||rc})}}}
                              title={`${item.name}\n${item.start_date} → ${item.end_date}\nDrag to move · Drag edges to resize · Drag to new row to reassign`}
                              style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:isViolation?'#C0392B':itemColor,borderRadius:5,display:'flex',alignItems:'center',padding:'0 12px',fontSize:10,fontWeight:600,color:'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,cursor:draggingBar===item.id?'grabbing':'grab',border:isViolation?'1px dashed #ff6b6b':'none',boxShadow:isDragging?'0 4px 12px rgba(0,0,0,0.4)':'none'}}>
                              {item.name}
                            </div>
                            {/* Right resize handle */}
                            <div
                              onMouseDown={e=>startBarDrag(e,item,'right')}
                              style={{position:'absolute',right:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.15)',borderRadius:'0 4px 4px 0'}}/>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Orphaned items */}
            {orphans.length>0&&(
              <div>
                <div style={{display:'flex',height:PARENT_H,background:'rgba(122,143,166,0.08)',borderBottom:'1px solid #243447',borderTop:'2px solid #243447',position:'sticky',top:36,zIndex:5}}>
                  <div style={{width:220,flexShrink:0,borderRight:'1px solid #243447',display:'flex',alignItems:'center',padding:'0 8px',gap:8}}>
                    <button onClick={()=>toggleCollapse('__orphans')} style={{background:'none',border:'none',cursor:'pointer',color:'#7A8FA6',fontSize:14,padding:'2px 4px',lineHeight:1,flexShrink:0}}>
                      {getCollapsed()['__orphans']?'▶':'▼'}
                    </button>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:'#7A8FA6'}}>No Project Assigned</div>
                      <div style={{fontSize:10,color:'#7A8FA6'}}>{orphans.length} items</div>
                    </div>
                  </div>
                  <div style={{flex:1,position:'relative',overflow:'hidden',display:'flex'}}>
                    <div style={{position:'absolute',top:0,bottom:0,left:todayPos(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4}}/>
                    {cols.map(col=>(
                      <div key={col.key} style={{width:COL_W,flexShrink:0,height:'100%'}}
                        onDragOver={e=>handleGanttDragOver(e,'',col)}
                        onDragLeave={handleGanttDragLeave}
                        onDrop={e=>handleGanttDrop(e,'',col)}/>
                    ))}
                  </div>
                </div>
                {!getCollapsed()['__orphans']&&orphans.map((item,idx)=>{
                  const pclr=pc(item.priority)
                  const isDragging=draggingBar===item.id
                  return(
                    <div key={item.id} style={{display:'flex',height:ROW_H,borderBottom:'1px solid #243447',background:idx%2===0?'#0D1B2A':'#111D2C'}}>
                      <div style={{width:220,flexShrink:0,borderRight:'1px solid #243447',display:'flex',alignItems:'center',padding:'0 8px 0 28px',gap:6}}>
                        <span style={{background:pclr.bg,color:'#fff',padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:700}}>{item.priority}</span>
                        <div style={{overflow:'hidden'}}>
                          <div style={{fontSize:11,color:'#C8C8D4',overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis',maxWidth:140}}>{item.name}</div>
                          <div style={{fontSize:9,color:'#7A8FA6',fontFamily:'monospace'}}>{item.item_id}</div>
                        </div>
                      </div>
                      <div style={{flex:1,position:'relative',overflow:'hidden',display:'flex'}}>
                        <div style={{position:'absolute',top:0,bottom:0,left:todayPos(),width:2,background:'#E74C3C',opacity:0.3,zIndex:4}}/>
                        <CfShading/>
                        {cols.map((col,ci)=>(
                          <div key={col.key} style={{width:COL_W,flexShrink:0,height:'100%',borderRight:'1px solid rgba(36,52,71,0.4)'}}
                            onDragOver={e=>handleGanttDragOver(e,'',col)}
                            onDragLeave={handleGanttDragLeave}
                            onDrop={e=>handleGanttDrop(e,'',col)}/>
                        ))}
                        <div style={{position:'absolute',top:6,height:28,left:`${pct(item.start_date)}%`,width:`${barW(item.start_date,item.end_date)}%`,zIndex:3,minWidth:8,opacity:isDragging?0.7:1}}>
                          <div onMouseDown={e=>startBarDrag(e,item,'left')} style={{position:'absolute',left:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.15)',borderRadius:'4px 0 0 4px'}}/>
                          <div onMouseDown={e=>startBarDrag(e,item,'move')} style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:'#7A8FA6',borderRadius:5,display:'flex',alignItems:'center',padding:'0 12px',fontSize:10,fontWeight:600,color:'#fff',overflow:'hidden',whiteSpace:'nowrap' as const,cursor:'grab'}}>
                            {item.name}
                          </div>
                          <div onMouseDown={e=>startBarDrag(e,item,'right')} style={{position:'absolute',right:0,top:0,bottom:0,width:8,cursor:'ew-resize',zIndex:5,background:'rgba(255,255,255,0.15)',borderRadius:'0 4px 4px 0'}}/>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Today footer */}
            <div style={{display:'flex',borderTop:'1px solid #243447',height:28,background:'#162436',position:'relative'}}>
              <div style={{width:220,flexShrink:0,borderRight:'1px solid #243447'}}/>
              <div style={{flex:1,position:'relative'}}>
                <div style={{position:'absolute',top:0,bottom:0,left:todayPos(),width:2,background:'#E74C3C',opacity:0.6}}/>
                <div style={{position:'absolute',top:4,left:`calc(${todayPos()} + 6px)`,fontSize:10,color:'#E74C3C',fontWeight:700,whiteSpace:'nowrap' as const}}>Today — {today.toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Backlog panel — right, collapsible */}
        <div style={{borderLeft:'1px solid #243447',background:'#162436',flexShrink:0,display:'flex',flexDirection:'column',transition:'width 0.2s',width:backlogOpen?260:32,overflow:'hidden'}}>
          <button onClick={()=>setBacklogOpen(o=>!o)}
            style={{background:'none',border:'none',borderBottom:'1px solid #243447',cursor:'pointer',padding:'10px 8px',display:'flex',alignItems:'center',gap:6,color:'#C8973A',fontSize:11,fontWeight:700,letterSpacing:1,whiteSpace:'nowrap' as const,width:'100%'}}>
            <span style={{transform:backlogOpen?'rotate(-90deg)':'rotate(90deg)',transition:'transform 0.2s',display:'inline-block'}}>◀</span>
            {backlogOpen&&`📋 BACKLOG (${uncommitted.length})`}
          </button>
          {backlogOpen&&(
            <div style={{flex:1,overflowY:'auto',padding:10}}>
              <div style={{fontSize:10,color:'#7A8FA6',marginBottom:8,lineHeight:1.5}}>
                Drag items onto a project row to commit them to the roadmap
              </div>
              {uncommitted.length===0&&(
                <div style={{textAlign:'center',padding:20,color:'#7A8FA6',fontSize:11}}>
                  <div style={{fontSize:20,marginBottom:8}}>🎯</div>
                  All items committed!
                </div>
              )}
              {uncommitted.map(item=>{
                const pclr=pc(item.priority)
                const r=rice(item)
                return(
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e=>{e.dataTransfer.setData('itemId',item.id);e.dataTransfer.effectAllowed='copy'}}
                    style={{background:'#1E3048',border:'1px solid #243447',borderLeft:`3px solid ${pclr.bg}`,borderRadius:6,padding:'8px 10px',marginBottom:6,cursor:'grab',userSelect:'none'}}
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

      {/* Edit modal */}
      {editing&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#162436',border:'1px solid #243447',borderRadius:12,padding:28,width:440}}>
            <div style={{fontSize:16,fontWeight:700,color:'#F4F6F8',marginBottom:4}}>Edit Item</div>
            <div style={{fontSize:10,color:'#7A8FA6',fontFamily:'monospace',marginBottom:20}}>{editing.item_id} · {editing.parent_project||'No project'}</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:'#7A8FA6',marginBottom:4}}>Name</div>
              <input value={editForm.name} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))} style={{width:'100%',background:'#1E3048',color:'#F4F6F8',border:'1px solid #243447',borderRadius:6,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
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
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>{
                // Remove from roadmap
                if(confirm('Remove from roadmap? This will clear start/end dates.')) {
                  supabase.from('items').update({start_date:null,end_date:null}).eq('id',editing.id)
                  setItems(items.map(i=>i.id===editing.id?{...i,start_date:null,end_date:null}:i))
                  setEditing(null)
                }
              }} style={{...sel,color:'#E74C3C',border:'1px solid #E74C3C',fontSize:11}}>Remove from Roadmap</button>
              <button onClick={()=>setEditing(null)} style={sel}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{background:'#C8973A',color:'#0D1B2A',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:13,opacity:saving?0.7:1}}>{saving?'Saving...':'Save'}</button>
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
                <span style={{color:'#E74C3C',fontWeight:700}}>{new Date(codeFreezeStart+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})} → {new Date(codeFreezeEnd+'T12:00:00').toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})}</span>
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
  const [loading,setLoading]=useState(true)
  const [activeTab,setActiveTab]=useState('backlog')

  useEffect(()=>{
    async function load(){
      const[{data:itemData},{data:projectData}]=await Promise.all([
        supabase.from('items').select('*').order('sort_order',{ascending:true}),
        supabase.from('projects').select('*').order('sort_order',{ascending:true}),
      ])
      if(itemData) setItems(itemData)
      if(projectData) setProjects(projectData)
      setLoading(false)
    }
    load()
    const ch1=supabase.channel('items').on('postgres_changes',{event:'*',schema:'public',table:'items'},()=>load()).subscribe()
    const ch2=supabase.channel('projects').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>load()).subscribe()
    return()=>{supabase.removeChannel(ch1);supabase.removeChannel(ch2)}
  },[])

  const totalViolations=projects.reduce((acc,p)=>{
    if(!p.start_date||!p.end_date) return acc
    const children=items.filter(i=>i.parent_project===p.name&&i.start_date&&i.end_date)
    return acc+children.filter(i=>new Date(i.start_date)<new Date(p.start_date)||new Date(i.end_date)>new Date(p.end_date)).length
  },0)

  const TABS=[
    {key:'backlog',label:'Backlog',icon:'≡'},
    {key:'projects',label:'Projects',icon:'◈',badge:totalViolations>0?totalViolations:null},
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
          <span>{items.length} items · {projects.length} projects</span>
        </div>
      </div>
      <div style={{flex:1,overflow:'hidden'}}>
        {activeTab==='backlog'&&<Backlog items={items} setItems={setItems} projects={projects}/>}
        {activeTab==='projects'&&<Projects items={items} projects={projects} setProjects={setProjects}/>}
        {activeTab==='roadmap'&&<Roadmap items={items} setItems={setItems} projects={projects}/>}
        {activeTab==='scoring'&&<Scoring items={items}/>}
        {activeTab==='stakeholder'&&<Stakeholder items={items} projects={projects}/>}
      </div>
    </div>
  )
}