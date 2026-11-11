import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { Buffer } from 'node:buffer'

writeFileSync(process.env.FASTFIGURE_TRANSPORT_PID, String(process.pid))
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
const scenario = process.env.FASTFIGURE_TRANSPORT_SCENARIO
const image = process.env.FASTFIGURE_TRANSPORT_IMAGE === '1'
const threadId = 'transport-thread', turnId = 'transport-turn'
let turnRequest
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line)
  if (m.method === 'initialize') {
    if (scenario === 'null') { send(null); return }
    if (scenario === 'invalid') { process.stdout.write('{bad\n'); return }
    if (scenario === 'frame') { send({ method: 42 }); return }
    if (scenario === 'exit') process.exit(9)
    if (scenario === 'stall') return
    send({ id: m.id, result: {} })
  }
  if (m.method === 'thread/start') {
    if (m.params.sandbox !== (image ? 'workspace-write' : 'read-only') || m.params.approvalPolicy !== 'never' || m.params.ephemeral !== true) process.exit(10)
    const args = process.argv.slice(2)
    for (const flag of ['features.shell_tool=false','features.unified_exec=false','features.multi_agent=false','features.apps=false','features.plugins=false','features.hooks=false','web_search="disabled"','mcp_servers={}']) if (!args.includes(flag)) process.exit(11)
    if (image && !args.includes('image_generation')) process.exit(16)
    send({ id: m.id, result: { thread: { id: threadId } } })
  }
  if (m.method === 'turn/start') {
    const policy = m.params.sandboxPolicy
    if (policy.type !== (image ? 'workspaceWrite' : 'readOnly') || m.params.approvalPolicy !== 'never') process.exit(12)
    if (image && (policy.networkAccess !== false || policy.excludeSlashTmp !== true || policy.excludeTmpdirEnvVar !== true || JSON.stringify(policy.writableRoots) !== JSON.stringify([process.cwd()]))) process.exit(17)
    writeFileSync(process.env.FASTFIGURE_TRANSPORT_PID + '.turn', 'started')
    if (scenario === 'turn-stall') return
    turnRequest = m.id
    send({ id: 'approval-command', method: 'item/commandExecution/requestApproval', params: { threadId } })
  }
  if (m.id === 'approval-command') {
    if (m.result?.decision !== 'decline') process.exit(13)
    send({ id: 'approval-files', method: 'item/fileChange/requestApproval', params: { threadId } })
  }
  if (m.id === 'approval-files') {
    if (m.result?.decision !== 'decline') process.exit(14)
    send({ id: 'tool', method: 'host/unexpectedTool', params: { threadId } })
  }
  if (m.id === 'tool') {
    if (m.error?.code !== -32601) process.exit(15)
    send({ id: turnRequest, result: { turn: { id: turnId } } })
    if (image) {
      send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'imageGeneration', status: 'completed', result: Buffer.alloc(1_600_000, 1).toString('base64') } } })
      return
    }
    send({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'reply', delta: 'permissions retained' } })
    send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } })
  }
})
