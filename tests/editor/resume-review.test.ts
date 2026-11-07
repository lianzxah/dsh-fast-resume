import {expect,it} from 'vitest'
import {reviewState,reviewEntries,hasReviewTarget} from '../../src/client/resume-review.ts'
import {resumeRevisionSchema,proposalIdSchema} from '../../src/identity.ts'
const id=proposalIdSchema.parse('11111111-1111-4111-8111-111111111111'),revision=resumeRevisionSchema.parse(2)
const proposal={id,baseRevision:resumeRevisionSchema.parse(1),summary:'Text',operationsJson:'[]',beforeAfterJson:JSON.stringify({before:{pages:[{id:'p',elements:[{id:'e',type:'text',content:'Before'}]}]},after:{pages:[{id:'p',elements:[{id:'e',type:'text',content:'After'}]}]}}),status:'proposed' as const}
it('reconciles a stale proposed log with application and Undo receipts after a full reload',()=>{
 const receipt={requestId:'apply',revision,proposalId:id,changedElementIds:['e'],createdAt:''}
 expect(reviewState({...proposal,status:'applied'},[receipt])).toMatchObject({state:'applied',receipt})
 expect(reviewState({...proposal,status:'applied'},[receipt,{...receipt,requestId:'undo',revision:resumeRevisionSchema.parse(3),revertedProposalId:id}]).state).toBe('reverted')
 expect(reviewState({...proposal,status:'applied'},[]).state).toBe('unknown')
 expect(reviewState(proposal,[]).state).toBe('proposed')
})
it('shows changed and deleted elements with page context without changing the preview documents',()=>{
 const entries=reviewEntries(proposal.beforeAfterJson);expect(entries).toEqual([{id:'e',page:1,before:'Before',after:'After'}]);expect(proposal.beforeAfterJson).toContain('Before')
 const pair=JSON.parse(proposal.beforeAfterJson);pair.after.pages[0].elements=[]
 expect(reviewEntries(JSON.stringify(pair))[0]).toMatchObject({id:'e',before:'Before',after:''})
})

it('offers current navigation only for surviving targets, including pages and nested children',()=>{const json=JSON.stringify({pages:[{id:'page2',elements:[{id:'group',children:[{id:'child',content:'Text'}]}]}]});expect(hasReviewTarget(json,'child')).toBe(true);expect(hasReviewTarget(json,'page2')).toBe(true);expect(hasReviewTarget(json,'deleted')).toBe(false)})

it('prefers durable Undo over an older retained Apply and accepts a newly acknowledged Undo before history refresh',()=>{
 const applied={requestId:'apply',revision,proposalId:id,changedElementIds:['e'],createdAt:''},undone={requestId:'undo',revision:resumeRevisionSchema.parse(3),revertedProposalId:id,changedElementIds:['e'],createdAt:''}
 expect(reviewState({...proposal,status:'applied'},[applied,undone],applied)).toEqual({state:'reverted',receipt:undone})
 expect(reviewState({...proposal,status:'applied'},[applied],undone)).toEqual({state:'reverted',receipt:undone})
})
