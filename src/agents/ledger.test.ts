// What is known of the agents and what counts as a finished task, without Orca.
import { assert, test } from 'orca/testing'
import {
  LEDGER,
  emptyLedger,
  markSeen,
  parseLedger,
  prune,
  recordStatus,
  removeWorkspace,
  seedAgents,
  setKinds,
  setNames,
  viewOf,
  type AgentState,
  type Ledger,
  type StatusChange
} from './ledger'

const HOUR = 60 * 60 * 1000

function change(
  paneKey: string,
  state: AgentState,
  receivedAt: number,
  workspaceId: string | null = 'ws-orbit'
): StatusChange {
  return { paneKey, state, receivedAt, workspaceId }
}

function office(): Ledger {
  const ledger = emptyLedger()
  setNames(ledger, [
    { id: 'ws-orbit', name: 'main', project: 'Orbit', path: '/code/orbit' },
    { id: 'ws-orbit-2', name: 'fix-login', project: 'Orbit', path: '/worktrees/orbit/fix-login' },
    // A folder workspace has no project, and Orca's name for it says nothing.
    { id: 'ws-tundra', name: 'Principal', project: null, path: '/code/Freelance/Tundra' }
  ])
  return ledger
}

test('an agent seen at work finishes a task when it is done', () => {
  const ledger = office()
  assert.equal(recordStatus(ledger, change('a', 'working', 1))?.finished, false)
  const note = recordStatus(ledger, change('a', 'done', 2))
  assert.deepEqual(note, {
    paneKey: 'a',
    workspaceId: 'ws-orbit',
    project: 'Orbit',
    agent: '',
    floating: false,
    state: 'done',
    finished: true
  })
  assert.deepEqual(viewOf(ledger).unseen, [{ name: 'Orbit', tasks: 1 }])
})

test('the first sight of an agent is not a finished task', () => {
  const ledger = office()
  assert.equal(recordStatus(ledger, change('a', 'done', 1))?.finished, false)
  assert.deepEqual(viewOf(ledger).unseen, [])
})

test('the same state twice is not a change', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1))
  recordStatus(ledger, change('a', 'done', 2))
  assert.equal(recordStatus(ledger, change('a', 'done', 3)), null)
  assert.deepEqual(viewOf(ledger).unseen, [{ name: 'Orbit', tasks: 1 }])
})

test('a turn the person interrupted is not a finished task', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1))
  const note = recordStatus(ledger, {
    ...change('a', 'done', 2),
    mainAgent: { outcome: 'interruption' }
  })
  assert.equal(note?.finished, false)
  assert.deepEqual(viewOf(ledger).unseen, [])
})

test('an agent that was waiting and then finishes counts once', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1))
  recordStatus(ledger, change('a', 'waiting', 2))
  recordStatus(ledger, change('a', 'working', 3))
  recordStatus(ledger, change('a', 'done', 4))
  assert.deepEqual(viewOf(ledger).unseen, [{ name: 'Orbit', tasks: 1 }])
})

test('the wall shows each project once, with what matters most', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1, 'ws-orbit'))
  recordStatus(ledger, change('b', 'done', 2, 'ws-orbit-2'))
  recordStatus(ledger, change('c', 'working', 3, 'ws-tundra'))
  recordStatus(ledger, change('d', 'blocked', 4, 'ws-tundra'))
  assert.deepEqual(viewOf(ledger).projects, [
    { name: 'Tundra', state: 'waiting' },
    { name: 'Orbit', state: 'working' }
  ])
})

test('an agent Orca cannot tie to a workspace finishes without a project', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1, null))
  const note = recordStatus(ledger, change('a', 'done', 2, null))
  assert.equal(note?.project, null)
  assert.equal(note?.finished, true)
  assert.deepEqual(viewOf(ledger).projects, [])
  assert.deepEqual(viewOf(ledger).unseen, [{ name: null, tasks: 1 }])
})

test('seeing the summary clears it', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1))
  recordStatus(ledger, change('a', 'done', 2))
  assert.equal(markSeen(ledger), true)
  assert.equal(markSeen(ledger), false)
  assert.deepEqual(viewOf(ledger).unseen, [])
})

test('a state nobody refreshed expires', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 0))
  assert.equal(prune(ledger, LEDGER.keepMs.working - HOUR), false)
  assert.equal(prune(ledger, LEDGER.keepMs.working + HOUR), true)
  assert.deepEqual(viewOf(ledger).projects, [])
})

