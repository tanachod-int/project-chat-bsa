import { describe, expect, it } from 'vitest'

import { parseSseTextDeltaChunk } from '@/lib/sse-parser'

describe('parseSseTextDeltaChunk', () => {
  it('buffers fragmented text-delta events across chunks', () => {
    const first = parseSseTextDeltaChunk(
      '',
      'data: {"type":"text-delta","delta":"hel'
    )

    expect(first.deltas).toEqual([])
    expect(first.done).toBe(false)
    expect(first.buffer).toContain('hel')

    const second = parseSseTextDeltaChunk(first.buffer, 'lo"}\n')

    expect(second.deltas).toEqual(['hello'])
    expect(second.buffer).toBe('')
  })

  it('detects done events split from previous data events', () => {
    const parsed = parseSseTextDeltaChunk(
      '',
      'data: {"type":"text-delta","delta":"ok"}\n' +
      'data: [DONE]\n'
    )

    expect(parsed.deltas).toEqual(['ok'])
    expect(parsed.done).toBe(true)
    expect(parsed.buffer).toBe('')
  })
})
