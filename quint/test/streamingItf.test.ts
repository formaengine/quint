import { describe, it } from 'mocha'
import { assert } from 'chai'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse, typecheck } from '../src/cliCommands'
import { toExpr } from '../src/cliHelpers'
import { prepareOnTrace } from '../src/cliReporting'
import type { TraceHook } from '../src/cliReporting'
import { Evaluator } from '../src/runtime/impl/evaluator'
import { newTraceRecorder } from '../src/runtime/trace'
import { newRng } from '../src/rng'
import { CommandWrapper } from '../src/rust/commandWrapper'
import { unreachable } from '../src/util'

const source = 'testFixture/simulator/gettingStarted.qnt'

describe('streaming simulation ITF', () => {
  for (const backend of ['typescript', 'rust'] as const) {
    const simulate = async (onTrace?: TraceHook) => {
      const parsed = await parse({
        args: {},
        path: source,
        sourceCode: new Map([[source, readFileSync(source, 'utf8')]]),
        stage: 'loading',
        warnings: [],
      })
      assert(parsed.isRight(), 'fixture must parse')
      const checked = await typecheck(parsed.value)
      assert(checked.isRight(), 'fixture must typecheck')
      const model = checked.value
      const init = toExpr(model, 'init').unwrap()
      const step = toExpr(model, 'step').unwrap()
      const invariant = toExpr(model, 'true').unwrap()
      const rng = newRng(0x4c2n)
      switch (backend) {
        case 'typescript': {
          const evaluator = new Evaluator(model.resolver.table, newTraceRecorder(0, rng, 3), rng, true)
          return evaluator.simulate(init, step, invariant, [], 4, 3, 3, onTrace)
        }
        case 'rust':
          return new CommandWrapper(0).simulate(
            { modules: [], table: model.resolver.table, main: 'bank', init, step, invariants: [], witnesses: [] },
            source,
            4,
            3,
            3,
            1,
            0x4c2n,
            true,
            onTrace
          )
        default:
          return unreachable(backend)
      }
    }

    it(`${backend} writes the release ITF bytes in trace order`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'quint-streaming-itf-'))
      const writeTrace = prepareOnTrace(source, join(directory, 'trace_{seq}.itf.json'), 3, true)
      const indices: number[] = []
      const now = Date.now
      const dateString = Date.prototype.toString
      // Fix the clock so the ITF headers can be compared byte for byte.
      Date.now = () => 0
      Date.prototype.toString = () => 'Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)'
      try {
        const outcome = await simulate((index, status, vars, states) => {
          indices.push(index)
          writeTrace(index, status, vars, states)
        })
        assert.equal(outcome.status, 'ok')
        assert.deepEqual(indices, [0, 1, 2])
        const filenames = ['trace_0.itf.json', 'trace_1.itf.json', 'trace_2.itf.json']
        assert.deepEqual(readdirSync(directory).sort(), filenames)
        for (const filename of filenames) {
          assert.deepEqual(
            readFileSync(join(directory, filename)),
            readFileSync(join('testFixture/streaming-itf', backend, filename)),
            filename
          )
        }
      } finally {
        Date.now = now
        Date.prototype.toString = dateString
        rmSync(directory, { recursive: true })
      }
    })

    it(`${backend} retains only the first converted payload after delivering every trace`, async () => {
      const deliveredLengths: number[] = []
      const outcome = await simulate((_index, _status, _vars, states) => deliveredLengths.push(states.length))

      assert.deepEqual(deliveredLengths, [4, 4, 4])
      assert.deepEqual(
        outcome.bestTraces.map(trace => trace.states.length),
        [4, 0, 0]
      )
      assert.deepEqual(
        outcome.bestTraces.map(trace => trace.result),
        [true, true, true]
      )
      assert.deepEqual(
        outcome.bestTraces.map(trace => trace.seed),
        { typescript: [1218n, 1227n, 1236n], rust: [1230n, 1242n, 1254n] }[backend]
      )
      assert(outcome.bestTraces.slice(1).every(trace => trace.diagnostics === undefined))
      assert(outcome.bestTraces.slice(1).every(trace => trace.pendingDiagnostics === undefined))
    })
  }
})
