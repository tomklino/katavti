<template>
  <div ref="host" class="days-filter" :class="{ 'is-active': active, 'is-open': open }" @keydown.esc.stop.prevent="close(true)">
    <button ref="trigger" type="button" class="lookback-trigger" aria-label="Look back period" aria-haspopup="menu" :aria-expanded="open" :aria-controls="menuId" aria-describedby="filter-status" @click="toggle" @keydown.down.prevent="show()" @keydown.up.prevent="show(true)">
      <span class="filter-dot" aria-hidden="true" />
      <span>{{ active ? selectedLabel : 'Look back' }}</span>
      <svg class="lookback-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div v-if="open" :id="menuId" class="lookback-menu" role="menu" aria-label="Look back period" @keydown="navigate">
      <p class="lookback-caption" role="presentation">Show recent notes</p>
      <button v-for="(option, index) in options" :key="option.days" type="button" class="lookback-option" role="menuitemradio" :aria-checked="active && modelValue === option.days" :tabindex="focused === index ? 0 : -1" @focus="focused = index" @click="select(option.days)">
        <span>{{ option.label }}</span>
        <svg v-if="active && modelValue === option.days" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, useId } from 'vue'

export default defineComponent({
  props: { modelValue: { type: Number, required: true }, active: Boolean },
  emits: ['update:modelValue'],
  setup() { return { menuId: `lookback-${useId()}` } },
  data: () => ({ open: false, focused: 0, options: [{ days: 5, label: '5 days' }, { days: 28, label: '4 weeks' }, { days: 90, label: '3 months' }, { days: 365, label: '1 year' }] }),
  computed: { selectedLabel(): string { return this.options.find(option => option.days === this.modelValue)?.label || 'Look back' } },
  mounted() { document.addEventListener('pointerdown', this.outside); document.addEventListener('focusin', this.outside) },
  beforeUnmount() { document.removeEventListener('pointerdown', this.outside); document.removeEventListener('focusin', this.outside) },
  methods: {
    toggle() { if (this.open) this.close(); else this.show() },
    show(last = false) {
      this.open = true
      this.focused = last ? this.options.length - 1 : Math.max(0, this.options.findIndex(option => option.days === this.modelValue))
      this.focusOption()
    },
    close(restoreFocus = false) { this.open = false; if (restoreFocus) (this.$refs.trigger as HTMLButtonElement).focus() },
    outside(event: Event) { if (!(this.$refs.host as HTMLElement).contains(event.target as Node)) this.close() },
    focusOption() { this.$nextTick(() => this.$el.querySelectorAll('.lookback-option')[this.focused]?.focus()) },
    select(days: number) { this.$emit('update:modelValue', days); this.close(true) },
    navigate(event: KeyboardEvent) {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Home') this.focused = 0
      else if (event.key === 'End') this.focused = this.options.length - 1
      else this.focused = (this.focused + (event.key === 'ArrowDown' ? 1 : -1) + this.options.length) % this.options.length
      this.focusOption()
    },
  },
})
</script>
