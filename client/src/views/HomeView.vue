<template>
  <main>
    <p v-if="$store.state.loading">Loading…</p>
    <p v-if="$store.state.error" class="error">{{ $store.state.error }}</p>
    <section v-if="$store.state.noteIds.length" class="notes" aria-label="Notes">
      <NoteCard
        v-for="(id, index) in $store.state.noteIds"
        :id="id"
        :key="id"
        :active="index === active"
        @activate="active = index"
      />
    </section>
    <p v-if="!$store.state.loading && !$store.state.noteIds.length">No notes found.</p>
  </main>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import NoteCard from '@/components/NoteCard.vue'
export default defineComponent({
  components: { NoteCard },
  data: () => ({ active: 0 }),
  created() { this.$store.dispatch('loadNotes') },
  watch: {
    '$store.state.noteIds'() { this.active = 0 },
  },
})
</script>
<style scoped>
main { display: flex; flex-direction: column; }
.notes { display: flex; flex: 1; flex-direction: column; gap: .5rem; min-height: 0; }
.error { color: #b91c1c; }
</style>
