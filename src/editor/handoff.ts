/** Real store transfer operations; App retains gesture, save and viewport ownership. */
import {applyConversationPlacement} from './placement.ts'
import {flushSync} from 'react-dom'
import {requestSchemas} from '../protocol.ts'
import {captureEditorCheckpoint,restoreEditorCheckpoint,validateCheckpointSize} from './editor-checkpoint.ts'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import type {ViewportHandle} from '../../upstream/editor/src/lib/viewport-handoff.ts'
import type {EditorApi} from './api.ts'
import type {SaveCoordinator} from './persistence.ts'
import type {BridgeHandler} from './bridge.ts'
/** All callbacks refer to the mounted Editor generation, never a global controller. */
export interface HandoffEditor {api:EditorApi;coordinator:()=>SaveCoordinator|null;viewport:()=>ViewportHandle|null;begin:()=>void;fence:(value:boolean)=>void;blocked:()=>boolean;signal:AbortSignal}
/** Create the source/target handler consumed by the parent bridge.
 * @param editor Mounted editor's save, gesture and DOM adapters.
 * @returns Handler whose failures retain fencing until rollback acknowledgement.
 */
export function editorHandoff(editor:HandoffEditor):BridgeHandler{
 let queue:Promise<unknown>=Promise.resolve()
 const perform:BridgeHandler=async(method,args,caller)=>{
 const signal=AbortSignal.any([caller,editor.signal]),check=()=>{signal.throwIfAborted();if(!editor.api.visible())throw Error('Editor is hidden; show it before transferring')},api=editor.api,c=editor.coordinator()
 check();if(!c)throw Error('Editor is not loaded')
 if(method==='editorFeedback'){
  const [request]=requestSchemas.editorFeedback.parse(args)
  if(request.resumeId!==c.state.snapshot.id||request.revision!==c.state.snapshot.revision||c.state.dirty||c.state.saving||editor.blocked())throw Error('Exact clean revision is unavailable')
  const viewport=editor.viewport();if(!viewport?.feedback)throw Error('Canvas feedback is unavailable')
  viewport.feedback(request.ids,request.locate);return true
 }
 if(method==='editorCapture'){
  const [request]=requestSchemas.editorCapture.parse(args)
  if(request.resumeId!==c.state.snapshot.id)throw Error('Source document changed')
  let submitted=false,begun=false
  try{
   editor.begin();begun=true;if(editor.blocked())throw Error('Resolve recovery before transferring the editor')
   const snapshot=await c.prepare();check()
   const viewport=editor.viewport();if(!viewport)throw Error('Canvas is not mounted')
   const checkpoint=captureEditorCheckpoint(snapshot,api.config.maxAssistantCheckpointBytes)
   checkpoint.viewport={...checkpoint.viewport,...viewport.capture()}
   validateCheckpointSize(checkpoint,api.config.maxAssistantCheckpointBytes)
   check();submitted=true
   await api.transfer({...request,revision:snapshot.revision,checkpointJson:JSON.stringify(checkpoint)})
   check();return{revision:snapshot.revision}
  }catch(error){if(submitted){try{await api.rollback({resumeId:request.resumeId,transferId:request.transferId});if(!editor.signal.aborted)editor.fence(false)}catch(rollback){throw Error('Transfer outcome is uncertain; keep the source open and retry ownership recovery',{cause:rollback})}}else if(begun&&!editor.signal.aborted)editor.fence(false);throw Object.assign(error instanceof Error?error:Error('Editor handoff failed'),{code:'editor-handoff-retained'})}
 }
 if(method==='editorLoad'){
  const [request]=requestSchemas.editorLoad.parse(args)
  if(request.resumeId!==c.state.snapshot.id||api.config.launch?.checkpointId!==request.checkpointId)throw Error('Target launch does not match the checkpoint')
  editor.fence(true)
  const claimed=await api.claim(request);check()
  const snapshot=await api.read(request.resumeId);check()
  if(snapshot.revision!==claimed.revision||snapshot.revision!==c.state.snapshot.revision)throw Error('Target revision changed; retain the source history')
  const viewport=editor.viewport();if(!viewport)throw Error('Target canvas is not mounted')
  flushSync(()=>{restoreEditorCheckpoint(JSON.parse(claimed.checkpointJson),snapshot,api.config.maxAssistantCheckpointBytes);if(api.config.launch?.source==='conversation')applyConversationPlacement()})
  await viewport.restore(useEditorStore.getState().viewport,signal);check()
  await api.activate(request,snapshot.revision);check();editor.fence(false)
  return{revision:snapshot.revision}
 }
 if(method==='editorResume'){
  const [request]=requestSchemas.editorResume.parse(args)
  if(request.resumeId!==c.state.snapshot.id)throw Error('Source document changed')
  await api.rollback(request);check();editor.fence(false);return true
 }
 throw Error('Unavailable editor handoff capability')
 }
 return(method,args,signal)=>{const pending=queue.then(()=>perform(method,args,signal));queue=pending.catch(()=>{});return pending}
}
