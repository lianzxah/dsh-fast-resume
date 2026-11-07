/** Shared checkpoint JSON validation; no editor runtime or actions are imported. */
import {z} from 'zod'
import {parseResumeBackup} from '../upstream/shared/src/index.ts'
import {resumeIdSchema,resumeRevisionSchema} from './identity.ts'
import type {ResumeSnapshot} from './types.ts'
const documentSchema=z.unknown().transform((value,ctx)=>{try{return parseResumeBackup(value).document}catch(error){ctx.addIssue({code:'custom',message:'Invalid checkpoint document'});return z.NEVER}})
const finite=z.number().finite(),positive=finite.positive(),index=z.number().int().nonnegative()
const schema=z.strictObject({
 schemaVersion:z.literal(1),resumeId:resumeIdSchema,revision:resumeRevisionSchema,
 document:documentSchema,past:z.array(documentSchema).max(50),future:z.array(documentSchema).max(50),
 history:z.array(z.strictObject({id:z.string(),timestamp:finite,description:z.string(),document:documentSchema})).max(50),historyIndex:z.number().int().min(-1),documentRevision:index,
 activePageIndex:index,selection:z.strictObject({selectedIds:z.array(z.string()),hoveredId:z.string().nullable()}),
 viewport:z.strictObject({scrollX:finite,scrollY:finite,anchor:z.strictObject({x:finite,y:finite}).optional(),zoom:z.strictObject({level:positive,minLevel:positive,maxLevel:positive})}),
 fitMode:z.enum(['width','page','manual']),fitGeneration:index,
 ui:z.strictObject({activeTool:z.enum(['select','text','shape','image','hand']),leftPanelTab:z.enum(['templates','components','layers','pages']),leftPanelVisible:z.boolean(),rightPanelVisible:z.boolean(),bottomPanelVisible:z.boolean(),bottomPanelHeight:positive,leftPanelWidth:positive,rightPanelWidth:positive,showGrid:z.boolean(),showRuler:z.boolean(),snapToGrid:z.boolean()}),
 clipboard:z.array(z.unknown()),
})
/** Serializable versioned checkpoint; actions and transient save state never cross the port. */
export type EditorCheckpoint=z.infer<typeof schema>

/** Enforce the JSON byte budget before constructing a combined checkpoint string.
 * @param value JSON-compatible checkpoint input.
 * @param maximum Positive byte budget from the resolved Host configuration.
 */
export function validateCheckpointSize(value:unknown,maximum:number):void{
 if(!Number.isSafeInteger(maximum)||maximum<=0)throw Error('Invalid checkpoint byte budget')
 let bytes=0
 const seen=new Set<object>()
 const add=(count:number)=>{bytes+=count;if(bytes>maximum)throw Error('Editor checkpoint exceeds the configured byte limit')}
 const string=(text:string)=>{add(2);for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c===34||c===92)add(2);else if(c<32)add([8,9,10,12,13].includes(c)?2:6);else if(c<128)add(1);else if(c<2048)add(2);else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){add(4);i++}else add(c>=0xd800&&c<=0xdfff?6:3)}}
 const walk=(item:unknown,depth:number):void=>{
  if(depth>128)throw Error('Editor checkpoint nesting is invalid')
  if(item===null){add(4);return}if(typeof item==='string'){string(item);return}if(typeof item==='boolean'){add(item?4:5);return}if(typeof item==='number'&&Number.isFinite(item)){add(String(item).length);return}
  if(typeof item!=='object'||seen.has(item))throw Error('Editor checkpoint is not valid JSON')
  seen.add(item);add(2)
  if(Array.isArray(item)){for(let i=0;i<item.length;i++){if(i)add(1);walk(item[i],depth+1)}}
  else {let first=true;for(const [key,child] of Object.entries(item)){if(child===undefined)continue;if(!first)add(1);first=false;string(key);add(1);walk(child,depth+1)}}
  seen.delete(item)
 }
 walk(value,0)
}
/** Keep only elements present in the committed document.
 * @param document Validated document.
 * @param current Captured selection.
 * @returns Selection limited to existing elements.
 */
export function checkpointSelection(document:EditorCheckpoint['document'],current:EditorCheckpoint['selection']){
 const ids=new Set<string>()
 const visit=(elements:EditorCheckpoint['document']['pages'][number]['elements'])=>{for(const element of elements){ids.add(element.id);if(element.type==='group')visit(element.children)}}
 for(const page of document.pages)visit(page.elements)
 return{selectedIds:current.selectedIds.filter(id=>ids.has(id)),hoveredId:current.hoveredId&&ids.has(current.hoveredId)?current.hoveredId:null}
}
/** Validate and independently clone exact committed history within the byte budget.
 * @param value Untrusted checkpoint JSON value.
 * @param snapshot Exact acknowledged Host revision.
 * @param maximum Resolved byte budget.
 * @returns Normalized checkpoint; failures do not mutate the editor.
 */
export function validateEditorCheckpoint(value:unknown,snapshot:ResumeSnapshot,maximum:number){
 validateCheckpointSize(value,maximum)
 const checkpoint=schema.parse(value)
 if(checkpoint.resumeId!==snapshot.id||checkpoint.revision!==snapshot.revision||checkpoint.document.id!==snapshot.id)throw Error('Editor checkpoint revision does not match the committed document')
 const committed=parseResumeBackup(snapshot.documentJson).document
 const normalized={...checkpoint.document,metadata:{...checkpoint.document.metadata,updatedAt:committed.metadata.updatedAt}}
 validateCheckpointSize({...checkpoint,document:normalized},maximum)
 if(JSON.stringify(normalized)!==JSON.stringify(committed))throw Error('Editor checkpoint content does not match the committed document')
 checkpoint.document=committed
 if(checkpoint.activePageIndex>=checkpoint.document.pages.length||checkpoint.historyIndex>=checkpoint.history.length)throw Error('Editor checkpoint state is invalid')
 for(const doc of [...checkpoint.past,...checkpoint.future,...checkpoint.history.map(entry=>entry.document)])if(doc.id!==snapshot.id)throw Error('Editor checkpoint history belongs to another document')
 const clipboard=parseResumeBackup({...checkpoint.document,pages:[{...checkpoint.document.pages[0],elements:checkpoint.clipboard}]}).document.pages[0]!.elements
 const result={...checkpoint,clipboard,selection:checkpointSelection(checkpoint.document,checkpoint.selection)}
 validateCheckpointSize(result,maximum)
 return structuredClone(result)
}
