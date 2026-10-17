import { constellation } from '@zodiaceco/sdk'
import { wrapping } from './roles'

const eth = constellation({
  workspace: 'Fixture workspace',
  label: 'Runtime fixture',
  chain: 1,
})

export const safe = eth.safe['Fixture Safe']({
  nonce: 0n,
  threshold: 1,
  owners: ['0x1111111111111111111111111111111111111111'],
  modules: [eth.roles['Fixture Roles']],
})

export const roles = eth.roles['Fixture Roles']({
  nonce: 0n,
  target: safe,
  owner: safe,
  avatar: safe,
  roles: { wrapping },
})
