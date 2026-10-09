<template>
  <article class="note" :class="{ active, browsing }" @click="$emit('activate')">
    <header :tabindex="active ? -1 : 0" :role="active ? undefined : 'button'" :aria-expanded="active" @keydown.enter.self.prevent="$emit('activate')" @keydown.space.self.prevent="$emit('activate')">
      <span class="note-number" aria-hidden="true">{{ (index + 1).toString().padStart(2, '0') }}</span>
      <div class="note-heading"><strong>{{ title }}</strong><time v-if="active">{{ formattedDate }}<span> / {{ editable ? 'Daily note' : 'From your notebook' }}</span></time></div>
      <span v-if="label" class="note-label">{{ label }}</span>
      <div v-if="active" class="actions">
        <label class="raw-toggle"><input v-model="raw" type="checkbox"><span>{{ raw ? 'Raw' : 'Preview' }}</span></label>
        <button type="button" @click.stop="copy"><span aria-hidden="true">▢</span> {{ copyLabel }}</button>
      </div>
      <span v-else class="note-chevron" aria-hidden="true">↗</span>
    </header>
    <p v-if="active && saveError" class="save-error" role="alert">{{ saveError }} Copy your draft before <button type="button" :disabled="reloading" @click.stop="reload">reloading the latest version</button>.</p>
    <div class="note-body" :aria-hidden="!active">
      <MarkdownEditor v-if="raw" ref="editor" :class="{ unsaved }" :model-value="note.content" :readonly="!editable" :aria-label="`Edit ${title}`" @update:model-value="edit" />
      <div v-else class="rendered" v-html="rendered" />
    </div>
    <footer v-if="active" class="note-footer"><span>{{ wordCount }} words <span class="footer-separator">/</span> Markdown</span><span class="save-state" :class="{ pending: unsaved }" role="status"><span />{{ saveError ? 'Not saved' : unsaved ? 'Saving changes…' : editable ? 'All changes saved' : 'Read-only · open Daily to write' }}</span></footer>
  </article>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { markdown } from '@/markdown'

