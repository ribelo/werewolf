import * as Result from 'effect/Result'
import { describe, expect, it } from 'vitest'
import {
  client2026Rulebook,
  parseRulebookJson,
  rulebookPresets,
  rulebookToJson,
} from './presets.ts'

describe('rulebook presets and JSON', () => {
  it('ww-s8ny: every preset is a valid rulebook with its own lifts', () => {
    expect(rulebookPresets.map((preset) => preset.rulebook.lifts.map((lift) => lift.id))).toEqual([
      ['bench', 'deadlift', 'curl'],
      ['squat', 'bench', 'deadlift'],
      ['bench', 'deadlift'],
      ['lift'],
    ])
  })

  it('ww-7s20: a rulebook survives export and import unchanged', () => {
    for (const preset of rulebookPresets) {
      const imported = parseRulebookJson(rulebookToJson(preset.rulebook))
      expect(Result.getOrThrow(imported)).toEqual(preset.rulebook)
    }
  })

  it('ww-7s20: broken text and broken references are rejected with one readable sentence', () => {
    const text = parseRulebookJson('{ not json')
    expect(Result.isFailure(text) && text.failure.detail).toBe('The text is not valid JSON.')
    const broken = JSON.parse(rulebookToJson(client2026Rulebook))
    broken.classifications[0].liftIds = ['unknown-lift']
    const reference = parseRulebookJson(JSON.stringify(broken))
    expect(Result.isFailure(reference) && reference.failure.detail).toMatch(
      /^The rulebook is not valid: /,
    )
    expect(Result.isFailure(reference) && reference.failure.detail).not.toContain('\n')
  })

  it('ww-e1fo: the 2026 preset has a kids division as a placeholder without invented rules', () => {
    const kids = client2026Rulebook.divisions.find((division) => division.id === 'kids')
    expect(kids?.conditions).toEqual({})
    expect(
      client2026Rulebook.classifications.some(
        (c) => c.kind === 'individual' && c.name.en.includes('Kids'),
      ),
    ).toBe(false)
  })
})
