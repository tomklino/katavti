<template>
  <div class="theme-toggle" role="group" aria-label="Color theme">
    <button v-for="option in options" :key="option.value" type="button" :aria-label="`${option.label} theme`" :title="`${option.label} theme`" :aria-pressed="modelValue === option.value" @click="$emit('update:modelValue', option.value)">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="option.value === 'light'"><circle cx="10" cy="10" r="3.2" /><path d="M10 2v1.5m0 13V18M2 10h1.5m13 0H18M4.3 4.3l1.1 1.1m9.2 9.2 1.1 1.1M4.3 15.7l1.1-1.1m9.2-9.2 1.1-1.1" /></template>
        <path v-else-if="option.value === 'dark'" d="M16.8 12.4A7 7 0 0 1 7.6 3.2a7 7 0 1 0 9.2 9.2Z" />
        <template v-else><rect x="2.5" y="3.5" width="15" height="10" rx="1.5" /><path d="M10 13.5v3m-3 0h6" /></template>
      </svg>
    </button>
  </div>
</template>
<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import type { Theme } from '@/theme'

export default defineComponent({
  props: { modelValue: { type: String as PropType<Theme>, required: true } },
  emits: ['update:modelValue'],
  data: () => ({ options: [{ value: 'light', label: 'Light' }, { value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }] }),
})
</script>
