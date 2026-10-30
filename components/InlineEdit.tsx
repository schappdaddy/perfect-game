'use client'
import { useState } from 'react'

// Edit a table cell in place. Each editor shows the cell as it normally looks; clicking it
// opens a dropdown (an invisible native select laid over the cell), a text box or a date
// picker. Clicks never reach the row, so editing doesn't open the side panel.

const stop=(e:any)=>e.stopPropagation()
const HOVER_CSS='.pg-inline{border-radius:4px;transition:box-shadow .1s}.pg-inline:hover{box-shadow:0 0 0 1px #3A4A5E}'
export function InlineEditStyles(){return <style>{HOVER_CSS}</style>}

type Opt=string|{value:string,label:string,disabled?:boolean}
const optVal=(o:Opt)=>typeof o==='string'?o:o.value
const optLabel=(o:Opt)=>typeof o==='string'?o:o.label

// value '' means none; options can include a '' option for "none"
export function InlineSelect({value,options,onChange,children,title,style}:{value:any,options:Opt[],onChange:(v:any)=>void,children:any,title?:string,style?:any}){
  const cur=value??''
  const list:Opt[]=options.some(o=>optVal(o)===cur)?options:[{value:cur,label:String(cur)},...options]
  return(
    <span className="pg-inline" onClick={stop} title={title||'Click to change'} style={{position:'relative',display:'inline-flex',alignItems:'center',maxWidth:'100%',cursor:'pointer',...style}}>
      {children}
      <select value={cur} onChange={e=>{if(e.target.value!==cur)onChange(e.target.value||null)}}
        style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer',fontSize:13}}>
        {list.map(o=>{const v=optVal(o);return <option key={v} value={v} disabled={typeof o!=='string'&&o.disabled}>{optLabel(o)}</option>})}
      </select>
    </span>
  )
}

// Click to edit text; Enter or leaving the box saves, Escape cancels
export function InlineText({value,onSave,children,placeholder,width=180,title}:{value:any,onSave:(v:string|null)=>void,children:any,placeholder?:string,width?:number,title?:string}){
  const [edit,setEdit]=useState(false)
  const [text,setText]=useState('')
  if(!edit)return <span className="pg-inline" onClick={e=>{stop(e);setText(value||'');setEdit(true)}} title={title||'Click to edit'} style={{cursor:'text',display:'inline-block',maxWidth:'100%'}}>{children}</span>
  const save=()=>{setEdit(false);const v=text.trim();if(v!==(value||''))onSave(v||null)}
  return <input autoFocus value={text} placeholder={placeholder} onClick={stop} onChange={e=>setText(e.target.value)} onBlur={save}
    onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();if(e.key==='Escape'){setEdit(false)}}}
    style={{width,background:'#0D1B2A',border:'1px solid #C8973A',borderRadius:4,color:'#F4F6F8',fontSize:12,padding:'3px 6px'}}/>
}

// Click to pick a date (or clear it)
export function InlineDate({value,onSave,empty='—'}:{value:any,onSave:(v:string|null)=>void,empty?:string}){
  const [edit,setEdit]=useState(false)
  if(!edit)return <span className="pg-inline" onClick={e=>{stop(e);setEdit(true)}} title="Click to set the date" style={{cursor:'pointer',padding:'1px 2px'}}>{value||empty}</span>
  return <input type="date" autoFocus defaultValue={value||''} onClick={stop} onBlur={e=>{setEdit(false);const v=e.target.value||null;if(v!==(value||null))onSave(v)}}
    onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();if(e.key==='Escape')setEdit(false)}}
    style={{background:'#0D1B2A',border:'1px solid #C8973A',borderRadius:4,color:'#F4F6F8',fontSize:11,padding:'2px 4px'}}/>
}
