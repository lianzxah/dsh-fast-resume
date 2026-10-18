/** Validated MessagePort messages. The frame receives data and capabilities, never credentials. */
import { z } from 'zod'
import {resumeIdSchema as resume, resumeRevisionSchema as revision, versionIdSchema, proposalIdSchema} from './identity.ts'
const id=z.string().min(1).max(256),text=z.string().max(14_000_000)
export const snapshotSchema=z.object({id:resume,title:z.string(),revision,pageCount:z.number().int().positive(),updatedAt:z.string(),documentJson:text,sessionId:z.string().optional()})
export const jobSchema=z.object({id,resumeId:resume,revision,documentJson:text,format:z.enum(['pdf','png']),pixelRatio:z.number().min(.1).max(4),pageId:id.optional(),deadline:z.number()})
export const recoverySchema=z.object({id:resume,revision,documentJson:text,updatedAt:z.number(),ownerId:id,editorId:id,localRevision:z.number().int().positive().safe()})
export const requestSchemas={
 list:z.tuple([]),create:z.tuple([z.object({title:z.string().min(1).max(512),templateId:id.optional(),documentJson:text.optional(),sessionId:id.optional()})]),
 read:z.tuple([resume]),save:z.tuple([z.object({id:resume,expectedRevision:revision,documentJson:text,versionName:z.string().max(256).optional(),sessionId:id.optional()})]),
 rename:z.tuple([resume,revision,z.string().min(1).max(512)]),duplicate:z.tuple([resume]),deleteResume:z.tuple([resume,revision]),history:z.tuple([resume]),versionRead:z.tuple([resume,versionIdSchema]),
 applyProposal:z.tuple([z.object({id:resume,proposalId:proposalIdSchema,requestId:id})]),revert:z.tuple([z.object({id:resume,expectedRevision:revision,proposalId:proposalIdSchema,requestId:id})]),restore:z.tuple([z.object({id:resume,expectedRevision:revision,versionId:versionIdSchema,requestId:id})]),
 importDocument:z.tuple([z.object({filename:z.string().max(512),format:z.enum(['json','markdown','docx','pdf']),dataBase64:text,title:z.string().optional()})]),
 exportDocument:z.tuple([z.object({id:resume,expectedRevision:revision,format:z.enum(['json','pdf','png']),pageId:id.optional()})]),
 recoveryRead:z.tuple([resume]),recoveryWrite:z.tuple([recoverySchema]),recoveryRemove:z.tuple([recoverySchema,revision]),
 sessionCreate:z.tuple([]),
 prompt:z.tuple([z.object({id:resume,revision,selectedIds:z.array(id).max(1000),text:z.string().min(1).max(100_000),sessionId:id.optional(),requestId:id})]),
 conversation:z.tuple([id.optional()]),render:z.tuple([jobSchema]),
} as const
export type Method=keyof typeof requestSchemas
export type Arguments<K extends Method>=z.infer<(typeof requestSchemas)[K]>
export const requestSchema=z.object({kind:z.literal('request'),id,method:z.enum(Object.keys(requestSchemas) as [Method,...Method[]]),args:z.array(z.unknown())}).strict()
export const responseSchema=z.discriminatedUnion('ok',[
 z.object({kind:z.literal('response'),id,ok:z.literal(true),value:z.unknown()}),
 z.object({kind:z.literal('response'),id,ok:z.literal(false),error:z.object({message:z.string(),code:z.string().optional(),currentRevision:z.number().optional()})}),
])
export const bootstrapSchema=z.object({nonce:id,recoveryOwnerId:id,recoveryOwnerPersistent:z.boolean(),mode:z.enum(['editor','renderer']),locale:z.enum(['zh','en']),autosaveDelayMs:z.number().positive(),maxImportBytes:z.number().positive(),maxDocumentBytes:z.number().positive(),frameConnectTimeoutMs:z.number().positive(),bridgeTimeoutMs:z.number().positive(),rendererPollIntervalMs:z.number().positive(),refreshIntervalMs:z.number().positive()})
export type Bootstrap=z.infer<typeof bootstrapSchema>
export type Recovery=z.infer<typeof recoverySchema>
/** Reject malformed and method-mismatched messages before dispatch. */
export function parseRequest(value: unknown) { const envelope=requestSchema.parse(value);return {...envelope,args:requestSchemas[envelope.method].parse(envelope.args)} }
