/** Validated recursive editing and source-compatible document factories. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { DEFAULT_PAGE_CONFIG, applyAiEditProposal, validateResumeDocument, resumeDataToPages } from '../../upstream/shared/src/index.ts'
import { getTemplateById } from '../../upstream/templates/src/index.ts'
import type { ResumeDocument, ResumeElement, ResumeOperation } from '../types.ts'
import { ResumeError, assertNever } from './errors.ts'

/** Decode document JSON without losing upstream image/link/group fields.
 * @param input Untrusted value decoded at a durable or transport input.
 * @param maxBytes Maximum serialized document bytes.
 * @returns A complete validated upstream document.
 */
export function validateDocument(input: unknown, maxBytes: number): ResumeDocument {
  const serialized = JSON.stringify(input)
  if (serialized === undefined || Buffer.byteLength(serialized) > maxBytes) throw new ResumeError('invalid-input', 'Document exceeds the configured byte limit')
  const result = validateResumeDocument(input)
  if (!result.success) throw new ResumeError('invalid-input', result.issues.map(i=>`${i.path}: ${i.message}`).join('; '))
  return result.document
}
/** Decode JSON with a structured input failure.
 * @param text JSON input.
 * @returns Decoded untrusted value.
 */
export function decodeJson(text: string): unknown { try { return JSON.parse(text) } catch (error) { throw new ResumeError('invalid-input', `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`) } }
/** Make a new independently identified document, including every nested group.
 * @param document Existing validated document.
 * @param title New title.
 * @returns Detached duplicate with fresh document/page/element ids.
 */
export function duplicateDocument(document: ResumeDocument, title: string): ResumeDocument {
  const copy = structuredClone(document)
  copy.id = randomUUID(); copy.metadata.title = title
  copy.metadata.createdAt = copy.metadata.updatedAt = new Date().toISOString()
  const fresh = (elements: ResumeElement[]): void => { for (const element of elements) { element.id = randomUUID(); if (element.type === 'group') fresh(element.children) } }
  for (const page of copy.pages) { page.id = randomUUID(); fresh(page.elements) }
  return copy
}
/** Build a blank or one of the six retained templates.
 * @param title Document title.
 * @param templateId Optional exact upstream template id.
 * @returns Fresh editable document.
 */
export function newDocument(title: string, templateId?: string): ResumeDocument {
  const timestamp = new Date().toISOString()
  const template = templateId === undefined ? undefined : getTemplateById(templateId)
  if (templateId !== undefined && template === undefined) throw new ResumeError('invalid-input', `Unknown template ${templateId}`)
  return duplicateDocument({ id:randomUUID(),version:'1.0.0', metadata:{title,author:'',createdAt:timestamp,updatedAt:timestamp},pageConfig:structuredClone(template?.pageConfig ?? DEFAULT_PAGE_CONFIG),pages:structuredClone(template?.pages ?? [{id:randomUUID(),pageNumber:1,elements:[]}]),...(templateId === undefined ? {} : {templateId}) },title)
}
const elementId = z.string().min(1)
const patch = z.record(z.string(),z.unknown()).refine(value=>!['id','type','children','__proto__','constructor','prototype'].some(key=>Object.hasOwn(value,key)), 'Element identity, type, and children cannot be patched')
const operationsSchema = z.array(z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('text.replace'),elementId,content:z.string()}),
  z.strictObject({type:z.literal('element.update'),elementId,patch}),
  z.strictObject({type:z.literal('element.insert'),pageId:elementId,parentId:elementId.optional(),element:z.unknown()}),
  z.strictObject({type:z.literal('element.delete'),elementId}),
  z.strictObject({type:z.literal('element.reorder'),elementId,index:z.number().int().nonnegative()}),
  z.strictObject({type:z.literal('page.insert'),page:z.unknown(),index:z.number().int().nonnegative().optional()}),
  z.strictObject({type:z.literal('page.delete'),pageId:elementId}),
  z.strictObject({type:z.literal('page.update'),pageId:elementId,config:z.record(z.string(),z.unknown())}),
  z.strictObject({type:z.literal('template.apply'),templateId:elementId}),
  z.strictObject({type:z.literal('semantic.replace'),resumeData:z.unknown(),relayout:z.boolean()}),
])).min(1)
/** Validate and atomically preview a bounded operation list; final validation covers inserted objects.
 * @param document Validated committed source.
 * @param json Untrusted operation array JSON.
 * @param maxOperations Configured list bound.
 * @param maxBytes Configured document bound.
 * @returns Validated target and stable changed element ids.
 */
