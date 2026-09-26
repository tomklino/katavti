import { describe, expect, it } from 'vitest'
import { markdown } from '@/markdown'

describe('Markdown fenced-code highlighting', () => {
  it('highlights JavaScript using the js fence alias', () => {
    const html = markdown.render('```js\nfunction something() {\n  return true\n}\n```')
    expect(html).toContain('class="language-js"')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('hljs-title')
    expect(html).toContain('something')
  })

  it('supports other registered languages', () => {
    const html = markdown.render('```yaml\nname: Katavti\nenabled: true\n```')
    expect(html).toContain('class="language-yaml"')
    expect(html).toContain('hljs-attr')
  })

  it('safely escapes unknown languages without attempting highlighting', () => {
    const html = markdown.render('```unknown\n<script>alert(1)</script>\n```')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('hljs-keyword')
  })
})
