/** One retained checkpoint per document; unresolved recovery is never evicted. */
import {readFile,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {writeFileAtomic} from '@deepseek-ai/dsh-atomic-write'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {EditorOwnerId,ResolvedConfig,ResumeId} from '../types.ts'
import {transferSchema,editorTokenSchema} from '../protocol.ts'
import {ResumeError} from './errors.ts'
const uuid=z.string().uuid()
const schema=transferSchema.extend({schemaVersion:z.literal(1),recoveryTarget:z.boolean().optional(),sourceOwnerId:uuid.transform(brandString<EditorOwnerId>),phase:z.enum(['prepared','claimed','active','revoking','rolledback']),targetToken:editorTokenSchema,rollbackToken:editorTokenSchema})
/** Independently atomic transfer evidence; owner records remain a separate file. */
export type TransferRecord=z.infer<typeof schema>
/** Storage uses the coordinator's existing admission and document locks. */
export class TransferFile {
 constructor(private config:ResolvedConfig){}
 private path(id:ResumeId){uuid.parse(id);return join(this.config.storageDir,'transfers-v1',`${id}.json`)}
 /** Read bounded private recovery evidence; malformed evidence fences the document.
  * @param id Document identity.
  * @returns Record or absence.
  */
 async read(id:ResumeId):Promise<TransferRecord|undefined>{
  try{
   const path=this.path(id)
   // JSON escaping can expand each checkpoint byte to six bytes; metadata contains UUIDs only.
   if((await stat(path)).size>this.config.maxAssistantCheckpointBytes*6+4096)throw Error('Transfer exceeds budget')
   const parsed=schema.parse(JSON.parse(await readFile(path,'utf8')))
   if(parsed.resumeId!==id||Buffer.byteLength(parsed.checkpointJson)>this.config.maxAssistantCheckpointBytes)throw Error('Transfer identity or budget mismatch')
   return parsed
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw new ResumeError('invalid-storage','Transfer recovery is unreadable; retain the source editor and repair storage')}
 }
 /** Persist recovery before changing ownership.
  * @param record Complete bounded transfer record.
  * @returns Durable atomic-file acknowledgement.
  */
 write(record:TransferRecord){return writeFileAtomic(this.path(record.resumeId),JSON.stringify(record)+'\n',{mode:0o600,dirMode:0o700})}
}
