const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')

const execute = promisify(execFile)

async function main() {
  const packageRoot = process.argv[2]
  const proofPath = process.argv[3]
  assert(packageRoot && proofPath, 'installed package and proof paths are required')
  const load = file => require(path.join(packageRoot, 'dist/src', file))
  const platform = `${process.platform}-${process.arch}`
  assert.equal(platform, process.env.BUNDLE_PLATFORM)
  const native = path.join(packageRoot, 'dist/src/rust/native')
  assert.deepEqual(readdirSync(native).sort(), ['darwin-arm64', 'linux-x64'])
  for (const target of readdirSync(native)) {
    const file = path.join(native, target, 'quint_evaluator')
    assert.equal(
      createHash('sha256').update(readFileSync(file)).digest('hex'),
      readFileSync(`${file}.sha256`, 'utf8').trim()
    )
  }
  const executable = await load('rust/binaryManager.js').getRustEvaluatorPath()
  assert.equal(executable, path.join(native, platform, 'quint_evaluator'))
  const directory = mkdtempSync(path.join(os.tmpdir(), 'quint-release-check-'))
  try {
    const guard = path.join(directory, 'network-denied.cjs')
    writeFileSync(
      guard,
      "const deny = () => { throw new Error('Release check denies network access') }; require('node:net').Socket.prototype.connect = deny; globalThis.fetch = deny;\n"
    )
    const output = path.join(directory, 'nested.itf.json')
    await execute(
      process.execPath,
      [
        '--require',
        guard,
        path.join(packageRoot, 'dist/src/cli.js'),
        'run',
        path.resolve(__dirname, '../testFixture/simulator/nested_any.qnt'),
        '--mbt',
        '--n-traces',
        '1',
        '--max-samples',
        '1',
        '--max-steps',
        '8',
        '--seed',
        '0x1',
        '--out-itf',
        output,
      ],
      { env: { ...process.env, QUINT_HOME: path.join(directory, 'empty-home'), NODE_OPTIONS: '' } }
    )
    const trace = JSON.parse(readFileSync(output, 'utf8'))
    assert.deepEqual(
      trace.states.map(state => state.x['#bigint']),
      ['0', '2', '3', '5', '15', '25', '35', '45', '46']
    )
    assert.deepEqual(
      trace.states.map(state => state['mbt::actionTaken']),
      ['init', 'Plain', 'Plain', 'Plain', 'Nested', 'Nested', 'Nested', 'Nested', 'Plain']
    )
    assert.deepEqual(
      trace.states.map(state => state['mbt::nondetPicks']),
      [0, 2, 1, 2, 0, 0, 0, 0, 1].map(value => ({
        v: value === 0 ? { tag: 'None', value: { '#tup': [] } } : { tag: 'Some', value: { '#bigint': String(value) } },
      }))
    )

    const source = 'testFixture/simulator/gettingStarted.qnt'
    for (const backend of ['typescript', 'rust']) {
      const parsed = (
        await load('cliCommands.js').parse({
          args: {},
          path: source,
          sourceCode: new Map([[source, readFileSync(path.resolve(__dirname, '..', source), 'utf8')]]),
          stage: 'loading',
          warnings: [],
        })
      ).unwrap()
      const model = (await load('cliCommands.js').typecheck(parsed)).unwrap()
      const init = load('cliHelpers.js').toExpr(model, 'init').unwrap()
      const step = load('cliHelpers.js').toExpr(model, 'step').unwrap()
      const invariant = load('cliHelpers.js').toExpr(model, 'true').unwrap()
      const lengths = []
      const onTrace = (_index, _status, _vars, states) => lengths.push(states.length)
      let outcome
      switch (backend) {
        case 'typescript': {
          const rng = load('rng.js').newRng(0x4c2n)
          outcome = new (load('runtime/impl/evaluator.js').Evaluator)(
            model.resolver.table,
            load('runtime/trace.js').newTraceRecorder(0, rng, 3),
            rng,
            true
          ).simulate(init, step, invariant, [], 4, 3, 3, onTrace)
          break
        }
        case 'rust':
          outcome = await new (load('rust/commandWrapper.js').CommandWrapper)(0).simulate(
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
          break
        default:
          assert.fail(`Unexpected backend: ${backend}`)
      }
      assert.equal(outcome.status, 'ok')
      assert.deepEqual(lengths, [4, 4, 4])
      assert.deepEqual(
        outcome.bestTraces.map(t => t.states.length),
        [4, 0, 0]
      )
    }
    const proof = {
      platform,
      defaultBackend: 'rust',
      nestedStates: trace.states.length,
      actions: trace.states.map(state => state['mbt::actionTaken']),
      executable,
      executableSha256: createHash('sha256').update(readFileSync(executable)).digest('hex'),
      streamingBackends: ['typescript', 'rust'],
      workflowRun: `https://github.com/formaengine/quint/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }
    writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n')
    console.log(JSON.stringify(proof, null, 2))
  } finally {
    rmSync(directory, { recursive: true })
  }
}

main().catch(error => {
  if (error instanceof Error) {
    console.error(error)
    process.exitCode = 1
    return
  }
  throw error
})
