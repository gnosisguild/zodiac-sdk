#!/usr/bin/env node
import { run } from './run'

run().then(
  () => {
    // A command that reports its own failure, like a refused push, sets the
    // exit code instead of throwing.
    process.exit(process.exitCode ?? 0)
  },
  (error: unknown) => {
    if (error) console.error(error)
    process.exit(1)
  }
)
