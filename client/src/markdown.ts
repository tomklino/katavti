import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLanguage from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' })
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdownLanguage)
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerLanguage('python', python)
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerLanguage('typescript', typescript)
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerLanguage('xml', xml)
hljs.registerAliases(['html', 'vue'], { languageName: 'xml' })
hljs.registerLanguage('yaml', yaml)
hljs.registerAliases(['yml'], { languageName: 'yaml' })

export const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    const normalized = language.trim().toLowerCase()
    if (!normalized || !hljs.getLanguage(normalized)) return ''
    return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value
  },
}).use(taskLists, { enabled: false, label: true })
