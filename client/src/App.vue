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
      <div v-if="$route.name === 'home'" class="filters">
        <LookbackMenu :model-value="days" :active="!labelActive" @update:model-value="searchDays" />
        <form class="label-search" role="search" @submit.prevent="searchLabel">
          <span v-if="labelActive" class="label-chip" :title="`Active label: ${$store.state.bug}`">
            <span class="label-chip-text">{{ $store.state.bug }}</span>
            <button type="button" class="clear-label" aria-label="Clear label filter" title="Clear label filter" @click="clearLabel"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6m0-6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
          </span>
          <input v-model="bug" aria-label="Search label" aria-describedby="filter-status" :placeholder="labelActive ? 'Label…' : 'Find a label…'">
          <button type="submit" class="search-submit" :disabled="!bug.trim()">Search</button>
        </form>
        <span id="filter-status" class="filter-status" role="status">{{ labelActive ? `Filtering by label: ${$store.state.bug}` : `Filtering by the last ${days} days` }}</span>
      </div>
      <div class="header-account">
        <ThemeToggle v-model="theme" />
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
import LookbackMenu from '@/components/LookbackMenu.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { initialTheme, rememberTheme, resolveTheme, type Theme } from '@/theme'
export default defineComponent({
  components: { LoginPanel, MessageBar, LookbackMenu, ThemeToggle },
  created() { this.$store.dispatch('initializeAuth').catch(() => undefined) },
  data() { return { days: this.$store.state.days, bug: '', theme: initialTheme(), systemDark: false, colorQuery: null as MediaQueryList | null } },
  computed: {
    resolvedTheme(): 'light' | 'dark' { return resolveTheme(this.theme, this.systemDark) },
    labelActive(): boolean { return Boolean(this.$store.state.bug) },
  },
  mounted() {
    this.colorQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemDark = this.colorQuery.matches
    this.colorQuery.addEventListener('change', this.systemThemeChanged)
  },
  beforeUnmount() { this.colorQuery?.removeEventListener('change', this.systemThemeChanged) },
  watch: { theme(value: Theme) { rememberTheme(value) }, '$store.state.days'(value: number) { this.days = value } },
  methods: {
    systemThemeChanged(event: MediaQueryListEvent) { this.systemDark = event.matches },
    searchDays(days: number) {
      this.days = days
      this.$store.dispatch('loadNotes', { days: this.days }).catch(() => undefined)
    },
    searchLabel() {
      const label = this.bug.trim()
      if (!label) return
      this.bug = ''
      this.$store.dispatch('loadNotes', { bug: label }).catch(() => undefined)
    },
    clearLabel() { this.$store.dispatch('loadNotes', { days: this.days }).catch(() => undefined) },
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
