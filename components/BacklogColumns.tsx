'use client'
import { Fragment, useState } from 'react'

// The Backlog table's columns. Drag a header to reorder them; the order is saved in this
// browser and used for every row (stories, bugs and epics alike).
export const BACKLOG_COLS:[string,string,number][]=[
  ['item_id','ID',85],['name','Item Name',200],['parent_project','Initiative',130],['epic','Epic',130],['work_type','Work',80],['release_month','Release',95],
  ['priority','Priority',70],['committed_priority','Rank',55],
  ['swimlane','Swimlane',110],['status','Status',130],['team','Team',50],
  ['effort','Effort',55],
  ['request_type','Request Type',110],['region','Region',100],
  ['vendor','Vendor',90],['vendor_delivery_date','Vendor Date',100],
  ['wsjf','WSJF',65],['rice','RICE',65],['reach','Reach',55],
  ['impact','Impact',55],['confidence','Confidence',80],
  ['owner','Owner',90],['start_date','Start Date',95],['end_date','End Date',95],
]
const KEY='pg_backlog_cols'
const DEFAULT=BACKLOG_COLS.map(c=>c[0])
function load():string[]{
  try{
    const v=JSON.parse(localStorage.getItem(KEY)||'null')
    if(!Array.isArray(v))return DEFAULT
    // keep the saved order, drop columns that no longer exist, add new ones at the end
    const known=v.filter((k:any)=>DEFAULT.includes(k))
    return [...known,...DEFAULT.filter(k=>!known.includes(k))]
  }catch{return DEFAULT}
}
export function useBacklogColumns(){
  const [order,setOrderS]=useState<string[]>(load)
  const setOrder=(o:string[])=>{setOrderS(o);try{localStorage.setItem(KEY,JSON.stringify(o))}catch{}}
  const move=(from:string,to:string)=>{
    if(from===to)return
    const o=order.filter(k=>k!==from),i=o.indexOf(to)
    o.splice(i<0?o.length:i,0,from);setOrder(o)
  }
  const reset=()=>{setOrderS(DEFAULT);try{localStorage.removeItem(KEY)}catch{}}
  const isDefault=order.join()===DEFAULT.join()
  return{order,move,reset,isDefault}
}
// A row's cells, laid out in the chosen column order
export function inColumnOrder(order:string[],cells:Record<string,any>){
  return order.map(k=><Fragment key={k}>{cells[k]}</Fragment>)
}
