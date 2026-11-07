/** Document resource addresses never infer or mutate a Session binding. */
import {z} from 'zod'
import {resumeIdSchema} from '../identity.ts'
import type {ResumeId} from '../types.ts'
const prefix='dsh-resource://fast-resume/document/'
/** @param id Resume identity. @returns Public right-pane address. */
export function resumeAddress(id:ResumeId):string{return prefix+id}
/** @param address Untrusted resource URL. @returns Valid document identity, or undefined. */
export function parseResumeAddress(address:string):ResumeId|undefined{
 if(!address.startsWith(prefix)||!z.string().uuid().safeParse(address.slice(prefix.length)).success)return undefined
 const parsed=resumeIdSchema.safeParse(address.slice(prefix.length))
 return parsed.success?parsed.data:undefined
}
