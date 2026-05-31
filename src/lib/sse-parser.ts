export interface TextDeltaParseResult {
  buffer: string
  deltas: string[]
  done: boolean
  parseErrors: number
}

export function parseSseTextDeltaChunk(
  previousBuffer: string,
  chunk: string,
  flush = false
): TextDeltaParseResult {
  const combined = previousBuffer + chunk
  const lines = combined.split(/\r?\n/)
  const completeLines = flush ? lines : lines.slice(0, -1)
  const nextBuffer = flush ? '' : lines[lines.length - 1] ?? ''
  const deltas: string[] = []
  let done = false
  let parseErrors = 0

  for (const rawLine of completeLines) {
    const line = rawLine.trimEnd()
    if (!line.startsWith('data: ')) continue

    const data = line.slice(6)
    if (data === '[DONE]') {
      done = true
      continue
    }

    try {
      const parsed = JSON.parse(data)
      if (parsed?.type === 'text-delta' && typeof parsed.delta === 'string') {
        deltas.push(parsed.delta)
      }
    } catch {
      parseErrors += 1
    }
  }

  return {
    buffer: done ? '' : nextBuffer,
    deltas,
    done,
    parseErrors,
  }
}
