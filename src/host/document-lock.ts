/** Shared document writer lock for ownership changes and envelope mutations. */
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {withFileLock} from '@deepseek-ai/dsh-atomic-write'
import {z} from 'zod'
import type {ResolvedConfig,ResumeId} from '../types.ts'
/** Serialize document authorization with writers without acquiring Session context locks.
 * @param config Resolved profile storage.
 * @param id Document identity.
 * @param operation Writer-local operation.
 * @returns Operation result.
 */
export async function withDocumentLock<T>(config:ResolvedConfig,id:ResumeId,operation:()=>Promise<T>):Promise<T>{
 z.string().uuid().parse(id)
 await mkdir(config.storageDir,{recursive:true,mode:0o700})
 return withFileLock(join(config.storageDir,`${id}.json`),operation,{waitMs:config.lockWaitMs})
}
