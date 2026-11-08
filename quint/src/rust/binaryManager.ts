/* ----------------------------------------------------------------------------------
 * Copyright 2025 Informal Systems
 * Licensed under the Apache License, Version 2.0.
 * See LICENSE in the project root for license information.
 * --------------------------------------------------------------------------------- */

/** Resolves and verifies the fork evaluator bundled with this package. */
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { arch, platform } from 'os'
import path from 'path'

export class EvaluatorChecksumError extends Error {
  constructor(readonly executablePath: string) {
    super(`Bundled Rust evaluator checksum mismatch: ${executablePath}`)
    this.name = 'EvaluatorChecksumError'
  }
}

/** Returns the host-specific bundled evaluator, failing rather than downloading a substitute. */
export async function getRustEvaluatorPath(): Promise<string> {
  const executable = platform() === 'win32' ? 'quint_evaluator.exe' : 'quint_evaluator'
  const executablePath = path.join(__dirname, 'native', `${platform()}-${arch()}`, executable)
  const [binary, checksum] = await Promise.all([readFile(executablePath), readFile(`${executablePath}.sha256`, 'utf8')])
  const actual = createHash('sha256').update(binary).digest('hex')
  if (actual !== checksum.trim()) {
    throw new EvaluatorChecksumError(executablePath)
  }
  return executablePath
}
