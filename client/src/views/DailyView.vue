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
        @pinned="announcePin"
        @unpinned="pinMessage = 'Note unpinned.'"
      />
    </section>
    <section v-if="pinnedNotes.length" class="pinned-notes" aria-label="Pinned notes">
      <h2>Pinned notes</h2>
      <NoteCard
        v-for="({ id, label }, index) in pinnedNotes"
        :id="id"
        :key="id"
        :index="index"
        :pin-label="label"
        editable
        start-raw
        :active="activePin === id"
        @activate="activePin = id"
        @pinned="announcePin"
        @unpinned="pinMessage = 'Note unpinned.'"
      />
    </section>
    <div class="daily-controls">
      <span v-if="pinMessage" class="pin-message" role="status">{{ pinMessage }}</span>
      <nav v-if="dailyIds.length > maxVisible" class="note-pages" aria-label="Daily note pages">
        <button :disabled="pageStart === 0" aria-label="Previous daily notes" @click="activate(pageStart - 1)">←</button>
        <span>{{ pageStart + 1 }}–{{ pageStart + visibleDailyIds.length }} / {{ dailyIds.length }}</span>
        <button :disabled="pageStart + maxVisible >= dailyIds.length" aria-label="Next daily notes" @click="activate(pageStart + maxVisible)">→</button>
      </nav>
      <button class="add" aria-label="Add note" :disabled="adding" @click="add"><span aria-hidden="true">+</span> {{ adding ? 'Opening…' : 'New note' }}</button>
    </div>
  </main>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import NoteCard from '@/components/NoteCard.vue'
import { getViewState } from '@/view-state'
import type { NotePin } from '@/api/notes'

export default defineComponent({
  components: { NoteCard },
  data() {
    const daily = getViewState(this.$store).daily
    const { dailyDate, dailyIds, pins } = this.$store.state
    const pinnedIds = new Set(pins.map((pin: NotePin) => pin.id))
    const active = daily.date === dailyDate && daily.activeId ? dailyIds.filter((id: string) => !pinnedIds.has(id)).indexOf(daily.activeId) : -1
    return { active: Math.max(0, active), activePin: '', pinMessage: '', adding: false, error: '', maxVisible: 10000, resizeObserver: null as ResizeObserver | null }
  },
  computed: {
    dailyIds(): string[] {
      const pinnedIds = new Set(this.$store.state.pins.map((pin: NotePin) => pin.id))
      return this.$store.state.dailyIds.filter((id: string) => !pinnedIds.has(id))
    },
    pageStart(): number { return Math.floor(this.active / this.maxVisible) * this.maxVisible },
    visibleDailyIds(): string[] { return this.dailyIds.slice(this.pageStart, this.pageStart + this.maxVisible) },
    pinnedNotes(): { id: string; label: string }[] {
      return this.$store.state.pins.map(({ id, period }: NotePin) => ({ id, label: period[0].toUpperCase() + period.slice(1) }))
    },
  },
  watch: {
    '$store.state.dailyDate': 'resetForDay',
    '$store.state.pins'(pins: NotePin[], previous: NotePin[]) {
      const changed = pins.find(pin => !previous.some(old => old.id === pin.id && old.period === pin.period))
      if (changed) this.announcePin(changed.period)
      else if (previous.some(old => !pins.some(pin => pin.id === old.id))) this.pinMessage = 'Note unpinned.'
    },
    dailyIds(ids: string[], previous: string[]) {
      const activeId = previous[this.active]
      const restoredPin = this.activePin && ids.includes(this.activePin) ? this.activePin : ''
      if (restoredPin) {
        this.active = ids.indexOf(restoredPin)
        this.activePin = ''
      } else {
        const index = ids.indexOf(activeId)
        this.active = index < 0 ? Math.min(this.active, Math.max(0, ids.length - 1)) : index
        if (activeId && !ids.includes(activeId) && this.$store.state.pins.some((pin: NotePin) => pin.id === activeId)) this.activePin = activeId
      }
    },
  },
  created() { this.resetForDay(); this.loadDaily() },
  mounted() {
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) this.maxVisible = Math.max(1, Math.floor((entry.contentRect.height - 240) / 34) + 1)
    })
    this.resizeObserver.observe(this.$refs.notes as HTMLElement)
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect()
    getViewState(this.$store).daily.activeId = this.dailyIds[this.active]
  },
  methods: {
    resetForDay() {
      const daily = getViewState(this.$store).daily
      if (daily.date === this.$store.state.dailyDate) return
      daily.date = this.$store.state.dailyDate
      daily.activeId = undefined
      daily.notes = new Map()
      this.active = 0
      this.activePin = ''; this.pinMessage = ''
    },
    announcePin(period: NotePin['period']) { this.pinMessage = `Pinned for the rest of this ${period}.` },
    async loadDaily() {
      try {
        await this.$store.dispatch('loadDaily', 4)
        this.active = Math.min(this.active, Math.max(0, this.dailyIds.length - 1))
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
        const newId = this.$store.state.dailyIds[nextIndex]
        this.active = Math.max(0, this.dailyIds.indexOf(newId))
      } catch { this.error = 'Unable to add a note. Your existing notes are safe.' }
      finally { this.adding = false }
    },
  },
})
</script>
<style scoped>
main { display: flex; flex-direction: column; }
.notes { display: flex; flex: 1; flex-direction: column; gap: 6px; min-height: 0; overflow: hidden; }
.pinned-notes { display: flex; flex: 0 0 auto; flex-direction: column; gap: 4px; max-height: 38%; overflow-y: auto; margin-top: 8px; }
.pinned-notes h2 { color: var(--muted); font-size: 11px; font-weight: 600; margin: 0 0 2px; }
.pinned-notes :deep(.note.active) { flex: 0 0 auto; min-height: 120px; max-height: 200px; }
.pin-message { color: var(--muted); font-size: 11px; }
.daily-controls { align-items: center; display: flex; flex-shrink: 0; gap: 10px; min-height: 32px; padding-top: 6px; }
.note-pages { align-items: center; color: var(--muted); display: flex; font-size: 10px; gap: 8px; }
.note-pages button { padding: 3px 8px; }
.add { align-items: center; background: transparent; border: 1px solid var(--line); border-radius: var(--radius); color: var(--muted); display: flex; font-size: 11px; gap: 6px; margin-left: auto; padding: 4px 10px; }
.add span { color: var(--accent); font-size: 16px; line-height: 1; }
.error { color: #b91c1c; }
</style>
