<template>
  <main>
    <section class="notes" aria-label="Daily notes">
      <NoteCard
        v-for="(id, index) in $store.state.dailyIds"
        :id="id"
        :key="id"
        editable
        start-raw
        :active="index === active"
        @activate="activate(index)"
      />
    </section>
    <button class="add" aria-label="Add note" :disabled="adding" @click="add">+</button>
  </main>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import NoteCard from '@/components/NoteCard.vue'
export default defineComponent({
  components: { NoteCard },
  data: () => ({ active: 0, adding: false }),
  created() { this.loadDaily() },
  methods: {
    async loadDaily() {
      await this.$store.dispatch('loadDaily', 4)
      this.active = Math.min(this.active, Math.max(0, this.$store.state.dailyIds.length - 1))
    },
    activate(index: number) { this.active = index },
    async add() {
      if (this.adding) return
      this.adding = true
      try {
        const nextIndex = this.$store.state.dailyIds.length
        await this.$store.dispatch('loadDaily', nextIndex + 1)
        this.active = Math.min(nextIndex, this.$store.state.dailyIds.length - 1)
      } finally { this.adding = false }
    },
  },
})
</script>
<style scoped>
main { display: flex; flex-direction: column; }
.notes { display: flex; flex: 1; flex-direction: column; gap: .5rem; min-height: 0; }
.add { background: #0f9f78; border: 0; border-radius: 50%; bottom: 2rem; color: white; font-size: 2rem; height: 3.5rem; position: fixed; right: 2rem; width: 3.5rem; }
</style>
