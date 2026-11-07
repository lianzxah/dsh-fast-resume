/** Validated MessagePort messages. The frame receives data and capabilities, never credentials. */
import { z } from 'zod'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {EditorToken,EditorOwnerId,EditorIncarnationId,EditorPreparationId,EditorTransferId,EditorCheckpointId} from './types.ts'
import {resumeIdSchema as resume, resumeRevisionSchema as revision, versionIdSchema, proposalIdSchema,resumeSessionIdSchema} from './identity.ts'
const id=z.string().min(1).max(256),text=z.string().max(14_000_000)
export const snapshotSchema=z.object({id:resume,title:z.string(),revision,pageCount:z.number().int().positive(),updatedAt:z.string(),documentJson:text,sessionId:z.string().optional()})
export const jobSchema=z.object({id,resumeId:resume,revision,documentJson:text,format:z.enum(['pdf','png']),pixelRatio:z.number().min(.1).max(4),pageId:id.optional(),deadline:z.number()})
export const recoverySchema=z.object({id:resume,revision,documentJson:text,updatedAt:z.number(),ownerId:id,editorId:id,localRevision:z.number().int().positive().safe()})
export const editorTokenSchema=z.string().uuid().transform(brandString<EditorToken>)
export const ownershipSchema=z.object({token:editorTokenSchema,uncertain:z.boolean()})
export const preparationSchema=z.object({id:z.string().uuid().transform(brandString<EditorPreparationId>),expectedRevision:revision,deadline:z.number()})
export const transferIdSchema=z.string().uuid().transform(brandString<EditorTransferId>)
export const checkpointIdSchema=z.string().uuid().transform(brandString<EditorCheckpointId>)
const incarnation=z.string().uuid().transform(brandString<EditorIncarnationId>),owner=z.string().uuid().transform(brandString<EditorOwnerId>)
export const launchSchema=z.object({resumeId:resume,sessionId:z.string().min(1).transform(brandString<import('@deepseek-ai/dsh-session/types').SessionId>).optional(),source:z.enum(['space','conversation']),checkpointId:checkpointIdSchema.optional()}).strict()
export const transferSchema=z.object({resumeId:resume,sourceToken:editorTokenSchema,sourceIncarnationId:incarnation,targetOwnerId:owner,targetIncarnationId:incarnation,transferId:transferIdSchema,checkpointId:checkpointIdSchema,revision,checkpointJson:z.string()}).strict()
const claimSchema=z.object({resumeId:resume,transferId:transferIdSchema,checkpointId:checkpointIdSchema,incarnationId:incarnation}).strict()
const saveRequestSchema=z.object({id:resume,expectedRevision:revision,documentJson:text,versionName:z.string().max(256).optional(),sessionId:id.optional()}).strict()
/** Validated conversation save with an owned editor capability. */
export const sessionSaveRequestSchema=z.object({contextSessionId:resumeSessionIdSchema,save:saveRequestSchema,token:editorTokenSchema}).strict()
/** Save acknowledgement with independent target association status. */
export const sessionSaveResultSchema=z.object({snapshot:snapshotSchema,association:z.enum(['bound','superseded','failed'])}).strict()
const uiAction=z.string().uuid().transform(brandString<import('./types.ts').ResumeUiActionId>)
const uiBase={sessionId:resumeSessionIdSchema,actionId:uiAction}
/** Explicit UI mutation input; restore remains outside the card action API. */
export const uiMutationRequestSchema=z.discriminatedUnion('kind',[
 z.object({...uiBase,kind:z.literal('apply'),request:z.object({id:resume,proposalId:proposalIdSchema,requestId:id}).strict()}).strict(),
 z.object({...uiBase,kind:z.literal('revert'),request:z.object({id:resume,expectedRevision:revision,proposalId:proposalIdSchema,requestId:id}).strict()}).strict(),
])
/** Committed receipt and independent post-commit acknowledgements. */
export const uiMutationResultSchema=z.object({resumeId:resume,sessionId:resumeSessionIdSchema,receipt:z.object({requestId:id,revision,proposalId:proposalIdSchema.optional(),versionId:versionIdSchema.optional(),revertedProposalId:proposalIdSchema.optional(),changedElementIds:z.array(z.string()),createdAt:z.string()}),association:z.enum(['bound','superseded','ambiguous','failed']),editor:z.enum(['released','uncertain','not-required'])}).strict()
/** Nonmutating exact-transfer lookup result; unknown never authorizes journal cleanup. */
export const editorTransferDispositionSchema=z.union([z.object({state:z.enum(['active','pending']),revision,currentRevision:revision}).strict(),z.object({state:z.literal('unknown')}).strict()])
export const requestSchemas={
 editorTransferRead:z.tuple([z.object({resumeId:resume,transferId:transferIdSchema,checkpointId:checkpointIdSchema}).strict()]),
 editorFeedback:z.tuple([z.object({resumeId:resume,revision,ids:z.array(id).max(1000),locate:z.boolean()}).strict()]),
 editorSelectTarget:z.tuple([resume,revision]),
 saveInSession:z.tuple([sessionSaveRequestSchema]),
 editorRecover:z.tuple([z.object({resumeId:resume,transferId:transferIdSchema,checkpointId:checkpointIdSchema,fromIncarnationId:incarnation,targetOwnerId:owner,targetIncarnationId:incarnation}).strict()]),
 editorTransfer:z.tuple([transferSchema]),editorClaim:z.tuple([claimSchema]),editorActivate:z.tuple([claimSchema.extend({token:editorTokenSchema,revision})]),editorRollback:z.tuple([z.object({resumeId:resume,transferId:transferIdSchema,sourceToken:editorTokenSchema,sourceIncarnationId:incarnation}).strict()]),
 editorInstalled:z.tuple([z.object({resumeId:resume,revision:revision.optional()}).strict()]),
 editorNavigate:z.tuple([resume.optional()]),
 editorVisibility:z.tuple([z.boolean()]),
 editorReady:z.tuple([]),editorCapture:z.tuple([z.object({resumeId:resume,targetOwnerId:owner,targetIncarnationId:incarnation,transferId:transferIdSchema,checkpointId:checkpointIdSchema}).strict()]),editorLoad:z.tuple([claimSchema.omit({incarnationId:true})]),editorResume:z.tuple([z.object({resumeId:resume,transferId:transferIdSchema}).strict()]),

 editorRegister:z.tuple([z.object({resumeId:resume,ownerId:z.string().uuid().transform(brandString<EditorOwnerId>),incarnationId:z.string().uuid().transform(brandString<EditorIncarnationId>),recoveryPending:z.boolean(),acquisition:z.enum(['available','recover']).optional()})]),
 editorPoll:z.tuple([resume,editorTokenSchema]),editorDisconnect:z.tuple([resume,editorTokenSchema,z.boolean().optional()]),
 editorAcknowledge:z.tuple([z.object({resumeId:resume,token:editorTokenSchema,preparationId:preparationSchema.shape.id,revision,clean:z.boolean()})]),
 editorReconcile:z.tuple([z.object({resumeId:resume,token:editorTokenSchema,expectedRevision:revision})]),
 list:z.tuple([]),create:z.tuple([z.object({title:z.string().min(1).max(512),templateId:id.optional(),documentJson:text.optional(),sessionId:id.optional()})]),
 changeReceipt:z.tuple([resume,revision]),
 read:z.tuple([resume]),save:z.tuple([z.object({id:resume,expectedRevision:revision,documentJson:text,versionName:z.string().max(256).optional(),sessionId:id.optional()}),editorTokenSchema]),
 rename:z.tuple([resume,revision,z.string().min(1).max(512),editorTokenSchema]),duplicate:z.tuple([resume]),deleteResume:z.tuple([resume,revision,editorTokenSchema]),history:z.tuple([resume]),versionRead:z.tuple([resume,versionIdSchema]),
 applyProposal:z.tuple([z.object({id:resume,proposalId:proposalIdSchema,requestId:id}),editorTokenSchema]),revert:z.tuple([z.object({id:resume,expectedRevision:revision,proposalId:proposalIdSchema,requestId:id}),editorTokenSchema]),restore:z.tuple([z.object({id:resume,expectedRevision:revision,versionId:versionIdSchema,requestId:id}),editorTokenSchema]),
 importDocument:z.tuple([z.object({filename:z.string().max(512),format:z.enum(['json','markdown','docx','pdf']),dataBase64:text,title:z.string().optional()})]),
 exportDocument:z.tuple([z.object({id:resume,expectedRevision:revision,format:z.enum(['json','pdf','png']),pageId:id.optional()})]),
 recoveryRead:z.tuple([resume]),recoveryWrite:z.tuple([recoverySchema]),recoveryRemove:z.tuple([recoverySchema,revision]),
 editorRecoverView:z.tuple([resume]),
 editorAssistant:z.tuple([resume]),
 assistantStatus:z.tuple([z.enum(['saving','creating','binding','mounting','ready','failed','outcome-unknown'])]),
 sessionCreate:z.tuple([]),
 prompt:z.tuple([z.object({id:resume,revision,selectedIds:z.array(id).max(1000),text:z.string().min(1).max(100_000),sessionId:id.optional(),requestId:id})]),
 conversation:z.tuple([id.optional()]),render:z.tuple([jobSchema]),
} as const
export type Method=keyof typeof requestSchemas
export type Arguments<K extends Method>=z.infer<(typeof requestSchemas)[K]>
export const requestSchema=z.object({kind:z.literal('request'),id,method:z.enum(Object.keys(requestSchemas) as [Method,...Method[]]),args:z.array(z.unknown()),generation:z.string().optional(),role:z.enum(['parent','editor']).optional()}).strict()
export const responseSchema=z.discriminatedUnion('ok',[
 z.object({kind:z.literal('response'),id,generation:z.string().optional(),role:z.enum(['parent','editor']).optional(),ok:z.literal(true),value:z.unknown()}),
 z.object({kind:z.literal('response'),id,generation:z.string().optional(),role:z.enum(['parent','editor']).optional(),ok:z.literal(false),error:z.object({message:z.string(),code:z.string().optional(),currentRevision:z.number().optional()})}),
])
export const bootstrapSchema=z.object({launch:launchSchema.optional(),maxAssistantCheckpointBytes:z.number().int().positive().safe(),nonce:id,recoveryOwnerId:id,recoveryOwnerPersistent:z.boolean(),mode:z.enum(['editor','renderer']),wheelZoomDirection:z.enum(['auto','standard','reversed']).default('auto'),locale:z.enum(['zh','en']),autosaveDelayMs:z.number().positive(),maxImportBytes:z.number().positive(),maxDocumentBytes:z.number().positive(),frameConnectTimeoutMs:z.number().positive(),bridgeTimeoutMs:z.number().positive(),rendererPollIntervalMs:z.number().positive(),refreshIntervalMs:z.number().positive(),editorPollIntervalMs:z.number().positive()})
export type Bootstrap=z.infer<typeof bootstrapSchema>
export type Recovery=z.infer<typeof recoverySchema>
/** Reject malformed and method-mismatched messages before dispatch. */
export function parseRequest(value: unknown) { const envelope=requestSchema.parse(value);return {...envelope,args:requestSchemas[envelope.method].parse(envelope.args)} }
