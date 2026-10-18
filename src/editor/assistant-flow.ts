/** Associates a normal Session through the serialized document owner before prompting its exact acknowledged revision. */
import type {ResumeId,ResumeRevision,ResumeSnapshot} from '../types.ts'
interface PromptInput { snapshot:ResumeSnapshot; sessionId?:string; text:string; selectedIds:string[] }
interface PromptCalls {
 createSession:()=>Promise<{sessionId:string}>
 associate:(sessionId:string)=>Promise<ResumeSnapshot>
 prompt:(r:{id:ResumeId;revision:ResumeRevision;sessionId:string;text:string;selectedIds:string[];requestId:string})=>Promise<{sessionId:string}>
 onSession:(sessionId:string)=>void
}
/** No document mutation follows prompt admission; an immediate agent apply cannot race an association save. */
export async function sendResumePrompt(input:PromptInput,calls:PromptCalls):Promise<{sessionId:string}>{
 const sessionId=input.sessionId??input.snapshot.sessionId??(await calls.createSession()).sessionId
 calls.onSession(sessionId)
 const snapshot=input.snapshot.sessionId===sessionId?input.snapshot:await calls.associate(sessionId)
 return calls.prompt({id:snapshot.id,revision:snapshot.revision,sessionId,text:input.text,selectedIds:input.selectedIds,requestId:crypto.randomUUID()})
}