export default defineComponent({
  components: { MarkdownEditor },
  props: { id: { type: String, required: true }, index: { type: Number, default: 0 }, editable: Boolean, active: { type: Boolean, default: true }, startRaw: Boolean, browsing: Boolean },
  emits: ['activate'],
  data() { return { raw: this.startRaw, copyLabel: 'Copy', timer: 0, reloading: false, pendingContent: null as string | null } },
  computed: {
    note(): any { return this.$store.state.notes[this.id] || { content: '', ISODateString: new Date().toISOString() } },
    title(): string { return this.note.content.split('\n').find((line: string) => line.trim())?.replace(/^#+\s*/, '') || 'Untitled note' },
    formattedDate(): string { return new Date(this.note.ISODateString).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) },
    label(): string { return this.note.content.match(/^Label:\s*(.+)$/m)?.[1] || this.note.content.match(/^Bug:\s*(.+)$/m)?.[1] || '' },
    wordCount(): number { return this.note.content.trim() ? this.note.content.trim().split(/\s+/).length : 0 },
    rendered(): string { return markdown.render(this.note.content) },
    unsaved(): boolean { return Boolean(this.$store.state.unsavedNotes[this.id]) },
    saveError(): string | null { return this.$store.state.saveErrors[this.id] || null },
  },
  watch: {
    active(value: boolean) { if (value) this.focusEditor() },
    raw(value: boolean) { if (value && this.active) this.focusEditor() },
  },
  mounted() { window.addEventListener('pagehide', this.flushPendingEdit) },
  beforeUnmount() {
    window.removeEventListener('pagehide', this.flushPendingEdit)
    this.flushPendingEdit()
  },
  methods: {
    focusEditor() { this.$nextTick(() => (this.$refs.editor as any)?.focus()) },
    edit(content: string) {
      this.$store.commit('setNoteContent', { id: this.id, content })
      this.$store.commit('setNoteUnsaved', { id: this.id, value: true })
      this.pendingContent = content
      clearTimeout(this.timer)
      this.timer = window.setTimeout(this.flushPendingEdit, 2000)
    },
    flushPendingEdit() {
      if (this.pendingContent === null) return
      clearTimeout(this.timer)
      const content = this.pendingContent
      this.pendingContent = null
      this.$store.dispatch('saveNote', { id: this.id, content }).catch(() => undefined)
    },
    async reload() {
      if (this.reloading) return
      this.reloading = true
      clearTimeout(this.timer)
      this.pendingContent = null
      try { await this.$store.dispatch('reloadNote', this.id) }
      catch { /* The store keeps the draft and displays the reload error. */ }
      finally { this.reloading = false }
    },
    async copy() {
      try { await navigator.clipboard.writeText(this.note.content); this.copyLabel = 'Copied!' }
      catch { this.copyLabel = 'Copy failed' }
      window.setTimeout(() => { this.copyLabel = 'Copy' }, 1500)
    },
  },
})
</script>

<style scoped>
.note {
  background: var(--collapsed); border: 1px solid var(--line); border-radius: var(--radius);
  box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; flex: 0 0 28px;
  min-height: 28px; overflow: hidden;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.note:hover { border-color: var(--muted); }
.note.active { background: var(--surface); border-color: var(--active-line); box-shadow: var(--note-shadow); cursor: default; flex: 1 1 0; min-height: 0; }
.note.browsing { flex: 0 0 auto; min-height: 0; overflow: visible; }
header { align-items: center; display: flex; flex-shrink: 0; gap: 12px; min-height: 26px; padding: 0 14px; }
.note.active header { border-bottom: 1px solid var(--line); min-height: 48px; }
.note-heading { flex: 1; min-width: 0; }
strong { display: block; font-size: 13px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note.active strong { font-size: 13px; }
.note-number { color: var(--muted); font: 10px/1.5 ui-monospace, monospace; }
.note.active .note-number { color: var(--accent); }
time { color: var(--muted); display: block; font-size: 10px; margin-top: 5px; }
time span { opacity: .8; }
.note-label { background: var(--tag-bg); border-radius: 4px; color: var(--tag-text); font-size: 10px; padding: 3px 8px; }
.note-chevron { color: var(--muted); font-size: 15px; margin-left: 8px; }
.actions { align-items: center; display: flex; gap: 12px; white-space: nowrap; }
.actions button { align-items: center; background: var(--surface); border-color: var(--line); display: flex; font-size: 11px; gap: 5px; padding: 7px 10px; }
.raw-toggle { align-items: center; color: var(--muted); cursor: pointer; display: flex; font-size: 11px; gap: 6px; }
.raw-toggle input { accent-color: var(--accent); height: 12px; margin: 0; width: 12px; }
.note-body { display: none; min-height: 0; overflow: auto; }
.note.active .note-body { display: block; flex: 1; }
.note.browsing .note-body { flex: 0 0 auto; overflow: visible; }
.markdown-editor { border: 2px solid transparent; box-sizing: border-box; }
.markdown-editor.unsaved { border-style: dashed; border-color: #d97706; }
.rendered { box-sizing: border-box; font-family: var(--reading-font); font-size: 14px; line-height: 1.65; margin: 0; max-width: 900px; padding: 0 20px 16px; text-align: left; }
.note-footer { align-items: center; border-top: 1px solid var(--line); color: var(--muted); display: flex; flex-shrink: 0; font-size: 9px; justify-content: space-between; padding: 6px 14px; }
.footer-separator { margin: 0 7px; opacity: .6; }
.save-error { background: #fee2e2; color: #991b1b; flex-shrink: 0; font-size: 12px; margin: 0; padding: 8px 14px; }
.save-error button { background: none; border: 0; color: inherit; cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
.save-error button:disabled { cursor: wait; opacity: .6; }
.save-state { align-items: center; display: flex; gap: 5px; }
.save-state > span { background: var(--accent); border-radius: 50%; height: 4px; width: 4px; }
.save-state.pending > span { background: #d97706; }
@media (max-width: 600px) {
  header { gap: 8px; padding: 0 10px; }
  .note.active header { min-height: 48px; }
  .note.active .note-label, time span { display: none; }
  .actions { gap: 6px; }.actions button { font-size: 10px; padding: 5px 7px; }
  .raw-toggle { font-size: 10px; }.rendered { padding: 0 12px 12px; }
  .note-footer { font-size: 8px; padding: 6px 10px; }
}
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
