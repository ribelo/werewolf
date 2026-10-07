import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import { Api, WebDeploy } from './infra/stack.ts'

export default Alchemy.Stack(
  'Werewolf',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const api = yield* Api
    yield* WebDeploy
    return { api: api.url }
  }),
)
