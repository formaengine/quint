import { afterEach, beforeEach, describe, it } from 'mocha'
import { assert } from 'chai'
import { copyFileSync, cpSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { arch, platform, tmpdir } from 'os'
import { join } from 'path'

describe('bundled fork evaluator', () => {
  let directory: string
  let executable: string
  let manager: typeof import('../src/rust/binaryManager')

  beforeEach(() => {
    directory = realpathSync(mkdtempSync(join(tmpdir(), 'quint-bundled-evaluator-')))
    copyFileSync('dist/src/rust/binaryManager.js', join(directory, 'binaryManager.js'))
    cpSync('dist/src/rust/native', join(directory, 'native'), { recursive: true })
    executable = join(
      directory,
      'native',
      `${platform()}-${arch()}`,
      platform() === 'win32' ? 'quint_evaluator.exe' : 'quint_evaluator'
    )
    manager = require(join(directory, 'binaryManager.js'))
  })

  afterEach(() => rmSync(directory, { recursive: true }))

  it('selects the verified executable from its own package', async () => {
    assert.equal(await manager.getRustEvaluatorPath(), executable)
  })

  it('rejects a corrupted bundled executable', async () => {
    writeFileSync(executable, 'corrupted evaluator')
    try {
      await manager.getRustEvaluatorPath()
      assert.fail('corrupted evaluator must be rejected')
    } catch (error) {
      assert(error instanceof manager.EvaluatorChecksumError)
      assert.equal(error.executablePath, executable)
    }
  })

  it('fails on a missing host bundle instead of selecting a downloaded evaluator', async () => {
    rmSync(join(directory, 'native'), { recursive: true })
    try {
      await manager.getRustEvaluatorPath()
      assert.fail('missing evaluator must be rejected')
    } catch (error) {
      assert(error instanceof Error)
      assert.include(error.message, 'ENOENT')
      assert.include(error.message, executable)
    }
  })
})
