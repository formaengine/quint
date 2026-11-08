import { describe, it } from 'mocha'
import { assert } from 'chai'
import { execFile } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { ItfTrace } from '../src/itf'

const run = promisify(execFile)

describe('nested any MBT action names', () => {
  for (const { backend, values, picks } of [
    { backend: 'typescript', values: [0, 1, 3, 13, 23, 33, 35, 37, 47], picks: [0, 1, 2, 0, 0, 0, 2, 2, 0] },
    { backend: 'rust', values: [0, 2, 3, 5, 15, 25, 35, 45, 46], picks: [0, 2, 1, 2, 0, 0, 0, 0, 1] },
  ] as const) {
    it(`${backend} preserves Nested and Plain names without changing seeded states or picks`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'quint-nested-any-'))
      const output = join(directory, 'trace.itf.json')
      try {
        await run(process.execPath, [
          'dist/src/cli.js',
          'run',
          'testFixture/simulator/nested_any.qnt',
          '--mbt',
          '--n-traces',
          '1',
          '--max-samples',
          '1',
          '--max-steps',
          '8',
          '--seed',
          '0x1',
          '--backend',
          backend,
          '--out-itf',
          output,
        ])
        const trace: ItfTrace = JSON.parse(readFileSync(output, 'utf8'))
        assert.deepEqual(
          trace.states.map(state => state.x),
          values.map(value => ({ '#bigint': String(value) }))
        )
        assert.deepEqual(
          trace.states.map(state => state['mbt::nondetPicks']),
          picks.map(value => ({
            v:
              value === 0
                ? { tag: 'None', value: { '#tup': [] } }
                : { tag: 'Some', value: { '#bigint': String(value) } },
          }))
        )
        assert.deepEqual(
          trace.states.map(state => state['mbt::actionTaken']),
          values.map((value, index) => (index === 0 ? 'init' : value - values[index - 1] === 10 ? 'Nested' : 'Plain'))
        )
      } finally {
        rmSync(directory, { recursive: true })
      }
    }).timeout(30000)
  }
})
