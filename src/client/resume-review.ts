/** Durable proposal reconciliation and nonmutating before/after text projection. */
import {z} from 'zod'
import type {ProposalView,ChangeReceipt} from '../types.ts'
/** Reconcile retained proposals with both application and selective Undo receipts.
 * @param proposal Current durable proposal, never the old logged result.
 * @param changes Current durable receipt history.
 * @param acknowledged Optional retained UI receipt while history refresh is pending.
 * @returns Safe review state and the exact committed receipt when present.
 */
export function reviewState(proposal:ProposalView,changes:ChangeReceipt[],acknowledged?:ChangeReceipt){
 const candidates=acknowledged?[...changes,acknowledged]:changes
 const receipt=candidates.filter(c=>c.proposalId===proposal.id||c.revertedProposalId===proposal.id).reduce<ChangeReceipt|undefined>((latest,next)=>!latest||next.revision>latest.revision?next:latest,undefined)
 return receipt?{state:receipt.revertedProposalId===proposal.id?'reverted' as const:'applied' as const,receipt}:proposal.status==='applied'?{state:'unknown' as const}:{state:'proposed' as const}
}
interface PreviewElement {id:string;type?:string;content?:string;children?:PreviewElement[]}
const element:z.ZodType<PreviewElement>=z.lazy(()=>z.object({id:z.string(),type:z.string().optional(),content:z.string().optional(),children:z.array(element).optional()}).passthrough())
const document=z.object({pages:z.array(z.object({id:z.string(),elements:z.array(element)}).passthrough())}).passthrough()
/** Reviewable values with stable IDs and one-based page context. */
export interface ReviewEntry {id:string;page:number;before:string;after:string;deleted?:true}
/** Extract text and changed object values from immutable preview documents.
 * @param json Stored before/after document pair.
 * @returns Changed entries; deleted entries have an empty after value.
 */
export function reviewEntries(json:string):ReviewEntry[]{
 const pair=z.object({before:document,after:document}).parse(JSON.parse(json))
 const flatten=(doc:z.infer<typeof document>)=>{const map=new Map<string,{page:number;text:string;raw:string}>();doc.pages.forEach((p,i)=>{const visit=(e:z.infer<typeof element>)=>{map.set(e.id,{page:i+1,text:e.content??e.type??'',raw:JSON.stringify(e)});e.children?.forEach(visit)};p.elements.forEach(visit);map.set(p.id,{page:i+1,text:'',raw:JSON.stringify(p)})});return map}
 const before=flatten(pair.before),after=flatten(pair.after)
 return [...new Set([...before.keys(),...after.keys()])].flatMap(id=>{const a=before.get(id),b=after.get(id);if(a?.raw===b?.raw)return[];const oldPage=pair.before.pages.find(p=>p.id===id),newPage=pair.after.pages.find(p=>p.id===id);if(oldPage&&newPage&&JSON.stringify({...oldPage,elements:[]})===JSON.stringify({...newPage,elements:[]}))return[];return[{id,page:b?.page??a!.page,before:a?.text??'',after:b?.text??'',...(b?{}:{deleted:true as const})}]})
}

/** Read validated page identities from a durable preview pair. */
export function previewDocuments(json:string){return z.object({before:document,after:document}).parse(JSON.parse(json))}

/** Check a current saved document before offering explicit navigation to an old change.
 * @param json Current saved document JSON.
 * @param id Changed element or page identity.
 * @returns Whether the current document still contains that target.
 */
export function hasReviewTarget(json:string,id:string):boolean{
 const doc=document.parse(JSON.parse(json)),contains=(values:PreviewElement[]):boolean=>values.some(e=>e.id===id||!!e.children&&contains(e.children))
 return doc.pages.some(page=>page.id===id||contains(page.elements))
}
