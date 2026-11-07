/** Real editor store checkpoint and contiguous AI history adapters. */
import {parseResumeBackup} from '@resume-editor/shared'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import type {ResumeSnapshot,ResumeRevision} from '../types.ts'
import {validateEditorCheckpoint as validate,checkpointSelection as selection} from '../checkpoint.ts'
export {validateCheckpointSize,type EditorCheckpoint} from '../checkpoint.ts'
function clean(){const state=useEditorStore.getState();if(state.isDirty||state.isSaving||state.saveError)throw Error('Save the local draft before transferring or loading an AI revision');return state}
/** Capture a clean store after its SaveCoordinator has drained saves and recovery writes.
 * @param snapshot Acknowledged document revision held by that coordinator.
 * @param maximum Configured checkpoint byte budget.
 * @returns Validated independent checkpoint suitable for durable recovery and transfer.
 */
export function captureEditorCheckpoint(snapshot:ResumeSnapshot,maximum:number){
 const s=clean()
 return validate({schemaVersion:1,resumeId:snapshot.id,revision:snapshot.revision,document:s.document,past:s.past,future:s.future,history:s.history,historyIndex:s.historyIndex,documentRevision:s.documentRevision,activePageIndex:s.activePageIndex,selection:s.selection,viewport:s.viewport,fitMode:s.fitMode,fitGeneration:s.fitGeneration,ui:s.ui,clipboard:s.clipboard},snapshot,maximum)
}
/** Restore only after the incoming instance has read the exact acknowledged revision.
 * @param value Untrusted checkpoint received through the bridge.
 * @param snapshot Current Host acknowledgement.
 * @param maximum Configured checkpoint byte budget.
 */
export function restoreEditorCheckpoint(value:unknown,snapshot:ResumeSnapshot,maximum:number):void{
 clean();const checkpoint=validate(value,snapshot,maximum)
 const {schemaVersion,resumeId,revision,...state}=checkpoint
 useEditorStore.setState({...state,resumeId,isDirty:false,isSaving:false,saveError:null,lastSavedAt:snapshot.updatedAt,canvasSize:null})
}
/** Install one contiguous acknowledged AI batch without notifying autosave of a dirty document.
 * @param snapshot Committed Host document.
 * @param receipt Batch identity and its actual base revision.
 * @param acknowledged The coordinator's latest installed acknowledgement.
 * @returns False for an already installed revision, true for one newly installed batch.
 */
export function installCommittedRevision(snapshot:ResumeSnapshot,receipt:{baseRevision:ResumeRevision;batchId:string},acknowledged:ResumeSnapshot):boolean{
 if(snapshot.id!==acknowledged.id||!receipt.batchId)throw Error('AI receipt identity does not match the editor')
 if(snapshot.revision===acknowledged.revision&&snapshot.documentJson===acknowledged.documentJson)return false
 const state=clean()
 if(state.document.id!==snapshot.id||receipt.baseRevision!==acknowledged.revision||snapshot.revision!==receipt.baseRevision+1)throw Error('Editor revision gap: reload the committed document to reconcile history')
 const document=parseResumeBackup(snapshot.documentJson).document
 if(document.id!==snapshot.id||document.pages.length!==snapshot.pageCount)throw Error('AI document acknowledgement does not match')
 const history=[...state.history.slice(0,state.historyIndex+1),{id:receipt.batchId,timestamp:Date.now(),description:'AI',document}].slice(-50)
 const pageId=state.document.pages[state.activePageIndex]?.id,index=document.pages.findIndex(page=>page.id===pageId)
 useEditorStore.setState({document,past:[...state.past,state.document].slice(-50),future:[],history,historyIndex:history.length-1,documentRevision:state.documentRevision+1,activePageIndex:index<0?Math.min(state.activePageIndex,document.pages.length-1):index,selection:selection(document,state.selection),isDirty:false,lastSavedAt:snapshot.updatedAt})
 return true
}
