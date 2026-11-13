// Runs src/worker.ts's activate(orca) with the orca object Orca passes, over a mock host.
import { assert, hostError, mockHost, mountWorker, test } from 'orca/testing'
import type { OfficeChange } from './agents/ledger'
import * as main from './worker'

const WORKSPACES = {
  workspaces: [
    { id: 'ws-1', kind: 'worktree', name: 'main', project: 'Orbit', path: '/orbit', branch: 'main', hostId: null }
  ],
  truncated: false
}

// Nothing outside the mock host is read: no CLI, no folders.
main.outside.readAgents = async () => ({ workspaceIds: [], agents: [] })
main.outside.lastWorked = async () => 0
main.outside.readIcon = async () => null
main.outside.readProjectIcons = async () => ({})

function status(state: 'working' | 'blocked' | 'waiting' | 'done', receivedAt: number) {
  return { workspaceId: 'ws-1', paneKey: 'pane-1', state, receivedAt }
}

test('opens the workspace the panel asks for', async () => {
  const host = mockHost({ results: { 'workspace.open': { opened: true } } })
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('agent.open', { workspaceId: 'ws-1' }), { opened: true })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('counts a finished task, names its project and tells the panel', async () => {
  const host = mockHost({ results: { 'workspace.list': WORKSPACES } })
  const worker = await mountWorker(main, { host })
  await worker.emit('agent.status.changed', status('working', 1))
  await worker.emit('agent.status.changed', status('done', 2))

  const last = worker.posts.at(-1)
  assert.equal(last?.event, 'office.changed')
  const { view, note } = last?.payload as OfficeChange
  assert.equal(note?.project, 'Orbit')
  assert.equal(note?.finished, true)
  assert.deepEqual(view.projects, [{ name: 'Orbit', state: 'idle' }])
  assert.equal(worker.posts.length, 2)
  // The names are asked for once, not on every change.
  assert.equal(host.callsOf('workspace.list').length, 1)
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('keeps what the agents finished for a panel that opens later', async () => {
  const host = mockHost({ results: { 'workspace.list': WORKSPACES } })
  const first = await mountWorker(main, { host })
  await first.emit('agent.status.changed', status('working', 1))
  await first.emit('agent.status.changed', status('done', 2))
  await first.deactivate()

  // Orca stopped the idle worker; a new one starts when the panel opens.
  const second = await mountWorker(main, { host })
  const view = await second.request('office.read')
  assert.deepEqual(view.unseen, [{ name: 'Orbit', tasks: 1 }])
  assert.deepEqual(await second.request('office.seen'), { seen: true })
  assert.deepEqual((await second.request('office.read')).unseen, [])
  await second.deactivate()
})

test('still counts a finished task when Orca will not list the workspaces', async () => {
  const host = mockHost({
    results: {
      'workspace.list': () => {
        throw hostError('unavailable')
      }
    }
  })
  const worker = await mountWorker(main, { host })
  await worker.emit('agent.status.changed', status('working', 1))
  await worker.emit('agent.status.changed', status('done', 2))
  const { note } = worker.posts.at(-1)?.payload as OfficeChange
  assert.equal(note?.project, null)
  assert.equal(note?.finished, true)
  await worker.deactivate()
})

test('names the project of an agent whose workspace id is not the one Orca lists', async () => {
  const host = mockHost({ results: { 'workspace.list': WORKSPACES } })
  const worker = await mountWorker(main, { host })
  await worker.emit('agent.status.changed', { ...status('working', 1), workspaceId: 'repo-9::/orbit' })
  const { view } = worker.posts.at(-1)?.payload as OfficeChange
  assert.deepEqual(view.projects, [{ name: 'Orbit', state: 'working' }])
  await worker.deactivate()
})

test('opening the panel shows every agent Orca has and the projects last worked in', async () => {
  const host = mockHost({
    results: {
      'workspace.list': {
        workspaces: [
          ...WORKSPACES.workspaces,
          { id: 'ws-2', kind: 'worktree', name: 'main', project: 'nimbus', path: '/nimbus', branch: 'main', hostId: 'local' },
          { id: 'ws-3', kind: 'folder', name: 'Principal', project: null, path: '/code/Tundra', branch: null, hostId: null }
        ],
        truncated: false
      }
    }
  })
  main.outside.readAgents = async () => ({
    workspaceIds: ['repo-1::/orbit', 'repo-2::/nimbus'],
    agents: [
      { paneKey: 'pane-9', workspaceId: 'repo-2::/nimbus', state: 'working', agent: 'codex', at: null }
    ]
  })
  main.outside.lastWorked = async (folder) => (folder === '/code/Tundra' ? 30 : folder === '/orbit' ? 20 : 0)
  main.outside.readIcon = async (folder) => (folder === '/nimbus' ? { data: 'AAAA', type: 'image/png' } : null)
  const worker = await mountWorker(main, { host })

  const view = await worker.request('office.read')
  assert.deepEqual(view.projects, [
    { name: 'nimbus', state: 'working' },
    { name: 'Tundra', state: 'idle' },
    { name: 'Orbit', state: 'idle' }
  ])
  assert.deepEqual(view.unseen, [])
  assert.deepEqual(view.crew, [
    { key: 'pane-9', agent: 'codex', state: 'working', project: 'nimbus' }
  ])
  // An agent first seen this way finishes a task when it is done.
  await worker.emit('agent.status.changed', {
    workspaceId: 'repo-2::/nimbus',
    paneKey: 'pane-9',
    state: 'done',
    receivedAt: 5
  })
  assert.equal((worker.posts.at(-1)?.payload as OfficeChange).note?.finished, true)

  assert.deepEqual(await worker.request('project.icon', { name: 'nimbus' }), { data: 'AAAA', type: 'image/png' })
  assert.equal(await worker.request('project.icon', { name: 'Orbit' }), null)
  // The icon the person gave the project in Orca wins over the one in its folder.
  main.outside.readProjectIcons = async () => ({ '/nimbus': { data: 'BBBB', type: 'image/png' } })
  assert.deepEqual(await worker.request('project.icon', { name: 'nimbus' }), { data: 'BBBB', type: 'image/png' })
  // A panel cannot make the worker read a folder Orca did not list.
  assert.equal(await worker.request('project.icon', { name: '/etc' }), null)
  await worker.deactivate()
})

/** A ranking server in memory: it answers what each test sets and keeps what it was sent. */
function fakeServer(answers: Record<string, unknown[]>) {
  const sent: { method: string; path: string; auth: string | null; body: unknown }[] = []
  main.outside.fetch = async (url, init) => {
    const path = new URL(url).pathname
    const method = init.method ?? 'GET'
    const headers = (init.headers ?? {}) as Record<string, string>
    sent.push({
      method,
      path,
      auth: headers.authorization ?? null,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null
    })
    const key = `${method} ${path.replace(/runs\/[^/]+$/, 'runs/:id')}`
    const answer = answers[key]?.shift() ?? { status: 404, body: { error: 'not found' } }
    const { status, body } = answer as { status: number; body: unknown }
    return new Response(status === 204 ? null : JSON.stringify(body), { status })
  }
  return sent
}

const WEEK = { period: '2026-W46', endsAt: Date.now() + 86_400_000 }
const BOARD = {
  game: 'blip',
  week: { ...WEEK, top: [], me: null },
  all: { top: [], me: null }
}
const COUNTED = (score: number) => ({
  status: 200,
  body: {
    status: 'counted',
    score,
    week: { rank: 1, score },
    all: { rank: 1, score },
    ...WEEK
  }
})

test('nothing reaches the ranking until the person joins it', async () => {
  const sent = fakeServer({})
  const worker = await mountWorker(main, { host: mockHost() })
  const result = await worker.request('ranking.submit', { game: 'blip', score: 12, record: {} })
  assert.deepEqual(result, { status: 'skipped' })
  assert.deepEqual(await worker.request('ranking.join', { name: ' ' }), { ok: false, problem: 'name' })
  assert.equal(sent.length, 0)
  await worker.deactivate()
})

test('joins with a nickname, sends a run that beats the week and skips one that does not', async () => {
  const sent = fakeServer({
    'PUT /v1/me': [{ status: 200, body: { name: 'Ada' } }],
    'POST /v1/runs': [{ status: 200, body: { status: 'checking', run: '0'.repeat(36) } }],
    'POST /v1/runs/:id': [COUNTED(20)],
    'GET /v1/boards/blip': [{ status: 200, body: BOARD }]
  })
  const worker = await mountWorker(main, { host: mockHost() })
  assert.deepEqual(await worker.request('ranking.join', { name: '  Ada  ' }), { ok: true, name: 'Ada' })
  const verdict = await worker.request('ranking.submit', { game: 'blip', score: 20, record: { r: 1 } })
  assert.equal(verdict.status, 'counted')
  // A run below the best of the week would change nothing: it stays home.
  assert.deepEqual(
    await worker.request('ranking.submit', { game: 'blip', score: 15, record: {} }),
    { status: 'skipped' }
  )
  const view = await worker.request('ranking.read', { game: 'blip' })
  assert.equal(view.name, 'Ada')
  assert.deepEqual(
    sent.map((request) => `${request.method} ${request.path.replace(/0{36}/, ':id')}`),
    ['PUT /v1/me', 'POST /v1/runs', 'POST /v1/runs/:id', 'GET /v1/boards/blip']
  )
  // The same secret every time, and only the nickname and the run in the bodies.
  const secrets = new Set(sent.map((request) => request.auth))
  assert.equal(secrets.size, 1)
  assert.match([...secrets][0] ?? '', /^Bearer [A-Za-z0-9_-]{43}$/)
  assert.deepEqual(sent[0]?.body, { name: 'Ada' })
  assert.deepEqual(sent[1]?.body, { game: 'blip', record: { r: 1 } })
  await worker.deactivate()
})

test('a player the server forgot joins again, and leaving forgets the player here too', async () => {
  fakeServer({
    'PUT /v1/me': [
      { status: 200, body: { name: 'Ada' } },
      { status: 200, body: { name: 'Ada' } }
    ],
    'POST /v1/runs': [{ status: 403, body: { error: 'not in the ranking' } }],
    'DELETE /v1/me': [{ status: 204, body: null }],
    'GET /v1/boards/blip': [
      { status: 200, body: BOARD },
      { status: 200, body: BOARD }
    ]
  })
  const worker = await mountWorker(main, { host: mockHost() })
  await worker.request('ranking.join', { name: 'Ada' })
  const refused = await worker.request('ranking.submit', { game: 'blip', score: 3, record: {} })
  assert.deepEqual(refused, { status: 'refused', reason: 'not in the ranking' })
  assert.equal((await worker.request('ranking.read', { game: 'blip' })).name, null)
  await worker.request('ranking.join', { name: 'Ada' })
  assert.deepEqual(await worker.request('ranking.leave'), { left: true })
  assert.equal((await worker.request('ranking.read', { game: 'blip' })).name, null)
  await worker.deactivate()
})

test('a server out of reach leaves the games playing', async () => {
  main.outside.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  const worker = await mountWorker(main, { host: mockHost() })
  assert.deepEqual(await worker.request('ranking.join', { name: 'Ada' }), { ok: false, problem: 'offline' })
  assert.deepEqual(await worker.request('ranking.read', { game: 'blip' }), { name: null, board: null })
  await worker.deactivate()
})
