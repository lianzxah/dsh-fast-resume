/** Agent-scoped resume tools using the ordinary Harness tool log and pure output rendering. */
import {resumeIdSchema,resumeRevisionSchema,proposalIdSchema,versionIdSchema} from '../identity.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { ResumeDocument, ResumeElement } from '../types.ts'
import type {} from './index.ts'

/** Loader identity. */
export const name='fast-resume-tools'
/** Required shared services; registration follows each exact live Agent scope. */
export const inject=['agents','tools','fastResume']
const output={type:'json'} as const satisfies ValueSchemaSpec
const render=(_args:unknown,value:InferValue<typeof output>):[{type:'text';text:string}]=>[{type:'text',text:JSON.stringify(value)}]
const id={type:'string',required:true,description:'Resume id returned by resume_list or resume_create.'} as const
const revision={type:'integer',required:true,description:'Exact committed revision last read.'} as const
const key={type:'string',required:true,description:'Unique request id; reuse only for an identical retry.'} as const
// Serializing projects nominal DTO interfaces onto the registry's canonical JSON value type.
const json=(value:unknown):InferValue<typeof output>=>JSON.parse(JSON.stringify(value))
/** Project inline images into usable document-local references without exposing bytes.
 * @param element Saved element, including recursive groups.
 * @returns Detached model-visible element.
 */
export function withoutImageBytes(element:ResumeElement):ResumeElement {const copy=structuredClone(element);if(copy.type==='image'&&copy.src.startsWith('data:'))copy.src=`resume-asset:${copy.id}`;if(copy.type==='group')copy.children=copy.children.map(withoutImageBytes);return copy}
/** Project a committed document into model-visible references without inline image bytes.
 * @param document Complete committed document.
 * @returns Detached document whose canvas and profile assets remain referenceable.
 */
