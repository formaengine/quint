const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync, readdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const directory = process.argv[2]
assert(directory, 'release output directory is required')
const filename = 'informalsystems-quint-0.33.1.tgz'
const tarball = readFileSync(path.join(directory, filename))
const sha256 = createHash('sha256').update(tarball).digest('hex')
const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64')
const pack = JSON.parse(readFileSync(path.join(directory, 'npm-pack.json'), 'utf8'))[0]
assert.equal(pack.filename, filename)
assert.equal(pack.integrity, integrity)
const native = path.resolve(__dirname, '../src/rust/native')
assert.deepEqual(readdirSync(native).sort(), ['darwin-arm64', 'linux-x64'])
const platforms = readdirSync(native)
  .sort()
  .map(platform => {
    const executable = path.join(native, platform, 'quint_evaluator')
    const provenance = JSON.parse(readFileSync(`${executable}.provenance.json`, 'utf8'))
    assert.equal(provenance.repository, 'formaengine/quint')
    assert.equal(provenance.sourceCommit, process.env.GITHUB_SHA)
    assert.equal(provenance.platform, platform)
    assert.equal(provenance.sha256, createHash('sha256').update(readFileSync(executable)).digest('hex'))
    assert.equal(provenance.sha256, readFileSync(`${executable}.sha256`, 'utf8').trim())
    return provenance
  })
const receipt = {
  repository: 'formaengine/quint',
  sourceCommit: process.env.GITHUB_SHA,
  workflowRun: `https://github.com/formaengine/quint/actions/runs/${process.env.GITHUB_RUN_ID}`,
  tarball: { filename, sha256, integrity, size: tarball.length },
  platforms,
}
writeFileSync(path.join(directory, 'provenance.json'), JSON.stringify(receipt, null, 2) + '\n')
writeFileSync(path.join(directory, 'npm-integrity.txt'), integrity + '\n')
const sums = [
  `${sha256}  ${filename}`,
  ...platforms.map(p => `${p.sha256}  package/dist/src/rust/native/${p.platform}/quint_evaluator`),
]
writeFileSync(path.join(directory, 'SHA256SUMS'), sums.join('\n') + '\n')
console.log(JSON.stringify(receipt, null, 2))
