<template>
  <main>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <section ref="notes" class="notes" aria-label="Daily notes">
      <NoteCard
        v-for="(id, index) in visibleDailyIds"
        :id="id"
        :key="id"
        :index="pageStart + index"
        editable
        start-raw
        :active="pageStart + index === active"
        @activate="activate(pageStart + index)"
      />
    </section>
    <div class="daily-controls">
      <nav v-if="$store.state.dailyIds.length > maxVisible" class="note-pages" aria-label="Daily note pages">
        <button :disabled="pageStart === 0" aria-label="Previous daily notes" @click="activate(pageStart - 1)">←</button>
        <span>{{ pageStart + 1 }}–{{ pageStart + visibleDailyIds.length }} / {{ $store.state.dailyIds.length }}</span>
        <button :disabled="pageStart + maxVisible >= $store.state.dailyIds.length" aria-label="Next daily notes" @click="activate(pageStart + maxVisible)">→</button>
      </nav>
      <button class="add" aria-label="Add note" :disabled="adding" @click="add"><span aria-hidden="true">+</span> {{ adding ? 'Opening…' : 'New note' }}</button>
    </div>
  </main>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import NoteCard from '@/components/NoteCard.vue'
export default defineComponent({
  components: { NoteCard },
  data: () => ({ active: 0, adding: false, error: '', maxVisible: 10000, resizeObserver: null as ResizeObserver | null }),
  computed: {
    pageStart(): number { return Math.floor(this.active / this.maxVisible) * this.maxVisible },
    visibleDailyIds(): string[] { return this.$store.state.dailyIds.slice(this.pageStart, this.pageStart + this.maxVisible) },
  },
  watch: { '$store.state.dailyDate'() { this.active = 0 } },
  created() { this.loadDaily() },
  mounted() {
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) this.maxVisible = Math.max(1, Math.floor((entry.contentRect.height - 240) / 34) + 1)
    })
    this.resizeObserver.observe(this.$refs.notes as HTMLElement)
  },
  beforeUnmount() { this.resizeObserver?.disconnect() },
  methods: {
    async loadDaily() {
      try {
        await this.$store.dispatch('loadDaily', 4)
        this.active = Math.min(this.active, Math.max(0, this.$store.state.dailyIds.length - 1))
      } catch { this.error = 'Unable to open your daily notes. Please try again.' }
    },
    activate(index: number) { this.active = index },
    async add() {
      if (this.adding) return
      this.adding = true
      this.error = ''
      try {
        const nextIndex = this.$store.state.dailyIds.length
        await this.$store.dispatch('loadDaily', nextIndex + 1)
        this.active = Math.min(nextIndex, this.$store.state.dailyIds.length - 1)
      } catch { this.error = 'Unable to add a note. Your existing notes are safe.' }
      finally { this.adding = false }
    },
  },
})
</script>
<style scoped>
main { display: flex; flex-direction: column; }
.notes { display: flex; flex: 1; flex-direction: column; gap: 6px; min-height: 0; overflow: hidden; }
.daily-controls { align-items: center; display: flex; flex-shrink: 0; gap: 10px; min-height: 32px; padding-top: 6px; }
.note-pages { align-items: center; color: var(--muted); display: flex; font-size: 10px; gap: 8px; }
.note-pages button { padding: 3px 8px; }
.add { align-items: center; background: transparent; border: 1px solid var(--line); border-radius: var(--radius); color: var(--muted); display: flex; font-size: 11px; gap: 6px; margin-left: auto; padding: 4px 10px; }
.add span { color: var(--accent); font-size: 16px; line-height: 1; }
.error { color: #b91c1c; }
</style>
