// The texts that are put together from parts.
import { assert, test } from 'orca/testing'
import { fill, newsText, stringsFor } from './strings'

const es = stringsFor('es-EC')
const en = stringsFor('en-US')

test('fills the places of a text and leaves the ones it has no value for', () => {
  assert.equal(fill('{name} has {count}', { name: 'orbit', count: 5 }), 'orbit has 5')
  assert.equal(fill('{name} finished', {}), '{name} finished')
})

test('the summary names each project and adds up the tasks', () => {
  const unseen = [
    { name: 'orbit', tasks: 3 },
    { name: 'acme-platform', tasks: 1 }
  ]
  assert.equal(
    newsText(es, unseen, true),
    'Mientras no mirabas, tus agentes terminaron 4 tareas: orbit 3, acme-platform 1'
  )
  assert.equal(
    newsText(en, unseen, true),
    'While you were away, your agents finished 4 tasks: orbit 3, acme-platform 1'
  )
})

test('the summary of one task is in the singular', () => {
  assert.equal(
    newsText(es, [{ name: 'orbit', tasks: 1 }], true),
    'Mientras no mirabas, tus agentes terminaron 1 tarea: orbit 1'
  )
})

test('the summary leaves out the names when they are hidden or unknown', () => {
  assert.equal(
    newsText(es, [{ name: 'orbit', tasks: 2 }], false),
    'Mientras no mirabas, tus agentes terminaron 2 tareas'
  )
  assert.equal(
    newsText(es, [{ name: null, tasks: 2 }], true),
    'Mientras no mirabas, tus agentes terminaron 2 tareas'
  )
})

test('Spanish is used for any Spanish locale and English for the rest', () => {
  assert.equal(es.items.cat, 'Gato')
  assert.equal(stringsFor('fr-FR').items.cat, 'Cat')
})
