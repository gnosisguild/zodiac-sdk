#!/usr/bin/env bun
// Runs every test file in a process of its own. `mock.module` replaces a
// module for the rest of the process and `mock.restore()` does not undo it, so
// under a single `bun test` a mock leaks into every file that runs after the
// one declaring it, and whether a suite passes depends on file order.
//
// Positional arguments pick the files whose path contains any of them, the way
// `bun test` filters; flags go to every `bun test` run, so pass values inline
// (`--test-name-pattern=push`).

import { Glob, spawnSync } from 'bun'

const args = process.argv.slice(2)
const filters = args.filter((arg) => !arg.startsWith('-'))
const flags = args.filter((arg) => arg.startsWith('-'))

const files = (await Array.fromAsync(new Glob('src/**/*.test.ts').scan()))
  .filter(
    (file) =>
      filters.length === 0 || filters.some((filter) => file.includes(filter))
  )
  .toSorted()

const failed: string[] = []

for (const file of files) {
  const { exitCode } = spawnSync(['bun', 'test', ...flags, `./${file}`], {
    stdio: ['inherit', 'inherit', 'inherit'],
  })

  if (exitCode !== 0) {
    failed.push(file)
  }
}

if (failed.length > 0) {
  console.error(`\n${failed.length} of ${files.length} test files failed:`)

  for (const file of failed) {
    console.error(`  ${file}`)
  }

  process.exit(1)
}

console.log(`\nAll ${files.length} test files passed.`)
