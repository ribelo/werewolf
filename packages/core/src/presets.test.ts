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
      ['bench', 'monster', 'deadlift', 'curl'],
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

  it('ww-e1fo: kids are the age classes 2–8 and 9–12, T16 starts at 13, and teams leave out kids up to 12', () => {
    expect(
      client2026Rulebook.ageClasses.slice(0, 3).map((item) => [item.id, item.from, item.through]),
    ).toEqual([
      ['k2-8', 2, 8],
      ['k9-12', 9, 12],
      ['t16', 13, 16],
    ])
    for (const team of client2026Rulebook.classifications.filter((c) => c.kind === 'team')) {
      expect(team.ageClassIds).toContain('t16')
      expect(team.ageClassIds).not.toContain('k2-8')
      expect(team.ageClassIds).not.toContain('k9-12')
    }
  })
})
