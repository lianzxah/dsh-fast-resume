/** Product-facing explicit editor handoff; callers own navigation and Session creation. */
import {brandString} from '@deepseek-ai/dsh-brand'
import {resumeRevisionSchema} from '../identity.ts'
import {z} from 'zod'
import {requestSchemas} from '../protocol.ts'
import type {Dispatch} from './frame.tsx'
import type {EditorOwnerId,EditorIncarnationId,EditorTransferId,EditorCheckpointId,ResumeId,ResumeRevision} from '../types.ts'
import type {PortBridge} from '../editor/bridge.ts'
/** Preallocated destination generation; pass it unchanged to connectFrame. */
export interface EditorIdentity {ownerId:EditorOwnerId;incarnationId:EditorIncarnationId}
/** A connected generation; ready waits for its actual editor and viewport mount. */
export interface EditorReadyHandle extends EditorIdentity {bridge:PortBridge}
/** Retained source history and designated destination; no Session association is implied. */
export interface RetainedEditorHandoff {target:EditorIdentity;resumeId:ResumeId;transferId:EditorTransferId;checkpointId:EditorCheckpointId;revision:ResumeRevision}
/** Attached source support for rollback before navigation. */
export interface PreparedEditorHandoff extends RetainedEditorHandoff {source:EditorReadyHandle}
/** Unknown target outcomes retain the descriptor needed for a fresh recovery launch. */
export class EditorHandoffRecoveryError extends Error {
 readonly code='editor-handoff-recovery'
 constructor(readonly handoff:RetainedEditorHandoff,cause:unknown,readonly recoveryTarget?:EditorIdentity){super('Editor transfer needs recovery from its retained checkpoint',{cause})}
}
/** Allocate a target generation before mounting its frame.
 * @param ownerId Source recovery owner.
 * @returns Identity for preparation and target connectFrame options.
 */
export function editorDestination(ownerId:EditorOwnerId):EditorIdentity{return{ownerId,incarnationId:brandString<EditorIncarnationId>(crypto.randomUUID())}}
/** Save, drain recovery, capture actual state and retain it before source release.
 * @param source Mounted source generation.
 * @param target Preallocated target identity.
 * @param resumeId Explicit current document.
 * @param signal Caller cancellation; failures attempt an acknowledged source rollback.
 * @returns Retained handoff for later launch/create/bind/navigation orchestration.
 */
export async function prepareEditorHandoff(source:EditorReadyHandle,target:EditorIdentity,resumeId:ResumeId,signal?:AbortSignal):Promise<PreparedEditorHandoff>{
 const transferId=brandString<EditorTransferId>(crypto.randomUUID()),checkpointId=brandString<EditorCheckpointId>(crypto.randomUUID())
 await source.bridge.call('editorReady',[],signal)
 try{const result=z.object({revision:resumeRevisionSchema}).parse(await source.bridge.call('editorCapture',[{resumeId,transferId,checkpointId,targetOwnerId:target.ownerId,targetIncarnationId:target.incarnationId}],signal));return{source,target,resumeId,transferId,checkpointId,revision:result.revision}}
 catch(error){if(error instanceof Error&&'code' in error&&error.code==='editor-handoff-retained')throw error;try{await source.bridge.call('editorResume',[{resumeId,transferId}])}catch(rollback){throw Error('Transfer outcome is uncertain; keep the source open and recover ownership',{cause:rollback})}throw error}
}
/** Restore exact history and viewport, then acknowledge loaded revision before target writes.
 * @param prepared Retained source handoff.
 * @param target Connected designated frame with checkpointId in its launch.
 * @param signal Caller cancellation.
 * @returns Loaded committed revision. Detached failures include durable recovery-launch information.
 */
export async function completeEditorHandoff(prepared:RetainedEditorHandoff,target:EditorReadyHandle,signal?:AbortSignal):Promise<ResumeRevision>{
 if(target.incarnationId!==prepared.target.incarnationId||target.ownerId!==prepared.target.ownerId)throw Error('Wrong destination editor generation')
 try{await target.bridge.call('editorReady',[],signal);const result=z.object({revision:resumeRevisionSchema}).parse(await target.bridge.call('editorLoad',[{resumeId:prepared.resumeId,transferId:prepared.transferId,checkpointId:prepared.checkpointId}],signal));if(result.revision!==prepared.revision)throw Error('Loaded editor revision differs');return result.revision}
 catch(error){if('source' in prepared){try{await rollbackEditorHandoff(prepared as PreparedEditorHandoff)}catch(recovery){throw new EditorHandoffRecoveryError(prepared,recovery)}throw error}throw new EditorHandoffRecoveryError(prepared,error)}
}
/** Revoke/confirm target ownership before re-enabling the retained source.
 * @param prepared Exact retained transfer.
 * @returns Acknowledgement; failure requires keeping the source fenced and visible.
 */
export async function rollbackEditorHandoff(prepared:PreparedEditorHandoff):Promise<void>{await prepared.source.bridge.call('editorResume',[{resumeId:prepared.resumeId,transferId:prepared.transferId}])}

/** Release the source dependency after durable preparation; journal this descriptor before navigation.
 * @param prepared Acknowledged retained checkpoint and fenced source.
 * @returns Serializable handoff usable after the source iframe unmounts. The caller may now dispose that view.
 */
export function releaseEditorHandoff(prepared:PreparedEditorHandoff):RetainedEditorHandoff{
 const {target,resumeId,transferId,checkpointId,revision}=prepared
 return{target,resumeId,transferId,checkpointId,revision}
}
/** Revoke a detached target and prepare a fresh global/conversation recovery frame.
 * @param retained Journaled handoff or a recovery error's descriptor.
 * @param target Explicit fresh identity, retained by the caller for identical retries.
 * @param dispatch Authenticated parent Host dispatcher; no old editor VM is required.
 * @param signal Caller cancellation. Unknown outcomes require retrying the same identity.
 * @returns Descriptor for mounting and completing the recovery editor from the same checkpoint.
 */
export async function recoverEditorHandoff(retained:RetainedEditorHandoff,target:EditorIdentity,dispatch:Dispatch,signal?:AbortSignal):Promise<RetainedEditorHandoff>{
 signal?.throwIfAborted()
 const request={resumeId:retained.resumeId,transferId:retained.transferId,checkpointId:retained.checkpointId,fromIncarnationId:retained.target.incarnationId,targetOwnerId:target.ownerId,targetIncarnationId:target.incarnationId}
 try{const result=z.object({revision:resumeRevisionSchema}).parse(await dispatch('editorRecover',requestSchemas.editorRecover.parse([request]),signal));if(result.revision!==retained.revision)throw Error('Recovery revision differs');return{...retained,target}}
 catch(error){throw new EditorHandoffRecoveryError(retained,error,target)}
}
