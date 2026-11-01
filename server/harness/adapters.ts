import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import type { HarnessKind, HarnessStatus } from '../../src/core/harness.ts'
import { JsonlRpc, record } from './rpc.ts'

export interface HarnessTurn {
  cwd: string; content: string; model?: string; images?: { path: string; dataUrl: string }[]; signal: AbortSignal
  emit: (type: 'assistant.delta' | 'activity', text: string) => void
}
export interface HarnessAdapter {
  kind: HarnessKind
  status(): Promise<HarnessStatus>
  send(input: HarnessTurn): Promise<string>
  dispose(): void
}
export interface AdapterOptions { command?: string; args?: string[]; env?: NodeJS.ProcessEnv }
async function cliStatus(kind: HarnessKind, options: AdapterOptions): Promise<HarnessStatus> {
  try {
    const { stdout } = await promisify(execFile)(options.command ?? kind, [...(options.args ?? []), '--version'], { timeout: 5000, maxBuffer: 32_000, env: options.env ?? process.env })
    return { kind, state: 'ready', version: stdout.trim().slice(0, 150), message: 'CLI 可执行，登录与模型可用性将在运行时验证', images: true }
  } catch { return { kind, state: 'unavailable', message: `${kind === 'codex' ? 'Codex' : 'Claude'} CLI 未安装或无法执行`, images: true } }
}

export class CodexAdapter implements HarnessAdapter {
  readonly kind = 'codex' as const
  private options: AdapterOptions
  private rpc: JsonlRpc | undefined
  private threadId = ''
  constructor(options: AdapterOptions = {}) { this.options = options }
  status() { return cliStatus(this.kind, this.options) }
  async send(input: HarnessTurn): Promise<string> {
    input.signal.throwIfAborted()
    if (!this.rpc) {
      const rpc = new JsonlRpc(this.options.command ?? 'codex', [...(this.options.args ?? []), 'app-server', '--stdio',
        '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false', '-c', 'features.multi_agent=false',
        '-c', 'features.apps=false', '-c', 'features.plugins=false', '-c', 'features.hooks=false', '-c', 'web_search="disabled"', '-c', 'mcp_servers={}'], input.cwd, this.options.env)
      this.rpc = rpc
      const abortInitialization = () => this.dispose()
      input.signal.addEventListener('abort', abortInitialization, { once: true })
      try {
        await rpc.request('initialize', { clientInfo: { name: 'fastfigure', version: '0.2.0' } }); rpc.notify('initialized')
        const started = record(await rpc.request('thread/start', { cwd: input.cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true }))
        this.threadId = String(record(started.thread).id ?? '')
        if (!this.threadId) throw new Error('Codex 未返回会话 ID')
      } catch (e) { this.dispose();input.signal.throwIfAborted(); throw e }
      finally { input.signal.removeEventListener('abort', abortInitialization) }
    }
    input.signal.throwIfAborted()
    const rpc = this.rpc
    return new Promise<string>((resolve, reject) => {
      let turnId = '', finished = false, finalText = ''
      const deltas = new Map<string, string>(), finals = new Map<string, string>(), early: RpcMessageWithParams[] = []
      const cleanup = () => { rpc.listeners.delete(handle); rpc.exits.delete(fail); input.signal.removeEventListener('abort', abort) }
      const fail = (error: Error) => { if (finished) return; finished = true; cleanup(); this.dispose(); reject(error) }
      const finish = () => { if (finished) return; finished = true; cleanup(); resolve(finalText || [...finals.values()].at(-1) || [...deltas.values()].at(-1) || '') }
      const abort = () => {
        if (turnId) void rpc.request('turn/interrupt', { threadId: this.threadId, turnId }).catch(() => undefined)
        fail(new DOMException('运行已取消', 'AbortError'))
      }
      const handle = (message: { method?: string; params?: unknown }) => {
        const params = record(message.params)
        if (finished || params.threadId !== this.threadId) return
        const eventTurn = params.turnId ?? record(params.turn).id
        if (typeof eventTurn !== 'string') return
        if (!turnId) { early.push({ method: message.method, params }); return }
        if (eventTurn !== turnId) return
        const item = record(params.item), itemId = String(params.itemId ?? item.id ?? 'message')
        if (message.method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
          deltas.set(itemId, (deltas.get(itemId) ?? '') + params.delta); input.emit('assistant.delta', params.delta)
        }
        if (message.method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') {
          finals.set(itemId, item.text)
          if (item.phase === 'final_answer') finalText = item.text
          if (!deltas.has(itemId)) input.emit('assistant.delta', item.text)
        }
        if (message.method === 'item/started' && item.type !== 'agentMessage') input.emit('activity', `Codex：${String(item.type || '处理上下文')}`)
        if (message.method === 'error' && params.willRetry === false) fail(new Error(String(record(params.error).message || 'Codex 运行失败')))
        if (message.method === 'turn/completed') {
          const turn = record(params.turn)
          if (turn.status === 'interrupted') fail(new DOMException('运行已取消', 'AbortError'))
          else if (turn.status === 'failed') fail(new Error(String(record(turn.error).message || 'Codex 运行失败')))
          else finish()
        }
      }
      rpc.listeners.add(handle); rpc.exits.add(fail); input.signal.addEventListener('abort', abort, { once: true })
      if (input.signal.aborted) { abort(); return }
      void rpc.request('turn/start', { threadId: this.threadId, cwd: input.cwd, approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly' },
        input: [{ type: 'text', text: input.content, text_elements: [] }, ...(input.images??[]).map(image=>({type:'localImage',path:image.path}))],
        ...(input.model ? { model: input.model } : {}),
      }).then(value => {
        if (finished) return
        turnId = String(record(record(value).turn).id ?? '')
        if (!turnId) { fail(new Error('Codex 未返回运行 ID')); return }
        for (const event of early) handle(event)
      }, fail)
    })
  }
  dispose() { const rpc = this.rpc; this.rpc = undefined; this.threadId = ''; rpc?.dispose() }
}
interface RpcMessageWithParams { method?: string; params: Record<string, unknown> }

