<template>
  <main>
    <p v-if="$store.state.loading" class="view-message" role="status">Opening your notebook…</p>
    <p v-if="$store.state.error" class="error" role="alert">{{ $store.state.error }}</p>
    <section v-if="$store.state.noteIds.length" class="notes browsing-notes" aria-label="Notes">
      <NoteCard
        v-for="(id, index) in $store.state.noteIds"
        :id="id"
        :key="id"
        :index="index"
        active
        browsing
      />
    </section>
    <section v-if="!$store.state.loading && !$store.state.error && !$store.state.noteIds.length" class="empty-state"><span aria-hidden="true">▤</span><p class="eyebrow">A LITTLE SPACE TO BEGIN</p><h2>{{ $store.state.bug ? 'No thoughts with that label.' : 'Your notebook starts here.' }}</h2><p>{{ $store.state.bug ? 'Try another exact label, or look back through your recent notes.' : 'An idea, a list, a few words about your day. Your first note can be anything.' }}</p><router-link to="/daily">Open today’s workspace <span aria-hidden="true">↗</span></router-link></section>
  </main>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import NoteCard from '@/components/NoteCard.vue'
export default defineComponent({
  components: { NoteCard },
  created() { this.$store.dispatch('loadNotes').catch(() => undefined) },
})
</script>
<style scoped>
main { display: flex; flex-direction: column; }
.notes { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; padding: 0 4px 2px 0; scrollbar-gutter: stable; }
.error { color: #b91c1c; }
</style>
