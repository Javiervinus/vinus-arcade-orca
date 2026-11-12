// What is kept of the CLI's answer.
import { assert, test } from 'orca/testing'
import { parseAgents, parseProjectIcons } from './cli'

test('keeps where each agent runs, which it is and its state, and nothing of what it said', () => {
  const seen = parseAgents(
    JSON.stringify({
      ok: true,
      result: {
        worktrees: [
          {
            worktreeId: 'repo-1::/code/harbor',
            agents: [
              {
                paneKey: 'pane-1',
                state: 'working',
                agentType: 'claude',
                updatedAt: 40,
                stateStartedAt: 30,
                prompt: 'secret',
                lastAssistantMessage: 'secret'
              },
              { paneKey: 'pane-2', state: 'sleeping' }
            ]
          },
          { worktreeId: 'folder:1', agents: [] },
          { agents: [{ paneKey: 'pane-3', state: 'done' }] }
        ]
      }
    })
  )
  assert.deepEqual(seen, {
    workspaceIds: ['repo-1::/code/harbor', 'folder:1'],
    agents: [
      {
        paneKey: 'pane-1',
        workspaceId: 'repo-1::/code/harbor',
        state: 'working',
        agent: 'claude',
        at: 40
      }
    ]
  })
})

test('an answer that is not the expected one gives no agents', () => {
  assert.deepEqual(parseAgents('{"ok":false}'), { workspaceIds: [], agents: [] })
  assert.throws(() => parseAgents('not json'))
})

test('keeps only the icons the person gave their projects in Orca', () => {
  const icons = parseProjectIcons(
    JSON.stringify({
      result: {
        repos: [
          { path: '/code/nimbus', repoIcon: { type: 'image', src: 'data:image/png;base64,AAAA' } },
          { path: '/code/orbit', repoIcon: { type: 'image', src: 'https://github.com/someone.png' } },
          { path: '/code/blip', repoIcon: { type: 'lucide', name: 'Shapes' } },
          { path: '/code/harbor', repoIcon: null }
        ]
      }
    })
  )
  assert.deepEqual(icons, { '/code/nimbus': { type: 'image/png', data: 'AAAA' } })
})
