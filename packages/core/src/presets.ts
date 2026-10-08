import * as Schema from 'effect/Schema'
import clientInput from './data/client-2026.json' with { type: 'json' }
import { Rulebook } from './rulebook.ts'

/** Starting 2026 rules. Equipment and individual rankings remain editable; kids rules are not set. */
export const client2026Rulebook = Schema.decodeUnknownSync(Rulebook)(clientInput)
