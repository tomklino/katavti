<template>
  <main>
    <p v-if="$store.state.loading" class="view-message" role="status">Opening your notebook…</p>
    <p v-if="$store.state.error" class="error" role="alert">{{ $store.state.error }}</p>
    <section v-if="$store.state.noteIds.length" ref="notes" class="notes browsing-notes" aria-label="Notes">
      <NoteCard
        v-for="(id, index) in $store.state.noteIds"
        :id="id"
        :key="id"
        :index="index"
        active
        browsing
        @pinned="announcePin"
      />
    </section>
    <p v-if="pinMessage" class="view-message" role="status">{{ pinMessage }} <router-link to="/daily">Open Daily</router-link></p>
    <section v-if="!$store.state.loading && !$store.state.error && !$store.state.noteIds.length" class="empty-state"><span aria-hidden="true">▤</span><p class="eyebrow">A LITTLE SPACE TO BEGIN</p><h2>{{ $store.state.bug ? 'No thoughts with that label.' : 'Your notebook starts here.' }}</h2><p>{{ $store.state.bug ? 'Try another exact label, or look back through your recent notes.' : 'An idea, a list, a few words about your day. Your first note can be anything.' }}</p><router-link to="/daily">Open today’s workspace <span aria-hidden="true">↗</span></router-link></section>
  </main>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import NoteCard from '@/components/NoteCard.vue'
import { getViewState } from '@/view-state'
import type { NotePin } from '@/api/notes'

export default defineComponent({
  components: { NoteCard },
  data: () => ({ pinMessage: '' }),
  methods: {
    announcePin(period: NotePin['period']) { this.pinMessage = `Pinned for the rest of this ${period}.` },
  },
  async mounted() {
    const { scrollTop } = getViewState(this.$store).home
    const notes = this.$refs.notes as HTMLElement | undefined
    if (notes) notes.scrollTop = scrollTop
    const initialScroll = notes?.scrollTop
    await this.$store.dispatch('loadNotes').catch(() => undefined)
    await this.$nextTick()
    const refreshed = this.$refs.notes as HTMLElement | undefined
    // If the cached feed couldn't restore the full offset, retry on the loaded
    // feed, but don't override a scroll the reader made while it was loading.
    if (refreshed && (refreshed !== notes || refreshed.scrollTop === initialScroll)) {
      refreshed.scrollTop = scrollTop
    }
  },
  beforeUnmount() {
    const notes = this.$refs.notes as HTMLElement | undefined
    getViewState(this.$store).home.scrollTop = notes?.scrollTop ?? 0
  },
})
</script>
<style scoped>
main { display: flex; flex-direction: column; }
.notes { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; padding: 0 4px 2px 0; scrollbar-gutter: stable; }
.error { color: #b91c1c; }
</style>
