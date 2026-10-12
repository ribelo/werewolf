import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import { mcCulloughCoefficient, reshelCoefficient } from './coefficients.ts'
import { Command, ContestJournal } from './contest.ts'
import { CalendarDate } from './lifter.ts'
import { client2026Rulebook } from './presets.ts'
import { individualRankings, teamRankings } from './results.ts'
import { Rulebook } from './rulebook.ts'
import { federationCsv, formatDecimal, individualTable, teamTable } from './results-export.ts'
import { Kilograms } from './barbell.ts'

const book = Schema.decodeUnknownSync(Rulebook)({
  ...client2026Rulebook,
  classifications: client2026Rulebook.classifications.map(
    ({ ageClassIds: _ages, ...item }) => item,
  ),
  ageClasses: [
    { id: 'senior', name: { pl: 'Senior (24-39)', en: 'Senior (24-39)' }, from: 24, through: 39 },
  ],
  weightClasses: [
    { id: 'w100', name: { pl: 'Do 100 kg', en: 'Up to 100 kg' }, upperInclusive: 100 },
  ],
})
const date = Schema.decodeSync(CalendarDate)('2026-11-14')
const decode = Schema.decodeUnknownSync(Command)
const entry = (
  id: string,
  name: string,
  sex: string,
  birth: string,
  bw: number,
  lot: number,
  open: number,
) =>
  decode({
    _tag: 'AddEntry',
    id: 'add-' + id,
    at: lot,
    entry: {
      id,
      lifter: { id: 'l' + id, name, sex, birthDate: birth },
      bodyweight: bw,
      lotNumber: lot,
      divisions: [],
      lifts: [{ liftId: 'bench', openingWeight: open }],
    },
  })
const verdict = (id: string, n: number, v: string, at: number) =>
  decode({
    _tag: 'SetVerdict',
    id: 'v' + id + n,
    at,
    attempt: { entryId: id, liftId: 'bench', number: n },
    verdict: v,
  })
const weight = (id: string, n: number, w: number, at: number) =>
  decode({
    _tag: 'SetWeight',
    id: 'w' + id + n,
    at,
    attempt: { entryId: id, liftId: 'bench', number: n },
    weight: w,
  })
const state = Result.getOrThrow(
  ContestJournal.restore(book, date, [
    entry('f', 'Anna Kowalska', 'female', '1990-05-05', 62.5, 1, 50),
    entry('m', 'Jan Nowak Jr', 'male', '1985-01-01', 90, 2, 100),
    entry('z', 'Zero Lifter', 'male', '1988-03-03', 95, 3, 80),
    verdict('f', 1, 'goodLift', 10),
    weight('f', 2, 55, 11),
    verdict('f', 2, 'noLift', 12),
    verdict('m', 1, 'goodLift', 13),
    weight('m', 2, 105, 14),
    verdict('m', 2, 'goodLift', 15),
    verdict('z', 1, 'noLift', 16),
  ]),
).state
const bench = individualRankings(state).find((ranking) => ranking.classificationId === 'open-bench')
if (!bench) throw new Error('bench ranking missing')
const kg = (value: number) => Schema.decodeSync(Kilograms)(value)
const labels = {
  place: 'Miejsce',
  name: 'Zawodnik',
  team: 'Drużyna',
  ageClass: 'Wiek',
  weightClass: 'Waga',
  bodyweight: 'Masa',
  result: 'Wynik',
  points: 'Punkty',
  counted: 'Liczeni',
  didNotStart: 'DNS',
}

describe('federation CSV', () => {
  it('ww-52g7: matches the 2025 layout: BOM, semicolons, blocks by sex and age class, failed attempts negative', () => {
    const csv = federationCsv(state, bench, 'en')
    const reshelF = 50 * reshelCoefficient(kg(62.5), 'female')
    const reshelM = 105 * reshelCoefficient(kg(90), 'male')
    const lines = [
      '\uFEFFBENCH RESULTS' + ';'.repeat(15),
      '',
      'WOMEN - Senior (24-39) RAW' + ';'.repeat(15),
      'Place;Name;Surname;Country;Age;Weight;Age Class;Weight Class;Div;BP1;BP2;BP3;BP4;TotalBP;ReshelBP;McCouloghBP',
      '1;Anna;Kowalska;;36;62.5;Senior (24-39);Up to 100 kg;RAW;50;-55;;;50;' +
        formatDecimal(reshelF, 4) +
        ';' +
        formatDecimal(
          reshelF * mcCulloughCoefficient(Schema.decodeSync(CalendarDate)('1990-05-05'), date),
          4,
        ),
      '',
      'MEN - Senior (24-39) RAW' + ';'.repeat(15),
      'Place;Name;Surname;Country;Age;Weight;Age Class;Weight Class;Div;BP1;BP2;BP3;BP4;TotalBP;ReshelBP;McCouloghBP',
      '1;Jan;Nowak Jr;;41;90;;Up to 100 kg;RAW;100;105;;;105;' +
        formatDecimal(reshelM, 4) +
        ';' +
        formatDecimal(
          reshelM * mcCulloughCoefficient(Schema.decodeSync(CalendarDate)('1985-01-01'), date),
          4,
        ),
    ]
    // Jan (41) is outside the Senior class 24-39 in this fixture, so he forms an unassigned block.
    expect(csv.split('\n')[0]).toBe(lines[0])
    expect(csv.split('\n').slice(1, 6)).toEqual(lines.slice(1, 6))
    const rest = csv.split('\n').slice(6)
    // Zero Lifter has no good lift: listed after the ranked entries of his block, failed attempt negative.
    expect(rest[0]).toBe('MEN - Senior (24-39) RAW' + ';'.repeat(15))
    expect(rest[2]).toBe('1;Zero;Lifter;;38;95;Senior (24-39);Up to 100 kg;RAW;-80;;;;0;0;0')
    expect(rest[4]).toBe('MEN - Unassigned RAW' + ';'.repeat(15))
    expect(rest[6]).toMatch(/^1;Jan;Nowak Jr;;41;90;;Up to 100 kg;RAW;100;105;;;105;/)
  })

  it('ww-52g7: values with a semicolon or a quote are quoted, trailing zeros are dropped', () => {
    expect(formatDecimal(370, 2)).toBe('370')
    expect(formatDecimal(58.5, 2)).toBe('58.5')
    expect(formatDecimal(219.60000000000002, 2)).toBe('219.6')
    expect(formatDecimal(145.68, 4)).toBe('145.68')
    expect(formatDecimal(Number.NaN, 2)).toBe('')
  })
})

describe('result tables', () => {
  it('ww-sbfk ww-6hvn: individual and team tables hold the ranked rows and the counted lifters', () => {
    const individual = individualTable(state, bench, 'pl', labels)
    expect(individual.columns.slice(0, 2)).toEqual(['Miejsce', 'Zawodnik'])
    expect(individual.rows.map((row) => row.slice(0, 2))).toEqual([
      ['1', 'Jan Nowak Jr'],
      ['2', 'Anna Kowalska'],
    ])
    const team = teamRankings(state)[0]
    if (!team) throw new Error('no team ranking')
    expect(teamTable(state, team, 'pl', labels).columns).toEqual([
      'Miejsce',
      'Drużyna',
      'Liczeni',
      'Punkty',
    ])
  })
})
