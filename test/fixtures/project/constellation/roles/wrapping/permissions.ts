import { allow, c, type Permissions } from '@zodiaceco/sdk'
import { custom } from '@zodiaceco/sdk/actions'

export default [
  custom({
    label: 'Wrap and unwrap ETH',
    permissions: [
      allow.eth.weth.deposit({ send: true }),
      allow.eth.weth.withdraw(c.lte(10n ** 18n)),
    ],
  }),
] satisfies Permissions
