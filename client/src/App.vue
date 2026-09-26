<template>
  <div id="app">
    <MessageBar v-if="$store.state.storageWarning" variant="warning" @dismiss="$store.dispatch('dismissStorageWarning')">
      These notes are stored only in this browser. Log in to back them up to Katavti.
    </MessageBar>
    <MessageBar v-if="$store.state.backupStatus" :variant="$store.state.backupStatus.includes('failed') ? 'error' : 'success'" @dismiss="$store.commit('setBackupStatus', '')">
      {{ $store.state.backupStatus }}
    </MessageBar>
    <header>
      <router-link class="brand" to="/">Katavti</router-link>
      <router-link to="/daily">Daily</router-link>
      <select v-model.number="days" @change="searchDays"><option :value="5">5 days</option><option :value="28">4 weeks</option><option :value="90">3 months</option><option :value="365">1 year</option></select>
      <form @submit.prevent="searchLabel"><input v-model="bug" placeholder="Search label"><button>Search</button></form>
      <LoginPanel />
    </header>
    <router-view />
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import LoginPanel from '@/components/LoginPanel.vue'
import MessageBar from '@/components/MessageBar.vue'
export default defineComponent({
  components: { LoginPanel, MessageBar },
  created() { this.$store.dispatch('initializeAuth').catch(() => undefined) },
  data() { return { days: this.$store.state.days, bug: this.$store.state.bug } },
  methods: {
    goHome() { if (this.$route.path !== '/') this.$router.push('/') },
    searchDays() { this.goHome(); this.$store.dispatch('loadNotes', { days: this.days }) },
    searchLabel() { this.goHome(); this.$store.dispatch('loadNotes', this.bug ? { bug: this.bug } : { days: this.days }) },
  },
})
</script>
<style>
html, body, #app { height: 100%; } body { background: #f5f7f8; color: #24313a; font-family: Inter, system-ui, sans-serif; margin: 0; overflow: hidden; } #app { display: flex; flex-direction: column; min-height: 0; } #app > header { align-items: center; background: white; box-shadow: 0 1px 5px #0002; display: flex; flex: 0 0 auto; gap: 1rem; padding: 1.25rem max(1rem, calc((100% - 1100px)/2)); } .brand { color: #0f9f78; font-size: 1.25rem; font-weight: 800; margin-right: auto; } a { color: inherit; text-decoration: none; } form { display: flex; gap: .25rem; } input, select, button { border: 1px solid #cbd5e1; border-radius: 5px; padding: .5rem; } #app > main { box-sizing: border-box; flex: 1 1 auto; margin: 1rem auto; max-width: 1100px; min-height: 0; padding: 0 1rem; width: 100%; }
</style>