test('a removed workspace leaves the wall', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1, 'ws-tundra'))
  assert.equal(removeWorkspace(ledger, 'ws-tundra'), true)
  assert.deepEqual(viewOf(ledger).projects, [])
})

test('a stored ledger comes back as it was, and junk is dropped', () => {
  const ledger = office()
  recordStatus(ledger, change('a', 'working', 1))
  recordStatus(ledger, change('a', 'done', 2))
  assert.deepEqual(parseLedger(JSON.parse(JSON.stringify(ledger))), ledger)
  assert.deepEqual(parseLedger('junk'), emptyLedger())
  assert.deepEqual(
    parseLedger({ panes: { a: { state: 'flying', at: 1 } }, unseen: { Orbit: 'x' } }),
    emptyLedger()
  )
})

test('an agent names its workspace by path, which ties it to the one Orca lists', () => {
  const ledger = emptyLedger()
  const listed = [
    { id: 'identity:1', name: 'main', project: 'harbor', path: '/code/harbor' },
    { id: 'identity:2', name: 'AP-7600', project: 'acme-platform', path: '/worktrees/ap/AP-7600/' }
  ]
  setNames(ledger, listed, 'repo-1::/code/harbor')
  recordStatus(ledger, change('a', 'working', 1, 'repo-1::/code/harbor'))
  recordStatus(ledger, change('b', 'working', 2, 'repo-2::/worktrees/ap/AP-7600'))
  recordStatus(ledger, change('c', 'working', 3, 'repo-3::/code/unlisted-folder'))
  recordStatus(ledger, change('d', 'working', 4, 'global-floating-terminal'))
  setNames(ledger, listed)
  assert.deepEqual(
    viewOf(ledger).projects.map((project) => project.name),
    ['unlisted-folder', 'acme-platform', 'harbor']
  )
})

test('the agents Orca has right now fill the wall, and the ones gone leave it', () => {
  const ledger = office()
  recordStatus(ledger, change('gone', 'working', 1, 'ws-orbit'))
  recordStatus(ledger, change('elsewhere', 'working', 1, 'ws-other-machine'))
  seedAgents(
    ledger,
    {
      workspaceIds: ['ws-orbit', 'ws-tundra'],
      agents: [{ paneKey: 'new', workspaceId: 'ws-tundra', state: 'waiting', agent: 'codex', at: null }]
    },
    2
  )
  assert.deepEqual(Object.keys(ledger.panes).sort(), ['elsewhere', 'new'])
  assert.deepEqual(viewOf(ledger).unseen, [])
  assert.deepEqual(viewOf(ledger).projects, [{ name: 'Tundra', state: 'waiting' }])
})

test('the desks seat the agents that need the person first, and the rested ones leave', () => {
  const ledger = office()
  recordStatus(ledger, change('typing', 'working', 1, 'ws-orbit'))
  recordStatus(ledger, change('asking', 'working', 2, 'ws-tundra'))
  recordStatus(ledger, change('asking', 'waiting', 3, 'ws-tundra'))
  recordStatus(ledger, change('resting', 'working', 4, 'ws-orbit'))
  recordStatus(ledger, change('resting', 'done', 5, 'ws-orbit'))
  setKinds(ledger, [
    { paneKey: 'typing', workspaceId: 'ws-orbit', state: 'working', agent: 'claude', at: null }
  ])
  assert.deepEqual(viewOf(ledger, 6).crew, [
    { key: 'asking', agent: '', state: 'waiting', project: 'Tundra' },
    { key: 'typing', agent: 'claude', state: 'working', project: 'Orbit' },
    { key: 'resting', agent: '', state: 'done', project: 'Orbit' }
  ])
  assert.deepEqual(
    viewOf(ledger, 5 + LEDGER.restMs + 1).crew.map((member) => member.key),
    ['asking', 'typing']
  )
  // An agent keeps what it is when it changes state.
  recordStatus(ledger, change('typing', 'blocked', 7, 'ws-orbit'))
  assert.deepEqual(
    viewOf(ledger, 8).crew.find((member) => member.key === 'typing'),
    { key: 'typing', agent: 'claude', state: 'blocked', project: 'Orbit' }
  )
})

test('an agent in the floating window says so, and has no project', () => {
  const ledger = office()
  const note = recordStatus(ledger, change('a', 'waiting', 1, 'global-floating-terminal'))
  assert.equal(note?.floating, true)
  assert.equal(note?.project, null)
})
