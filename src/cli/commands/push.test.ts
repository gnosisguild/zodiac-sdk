import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApiRequestError } from '../../api'
import { ConstellationRejectedError } from '../../push'

const mockPush = mock()

mock.module('../../push', () => ({
  ConstellationRejectedError,
  push: mockPush,
}))

const { pushEntrypoint } = await import('./push')

/**
 * An entrypoint module exporting nothing to push, next to a config file
 * holding the API key to push with.
 */
const createProject = () => {
  const dir = mkdtempSync(join(tmpdir(), 'zodiac-push-test-'))
  const entrypoint = join(dir, 'index.ts')
  const config = join(dir, 'zodiac.config.ts')

  writeFileSync(entrypoint, 'export {}\n')
  writeFileSync(config, "export default { apiKey: 'zodiac_from_config' }\n")

  return { entrypoint, config }
}

describe('pushEntrypoint', () => {
  afterEach(() => {
    process.exitCode = 0
    mockPush.mockReset()
  })

  it('prints what Zodiac refused and fails without a stack trace', async () => {
    mockPush.mockRejectedValue(
      new ConstellationRejectedError(
        'Production',
        new ApiRequestError('Some policies cannot be held in Zodiac', {
          status: 400,
          statusText: 'Bad Request',
          details: {
            issues: [
              {
                path: ['specification', 0, 'roles', 'treasury_ops', 'policy'],
                message: 'Mark this role as that policy too.',
              },
            ],
          },
        }),
        () => 'opsRoles ("Ops Roles")'
      )
    )

    const error = spyOn(console, 'error').mockImplementation(() => {})

    await pushEntrypoint({ ...createProject(), openInBrowser: false })

    expect(error).toHaveBeenCalledWith(
      [
        'Zodiac refused the constellation "Production". Some policies cannot be held in Zodiac:',
        '  • opsRoles ("Ops Roles") › roles › treasury_ops › policy: Mark this role as that policy too.',
      ].join('\n')
    )
    expect(process.exitCode).toBe(1)

    error.mockRestore()
  })

  it('prints where each pushed constellation can be reviewed', async () => {
    mockPush.mockResolvedValue([{ id: '1', url: 'https://app.zodiac.eco/c/1' }])

    const log = spyOn(console, 'log').mockImplementation(() => {})

    await pushEntrypoint({ ...createProject(), openInBrowser: false })

    expect(log).toHaveBeenCalledWith(
      'Pushed constellation to: https://app.zodiac.eco/c/1'
    )

    log.mockRestore()
  })

  it('pushes with the API key from the config file', async () => {
    mockPush.mockResolvedValue([])

    await pushEntrypoint({ ...createProject(), openInBrowser: false })

    expect(mockPush).toHaveBeenCalledWith({}, { apiKey: 'zodiac_from_config' })
  })

  it("pushes the project root's constellation by default, wherever it runs", async () => {
    mockPush.mockResolvedValue([])

    const { config } = createProject()
    const root = join(config, '..')

    mkdirSync(join(root, 'constellation'))
    writeFileSync(
      join(root, 'constellation', 'index.ts'),
      'export const ops = "from the root"\n'
    )

    await pushEntrypoint({ config, openInBrowser: false })

    expect(mockPush).toHaveBeenCalledWith(
      { ops: 'from the root' },
      expect.anything()
    )
  })
})
