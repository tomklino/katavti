// Keep the browser and server label grammar in sync.
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
