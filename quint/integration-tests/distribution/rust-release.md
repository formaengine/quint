# Integration tests with the Rust backend

Tests in this script verify that the fork CLI runs its bundled evaluator with
the `rust` backend (`--backend rust`) without populating an evaluator cache.

Note that these tests only run before releases.

<!-- !test program
bash -
-->

## Runs the bundled evaluator with an empty configuration directory

The package provides its host-specific executable and SHA-256 checksum.
An empty `QUINT_HOME` needs no evaluator installation.

This test passes the `--n-threads` flag to the rust backend to check that the
CLI accepts it correctly.

<!-- !test in bundled evaluator -->
```
directory="$(mktemp -d)"
trap 'rm -rf "$directory"' EXIT
QUINT_HOME="$directory/home" quint run \
  --backend=rust \
  --n-threads=4 \
  ./testFixture/simulator/gettingStarted.qnt \
  > "$directory/output"
grep -o '\[ok\]' "$directory/output"
test ! -e "$directory/home"
```

<!-- !test out bundled evaluator -->
```
[ok]
```
