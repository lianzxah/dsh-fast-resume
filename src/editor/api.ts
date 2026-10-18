/** Typed browser capabilities over the validated parent-owned MessagePort. */
import { z } from 'zod'
import {versionIdSchema,proposalIdSchema,resumeRevisionSchema,resumeIdSchema} from '../identity.ts'
import type {ResumeId,ResumeRevision,ResumeVersionId} from '../types.ts'
import { parseResumeBackup } from '@resume-editor/shared'
import { snapshotSchema,recoverySchema,type Recovery,type Bootstrap } from '../protocol.ts'
import type { CreateRequest,SaveRequest,ImportRequest,ExportRequest,ApplyRequest,RevertRequest,RestoreRequest } from '../types.ts'
import type { PortBridge } from './bridge.ts'
function snapshot(value:unknown,id?:string,revision?:number){const result=snapshotSchema.parse(value);const doc=parseResumeBackup(result.documentJson).document;if((id!==undefined&&result.id!==id)||(revision!==undefined&&result.revision!==revision)||doc.id!==result.id||doc.pages.length!==result.pageCount)throw Error('Document acknowledgement does not match the request');return result}
const version=z.object({id:versionIdSchema,revision:resumeRevisionSchema,name:z.string(),createdAt:z.string()})
const proposal=z.object({id:proposalIdSchema,baseRevision:resumeRevisionSchema,summary:z.string(),operationsJson:z.string(),beforeAfterJson:z.string(),status:z.enum(['proposed','applied'])})
const change=z.object({requestId:z.string(),revision:resumeRevisionSchema,proposalId:proposalIdSchema.optional(),versionId:versionIdSchema.optional(),revertedProposalId:proposalIdSchema.optional(),changedElementIds:z.array(z.string()),createdAt:z.string()})
const history=z.object({versions:z.array(version),proposals:z.array(proposal),changes:z.array(change)})
const receiptSchema=z.object({id:z.string(),resumeId:resumeIdSchema,revision:resumeRevisionSchema,format:z.enum(['json','pdf','png']),filename:z.string(),byteSize:z.number(),pageCount:z.number(),width:z.number(),height:z.number(),dimensionUnit:z.enum(['mm','px']),dataBase64:z.string(),artifactPath:z.string()})
/** Frame-lifetime API. Every acknowledgement is validated before it changes editor state. */
export function createEditorApi(port:PortBridge,config:Bootstrap){let localRevision=0;const owned=new Map<string,Recovery>();return {
 config,
 list:async()=>z.array(snapshotSchema.omit({documentJson:true,sessionId:true})).parse(await port.call('list',[])),
 create:async(r:CreateRequest)=>snapshot(await port.call('create',[r])),
 read:async(id:ResumeId)=>snapshot(await port.call('read',[id]),id),
 save:async(r:SaveRequest)=>snapshot(await port.call('save',[r]),r.id,r.expectedRevision+1),
 rename:async(id:ResumeId,revision:ResumeRevision,title:string)=>snapshot(await port.call('rename',[id,revision,title]),id,revision+1),
 duplicate:async(id:ResumeId)=>snapshot(await port.call('duplicate',[id])),
 deleteResume:async(id:ResumeId,revision:ResumeRevision)=>z.boolean().parse(await port.call('deleteResume',[id,revision])),
 history:async(id:ResumeId)=>history.parse(await port.call('history',[id])),
 version:async(id:ResumeId,versionId:ResumeVersionId)=>snapshot(await port.call('versionRead',[id,versionId]),id),
 apply:async(r:ApplyRequest)=>change.parse(await port.call('applyProposal',[r])),
 revert:async(r:RevertRequest)=>change.parse(await port.call('revert',[r])),
 restore:async(r:RestoreRequest)=>change.parse(await port.call('restore',[r])),
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
