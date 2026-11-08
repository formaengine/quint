const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const { readFileSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')

const execute = promisify(execFile)

async function main() {
  const platform = `${process.platform}-${process.arch}`
  assert.equal(platform, process.env.BUNDLE_PLATFORM)
  assert.equal(process.env.GITHUB_REPOSITORY, 'formaengine/quint')
  assert.match(process.env.GITHUB_SHA, /^[a-f0-9]{40}$/)
  const expectedHost = { 'darwin-arm64': 'aarch64-apple-darwin', 'linux-x64': 'x86_64-unknown-linux-gnu' }[platform]
  assert(expectedHost)
  const executable = path.resolve(__dirname, '../src/rust/native', platform, 'quint_evaluator')
  const sha256 = createHash('sha256').update(readFileSync(executable)).digest('hex')
  assert.equal(sha256, readFileSync(`${executable}.sha256`, 'utf8').trim())
  const rustc = (await execute('rustc', ['--version', '--verbose'])).stdout.trim()
  assert.match(rustc, /^rustc 1\.90\.0 /)
  assert(rustc.includes(`host: ${expectedHost}`))
  const cargo = (await execute('cargo', ['--version'])).stdout.trim()
  const compiler = (await execute('cc', ['--version'])).stdout.trim()
  const binaryFormat = (await execute('file', [executable])).stdout.trim()
  const npm = (await execute('npm', ['--version'])).stdout.trim()
  const provenance = {
    repository: process.env.GITHUB_REPOSITORY,
    sourceCommit: process.env.GITHUB_SHA,
    platform,
    sha256,
    cargoLockSha256: createHash('sha256')
      .update(readFileSync(path.resolve(__dirname, '../../evaluator/Cargo.lock')))
      .digest('hex'),
    toolchain: { rustc, cargo, compiler, node: process.version, npm },
    build: {
      command: 'cargo build --release --locked --jobs 1',
      rustflags: process.env.RUSTFLAGS,
      sourceDateEpoch: process.env.SOURCE_DATE_EPOCH,
      incremental: process.env.CARGO_INCREMENTAL,
      zeroArDate: process.env.ZERO_AR_DATE,
      binaryFormat,
    },
    runner: {
      label: process.env.BUNDLE_RUNNER,
      name: process.env.RUNNER_NAME,
      os: process.env.RUNNER_OS,
      arch: process.env.RUNNER_ARCH,
      imageOS: process.env.ImageOS,
      imageVersion: process.env.ImageVersion,
      kernel: os.release(),
    },
    workflowRun: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  }
  writeFileSync(`${executable}.provenance.json`, JSON.stringify(provenance, null, 2) + '\n')
  console.log(JSON.stringify(provenance, null, 2))
}

main().catch(error => {
  if (error instanceof Error) {
    console.error(error)
    process.exitCode = 1
    return
  }
  throw error
})
