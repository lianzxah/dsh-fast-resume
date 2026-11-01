/** Resume creation and import dialogs share the workspace theme and mutation guards. */
import React,{useEffect,useId,useRef,useState,type CSSProperties} from 'react'
import {ArrowUpRight,Check,FilePlus2,FileText,LayoutTemplate,LoaderCircle,Plus,ShieldCheck,Sparkles,UploadCloud} from 'lucide-react'
import {templates} from '@resume-editor/templates'
import type {ResumeTemplate} from '@resume-editor/shared'
import type {ResumeSnapshot} from '../types.ts'
import type {EditorApi} from './api.ts'
import {encodeBytes} from './api.ts'
import type {Copy} from './locales.ts'
import {Modal} from './modal.tsx'

type DialogProps={api:EditorApi;copy:Copy;close:()=>void;onOpen:(snapshot:ResumeSnapshot)=>void}
function Notice({error}:{error:string}){return error?<p className="fr-compose-error" role="alert">{error}</p>:null}
function TemplatePreview({template}:{template:ResumeTemplate}){
 return <svg viewBox="0 0 794 1123" aria-hidden="true" className="fr-template-paper"><rect width="794" height="1123" fill={template.pageConfig.backgroundColor}/>{template.pages[0]?.elements.map(element=>{
  if(element.type==='shape')return <rect key={element.id} x={element.left} y={element.top} width={element.width} height={element.height} rx={element.borderRadius} fill={element.fill}/>
  if(element.type==='text')return <text key={element.id} x={element.left} y={element.top+element.fontSize} fill={element.color} fontSize={element.fontSize} fontWeight={element.fontWeight} fontFamily="sans-serif">{element.content.split('\n').slice(0,4).map((line,index)=><tspan x={element.left} dy={index===0?0:element.fontSize*element.lineHeight} key={`${element.id}-${index}`}>{line}</tspan>)}</text>
  return null
 })}</svg>
}
function illuminate(event:React.PointerEvent<HTMLButtonElement>){
 if(event.pointerType!=='mouse')return
 const rect=event.currentTarget.getBoundingClientRect()
 event.currentTarget.style.setProperty('--spotlight-x',`${event.clientX-rect.left}px`)
 event.currentTarget.style.setProperty('--spotlight-y',`${event.clientY-rect.top}px`)
}

/** Creates one editable document from the selected blank page or template.
 * @param props Profile API, localized copy and dialog navigation actions.
 * @returns A guarded creation form with template previews.
 */
