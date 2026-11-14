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
export const REQUEST_TYPES=['Enhancement','Tech Debt']

// A small tag showing an item's work type
const WT_ICON:any={new:'✦',sustain:'⟳',saas:'☁'}
export function WorkTag({wt,compact}:{wt:string,compact?:boolean}){
  const k:any=isWorkType(wt)?wt:'new',c=WT_COLOR[k as 'new']
  const label=compact?WT_ICON[k]:`${WT_ICON[k]} ${k==='saas'?'SaaS':WT_LABEL[k as 'new']}`
  const title=`${WT_LABEL[k as 'new']}: ${WT_HINT[k as 'new']}`
  return k==='new'?<span title={title} style={{fontSize:10,fontWeight:700,color:'#C8973A',border:'1px solid rgba(200,151,58,0.5)',borderRadius:4,padding:compact?'0 4px':'1px 7px',whiteSpace:'nowrap' as const,flexShrink:0}}>{label}</span>
    :<span title={title} style={{fontSize:10,fontWeight:700,color:c.fg,background:c.bg,borderRadius:4,padding:compact?'1px 4px':'2px 7px',whiteSpace:'nowrap' as const,flexShrink:0}}>{label}</span>
}
