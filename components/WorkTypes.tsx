// Work types shared by initiatives, epics and stories: New, Sustain and SaaS deliverable.
// Everything is planned on the Backlog's planning board; the work type says what kind of work
// it is. For the strategy's capacity split (new vs sustain share), SaaS deliverables count
// toward the sustain share.

export type WorkType='new'|'sustain'|'saas'
export const WORK_TYPE_KEYS:WorkType[]=['new','sustain','saas']
export const WT_LABEL:Record<WorkType,string>={new:'New',sustain:'Sustain',saas:'SaaS deliverable'}
export const WT_HINT:Record<WorkType,string>={
  new:'New initiative work',
  sustain:'Tech debt, stabilization and enhancements to existing things',
  saas:'Deliverables from a SaaS vendor',
}
export const WT_COLOR:Record<WorkType,{bg:string,fg:string}>={
  new:{bg:'#C8973A',fg:'#0D1B2A'},
  sustain:{bg:'#4A5D72',fg:'#F4F6F8'},
  saas:{bg:'#16A085',fg:'#F4F6F8'},
}
export const isWorkType=(v:any):v is WorkType=>v==='new'||v==='sustain'||v==='saas'
// 'bau' was the earlier way to mark sustain work; it still reads as sustain
export const workTypeOfProject=(p:any):WorkType=>p?.work_type==='saas'?'saas':p?.work_type==='sustain'||p?.planning_state==='bau'?'sustain':'new'
// The strategy's capacity split has two shares: new and sustain (SaaS counts as sustain)
export const capacityShare=(wt:WorkType|string):'new'|'sustain'=>wt==='new'?'new':'sustain'

// Request types for work items
export const REQUEST_TYPES=['Enhancement','Tech Debt','Bug']

// Closed work: any of these statuses takes an item, epic or initiative out of every working
// view (Backlog, Planning, Roadmap, Sprints pools, Teams, flags, Desk, PowerPoints); it's
// kept on the Done tab
export const CLOSED_STATUSES=['Done','Will Not Implement',"Won't Do",'Closed','Cancelled','Canceled','Resolved','Complete','Completed']
export const isClosedStatus=(s:any)=>CLOSED_STATUSES.includes(s)||/^(done|closed|complete(d)?|cancell?ed|resolved|will not implement|won'?t do)$/i.test(String(s||'').trim())
export const isClosed=(x:any)=>isClosedStatus(x?.status)

// Bugs: work items with request type 'Bug', tracked like stories, with a severity
export const isBug=(i:any)=>i?.request_type==='Bug'
export const SEVERITIES=[{key:'S1',label:'S1 Critical',color:'#E74C3C'},{key:'S2',label:'S2 Major',color:'#E67E22'},{key:'S3',label:'S3 Minor',color:'#E8B95A'},{key:'S4',label:'S4 Trivial',color:'#8FA6BC'}]
export const sevOf=(k:any)=>SEVERITIES.find(s=>s.key===k)||null
export const BUG_CLR='#E74C3C'
// The red 🐞 BUG label, with its severity when it has one
export function BugTag({item,compact}:{item:any,compact?:boolean}){
  const sv=sevOf(item?.severity)
  return <span title={`Bug${sv?` · ${sv.label}`:''}`} style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:9,fontWeight:800,color:'#fff',background:BUG_CLR,borderRadius:3,padding:'0 4px',letterSpacing:0.5,whiteSpace:'nowrap' as const,flexShrink:0}}>
    🐞{compact?'':' BUG'}{sv&&<span style={{background:'rgba(0,0,0,0.25)',borderRadius:2,padding:'0 3px',color:'#fff'}}>{sv.key}</span>}
  </span>
}

// A small tag showing an item's work type
const WT_ICON:any={new:'✦',sustain:'⟳',saas:'☁'}
export function WorkTag({wt,compact}:{wt:string,compact?:boolean}){
  const k:any=isWorkType(wt)?wt:'new',c=WT_COLOR[k as 'new']
  const label=compact?WT_ICON[k]:`${WT_ICON[k]} ${k==='saas'?'SaaS':WT_LABEL[k as 'new']}`
  const title=`${WT_LABEL[k as 'new']}: ${WT_HINT[k as 'new']}`
  return k==='new'?<span title={title} style={{fontSize:10,fontWeight:700,color:'#C8973A',border:'1px solid rgba(200,151,58,0.5)',borderRadius:4,padding:compact?'0 4px':'1px 7px',whiteSpace:'nowrap' as const,flexShrink:0}}>{label}</span>
    :<span title={title} style={{fontSize:10,fontWeight:700,color:c.fg,background:c.bg,borderRadius:4,padding:compact?'1px 4px':'2px 7px',whiteSpace:'nowrap' as const,flexShrink:0}}>{label}</span>
}
