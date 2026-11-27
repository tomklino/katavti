<template>
  <div id="app" :data-theme="resolvedTheme">
    <MessageBar v-if="$store.state.previousDayWarning" class="previous-day-warning" variant="warning" persistent @dismiss="$store.commit('setPreviousDayWarning', false)">
      You're editing notes of a previous day. <a href="/daily" :aria-disabled="startingDay" @click.prevent="startNewDay">start a new day</a>
      <span v-if="dayError" role="alert"> {{ dayError }}</span>
    </MessageBar>
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
        <router-link to="/browse" exact-active-class="router-link-exact-active">All notes</router-link>
      </nav>
      <div v-if="$route.name === 'home'" class="filters">
        <LookbackMenu :model-value="days" :active="!labelActive" @update:model-value="searchDays" />
        <form class="label-search" role="search" @submit.prevent="searchLabel">
          <span v-if="labelActive" class="label-chip" :title="`Active label: ${activeLabel}`">
            <span class="label-chip-text">{{ activeLabel }}</span>
            <button type="button" class="clear-label" aria-label="Clear label filter" title="Clear label filter" @click="clearLabel"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6m0-6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
          </span>
          <input v-model="bug" aria-label="Search label" aria-describedby="filter-status" :placeholder="labelActive ? 'key: value…' : 'Find key: value…'">
          <button type="submit" class="search-submit" :disabled="!bug.trim()">Search</button>
        </form>
        <span v-if="labelError" role="alert">{{ labelError }}</span>
        <span id="filter-status" class="filter-status" role="status">{{ labelActive ? `Filtering by label: ${activeLabel}` : `Filtering by the last ${days} days` }}</span>
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
import { parseLabels } from '@/labels'
export default defineComponent({
  components: { LoginPanel, MessageBar, LookbackMenu, ThemeToggle },
  created() { this.$store.dispatch('initializeAuth').catch(() => undefined) },
  data() { return { startingDay: false, dayError: '', labelError: '', days: this.$store.state.days, bug: '', theme: initialTheme(), systemDark: false, colorQuery: null as MediaQueryList | null } },
  computed: {
    resolvedTheme(): 'light' | 'dark' { return resolveTheme(this.theme, this.systemDark) },
    activeLabel(): string { return this.$store.state.label || this.$store.state.bug },
    labelActive(): boolean { return Boolean(this.activeLabel) },
  },
  mounted() {
    this.colorQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemDark = this.colorQuery.matches
    this.colorQuery.addEventListener('change', this.systemThemeChanged)
  },
  beforeUnmount() { this.colorQuery?.removeEventListener('change', this.systemThemeChanged) },
  watch: { theme(value: Theme) { rememberTheme(value) }, '$store.state.days'(value: number) { this.days = value } },
  methods: {
    async startNewDay() {
      if (this.startingDay) return
      this.startingDay = true
      this.dayError = ''
      try {
        await this.$store.dispatch('loadDaily', 4)
        await this.$router.push('/daily')
      } catch { this.dayError = 'Unable to start a new day. Please try again.' }
      finally { this.startingDay = false }
    },
    systemThemeChanged(event: MediaQueryListEvent) { this.systemDark = event.matches },
    searchDays(days: number) {
      this.labelError = ''
      this.days = days
      this.$store.dispatch('loadNotes', { days: this.days }).catch(() => undefined)
    },
    searchLabel() {
      const label = this.bug.trim()
      if (!label) return
      const isPair = !label.includes('\n') && parseLabels(label).length === 1
      if (!isPair && /[:\s]/.test(label)) { this.labelError = 'Use key: value (one word each).'; return }
      this.labelError = ''
      this.bug = ''
      this.$store.dispatch('loadNotes', isPair ? { label } : { bug: label }).catch(() => undefined)
    },
    clearLabel() { this.labelError = ''; this.$store.dispatch('loadNotes', { days: this.days }).catch(() => undefined) },
  },
})
</script>
<style>
html, body, #app { height: 100%; }
#katavti-root { height: 100%; }
.previous-day-warning a { color: inherit; text-decoration: underline; font-weight: 600; }
.previous-day-warning a[aria-disabled="true"] { cursor: wait; opacity: .6; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; overflow: hidden; }
#app { display: flex; flex-direction: column; min-height: 0; }
#app > main { box-sizing: border-box; flex: 1 1 auto; margin: 0 auto; min-height: 0; width: var(--workspace-width); }
</style>
<style src="./styles/designs.css" />
