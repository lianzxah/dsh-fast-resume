/** PDF import owns the loading task through success and extraction failure. */
import {describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({destroy:vi.fn(async()=>{}),extract:vi.fn(async()=>({items:[{str:'Candidate',transform:[12,0,0,12,0,10],height:12}]}))}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:state.extract})}),destroy:state.destroy})}))
import {pdfToParsedDocument} from '../../upstream/server/document-parser.ts'
describe('PDF import task ownership',()=>{
 it('awaits task destruction after successful text extraction',async()=>{state.destroy.mockClear();const result=await pdfToParsedDocument(new ArrayBuffer(0));expect(result.rawText).toContain('Candidate');expect(state.destroy).toHaveBeenCalledTimes(1)})
 it('destroys its task when page text extraction fails',async()=>{state.destroy.mockClear();state.extract.mockRejectedValueOnce(Error('Page extraction failed'));await expect(pdfToParsedDocument(new ArrayBuffer(0))).rejects.toThrow('Page extraction failed');expect(state.destroy).toHaveBeenCalledTimes(1)})
})
