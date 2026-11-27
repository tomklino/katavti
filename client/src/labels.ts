// A label occupies a whole line: an alphanumeric/underscore key followed by
// exactly one space and one non-whitespace value. Preserve spelling for display.
export function parseLabels(content: string): Array<[string, string]> {
  return content.split('\n').flatMap(line => {
    const match = /^([a-z0-9][a-z0-9_]*): (\S+)\r?$/i.exec(line)
    return match ? [[match[1], match[2]]] : []
  })
}

export function matchesLabel(content: string, label: string): boolean {
  const requested = parseLabels(label)
  if (requested.length !== 1) return false
  const [key, value] = requested[0].map(part => part.toLowerCase())
  return parseLabels(content).some(([k, v]) => k.toLowerCase() === key && v.toLowerCase() === value)
}
