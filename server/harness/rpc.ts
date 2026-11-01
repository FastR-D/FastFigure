import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
export interface RpcMessage { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { message?: string } }
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** JSONL RPC based on FastPPT's app-server bridge, with bounded records and explicit process cleanup. */
export class JsonlRpc {
  readonly child: ChildProcessWithoutNullStreams
  readonly listeners = new Set<(message: RpcMessage) => void>()
  readonly exits = new Set<(error: Error) => void>()
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private sequence = 0
  private closed = false
  constructor(command: string, args: string[], cwd: string, env = process.env, maxRecordBytes=2_000_000) {
    this.child = spawn(command, args, { cwd, env, stdio: 'pipe', windowsHide: true })
    let buffer = ''
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > maxRecordBytes) { this.fail(new Error('Harness 协议记录超出限制')); this.dispose(); return }
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        if (!line.trim()) continue
        let message: RpcMessage
        try { message = JSON.parse(line) as RpcMessage } catch { this.fail(new Error('Harness 返回了无效的 JSONL')); this.dispose(); return }
        if (message.method) {
          if (message.id !== undefined) {
            // This integration produces structured suggestions; it has no interactive host tools.
            this.write({ id: message.id, ...(message.method.endsWith('requestApproval') ? { result: { decision: 'decline' } } : { error: { code: -32601, message: 'FastFigure does not expose this host capability' } }) })
          } else for (const listener of this.listeners) listener(message)
        } else if (typeof message.id === 'number') {
          const pending = this.pending.get(message.id)
          if (!pending) continue
          this.pending.delete(message.id); clearTimeout(pending.timer)
          if (message.error) pending.reject(new Error(message.error.message || 'Harness RPC 失败'))
          else pending.resolve(message.result)
        }
      }
    })
    // Drain stderr without returning local configuration or credentials to the browser.
    this.child.stderr.resume()
    this.child.stdin.on('error', error => this.fail(error))
    this.child.once('error', error => this.fail(error))
    this.child.once('exit', code => this.fail(new Error(`Harness 进程已退出 (${code})`)))
  }
  private write(message: unknown) { if (!this.closed) this.child.stdin.write(`${JSON.stringify(message)}\n`) }
  request(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Harness 连接已关闭'))
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Harness 请求超时：${method}`)) }, 30_000)
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params })
    })
  }
  notify(method: string, params: unknown = {}) { this.write({ method, params }) }
  private fail(error: Error) {
    if (this.closed) return
    this.closed = true
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error) }
    this.pending.clear()
    for (const listener of this.exits) listener(error)
  }
  dispose() {
    this.fail(new Error('Harness 连接已关闭'))
    this.child.kill('SIGTERM')
    const timer = setTimeout(() => { if (this.child.exitCode === null) this.child.kill('SIGKILL') }, 1000)
    timer.unref(); this.child.once('exit', () => clearTimeout(timer))
  }
}
