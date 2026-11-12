// The texts that are put together from parts.
import { assert, test } from 'orca/testing'
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  fill,
  isLanguage,
  newsText,
  stringsFor
} from './strings'

const es = stringsFor('es')
const en = stringsFor('en')

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

test('each language has every text, and the panel starts in English', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en')
  assert.equal(es.items.cat, 'Gato')
  assert.equal(en.items.cat, 'Cat')
  for (const language of LANGUAGES) {
    const texts = stringsFor(language)
    assert.deepEqual(Object.keys(texts).sort(), Object.keys(en).sort())
    for (const [key, text] of Object.entries(texts)) {
      if (typeof text === 'string') assert.ok(text.length > 0, `${language} has no "${key}"`)
    }
    assert.ok(LANGUAGE_NAMES[language])
  }
})

test('only a language there is counts as one', () => {
  assert.equal(isLanguage('es'), true)
  assert.equal(isLanguage('fr'), false)
  assert.equal(isLanguage(null), false)
})
