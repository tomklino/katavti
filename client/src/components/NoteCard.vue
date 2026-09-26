<template>
  <article class="note" :class="{ active }" @click="$emit('activate')">
    <header>
      <time v-if="active">{{ formattedDate }}</time>
      <strong>{{ title }}</strong>
      <div v-if="active" class="actions">
        <label><input v-model="raw" type="checkbox"> Raw</label>
        <button @click.stop="copy">{{ copyLabel }}</button>
      </div>
    </header>
    <div class="note-body" :aria-hidden="!active">
      <MarkdownEditor v-if="raw" ref="editor" :model-value="note.content" :readonly="!editable" @update:model-value="edit" />
      <div v-else class="rendered" v-html="rendered" />
    </div>
  </article>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { markdown } from '@/markdown'

export default defineComponent({
  components: { MarkdownEditor },
  props: { id: { type: String, required: true }, editable: Boolean, active: { type: Boolean, default: true }, startRaw: Boolean },
  data() { return { raw: this.startRaw, copyLabel: 'Copy', timer: 0 } },
  computed: {
    note(): any { return this.$store.state.notes[this.id] || { content: '', ISODateString: new Date().toISOString() } },
    title(): string { return this.note.content.split('\n').find((line: string) => line.trim())?.replace(/^#+\s*/, '') || 'Untitled note' },
    formattedDate(): string { return new Date(this.note.ISODateString).toLocaleDateString() },
    rendered(): string { return markdown.render(this.note.content) },
  },
  watch: {
    active(value: boolean) { if (value) this.focusEditor() },
  },
  methods: {
    focusEditor() { this.$nextTick(() => (this.$refs.editor as any)?.focus()) },
    edit(content: string) {
      clearTimeout(this.timer)
      this.timer = window.setTimeout(() => this.$store.dispatch('saveNote', { id: this.id, content }), 500)
    },
    async copy() { await navigator.clipboard.writeText(this.note.content); this.copyLabel = 'Copied!'; window.setTimeout(() => { this.copyLabel = 'Copy' }, 1500) },
  },
})
</script>

<style scoped>
.note {
  background: #e8edf0; border-radius: 10px; box-shadow: 0 2px 8px #0002;
  box-sizing: border-box; cursor: pointer; flex: 0 0 3.25rem; max-height: 3.25rem;
  min-height: 3.25rem; overflow: hidden; padding: 1rem;
  transition: flex-grow 180ms ease, max-height 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
}
.note.active { background: white; cursor: default; flex: 1 1 auto; max-height: 100%; }
header { align-items: center; display: grid; gap: 1rem; grid-template-columns: auto 1fr auto; }
.note:not(.active) header { display: block; }
.note:not(.active) strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note.active header { border-bottom: 1px solid #ddd; padding-bottom: .5rem; }
time { color: #64748b; font-size: .85rem; }
.actions { white-space: nowrap; }
.note-body { height: calc(100% - 2.5rem); opacity: 0; overflow: auto; pointer-events: none; transition: opacity 120ms ease; visibility: hidden; }
.note.active .note-body { opacity: 1; pointer-events: auto; transition-delay: 80ms; visibility: visible; }
button { margin-left: .75rem; }
.rendered { line-height: 1.55; padding: .25rem .25rem 1rem; text-align: left; }
.rendered :deep(h1), .rendered :deep(h2), .rendered :deep(h3), .rendered :deep(h4), .rendered :deep(h5), .rendered :deep(h6) { line-height: 1.25; margin: 1em 0 .45em; }
.rendered :deep(ul), .rendered :deep(ol) { padding-left: 1.75rem; }
.rendered :deep(li) { margin: .25rem 0; }
.rendered :deep(.task-list-item) { list-style: none; }
.rendered :deep(input[type="checkbox"]) { margin: 0 .5rem 0 -1.4rem; }
.rendered :deep(blockquote) { border-left: 4px solid #cbd5e1; color: #475569; margin-left: 0; padding-left: 1rem; }
.rendered :deep(code) { background: #e2e8f0; border-radius: 4px; padding: .1rem .3rem; }
.rendered :deep(pre) { background: #e2e8f0; border-radius: 6px; overflow: auto; padding: 1rem; }
.rendered :deep(pre code) { background: transparent; padding: 0; }
.rendered :deep(.hljs-keyword), .rendered :deep(.hljs-selector-tag), .rendered :deep(.hljs-literal) { color: #7c3aed; font-weight: 600; }
.rendered :deep(.hljs-title), .rendered :deep(.hljs-title.function_) { color: #0369a1; }
.rendered :deep(.hljs-string), .rendered :deep(.hljs-attr) { color: #047857; }
.rendered :deep(.hljs-number), .rendered :deep(.hljs-symbol) { color: #b45309; }
.rendered :deep(.hljs-comment), .rendered :deep(.hljs-quote) { color: #64748b; font-style: italic; }
.rendered :deep(.hljs-variable), .rendered :deep(.hljs-params) { color: #9f1239; }
.rendered :deep(.hljs-built_in), .rendered :deep(.hljs-type) { color: #0f766e; }
.rendered :deep(a) { color: #2563eb; text-decoration: underline; }
</style>