export function CreateResumeDialog({api,copy,close,onOpen}:DialogProps){
 const [title,setTitle]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const descriptionId=useId(),active=useRef(true),pending=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const submit=async()=>{
  if(pending.current||!title.trim())return
  pending.current=true;setBusy(true);setError('')
  try{const saved=await api.create({title:title.trim(),templateId:selected||undefined});if(active.current)onOpen(saved)}
  catch(error){if(active.current)setError(error instanceof Error?error.message:copy.error)}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 return <Modal title={copy.new} className="fr-compose-modal fr-create-modal" descriptionId={descriptionId} titleIcon={<span className="fr-compose-emblem"><Sparkles size={23} aria-hidden="true"/></span>} closeLabel={copy.close} dismissible={!busy} close={close}>
  <div className="fr-compose-intro"><span className="fr-compose-eyebrow">{copy.createEyebrow}</span><p id={descriptionId}>{copy.createDescription}</p></div>
  <form onSubmit={event=>{event.preventDefault();void submit()}}>
   <label className="fr-compose-name"><span>{copy.name}</span><input value={title} required maxLength={512} disabled={busy} placeholder={copy.namePlaceholder} onChange={event=>setTitle(event.target.value)}/></label>
   <fieldset className="fr-template-fieldset" disabled={busy}><legend><LayoutTemplate size={15} aria-hidden="true"/>{copy.chooseTemplate}<small>{copy.templateHint}</small></legend>
    <div className="fr-template-gallery"><button type="button" disabled={busy} aria-pressed={!selected} className="fr-template-choice fr-template-blank" onPointerMove={illuminate} onClick={()=>setSelected('')}><div className="fr-template-art"><span className="fr-template-blank-paper"><Plus size={25} aria-hidden="true"/></span></div><span className="fr-template-name">{copy.blank}</span><span className="fr-template-check"><Check size={12} aria-hidden="true"/></span></button>
     {templates.map((template,index)=><button type="button" disabled={busy} key={template.id} aria-label={template.name} aria-pressed={selected===template.id} className="fr-template-choice" style={{'--template-color':template.theme.primaryColor,'--card-order':index+1} as CSSProperties} onPointerMove={illuminate} onClick={()=>setSelected(template.id)}><div className="fr-template-art"><TemplatePreview template={template}/></div><span className="fr-template-name">{template.name}</span><span className="fr-template-check"><Check size={12} aria-hidden="true"/></span></button>)}
    </div>
   </fieldset>
   <p className="fr-template-description"><Check size={14} aria-hidden="true"/>{selected?templates.find(template=>template.id===selected)?.description:copy.blankDescription}</p>
   <Notice error={error}/>
   <footer className="fr-compose-footer"><span><FilePlus2 size={15} aria-hidden="true"/>{copy.selectedTemplate} · {selected?templates.find(template=>template.id===selected)?.name:copy.blank}</span><div><button type="button" disabled={busy} onClick={close}>{copy.cancel}</button><button className="fr-compose-primary" disabled={busy||!title.trim()} aria-busy={busy}>{busy?<LoaderCircle size={16} className="fr-history-spinner" aria-hidden="true"/>:<ArrowUpRight size={16} aria-hidden="true"/>}{busy?copy.pending:copy.create}</button></div></footer>
  </form>
 </Modal>
}

/** Imports file bytes or Markdown as a separate document; pending reads also prevent dismissal.
 * @param props Profile API, localized copy and dialog navigation actions.
 * @returns File-drop and text-import controls with visible validation failures.
 */
export function ImportResumeDialog({api,copy,onOpen,close}:DialogProps){
 const [markdown,setMarkdown]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false)
 const active=useRef(true),pending=useRef(false),descriptionId=useId()
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const importBytes=async(filename:string,format:'json'|'markdown'|'docx'|'pdf',read:()=>Promise<Uint8Array>)=>{
  if(pending.current)return
  pending.current=true;setBusy(true);setError('')
  try{
   const bytes=await read();if(!active.current)return
   if(bytes.length>api.config.maxImportBytes){setError(copy.tooLarge);return}
   const saved=await api.import({filename,format,dataBase64:encodeBytes(bytes)});if(active.current)onOpen(saved)
  }catch(error){if(active.current)setError(error instanceof Error?error.message:copy.error)}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 const fileSelected=(file:File)=>{
  if(pending.current)return
  const ext=file.name.split('.').at(-1)?.toLowerCase(),format=ext==='md'||ext==='markdown'?'markdown':ext==='json'||ext==='docx'||ext==='pdf'?ext:null
  if(!format){setError(copy.unsupported);return}
  if(file.size>api.config.maxImportBytes){setError(copy.tooLarge);return}
  void importBytes(file.name,format,async()=>new Uint8Array(await file.arrayBuffer()))
 }
 return <Modal title={copy.import} className="fr-compose-modal fr-import-modal" descriptionId={descriptionId} titleIcon={<span className="fr-compose-emblem"><UploadCloud size={24} aria-hidden="true"/></span>} closeLabel={copy.close} dismissible={!busy} close={close}>
  <div className="fr-compose-intro"><span className="fr-compose-eyebrow">{copy.importEyebrow}</span><p id={descriptionId}>{copy.importDescription}</p></div>
  <div className="fr-import-grid"><section className="fr-import-file"><h3><FileText size={16} aria-hidden="true"/>{copy.importFile}</h3>
   <label className="fr-drop-zone" data-dragging={dragging||undefined} onDragOver={event=>{event.preventDefault();if(!pending.current)setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);const file=event.dataTransfer.files[0];if(file)fileSelected(file)}}>
    <input aria-label={copy.selectFile} type="file" accept=".json,.md,.markdown,.docx,.pdf" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)fileSelected(file);event.target.value=''}}/>
    <span className="fr-drop-orbit" aria-hidden="true"><UploadCloud size={29}/></span><strong>{busy?copy.pending:copy.dropTitle}</strong><span>{copy.dropHint}</span><span className="fr-file-formats" aria-hidden="true">{['JSON','Markdown','DOCX','PDF'].map(format=><span key={format}>{format}</span>)}</span>
   </label><p className="fr-import-limit">{copy.fileLimit} · {Math.round(api.config.maxImportBytes/1024/1024*10)/10} MB</p>
  </section><section className="fr-import-text"><h3><FilePlus2 size={16} aria-hidden="true"/>{copy.importMarkdown}</h3><label><span className="fr-import-text-hint">{copy.markdownHint}</span><textarea aria-label={copy.markdown} placeholder={copy.markdownPlaceholder} disabled={busy} value={markdown} onChange={event=>setMarkdown(event.target.value)}/></label><button className="fr-compose-primary" disabled={busy||!markdown.trim()} onClick={()=>{void importBytes('resume.md','markdown',async()=>new TextEncoder().encode(markdown))}}>{busy?<LoaderCircle size={16} className="fr-history-spinner" aria-hidden="true"/>:<ArrowUpRight size={16} aria-hidden="true"/>}{busy?copy.pending:copy.importText}</button></section></div>
  <Notice error={error}/><footer className="fr-compose-footer"><span><ShieldCheck size={15} aria-hidden="true"/>{copy.importNote}</span><button disabled={busy} onClick={close}>{copy.cancel}</button></footer>
 </Modal>
}
