/** Typed browser capabilities over the validated parent-owned MessagePort. */
import { z } from 'zod'
import {versionIdSchema,proposalIdSchema,resumeRevisionSchema,resumeIdSchema} from '../identity.ts'
import type {ResumeId,ResumeRevision,ResumeVersionId} from '../types.ts'
import { parseResumeBackup } from '@resume-editor/shared'
import type {BridgeHandler} from './bridge.ts'
import type {EditorTransfer,EditorClaim,EditorRollback} from '../types.ts'
import { sessionSaveResultSchema,snapshotSchema,recoverySchema,ownershipSchema,preparationSchema,requestSchemas,type Recovery,type Bootstrap } from '../protocol.ts'
import type { CreateRequest,SaveRequest,ImportRequest,ExportRequest,ApplyRequest,RevertRequest,RestoreRequest } from '../types.ts'
import type { PortBridge } from './bridge.ts'
function snapshot(value:unknown,id?:string,revision?:number){const result=snapshotSchema.parse(value);const doc=parseResumeBackup(result.documentJson).document;if((id!==undefined&&result.id!==id)||(revision!==undefined&&result.revision!==revision)||doc.id!==result.id||doc.pages.length!==result.pageCount)throw Error('Document acknowledgement does not match the request');return result}
const version=z.object({id:versionIdSchema,revision:resumeRevisionSchema,name:z.string(),createdAt:z.string()})
const proposal=z.object({id:proposalIdSchema,baseRevision:resumeRevisionSchema,summary:z.string(),operationsJson:z.string(),beforeAfterJson:z.string(),status:z.enum(['proposed','applied'])})
const change=z.object({requestId:z.string(),revision:resumeRevisionSchema,proposalId:proposalIdSchema.optional(),versionId:versionIdSchema.optional(),revertedProposalId:proposalIdSchema.optional(),changedElementIds:z.array(z.string()),createdAt:z.string()})
const history=z.object({versions:z.array(version),proposals:z.array(proposal),changes:z.array(change)})
const receiptSchema=z.object({id:z.string(),resumeId:resumeIdSchema,revision:resumeRevisionSchema,format:z.enum(['json','pdf','png']),filename:z.string(),byteSize:z.number(),pageCount:z.number(),width:z.number(),height:z.number(),dimensionUnit:z.enum(['mm','px']),dataBase64:z.string(),artifactPath:z.string()})
/** Frame-lifetime API. Every acknowledgement is validated before it changes editor state. */
export function createEditorApi(port:PortBridge,config:Bootstrap){let localRevision=0;const owned=new Map<string,Recovery>();const owners=new Map<ResumeId,Promise<import('../types.ts').EditorOwnership>>()
 const transferTokens=new Map<import('../types.ts').EditorTransferId,import('../types.ts').EditorToken>()
 let assistantState:import('../types.ts').AssistantEntryState|undefined;const assistantListeners=new Set<()=>void>()
 let visible=true;const visibilityListeners=new Set<()=>void>()
 let association:import('../types.ts').ResumeSessionSaveResult['association']|undefined;const associationListeners=new Set<()=>void>()
 let launchPending=!!config.launch?.checkpointId
 let handoff:BridgeHandler|undefined
 const waiting=new Set<()=>void>()
 const receive:BridgeHandler=async(method,args,signal)=>{
  if(method==='assistantStatus'){assistantState=requestSchemas.assistantStatus.parse(args)[0];for(const listener of assistantListeners)listener();return true}
  if(method==='editorVisibility'){visible=requestSchemas.editorVisibility.parse(args)[0];for(const listener of visibilityListeners)listener();return true}
  if(!handoff)await new Promise<void>((resolve,reject)=>{const ready=()=>{cleanup();resolve()},abort=()=>{cleanup();reject(Error('Editor readiness cancelled'))},cleanup=()=>{waiting.delete(ready);signal.removeEventListener('abort',abort)};if(signal.aborted){abort();return}waiting.add(ready);signal.addEventListener('abort',abort,{once:true})})
  if(signal.aborted||!handoff)throw Error('Editor is unavailable')
  return method==='editorReady'?true:handoff(method,args,signal)
 }
 const adopt=(id:ResumeId,value:unknown)=>{const result=ownershipSchema.parse(value);owners.set(id,Promise.resolve(result));return result}
 const register=(id:ResumeId,recoveryPending:boolean,acquisition:'available'|'recover'='available')=>{const pending=port.call('editorRegister',requestSchemas.editorRegister.parse([{resumeId:id,ownerId:config.recoveryOwnerId,incarnationId:config.nonce,recoveryPending,acquisition}])).then(value=>ownershipSchema.parse(value)).catch(error=>{if(owners.get(id)===pending)owners.delete(id);throw error});owners.set(id,pending);return pending}
 const capability=async(id:ResumeId)=>(await (owners.get(id)??register(id,true))).token
 return {
 register,receive,
 /** Last conversation-save association; consumers keep this separate from document save errors. */
 association:()=>association,subscribeAssociation:(listener:()=>void)=>{associationListeners.add(listener);return()=>{associationListeners.delete(listener)}},
 /** Report a clean installed revision after render; absence invalidates prior loaded evidence. */
 installed:async(resumeId:ResumeId,revision:ResumeRevision|undefined,signal:AbortSignal)=>z.boolean().parse(await port.call('editorInstalled',[{resumeId,revision}],signal)),
 assistantState:()=>assistantState,subscribeAssistant:(listener:()=>void)=>{assistantListeners.add(listener);return()=>{assistantListeners.delete(listener)}},
 recoverView:async(id:ResumeId)=>z.boolean().parse(await port.call('editorRecoverView',[id])),
 assistant:async(id:ResumeId)=>z.boolean().parse(await port.call('editorAssistant',[id])),
 selectTarget:(id:ResumeId,revision:ResumeRevision)=>port.call('editorSelectTarget',[id,revision]),
 navigate:async(id?:ResumeId)=>z.boolean().parse(await port.call('editorNavigate',[id])),
 visible:()=>visible, subscribeVisibility:(listener:()=>void)=>{visibilityListeners.add(listener);return()=>{visibilityListeners.delete(listener)}},
 pendingHandoff:(id:ResumeId)=>launchPending&&config.launch?.resumeId===id,
 onHandoff:(handler:BridgeHandler)=>{handoff=handler;for(const ready of waiting)ready();return()=>{if(handoff===handler)handoff=undefined}},
 transfer:async(request:Omit<EditorTransfer,'sourceToken'|'sourceIncarnationId'>)=>{const sourceToken=await capability(request.resumeId);transferTokens.clear();transferTokens.set(request.transferId,sourceToken);return z.boolean().parse(await port.call('editorTransfer',requestSchemas.editorTransfer.parse([{...request,sourceToken,sourceIncarnationId:config.nonce}])))},
 claim:async(request:Omit<EditorClaim,'incarnationId'>)=>{const result=z.object({token:ownershipSchema.shape.token,uncertain:z.boolean(),checkpointJson:z.string(),revision:resumeRevisionSchema}).parse(await port.call('editorClaim',requestSchemas.editorClaim.parse([{...request,incarnationId:config.nonce}])));adopt(request.resumeId,result);return result},
 activate:async(request:Omit<EditorClaim,'incarnationId'>,revision:ResumeRevision)=>{const ownership=adopt(request.resumeId,await port.call('editorActivate',requestSchemas.editorActivate.parse([{...request,incarnationId:config.nonce,token:await capability(request.resumeId),revision}])));launchPending=false;return ownership},
 rollback:async(request:Pick<EditorRollback,'resumeId'|'transferId'>)=>adopt(request.resumeId,await port.call('editorRollback',requestSchemas.editorRollback.parse([{...request,sourceToken:transferTokens.get(request.transferId)??await capability(request.resumeId),sourceIncarnationId:config.nonce}]))),
 poll:async(id:ResumeId)=>preparationSchema.nullable().parse(await port.call('editorPoll',[id,await capability(id)])),
 acknowledge:async(id:ResumeId,preparationId:import('../types.ts').EditorPreparationId,revision:ResumeRevision,clean:boolean)=>z.boolean().parse(await port.call('editorAcknowledge',[{resumeId:id,token:await capability(id),preparationId,revision,clean}])),
 reconcile:async(id:ResumeId,expectedRevision:ResumeRevision)=>ownershipSchema.parse(await port.call('editorReconcile',[{resumeId:id,token:await capability(id),expectedRevision}])),
 disconnect:async(id:ResumeId,detached=false)=>owners.has(id)?z.boolean().parse(await port.call('editorDisconnect',[id,await capability(id),detached])):true,
 config,
 list:async()=>z.array(snapshotSchema.omit({documentJson:true,sessionId:true})).parse(await port.call('list',[])),
 create:async(r:CreateRequest)=>snapshot(await port.call('create',[r])),
 read:async(id:ResumeId)=>snapshot(await port.call('read',[id]),id),
 save:async(r:SaveRequest)=>{
  const token=await capability(r.id),sessionId=config.launch?.source==='conversation'?config.launch.sessionId:undefined
  if(!sessionId)return snapshot(await port.call('save',[r,token]),r.id,r.expectedRevision+1)
  const result=sessionSaveResultSchema.parse(await port.call('saveInSession',[{contextSessionId:sessionId,save:r,token}]))
  const saved=snapshot(result.snapshot,r.id,r.expectedRevision+1);association=result.association;for(const listener of associationListeners)listener();return saved
 },
 rename:async(id:ResumeId,revision:ResumeRevision,title:string)=>snapshot(await port.call('rename',[id,revision,title,await capability(id)]),id,revision+1),
 duplicate:async(id:ResumeId)=>snapshot(await port.call('duplicate',[id])),
 deleteResume:async(id:ResumeId,revision:ResumeRevision)=>z.boolean().parse(await port.call('deleteResume',[id,revision,await capability(id)])),
 changeReceipt:async(id:ResumeId,revision:ResumeRevision)=>{const receipt=change.nullable().parse(await port.call('changeReceipt',[id,revision]));if(receipt&&receipt.revision!==revision)throw Error('Change receipt does not match the requested revision');return receipt},
 history:async(id:ResumeId)=>history.parse(await port.call('history',[id])),
 version:async(id:ResumeId,versionId:ResumeVersionId)=>snapshot(await port.call('versionRead',[id,versionId]),id),
 apply:async(r:ApplyRequest)=>change.parse(await port.call('applyProposal',[r,await capability(r.id)])),
 revert:async(r:RevertRequest)=>change.parse(await port.call('revert',[r,await capability(r.id)])),
 restore:async(r:RestoreRequest)=>change.parse(await port.call('restore',[r,await capability(r.id)])),
 import:async(r:ImportRequest)=>snapshot(await port.call('importDocument',[r])),
 export:async(r:ExportRequest)=>{const receipt=receiptSchema.parse(await port.call('exportDocument',[r]));if(receipt.resumeId!==r.id||receipt.revision!==r.expectedRevision||receipt.format!==r.format||receipt.dimensionUnit!==(r.format==='png'?'px':'mm'))throw Error('Export receipt does not match the request');return receipt},
 recovery:async(id:ResumeId)=>z.array(recoverySchema).parse(await port.call('recoveryRead',[id])),
 backup:async(r:Omit<Recovery,'ownerId'|'editorId'|'localRevision'>)=>{const record={...r,ownerId:config.recoveryOwnerId,editorId:config.nonce,localRevision:++localRevision};owned.set(r.id,record);return z.boolean().parse(await port.call('recoveryWrite',[record]))},
 clearBackup:async(id:ResumeId,revision:ResumeRevision,json:string,selected?:Recovery)=>{const record=selected??owned.get(id);if(!record)return true;return z.boolean().parse(await port.call('recoveryRemove',[{...record,documentJson:json},revision]))},
 createSession:async()=>z.object({sessionId:z.string()}).parse(await port.call('sessionCreate',[])),
 prompt:async(r:{id:ResumeId;revision:ResumeRevision;selectedIds:string[];text:string;sessionId?:string;requestId:string})=>z.object({sessionId:z.string()}).parse(await port.call('prompt',[r])),
 conversation:async(id?:string)=>z.boolean().parse(await port.call('conversation',[id])),
}}
export type EditorApi=ReturnType<typeof createEditorApi>
/** Browser download from an acknowledged Host receipt. */
export function downloadReceipt(receipt:z.infer<typeof receiptSchema>){
 const bytes=Uint8Array.from(atob(receipt.dataBase64),c=>c.charCodeAt(0));if(bytes.length!==receipt.byteSize)throw Error('Export byte receipt does not match')
 const url=URL.createObjectURL(new Blob([bytes],{type:receipt.format==='pdf'?'application/pdf':receipt.format==='png'?'image/png':'application/json'}))
 const anchor=document.createElement('a');anchor.href=url;anchor.download=receipt.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
/** Base64 encode bytes without overflowing the JavaScript call stack. */
export function encodeBytes(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary)}
