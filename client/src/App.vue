<template>
  <div id="app" :data-theme="resolvedTheme">
    <MessageBar v-if="$store.state.storageWarning" variant="warning" @dismiss="$store.dispatch('dismissStorageWarning')">
      These notes are stored only in this browser. Log in to back them up to Katavti.
    </MessageBar>
    <MessageBar v-if="$store.state.backupStatus" :variant="$store.state.backupStatus.includes('failed') ? 'error' : 'success'" @dismiss="$store.commit('setBackupStatus', '')">
      {{ $store.state.backupStatus }}
    </MessageBar>
    <header class="app-header">
      <router-link class="brand" to="/" aria-label="Katavti home"><span class="brand-mark" aria-hidden="true">k<span>·</span></span><span>katavti</span></router-link>
      <nav class="primary-nav" aria-label="Main navigation">
        <router-link to="/daily">Daily</router-link>
        <router-link to="/" exact-active-class="router-link-exact-active">All notes</router-link>
      </nav>
      <div class="filters">
        <select v-model.number="days" aria-label="Look back period" @change="searchDays"><option :value="5">5 days</option><option :value="28">4 weeks</option><option :value="90">3 months</option><option :value="365">1 year</option></select>
        <form class="label-search" role="search" @submit.prevent="searchLabel"><input v-model="bug" aria-label="Search label" placeholder="Find a label…"><button v-if="$store.state.bug" type="button" aria-label="Clear label filter" @click="clearLabel">×</button><button type="submit">Search</button></form>
      </div>
      <div class="header-account">
        <select v-model="theme" class="theme-select" aria-label="Color theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
        <LoginPanel />
      </div>
    </header>
    <router-view />
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import LoginPanel from '@/components/LoginPanel.vue'
import MessageBar from '@/components/MessageBar.vue'
import { initialTheme, rememberTheme, resolveTheme, type Theme } from '@/theme'
export default defineComponent({
  components: { LoginPanel, MessageBar },
  created() { this.$store.dispatch('initializeAuth').catch(() => undefined) },
  data() { return { days: this.$store.state.days, bug: this.$store.state.bug, theme: initialTheme(), systemDark: false, colorQuery: null as MediaQueryList | null } },
  computed: { resolvedTheme(): 'light' | 'dark' { return resolveTheme(this.theme, this.systemDark) } },
  mounted() {
    this.colorQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemDark = this.colorQuery.matches
    this.colorQuery.addEventListener('change', this.systemThemeChanged)
  },
  beforeUnmount() { this.colorQuery?.removeEventListener('change', this.systemThemeChanged) },
  watch: { theme(value: Theme) { rememberTheme(value) }, '$store.state.bug'(value: string) { this.bug = value }, '$store.state.days'(value: number) { this.days = value } },
  methods: {
    systemThemeChanged(event: MediaQueryListEvent) { this.systemDark = event.matches },
    goHome() { if (this.$route.path !== '/') this.$router.push('/') },
    searchDays() { this.goHome(); this.$store.dispatch('loadNotes', { days: this.days }).catch(() => undefined) },
    searchLabel() { this.goHome(); this.$store.dispatch('loadNotes', this.bug ? { bug: this.bug } : { days: this.days }).catch(() => undefined) },
    clearLabel() { this.bug = ''; this.searchLabel() },
  },
})
</script>
<style>
html, body, #app { height: 100%; }
#katavti-root { height: 100%; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; overflow: hidden; }
#app { display: flex; flex-direction: column; min-height: 0; }
#app > main { box-sizing: border-box; flex: 1 1 auto; margin: 0 auto; min-height: 0; width: var(--workspace-width); }
</style>
<style src="./styles/designs.css" />
