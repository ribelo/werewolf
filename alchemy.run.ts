import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import { Edge } from './infra/stack.ts'

export default Alchemy.Stack(
  'WerewolfV2',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const edge = yield* Edge
    return { url: edge.url }
  }),
)