export function applyOperations(document: ResumeDocument,json: string,maxOperations: number,maxBytes: number): {document:ResumeDocument;changedElementIds:string[]} {
  if (Buffer.byteLength(json)>maxBytes) throw new ResumeError('invalid-input','Operations exceed document byte limit')
  const parsed=operationsSchema.max(maxOperations).safeParse(decodeJson(json))
  if(!parsed.success) throw new ResumeError('invalid-input',parsed.error.message)
  // Inserted payloads are admitted only by complete document validation below, before persistence.
  const operations=parsed.data as ResumeOperation[]
  const assets=new Map<string,string>()
  const collect=(elements:ResumeElement[])=>{for(const element of elements){if(element.type==='image')assets.set(element.id,element.src);if(element.type==='group')collect(element.children)}}
  for(const page of document.pages)collect(page.elements)
  if(document.resumeData?.personalInfo.avatar)assets.set('@profile/avatar',document.resumeData.personalInfo.avatar)
  const resolveAssets=(value:unknown):void=>{
    if(typeof value!=='object'||value===null)return
    if(Array.isArray(value)){for(const item of value)resolveAssets(item);return}
    for(const field of ['src','avatar'] as const){if(field in value){const record=value as Record<string,unknown>,reference=record[field];if(typeof reference==='string'&&reference.startsWith('resume-asset:')){const source=assets.get(reference.slice('resume-asset:'.length));if(source===undefined||source.startsWith('resume-asset:'))throw new ResumeError('invalid-input','Image asset reference does not exist at the committed base revision');record[field]=source}}}
    for(const item of Object.values(value))resolveAssets(item)
  }
  for(const operation of operations)resolveAssets(operation)
  let next=structuredClone(document); const changed=new Set<string>()
  function locate(id:string,elements?:ResumeElement[]): {element:ResumeElement;siblings:ResumeElement[];index:number} | undefined {
    if(elements===undefined){for(const page of next.pages){const found=locate(id,page.elements);if(found)return found}return undefined}
    for(let index=0;index<elements.length;index++){const element=elements[index]; if(element.id===id)return{element,siblings:elements,index};if(element.type==='group'){const found=locate(id,element.children);if(found)return found}}
    return undefined
  }
  function target(id:string){const found=locate(id);if(!found)throw new ResumeError('invalid-input',`Element ${id} does not exist`);return found}
  for(const operation of operations){
    switch(operation.type){
      case 'text.replace': {
        const found=target(operation.elementId)
        if(found.element.type!=='text'&&found.element.type!=='shape')throw new ResumeError('invalid-input','Text replacement requires a text or shape element')
        // Reuse upstream pure validation/fact protection for nested elements through an isolated page.
        const temporary={...next,pages:[{...next.pages[0],elements:[found.element]}]}
        try {
          const applied=applyAiEditProposal({id:randomUUID(),title:'Text edit',rationale:'Requested text replacement',risk:'medium',commands:[{type:'text.replace',elementId:found.element.id,nextContent:operation.content}],preview:{changedElementIds:[found.element.id],summary:[]},requiresConfirmation:true},temporary)
          found.siblings[found.index]=applied.document.pages[0].elements[0]
        } catch(error){throw new ResumeError('invalid-input',error instanceof Error?error.message:String(error))}
        changed.add(operation.elementId);break
      }
      case 'element.update':{Object.assign(target(operation.elementId).element,operation.patch);changed.add(operation.elementId);break}
      case 'element.insert':{
        const page=next.pages.find(p=>p.id===operation.pageId);if(!page)throw new ResumeError('invalid-input','Page does not exist')
        let siblings=page.elements
        if(operation.parentId){const parent=locate(operation.parentId,page.elements)?.element;if(parent?.type!=='group')throw new ResumeError('invalid-input','Parent group does not exist on the selected page');siblings=parent.children}
        siblings.push(operation.element);changed.add(operation.element.id);break
      }
      case 'element.delete':{const found=target(operation.elementId);found.siblings.splice(found.index,1);changed.add(operation.elementId);break}
      case 'element.reorder':{const found=target(operation.elementId);found.siblings.splice(found.index,1);found.siblings.splice(operation.index,0,found.element);found.siblings.forEach((element,index)=>{element.zIndex=index});changed.add(operation.elementId);break}
      case 'page.insert':next.pages.splice(operation.index??next.pages.length,0,operation.page);break
      case 'page.delete':{const index=next.pages.findIndex(p=>p.id===operation.pageId);if(index<0)throw new ResumeError('invalid-input','Page does not exist');next.pages.splice(index,1);break}
      case 'page.update':{const page=next.pages.find(p=>p.id===operation.pageId);if(!page)throw new ResumeError('invalid-input','Page does not exist');page.config={...page.config,...operation.config};break}
      case 'template.apply':{const replacement=newDocument(next.metadata.title,operation.templateId);next={...next,pageConfig:replacement.pageConfig,pages:replacement.pages,templateId:operation.templateId};break}
      case 'semantic.replace':next.resumeData=operation.resumeData;if(operation.relayout)next.pages=resumeDataToPages(operation.resumeData);break
      default:assertNever(operation)
    }
    // Validate each intermediate state before the next operation can dereference it.
    next=validateDocument(next,maxBytes)
  }
  next.pages.forEach((page,index)=>{page.pageNumber=index+1})
  return{document:validateDocument(next,maxBytes),changedElementIds:[...changed]}
}
