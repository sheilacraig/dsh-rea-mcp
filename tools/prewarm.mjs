#!/usr/bin/env node
/**
 * Pre-warm and verify the upstream REA server, outside DeepSeek Harness.
 *
 * Why this exists: the bridge starts `npx -y rea-agents@<pin> mcp`, and npx
 * downloads that package and its dependencies on first use. In a harness that
 * gives up on the initial MCP connection long before a cold download finishes,
 * the plugin then looks broken. This script does the download here, in your own
 * terminal, with no timeout, and proves the pinned version answers the MCP
 * handshake before the harness ever tries.
 *
 * It runs the same argv the bridge runs and speaks the minimum protocol by hand
 * (initialize -> tools/list). No dependency: Node's child_process is enough.
 *
 *   node tools/prewarm.mjs
 */
import { spawn, spawnSync } from 'node:child_process'

/** Must match the pin in cordis.patch.yml — a test asserts the two agree. */
const SPEC = 'rea-agents@6.4.0'
/** The MCP subcommand REA publishes (see its server.json). */
const MCP_SUBCOMMAND = 'mcp'

const READY_TIMEOUT_MS = 20 * 60 * 1000
const ANSWER_TIMEOUT_MS = 90 * 1000
const EXIT_GRACE_MS = 5000

const t0 = Date.now()
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const say = (line) => process.stdout.write(`${line}\n`)
const warn = (line) => process.stderr.write(`${line}\n`)

function findNpx() {
  const fromPath = spawnSync('npx', ['--version'], { encoding: 'utf8' })
  if (!fromPath.error && fromPath.status === 0) {
    return { cmd: 'npx', where: 'on PATH' }
  }
  return undefined
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  // REA may spawn provider subprocesses (e.g. Ghidra); taskkill the tree.
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
}

async function main() {
  const npx = findNpx()
  if (npx === undefined) {
    warn('[prewarm] `npx` was not found.')
    warn('          Install Node.js first (REA requires 22.x >=22.19, 24.x >=24.11, or 26+):')
    warn('          https://nodejs.org/')
    warn('          Then re-run: node tools/prewarm.mjs')
    process.exitCode = 1
    return
  }

  say(`[prewarm] npx ${npx.where}`)
  say(`[prewarm] starting: npx -y ${SPEC} ${MCP_SUBCOMMAND}`)
  say('[prewarm] a cold npx cache downloads rea-agents and its dependencies here; this can take minutes.')
  say('')

  const stderrTail = []
  const child = spawn(npx.cmd, ['-y', SPEC, MCP_SUBCOMMAND], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const pending = new Map()
  let buffered = ''
  let sawJsonRpc = false

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffered += chunk
    let index
    while ((index = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, index).trim()
      buffered = buffered.slice(index + 1)
      if (line === '') continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue // server logs share this channel; only JSON-RPC matters
      }
      sawJsonRpc = true
      if (message.id !== undefined && pending.has(message.id)) {
        const settle = pending.get(message.id)
        pending.delete(message.id)
        settle(message)
      }
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim() === '') continue
      stderrTail.push(line)
      if (stderrTail.length > 40) stderrTail.shift()
    }
  })

  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code ?? -1)))
  const died = exited.then((code) => {
    killTree(child)
    return code
  })

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
  const waitFor = (id, timeoutMs, label) =>
    Promise.race([
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${label}: no response within ${Math.round(timeoutMs / 1000)}s`))
        }, timeoutMs)
        pending.set(id, (message) => {
          clearTimeout(timer)
          resolve(message)
        })
      }),
      died.then((code) => {
        throw new Error(`the server exited with code ${code} before answering ${label}`)
      }),
    ])

  try {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'dsh-rea-mcp/prewarm', version: '1.0.0' },
      },
    })
    const ready = await waitFor(1, READY_TIMEOUT_MS, 'initialize')
    if (ready.error !== undefined) throw new Error(`initialize failed: ${JSON.stringify(ready.error)}`)
    const info = ready.result?.serverInfo ?? {}
    say(`[prewarm] ready in ${elapsed()} — ${info.name ?? '?'} ${info.version ?? '?'} (protocol ${ready.result?.protocolVersion ?? '?'})`)

    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const listed = await waitFor(2, ANSWER_TIMEOUT_MS, 'tools/list')
    const tools = (listed.result?.tools ?? []).map((tool) => tool.name).sort()
    if (tools.length === 0) throw new Error('tools/list returned no tools')

    say('')
    say(`[prewarm] tools (${tools.length}):`)
    for (const name of tools) say(`          ${name}`)

    child.stdin.end()
    const code = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(null), EXIT_GRACE_MS))])
    if (code === null) killTree(child)

    say('')
    say(`[prewarm] OK — ${SPEC} is installed, verified, and answers the MCP handshake.`)
    say('[prewarm] The harness bridge will reuse this cache; enable the plugin and restart DSH.')
  } catch (error) {
    killTree(child)
    warn('')
    warn(`[prewarm] FAILED after ${elapsed()}: ${error instanceof Error ? error.message : String(error)}`)
    if (stderrTail.length > 0) {
      warn('[prewarm] last lines from the server:')
      for (const line of stderrTail) warn(`          ${line}`)
    }
    if (!sawJsonRpc) {
      warn('[prewarm] hints:')
      warn('          - `npx` must be the one DSH will use: install Node and open a new terminal.')
      warn('          - Make sure you can run `npx -y rea-agents --version` on its own first.')
    }
    process.exitCode = 1
  }
}

await main()