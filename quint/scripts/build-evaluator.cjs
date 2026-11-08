const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const { once } = require('node:events')
const { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')

async function main() {
  const evaluator = path.resolve(__dirname, '../../evaluator')
  const target = path.join(evaluator, 'target')
  const cargo = spawn(
    'cargo',
    [
      'build',
      '--release',
      '--locked',
      '--jobs',
      '1',
      '--manifest-path',
      path.join(evaluator, 'Cargo.toml'),
      '--target-dir',
      target,
    ],
    { env: process.env, stdio: 'inherit' }
  )
  const [code] = await once(cargo, 'close')
  if (code !== 0) {
    process.exitCode = code ?? 1
    return
  }
  const executable = process.platform === 'win32' ? 'quint_evaluator.exe' : 'quint_evaluator'
  const native = path.resolve(__dirname, '../src/rust/native')
  const directory = path.join(native, `${process.platform}-${process.arch}`)
  const source = path.join(target, 'release', executable)
  const destination = path.join(directory, executable)
  rmSync(native, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  copyFileSync(source, destination)
  chmodSync(destination, 0o755)
  const checksum = createHash('sha256').update(readFileSync(destination)).digest('hex')
  writeFileSync(`${destination}.sha256`, `${checksum}\n`)
  console.log(`Bundled fork evaluator ${process.platform}-${process.arch}: ${checksum}`)
}

main().catch(error => {
  if (error instanceof Error) {
    console.error(error)
    process.exitCode = 1
    return
  }
  throw error
})
