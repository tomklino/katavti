<template>
  <aside class="message-bar" :class="variant" role="status">
    <span><slot /></span>
    <button type="button" aria-label="Dismiss message" @click="dismiss">×</button>
    <span class="countdown" aria-hidden="true" />
  </aside>
</template>
<script lang="ts">
import { defineComponent, type PropType } from 'vue'

export default defineComponent({
  props: { variant: { type: String as PropType<'warning' | 'success' | 'error'>, default: 'success' } },
  emits: ['dismiss'],
  data: () => ({ timer: 0 }),
  mounted() { this.timer = window.setTimeout(this.dismiss, 30_000) },
  beforeUnmount() { window.clearTimeout(this.timer) },
  methods: { dismiss() { window.clearTimeout(this.timer); this.$emit('dismiss') } },
})
</script>
<style scoped>
.message-bar { align-items: center; display: flex; justify-content: center; overflow: hidden; padding: .65rem 3rem .65rem 1rem; position: relative; }
.message-bar.warning { background: #fef3c7; color: #854d0e; }
.message-bar.success { background: #d1fae5; color: #065f46; }
.message-bar.error { background: #fee2e2; color: #991b1b; }
button { background: transparent; border: 0; color: inherit; cursor: pointer; font-size: 1.25rem; padding: 0 .5rem; position: absolute; right: 1rem; }
.countdown { animation: dismiss-countdown 30s linear forwards; background: currentColor; bottom: 0; height: 3px; left: 0; opacity: .45; position: absolute; transform-origin: left; width: 100%; }
@keyframes dismiss-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .countdown { animation-timing-function: steps(30, end); } }
</style>
