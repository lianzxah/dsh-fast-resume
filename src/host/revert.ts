/** Three-way reversal preserves unrelated fields and rejects overlapping edits. */
import { ResumeError } from './errors.ts'
const equal=(left:unknown,right:unknown):boolean=>JSON.stringify(left)===JSON.stringify(right)
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const keyed=(value:unknown):value is Array<Record<string,unknown>&{id:string}>=>Array.isArray(value)&&value.every(item=>record(item)&&typeof item.id==='string')
/** Reverse changed fields only when their current value still matches the applied change.
 * @param before Validated document before the agent mutation.
 * @param after Validated document immediately after the agent mutation.
 * @param current Current document that may contain unrelated user changes.
 * @returns Reconstructed value; conflicts never mutate any input.
 */
export function reverseChange(before:unknown,after:unknown,current:unknown):unknown {
 if(equal(before,after))return structuredClone(current)
 if(equal(current,after))return structuredClone(before)
 if(record(before)&&record(after)&&record(current)){
  const result=structuredClone(current)
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
   // Save timestamps belong to the restoring commit, not user content.
   if(key==='updatedAt')continue
   if(equal(before[key],after[key]))continue
   const value=reverseChange(before[key],after[key],current[key]);if(value===undefined)delete result[key];else result[key]=value
  }
  return result
 }
 if(keyed(before)&&keyed(after)&&keyed(current)){
  const beforeIds=before.map(item=>item.id);const afterIds=after.map(item=>item.id);const currentIds=current.map(item=>item.id)
  const beforeMap=new Map(before.map(item=>[item.id,item]));const afterMap=new Map(after.map(item=>[item.id,item]));const currentMap=new Map(current.map(item=>[item.id,item]))
  if(equal(beforeIds,afterIds)){
   for(const item of before)if(!equal(item,afterMap.get(item.id))&&!currentMap.has(item.id))throw new ResumeError('conflict','An edited layer or page was deleted after this agent edit')
   return current.map(item=>beforeMap.has(item.id)?reverseChange(beforeMap.get(item.id),afterMap.get(item.id),item):structuredClone(item))
  }
  if(!equal(currentIds,afterIds))throw new ResumeError('conflict','Layer or page order changed after this agent edit')
  for(const item of after)if(!beforeMap.has(item.id)&&!equal(item,currentMap.get(item.id)))throw new ResumeError('conflict','An inserted layer changed after this agent edit')
  return before.map(item=>afterMap.has(item.id)?reverseChange(item,afterMap.get(item.id),currentMap.get(item.id)):structuredClone(item))
 }
 throw new ResumeError('conflict','A field changed after this agent edit; review the overlapping edit before undoing')
}
