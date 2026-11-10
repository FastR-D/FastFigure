import { JsonlRpcClient, type RpcMessage } from '@fastrd/harness-transport'

export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Figure host policy, used by suggestions and image drafts. Wire/process ownership is in transport. */
export class JsonlRpc {
  readonly listeners = new Set<(message: RpcMessage) => void>()
  readonly exits = new Set<(error: Error) => void>()
  private readonly rpc: JsonlRpcClient
  private disposal?: Promise<void>

  constructor(command: string, args: string[], cwd: string, env = process.env, maxRecordBytes = 2_000_000) {
    this.rpc = new JsonlRpcClient({ commandFactory: () => ({ command, args, cwd, env }),
      maxRecordBytes, maxStderrLines: 0, stopTimeoutMs: 1000 })
    this.rpc.onMessage(message => {
      if (message.id !== undefined && message.method) {
        // Both Figure entry points forbid interactive host tools and approvals.
        if (message.method.endsWith('requestApproval')) this.rpc.respond(message.id, { decision: 'decline' })
        else this.rpc.respondError(message.id, -32601, 'FastFigure does not expose this host capability')
      } else if (message.method) for (const listener of this.listeners) listener(message)
    })
    this.rpc.onExit(error => { for (const listener of this.exits) listener(error) })
    this.rpc.start()
  }
  request(method: string, params: unknown): Promise<unknown> { return this.rpc.request(method, params) }
  notify(method: string, params: unknown = {}): void { this.rpc.notify(method, params) }
  dispose(): Promise<void> {
    if (!this.disposal) {
      this.disposal = this.rpc.stop()
      for (const listener of this.exits) listener(new Error('Harness 连接已关闭'))
    }
    return this.disposal
  }
}
