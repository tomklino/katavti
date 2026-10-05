<template><div ref="host" class="markdown-editor" /></template>
<script lang="ts">
import { defineComponent } from 'vue'
import { markdown } from '@codemirror/lang-markdown'
import { Annotation, Compartment, EditorState } from '@codemirror/state'

const readonlyCompartment = new Compartment()
const externalUpdate = Annotation.define<boolean>()
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export default defineComponent({
  props: { modelValue: { type: String, required: true }, readonly: Boolean },
  emits: ['update:modelValue'],
  data: () => ({ view: undefined as EditorView | undefined }),
  mounted() {
    this.view = new EditorView({
      parent: this.$refs.host as HTMLElement,
      state: EditorState.create({
        doc: this.modelValue,
        extensions: [
          markdown(), history(), keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(HighlightStyle.define([
            { tag: tags.heading, color: '#0369a1', fontWeight: '700' },
            { tag: [tags.link, tags.url], color: '#2563eb', textDecoration: 'underline' },
            { tag: tags.emphasis, color: '#7c3aed', fontStyle: 'italic' },
            { tag: tags.strong, color: '#7c2d12', fontWeight: '700' },
            { tag: tags.monospace, color: '#9f1239', backgroundColor: '#cbd5e1' },
            { tag: tags.meta, color: '#64748b' },
            { tag: tags.list, color: '#047857', fontWeight: '600' },
          ])),
          readonlyCompartment.of(EditorState.readOnly.of(this.readonly)),
          EditorView.lineWrapping,
          EditorView.updateListener.of(update => {
            const external = update.transactions.some(transaction => transaction.annotation(externalUpdate))
            if (update.docChanged && !external) this.$emit('update:modelValue', update.state.doc.toString())
          }),
        ],
      }),
    })
  },
  beforeUnmount() { this.view?.destroy() },
  methods: { focus() { this.view?.focus() } },
  watch: {
    modelValue(value: string) {
      if (!this.view || value === this.view.state.doc.toString()) return
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: value },
        annotations: externalUpdate.of(true),
      })
    },
    readonly(value: boolean) {
      this.view?.dispatch({ effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(value)) })
    },
  },
})
</script>
<style>
.markdown-editor { background: #e2e8f0; height: 100%; min-height: 12rem; overflow: hidden; }
.markdown-editor .cm-editor { background: #e2e8f0; color: #1e293b; height: 100%; }
.markdown-editor .cm-scroller { font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow: auto; }
.markdown-editor .cm-content { caret-color: #0f766e; padding: 1rem; }
.markdown-editor .cm-focused { outline: 2px solid #94a3b8; outline-offset: -2px; }
.markdown-editor .cm-gutters { background: #d8e0e7; border-right: 1px solid #cbd5e1; color: #64748b; }
</style>
