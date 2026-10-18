/** Audits the actual npm publication file list and rejects missing or source-dependent runtime assets. */
import { execFileSync } from 'node:child_process'
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const cache = await mkdtemp(join(tmpdir(), 'resume-pack-cache-'))
let packed
try {
  const results = JSON.parse(execFileSync('npm', ['pack', '--workspaces=false', '--dry-run', '--ignore-scripts', '--json', '--cache', cache], { encoding: 'utf8' }))
  packed = results[0]
} finally {
  await rm(cache, { recursive: true, force: true })
}
const files = new Set(packed.files.map(file => file.path))
for (const path of ['lib/index.js', 'lib/tools.js', 'lib/client.js', 'lib/typert.host.js', 'lib/typert.remote-client.js', 'assets/editor.html', 'locale/en.json', 'locale/zh.json', 'cordis.patch.yml', 'LICENSE', 'NOTICE', 'COMMERCIAL_LICENSE.md', 'README.md', 'README.zh.md', 'upstream-content.json']) {
  assert.ok(files.has(path), `Publication is missing ${path}`)
  assert.ok((await stat(path)).size > 0, `Publication contains empty ${path}`)
}
assert.equal(manifest.type, 'module')
assert.equal(manifest.license, 'PolyForm-Noncommercial-1.0.0')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
assert.equal(manifest.engines?.dsh, '=0.2.1-rc.2')
assert.ok(manifest.peerDependencies?.['@deepseek-ai/cordis'], 'Cordis must remain a peer dependency')
for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
  for (const [name, version] of Object.entries(manifest[section] ?? {})) {
    assert.ok(!/^(?:workspace:|file:|link:)/.test(version), `${section}.${name} requires the source checkout`)
  }
}
for (const [name, target] of Object.entries(manifest.exports)) {
  if (name.includes('*')) continue
  for (const path of typeof target === 'string' ? [target] : Object.values(target)) {
    assert.ok(files.has(path.replace(/^\.\//, '')), `Export ${name} points outside the tarball: ${path}`)
  }
}
for (const path of files) {
  assert.ok(!/(?:^|\/)(?:node_modules|\.env(?:\.[^/]*)?|\.git|\.credentials[^/]*)(?:\/|$)|\.(?:db|sqlite|sqlite3)$/.test(path), `Private or installed data is included: ${path}`)
  if (path.endsWith('.js') || path === 'assets/editor.html') {
    const text = await readFile(path, 'utf8')
    assert.ok(!text.includes('/Users/Shared/workspace/Fast-Resume') && !text.includes('/Users/Shared/harness-workspace/'), `Runtime requires an absolute source directory: ${path}`)
    assert.ok(!/\/api\/(?:auth|resumes|import)\//.test(text), `Runtime still calls the original server: ${path}`)
  }
}
const html = await readFile('assets/editor.html', 'utf8')
assert.ok(!/<(?:script|link)[^>]+(?:src|href)=["'](?:\.?\.?\/|https?:\/\/)/i.test(html), 'Editor must contain its installed scripts and styles')
process.stdout.write(`PASS: publication content, ESM exports, source independence and retained license (${files.size} files, ${packed.unpackedSize} bytes unpacked)\n`)