export function projectDocumentForModel(document:ResumeDocument):ResumeDocument{const copy=structuredClone(document);copy.pages=copy.pages.map(page=>({...page,elements:page.elements.map(withoutImageBytes)}));if(copy.resumeData?.personalInfo.avatar?.startsWith('data:'))copy.resumeData.personalInfo.avatar='resume-asset:@profile/avatar';return copy}
function install(ctx:Context,agent:Agent):()=>void {
 const scoped=agent.ctx;const service=ctx.fastResume;const disposers:Array<()=>void>=[]
 const register=(tool:Parameters<typeof scoped.tools.register>[0])=>disposers.push(scoped.tools.register(tool))
 try{
 register(defineTool({name:'resume_list',description:'List resumable profile documents without loading their contents.',parameters:{},output:{schema:output,render},async execute(){return json(await service.list())}}))
 register(defineTool({name:'resume_create',description:'Create a blank resume or one of template-classic, template-modern, template-creative, template-academic, template-dark, template-minimal.',parameters:{title:{type:'string',required:true},templateId:{type:'string'}},output:{schema:output,render},async execute(args){const snapshot=await service.create(args);const{documentJson:_document,...summary}=snapshot;return json(summary)}}))
 register(defineTool({name:'resume_read',description:'Read an editable resume at its committed revision. Inline image bytes are replaced with stable resume-asset references. Preserve facts; ask the user for missing achievements or experience.',parameters:{id,pageId:{type:'string'},elementId:{type:'string'}},output:{schema:output,render},async execute(args){const snapshot=await service.read(resumeIdSchema.parse(args.id));const document=projectDocumentForModel(JSON.parse(snapshot.documentJson));document.pages=document.pages.filter(page=>args.pageId===undefined||page.id===args.pageId);const find=(elements:ResumeElement[]):ResumeElement|undefined=>{for(const element of elements){if(element.id===args.elementId)return element;if(element.type==='group'){const nested=find(element.children);if(nested)return nested}}return undefined};return json({id:snapshot.id,revision:snapshot.revision,...(args.elementId===undefined?{document}:{element:find(document.pages.flatMap(page=>page.elements))??null})})}}))
 register(defineTool({name:'resume_propose',description:'Propose bounded typed edits at a base revision; does not change the document. operationsJson is an array of text.replace {elementId,content}, element.update {elementId,patch} (style, image, layout, visible, locked, links), element.insert {pageId,parentId?,element}, element.delete {elementId}, element.reorder {elementId,index}, page.insert {page,index?}, page.delete {pageId}, page.update {pageId,config}, template.apply {templateId}, semantic.replace {resumeData,relayout}. Preserve all facts and never invent experience or achievements.',parameters:{id,expectedRevision:revision,requestId:key,operationsJson:{type:'string',required:true},summary:{type:'string',required:true}},output:{schema:output,render},async execute(args){const proposal=await service.propose({...args,id:resumeIdSchema.parse(args.id),expectedRevision:resumeRevisionSchema.parse(args.expectedRevision)});const{beforeAfterJson:_documents,...preview}=proposal;return json(preview)}}))
 register(defineTool({name:'resume_apply',description:'Apply an explicitly selected durable proposal exactly once at its original base revision; stale proposals fail without partial edits.',parameters:{id,proposalId:{type:'string',required:true},requestId:key},output:{schema:output,render},async execute(args){return json(await service.applyProposal({...args,id:resumeIdSchema.parse(args.id),proposalId:proposalIdSchema.parse(args.proposalId)}))}}))
 register(defineTool({name:'resume_revert',description:'Undo an applied agent proposal as a new revision, preserving unrelated later fields and rejecting overlaps.',parameters:{id,expectedRevision:revision,proposalId:{type:'string',required:true},requestId:key},output:{schema:output,render},async execute(args){return json(await service.revert({...args,id:resumeIdSchema.parse(args.id),expectedRevision:resumeRevisionSchema.parse(args.expectedRevision),proposalId:proposalIdSchema.parse(args.proposalId)}))}}))
 register(defineTool({name:'resume_history',description:'List retained versions, proposal previews and atomic change receipts.',parameters:{id},output:{schema:output,render},async execute(args){const history=await service.history(resumeIdSchema.parse(args.id));return json({...history,proposals:history.proposals.map(({beforeAfterJson:_documents,...proposal})=>proposal)})}}))
 register(defineTool({name:'resume_restore',description:'Restore a retained version as a new mutation; revision numbers never roll back.',parameters:{id,expectedRevision:revision,versionId:{type:'string',required:true},requestId:key},output:{schema:output,render},async execute(args){return json(await service.restore({...args,id:resumeIdSchema.parse(args.id),expectedRevision:resumeRevisionSchema.parse(args.expectedRevision),versionId:versionIdSchema.parse(args.versionId)}))}}))
 register(defineTool({name:'resume_export',description:'Export committed JSON/PDF/PNG bytes to a durable local artifact and return its path and metadata. PDF/PNG require a connected Harness client renderer; PNG selects a page.',parameters:{id,expectedRevision:revision,format:{type:'string',required:true,enum:['json','pdf','png']},pageId:{type:'string'}},output:{schema:output,render},async execute(args,exec){const{dataBase64:_bytes,...receipt}=await service.exportDocument({...args,id:resumeIdSchema.parse(args.id),expectedRevision:resumeRevisionSchema.parse(args.expectedRevision)},exec.signal);return json(receipt)}}))
 }catch(error){for(const dispose of disposers.reverse())dispose();throw error}
 return()=>{for(const dispose of disposers.reverse())dispose()}
}
/** Install tools for existing and newly created normal agents without replacing preset compositions.
 * @param ctx Plugin scope with shared services.
 */
export function apply(ctx:Context):void {
 const installed=new Map<Agent,()=>void>()
 const add=(agent:Agent):void=>{if(!installed.has(agent))installed.set(agent,install(ctx,agent))}
 for(const agent of ctx.agents.list())add(agent)
 ctx.on('agent/created',({agent})=>{add(agent)})
 ctx.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent)})
 ctx.effect(()=>()=>{for(const dispose of installed.values())dispose();installed.clear()},'fastResume.agentTools()')
}
