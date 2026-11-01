/** Builds the linked plugin and supervises an isolated dsh Web profile for local development. */
import { spawn } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] ?? 'watch'
if (mode === '--help') {
  console.log('Usage: node scripts/dev.mjs [setup|start|watch] [-- Web options]\nDSH_DEV_CLI: path to dsh/lib/bin.js; defaults to the enclosing Harness checkout, then dsh on PATH.\nDSH_HOME: defaults to .dev/home. Watch rebuilds and restarts the Web profile; save edits before rebuilding.')
  process.exit(0)
}
if (!['setup', 'start', 'watch'].includes(mode)) throw new Error(`Unknown development mode: ${mode}`)
const forwarded = process.argv.slice(3).filter((value, index) => index !== 0 || value !== '--')
const workspace = resolve(root, '../..')
const workspaceCli = join(workspace, 'apps/cli/lib/bin.js')
const cliPath = process.env.DSH_DEV_CLI ? resolve(process.env.DSH_DEV_CLI) : existsSync(workspaceCli) ? workspaceCli : undefined
if (cliPath && !existsSync(cliPath)) throw new Error(`DSH_DEV_CLI does not exist: ${cliPath}`)
const cli = cliPath ? [process.execPath, [cliPath]] : ['dsh', []]
const env = {
  ...process.env,
  DSH_HOME: resolve(process.env.DSH_HOME ?? join(root, '.dev/home')),
  DSH_AGENTS_HOME: resolve(process.env.DSH_AGENTS_HOME ?? join(root, '.dev/agents')),
  DSH_TELEMETRY_DISABLED: '1',
}
const children = new Map()
const watchers = []
let stopping = false
let server
let timer

function launch(command, args) {
  if (stopping) throw new Error('Development session is stopping')
  const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', detached: process.platform !== 'win32' })
  const done = new Promise((accept, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => accept({ code, signal }))
  })
  children.set(child, done)
  done.then(() => children.delete(child), () => children.delete(child))
  return { child, done }
}

async function run(command, args) {
  const { code, signal } = await launch(command, args).done
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`)
}

async function stopServer() {
  const previous = server
  server = undefined
  if (!previous) return
  await terminate(previous.child, previous.done)
}

async function terminate(child, done) {
  if (!child.pid) { await Promise.allSettled([done]); return }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    await new Promise((accept, reject) => { killer.once('error', reject); killer.once('exit', accept) })
    await done
    return
  }
  const signal = name => {
    try { process.kill(-child.pid, name); return true } catch (error) {
      if (error.code !== 'ESRCH') throw error
      return false
    }
  }
  signal('SIGTERM')
  const deadline = setTimeout(() => signal('SIGKILL'), 5000)
  try {
    await done
    const limit = Date.now() + 6000
    while (signal(0)) {
      if (Date.now() > limit) throw new Error(`Child process group ${child.pid} did not stop; inspect it before restarting.`)
      await new Promise(accept => setTimeout(accept, 50))
    }
  } finally { clearTimeout(deadline) }
}

async function shutdown(code) {
  if (stopping) return
  stopping = true
  clearTimeout(timer)
  for (const watcher of watchers) watcher.close()
  const active = [...children]
  const outcomes = await Promise.allSettled(active.map(([child, done]) => terminate(child, done)))
  for (const outcome of outcomes) if (outcome.status === 'rejected') console.error('Could not confirm child-process cleanup.', outcome.reason)
  process.exitCode = outcomes.some(outcome => outcome.status === 'rejected') ? 1 : code
}
process.once('SIGINT', () => { void shutdown(130) })
process.once('SIGTERM', () => { void shutdown(0) })

async function build() {
  console.log('Building Fast Resume...')
  await run(process.execPath, ['scripts/build.mjs'])
  for (const face of ['tsconfig.check.json', 'tsconfig.browser.json']) {
    await run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', face])
  }
}

function startServer() {
  const picker = join(workspace, 'apps/web/tests/pin-browse-picker.overlay.yml')
  const patches = cliPath === workspaceCli && existsSync(picker) ? ['--patch', picker] : []
  server = launch(cli[0], [...cli[1], 'web', ...patches, '--no-open', '--port', '58358', ...forwarded])
  const current = server
  current.done.then(result => {
    if (server === current && !stopping) void shutdown(result.code ?? 1)
  }, error => {
    console.error(error)
    void shutdown(1)
  })
}

let pending = false
let building = false
async function rebuild() {
  if (building || stopping) return
  building = true
  try {
    while (pending && !stopping) {
      pending = false
      await stopServer()
      try { await build() } catch (error) {
        if (!stopping) console.error('Build failed; Web is stopped. Fix the error and save to rebuild.', error)
        continue
      }
      if (!pending && !stopping) startServer()
    }
  } catch (error) {
    console.error(error)
    await shutdown(1)
  } finally { building = false }
}

try {
  console.log(`Fast Resume development home: ${env.DSH_HOME}`)
  await mkdir(env.DSH_HOME, { recursive: true })
  await build()
  await run(cli[0], [...cli[1], 'plugin', '--profile', 'web', 'add', `link:${root}`, `--store-dir=${join(root, '.dev/pnpm-store')}`])
  if (mode !== 'setup' && !stopping) {
    if (mode === 'watch') {
      const changed = () => {
        pending = true
        clearTimeout(timer)
        timer = setTimeout(() => { void rebuild() }, 300)
      }
      for (const path of ['src', 'upstream', 'locale', 'scripts']) {
        const watcher = watch(join(root, path), { recursive: true }, changed)
        watcher.on('error', error => { console.error('Source watcher failed; restart npm run dev.', error); void shutdown(1) })
        watchers.push(watcher)
      }
      const configs = new Set(['package.json', 'tsconfig.base.json', 'tsconfig.host.json', 'tsconfig.check.json', 'tsconfig.browser.json', 'cordis.patch.yml'])
      const configWatcher = watch(root, (_, filename) => { if (!filename || configs.has(String(filename))) changed() })
      configWatcher.on('error', error => { console.error('Configuration watcher failed; restart npm run dev.', error); void shutdown(1) })
      watchers.push(configWatcher)
      console.log('Watching plugin source. A successful rebuild restarts Harness; unsaved editor drafts use normal recovery.')
    }
    startServer()
  }
} catch (error) {
  if (!stopping) { console.error(error); await shutdown(1) }
}
