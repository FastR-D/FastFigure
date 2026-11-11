import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { get } from 'node:http'

function reservePort() {
  return new Promise(resolve => {
    const socket = createServer()
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port
      socket.close(() => resolve(port))
    })
  })
}

test('production serves the UI and retains local API boundaries', { timeout: 20_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fastfigure-production-'))
  const port = await reservePort()
  const child = spawn(process.execPath, ['server-dist/server.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), FASTFIGURE_LIBRARY_DIR: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', value => { logs += value })
  child.stderr.on('data', value => { logs += value })
  const exited = once(child, 'exit')
  try {
    const origin = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(`server exited: ${logs}`)
      try { ready = (await fetch(`${origin}/api/health`)).ok } catch { /* Wait for listen. */ }
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, logs)
    assert.deepEqual(await (await fetch(`${origin}/api/health`)).json(), { ok: true })
    const page = await fetch(origin)
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    const html = await page.text()
    const script = /src="([^" ]+\.js)"/.exec(html)?.[1]
    assert.ok(script)
    assert.equal((await fetch(new URL(script, origin))).status, 200)
    assert.equal((await fetch(`${origin}/.env`)).status, 404)
    assert.equal((await fetch(`${origin}/%2eprivate`)).status, 404)
    assert.equal((await fetch(`${origin}/api/missing`)).status, 404)
    assert.equal((await fetch(`${origin}/api/harness/status`, { headers: { Origin: 'https://attacker.example' } })).status, 403)
    assert.equal(await new Promise((resolve, reject) => {
      get(`${origin}/api/harness/status`, { headers: { Host: 'attacker.example' } }, response => {
        response.resume(); resolve(response.statusCode)
      }).on('error', reject)
    }), 403)
  } finally {
    child.kill('SIGTERM')
    await exited
    await rm(directory, { recursive: true, force: true })
  }
})
