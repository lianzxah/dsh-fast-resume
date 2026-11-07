import {expect,it} from 'vitest'
import {parseResumeAddress,resumeAddress} from '../../src/client/resume-resource.ts'
import {resumeIdSchema} from '../../src/identity.ts'
it('accepts only a complete document resource identity',()=>{
 const id=resumeIdSchema.parse('11111111-1111-4111-8111-111111111111')
 expect(parseResumeAddress(resumeAddress(id))).toBe(id)
 for(const address of ['dsh-resource://fast-resume/document/','dsh-resource://fast-resume/document/nope','dsh-resource://other/document/'+id,'dsh-resource://fast-resume/document/'+id+'/extra','dsh-resource://fast-resume/document/'+id+'?x=1'])expect(parseResumeAddress(address)).toBeUndefined()
})