/** FastWrite's Claude CLI bridge pattern: structured stream, explicit session id and cancellation. */
export class ClaudeAdapter implements HarnessAdapter {
  readonly kind = 'claude' as const
  private options: AdapterOptions
  private sessionId = randomUUID()
  private started = false
  private stop: (() => void) | undefined
  constructor(options: AdapterOptions = {}) { this.options = options }
  status() { return cliStatus(this.kind, this.options) }
  async send(input: HarnessTurn): Promise<string> {
    input.signal.throwIfAborted()
    const args = [...(this.options.args ?? []), '--print', '--safe-mode', '--output-format', 'stream-json', '--input-format', 'stream-json',
      '--verbose', '--include-partial-messages', '--tools', '', '--disable-slash-commands', '--disallowedTools', 'mcp__*',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--permission-mode', 'dontAsk',
      this.started ? '--resume' : '--session-id', this.sessionId, ...(input.model ? ['--model', input.model] : [])]
    const child = spawn(this.options.command ?? 'claude', args, { cwd: input.cwd, env: this.options.env ?? process.env, stdio: 'pipe', windowsHide: true })
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const stop = () => { child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 1000); killTimer.unref() }
    this.stop = stop
    input.signal.addEventListener('abort', stop, { once: true })
    if (input.signal.aborted) stop()
    let pending = '', partial = false, output = '', result: Record<string, unknown> | undefined, protocolError: Error | undefined
    const parse = (line: string) => {
      if (!line.trim()) return
      try {
        const message = record(JSON.parse(line))
        if (message.session_id && message.session_id !== this.sessionId) throw new Error('Claude 返回的会话 ID 不一致')
        if (message.parent_tool_use_id) return
        if (message.type === 'system' && message.subtype === 'init') this.started = true
        const delta = record(record(message.event).delta)
        if (message.type === 'stream_event' && delta.type === 'text_delta' && typeof delta.text === 'string') {
          partial = true; output += delta.text; input.emit('assistant.delta', delta.text)
        }
        if (message.type === 'assistant' && !partial) for (const block of (record(message.message).content as unknown[] | undefined) ?? []) {
          const part = record(block)
          if (part.type === 'text' && typeof part.text === 'string') { output += part.text; input.emit('assistant.delta', part.text) }
        }
        if (message.type === 'result') result = message
      } catch (error) { protocolError = error instanceof Error ? error : new Error('Claude 协议错误'); stop() }
    }
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk: string) => {
      pending += chunk
      if (pending.length > 2_000_000) { protocolError = new Error('Claude 协议记录超出限制'); stop(); return }
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, newline); pending = pending.slice(newline + 1); parse(line) }
    })
    child.stderr.resume(); child.stdin.on('error', () => undefined)
    const done = new Promise<string>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', code => {
        if (pending.trim()) parse(pending)
        if (input.signal.aborted) { reject(new DOMException('运行已取消', 'AbortError')); return }
        if (protocolError) { reject(protocolError); return }
        if (code !== 0 || !result || result.is_error) { reject(new Error(typeof result?.result === 'string' ? result.result.slice(0, 500) : `Claude 运行失败 (${code})，请检查 CLI 登录和模型配置`)); return }
        this.started = true
        resolve(typeof result.result === 'string' && result.result ? result.result : output)
      })
    })
    const content = [{ type: 'text', text: input.content }, ...(input.images??[]).map(image=>({type:'image',source:{type:'base64',media_type:image.dataUrl.slice(5,image.dataUrl.indexOf(';')),data:image.dataUrl.split(',')[1]}}))]
    child.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`)
    try { return await done } finally { clearTimeout(killTimer); input.signal.removeEventListener('abort', stop); this.stop = undefined }
  }
  dispose() { this.stop?.() }
}
