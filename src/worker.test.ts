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
