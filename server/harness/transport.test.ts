import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexAdapter } from './adapters'
import { CodexImageDraftAdapter } from '../imageDrafts/adapter'

const dirs: string[] = [], adapters: (CodexAdapter | CodexImageDraftAdapter)[] = []
afterEach(async () => {
  await Promise.all(adapters.splice(0).map(adapter => adapter.dispose()))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
async function setup(scenario: string) {
  const cwd = await mkdtemp(join(tmpdir(), 'figure-transport-')); dirs.push(cwd)
  const pidFile = join(cwd, 'pid')
  const adapter = new CodexAdapter({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/transport.mjs', import.meta.url))],
    env: { ...process.env, FASTFIGURE_TRANSPORT_SCENARIO: scenario, FASTFIGURE_TRANSPORT_PID: pidFile } })
  adapters.push(adapter)
  return { adapter, cwd, pidFile }
}
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
async function stopped(pidFile: string) {
  const pid = Number(await readFile(pidFile, 'utf8'))
  await expect.poll(() => alive(pid)).toBe(false)
}

async function imageSetup(scenario: string) {
  const { cwd, pidFile } = await setup(scenario)
  const adapter = new CodexImageDraftAdapter({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/transport.mjs', import.meta.url))],
    env: { ...process.env, FASTFIGURE_TRANSPORT_SCENARIO: scenario, FASTFIGURE_TRANSPORT_PID: pidFile, FASTFIGURE_TRANSPORT_IMAGE: '1' } })
  adapters.push(adapter)
  return { adapter, cwd, pidFile }
}

it.each(['null', 'invalid', 'frame', 'exit'])('image draft send awaits child cleanup after %s during initialization', async scenario => {
  const { adapter, cwd, pidFile } = await imageSetup(scenario)
  await expect(adapter.send({ cwd, content: 'image', paths: [], signal: new AbortController().signal, emit: () => {} })).rejects.toMatchObject({
    code: scenario === 'null' || scenario === 'frame' ? 'INVALID_MESSAGE' : scenario === 'invalid' ? 'INVALID_JSON' : 'PROCESS_EXITED',
  })
  expect(alive(Number(await readFile(pidFile, 'utf8')))).toBe(false)
  await rm(cwd, { recursive: true })
})

it('image draft keeps workspace-only/no-network policy, declines approvals, rejects tools and accepts frames over the suggestion limit', async () => {
  const { adapter, cwd, pidFile } = await imageSetup('approval')
  const result = await adapter.send({ cwd, content: 'image', paths: [], signal: new AbortController().signal, emit: () => {} })
  expect(result.bytes).toEqual(Buffer.alloc(1_600_000, 1))
  expect(alive(Number(await readFile(pidFile, 'utf8')))).toBe(false)
  await rm(cwd, { recursive: true })
})

it.each(['stall', 'turn-stall'])('image draft cancellation during %s awaits exit before releasing cwd', async scenario => {
  const { adapter, cwd, pidFile } = await imageSetup(scenario), controller = new AbortController(), reason = new DOMException('cancel image', 'AbortError')
  const rejected = expect(adapter.send({ cwd, content: 'image', paths: [], signal: controller.signal, emit: () => {} })).rejects.toBe(reason)
  await expect.poll(async () => { try { return !!await readFile(scenario === 'stall' ? pidFile : pidFile + '.turn') } catch { return false } }).toBe(true)
  controller.abort(reason)
  await rejected
  expect(alive(Number(await readFile(pidFile, 'utf8')))).toBe(false)
  await rm(cwd, { recursive: true })
})

it.each(['null', 'invalid', 'frame', 'exit'])('Codex public send rejects %s during initialization and cleans the child', async scenario => {
  const { adapter, cwd, pidFile } = await setup(scenario)
  await expect(adapter.send({ cwd, content: 'ping', signal: new AbortController().signal, emit: () => {} })).rejects.toMatchObject({
    code: scenario === 'null' || scenario === 'frame' ? 'INVALID_MESSAGE' : scenario === 'invalid' ? 'INVALID_JSON' : 'PROCESS_EXITED',
  })
  await stopped(pidFile)
})

it('Codex retains read-only parameters, declines both approval kinds and rejects host tools before normal output', async () => {
  const { adapter, cwd, pidFile } = await setup('approval')
  const deltas: string[] = []
  await expect(adapter.send({ cwd, content: 'ping', signal: new AbortController().signal, emit: (type, text) => { if (type === 'assistant.delta') deltas.push(text) } })).resolves.toBe('permissions retained')
  expect(deltas).toEqual(['permissions retained'])
  await adapter.dispose()
  await stopped(pidFile)
})

it('Codex abort rejects pending initialization with the explicit reason and leaves no child', async () => {
  const { adapter, cwd, pidFile } = await setup('stall')
  const controller = new AbortController(), reason = new Error('run cancelled')
  const rejected = expect(adapter.send({ cwd, content: 'ping', signal: controller.signal, emit: () => {} })).rejects.toBe(reason)
  await expect.poll(async () => { try { return !!await readFile(pidFile) } catch { return false } }).toBe(true)
  controller.abort(reason)
  await rejected
  await stopped(pidFile)
})
