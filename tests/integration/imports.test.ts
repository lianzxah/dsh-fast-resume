import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
const rid=resumeIdSchema.parse.bind(resumeIdSchema),rv=resumeRevisionSchema.parse.bind(resumeRevisionSchema)
/** Real file imports and complete document round trips through the profile store. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import { ResumeStore, resolveConfig } from '../../src/host/store.ts'
import type { ResumeDocument, ResumeElement } from '../../src/types.ts'
import { serializeResumeBackup } from '../../upstream/shared/src/index.ts'
import { createImageElement, createTextElement } from '../../upstream/canvas-engine/src/element-factory.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function store(): Promise<ResumeStore> {
  const root = await mkdtemp(join(tmpdir(), 'resume-import-'))
  roots.push(root)
  return new ResumeStore(resolveConfig(root, {}))
}
function textLayers(elements: ResumeElement[]): string[] {
  return elements.flatMap(element => element.type === 'text' ? [element.content] : element.type === 'group' ? textLayers(element.children) : [])
}
function documentTexts(document: ResumeDocument): string {
  return document.pages.flatMap(page => textLayers(page.elements)).join('\n')
}

describe('real semantic import files', () => {
  it('imports Markdown into editable text layers with identity and experience content', async () => {
    const service = await store()
    const bytes = await readFile(new URL('../fixtures/candidate.md', import.meta.url))
    const result = await service.importDocument({ filename: 'candidate.md', format: 'markdown', dataBase64: bytes.toString('base64') })
    const document: ResumeDocument = JSON.parse(result.documentJson)
    expect(documentTexts(document)).toContain('林然')
    expect(documentTexts(document)).toContain('linran@example.test')
    expect(documentTexts(document)).toContain('30%')
    expect(document.pages.flatMap(page => page.elements).length).toBeGreaterThan(3)
  })

  it('imports structured DOCX headings and paragraphs without the original server', async () => {
    const service = await store()
    const bytes = await readFile(new URL('../fixtures/candidate.docx', import.meta.url))
    const result = await service.importDocument({ filename: 'candidate.docx', format: 'docx', dataBase64: bytes.toString('base64') })
    const document: ResumeDocument = JSON.parse(result.documentJson)
    expect(documentTexts(document)).toContain('Ada Lovelace')
    expect(documentTexts(document)).toContain('ada@example.test')
    expect(documentTexts(document)).toContain('Reduced build time by 30 percent')
    expect(document.pages.flatMap(page => page.elements).length).toBeGreaterThan(3)
  })

  it('extracts a real PDF into editable resume content', async () => {
    const service = await store()
    const pdf = new jsPDF()
    pdf.setFontSize(22).text('Ada Lovelace', 20, 20)
    pdf.setFontSize(12).text('ada@example.test', 20, 30)
    pdf.setFontSize(16).text('Work Experience', 20, 45)
    pdf.setFontSize(12).text('Example Systems - Software Engineer', 20, 55)
    pdf.text('Reduced build time by 30 percent', 20, 65)
    const result = await service.importDocument({ filename: 'candidate.pdf', format: 'pdf', dataBase64: Buffer.from(pdf.output('arraybuffer')).toString('base64') })
    const document: ResumeDocument = JSON.parse(result.documentJson)
    expect(documentTexts(document)).toContain('Ada Lovelace')
    expect(documentTexts(document)).toContain('Reduced build time by 30 percent')
    expect(document.pages.flatMap(page => page.elements).every(element => element.type !== 'image')).toBe(true)
  })

  it.each(['json', 'docx', 'pdf'] as const)('rejects malformed %s without creating a document', async format => {
    const service = await store()
    await expect(service.importDocument({ filename: `invalid.${format}`, format, dataBase64: Buffer.from('invalid file').toString('base64') })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(await service.list()).toEqual([])
  })
})

it('retains nested groups, inline images, links and a second page through JSON import and history', async () => {
  const service = await store()
  const initial = await service.create({ title: 'Round trip', templateId: 'template-classic' })
  const document: ResumeDocument = JSON.parse(initial.documentJson)
  const text = createTextElement({ content: 'Nested linked text', link: { url: 'https://example.test/portfolio' } })
  const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNYQAAAAASUVORK5CYII='
  const image = createImageElement({ src: source, name: 'Inline portrait' })
  const group: ResumeElement = { ...text, id:rid('outer-group'), type: 'group', children: [{ ...text, id:rid('inner-group'), type: 'group', children: [text, image] }] }
  document.pages[0].elements.push(group)
  document.pages.push({ ...structuredClone(document.pages[0]), id:rid('second-page'), pageNumber: 2, elements: [] })
  const saved = await service.save({ id: initial.id, expectedRevision:rv(1), documentJson: JSON.stringify(document), versionName: 'Nested document' })
  const imported = await service.importDocument({ filename: 'roundtrip.json', format: 'json', dataBase64: Buffer.from(serializeResumeBackup(document)).toString('base64') })
  const copy: ResumeDocument = JSON.parse(imported.documentJson)
  expect(copy.pages).toHaveLength(2)
  const copiedOuter = copy.pages[0].elements.at(-1)
  if (copiedOuter?.type !== 'group') throw new Error('Nested outer group was not retained')
  const inner = copiedOuter.children[0]
  if (inner.type !== 'group') throw new Error('Nested inner group was not retained')
  expect(inner.children[0].link?.url).toBe('https://example.test/portfolio')
  expect(inner.children[1]).toMatchObject({ type: 'image', src: source })
  expect(inner.children[0].id).not.toBe(text.id)
  const versions = await service.history(initial.id)
  const snapshot = await service.versionRead(initial.id, versions.versions.at(-1)!.id)
  expect(snapshot.revision).toBe(saved.revision)
  expect(JSON.parse(snapshot.documentJson).pages[0].elements.at(-1)).toEqual(group)
})
