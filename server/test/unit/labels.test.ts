import { describe, expect, it } from 'vitest'
import { matchesLabel, parseLabels } from '../../src/data-modules/labels.js'
import { matchesLabel as browserMatchesLabel, parseLabels as browserParseLabels } from '../../../client/src/labels.js'

describe('labels', () => {
  const content = [
    'tag: issue', 'something else: base', '#Title: something',
    'Number: 123', '2p: Tom', 'tag : wrong', ' tag: wrong',
    'tag:  wrong', 'tag: two words', 'tag: issue extra', 'tag: issue\r',
  ].join('\n')
  it('extracts only complete valid lines, including CRLF and numeric keys and values', () => {
    expect(parseLabels(content)).toEqual([['tag', 'issue'], ['Number', '123'], ['2p', 'Tom'], ['tag', 'issue']])
  })
  it('keeps the browser and server implementations identical on the fixture', () => {
    expect(browserParseLabels(content)).toEqual(parseLabels(content))
    for (const label of ['TAG: ISSUE', '2P: tom', 'Number: 12', 'other: issue', 'something else: base']) {
      expect(browserMatchesLabel(content, label)).toBe(matchesLabel(content, label))
    }
  })
  it('matches the entire key/value pair without case sensitivity', () => {
    expect(matchesLabel(content, 'TAG: ISSUE')).toBe(true)
    expect(matchesLabel(content, '2P: tom')).toBe(true)
    expect(matchesLabel(content, 'Number: 12')).toBe(false)
    expect(matchesLabel(content, 'other: issue')).toBe(false)
    expect(matchesLabel(content, 'something else: base')).toBe(false)
  })
})
