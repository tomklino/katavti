<template>
  <div class="login" @keydown.esc="escapeProfile">
    <template v-if="$store.state.user">
      <button ref="profileTrigger" type="button" class="profile-trigger" aria-label="Profile" :aria-expanded="!!profileView" :aria-controls="profileView ? profileId : undefined" @click="toggleProfile">
        {{ initials }}
      </button>
      <div v-if="profileView === 'actions'" :id="profileId" class="account-panel profile-actions">
        <button ref="settingsButton" type="button" @click="openSettings">Settings</button>
        <button type="button" @click="logout">Log out</button>
      </div>
      <section v-else-if="profileView === 'settings'" :id="profileId" class="account-panel settings" role="dialog" :aria-labelledby="`${profileId}-title`">
        <div class="settings-heading">
          <h2 :id="`${profileId}-title`" ref="settingsHeading" tabindex="-1">Settings</h2>
          <button type="button" class="settings-close" aria-label="Close settings" :disabled="savingSettings" @click="closeProfile(true)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6m0-6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          </button>
        </div>
        <form @submit.prevent="applySettings">
          <fieldset :disabled="loadingSettings || savingSettings || !weekStart">
            <legend>First day of the week</legend>
            <div class="week-options">
              <label v-for="option in weekOptions" :key="option.value" :class="{ selected: weekStart === option.value }">
                <input v-model="weekStart" type="radio" name="week-start" :value="option.value">
                {{ option.label }}
              </label>
            </div>
          </fieldset>
          <p v-if="loadingSettings" class="settings-status" role="status">Loading settings…</p>
          <p v-if="settingsError" class="settings-status" role="alert">{{ settingsError }}</p>
          <div class="settings-actions">
            <button type="submit" class="apply" :disabled="loadingSettings || !weekStart" :aria-disabled="savingSettings || undefined">{{ savingSettings ? 'Applying…' : 'Apply' }}</button>
          </div>
        </form>
      </section>
    </template>
    <template v-else>
      <button class="login-trigger" @click="open = !open">Log in</button>
      <div v-if="open" class="popover">
        <div v-if="googleClientId" ref="googleButton" /><div v-if="googleClientId" class="or">or</div>
        <form @submit.prevent="sendLink"><label>Email <input v-model="email" type="email" required placeholder="you@example.com"></label><button :disabled="sending">{{ sending ? 'Sending…' : 'Email me a magic link' }}</button><button v-if="development" type="button" :disabled="sending || !email.trim()" @click="fakeLogin">Fake log in (dev only)</button></form>
        <p v-if="message" class="message">{{ message }}</p><a v-if="developmentUrl" :href="developmentUrl">Open development magic link</a><p v-if="error" class="error">{{ error }}</p>
      </div>
    </template>
  </div>
</template>
<script lang="ts">
import { defineComponent, useId } from 'vue'
import { authApi } from '@/api/auth'
import type { WeekStart } from '@/api/notes'
declare global { interface Window { google?: any } }
export default defineComponent({
  setup() { return { profileId: `profile-${useId()}` } },
  data: () => ({
    development: import.meta.env.DEV, open: false, email: '', sending: false, message: '', error: '', developmentUrl: '',
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    profileView: null as 'actions' | 'settings' | null, loadingSettings: false, savingSettings: false, settingsRequest: 0,
    settingsError: '', weekStart: null as WeekStart | null,
    weekOptions: [{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }] as const,
  }),
  computed: { initials(): string { return (this.$store.state.user?.name || this.$store.state.user?.email || 'U').slice(0, 1).toUpperCase() } },
  watch: { open(value) { if (value) this.$nextTick(this.renderGoogle) } },
  mounted() {
    document.addEventListener('pointerdown', this.dismissOutside)
    document.addEventListener('focusin', this.dismissOutside)
  },
  beforeUnmount() {
    document.removeEventListener('pointerdown', this.dismissOutside)
    document.removeEventListener('focusin', this.dismissOutside)
  },
  methods: {
    toggleProfile() {
      if (this.profileView) this.closeProfile(true)
      else {
        this.profileView = 'actions'
        this.$nextTick(() => (this.$refs.settingsButton as HTMLButtonElement | undefined)?.focus())
      }
    },
    closeProfile(restoreFocus = false) {
      if (!this.profileView || this.savingSettings) return
      this.settingsRequest++
      this.profileView = null
      if (restoreFocus) (this.$refs.profileTrigger as HTMLButtonElement | undefined)?.focus()
    },
    escapeProfile(event: KeyboardEvent) {
      if (!this.profileView) return
      event.stopPropagation()
      event.preventDefault()
      this.closeProfile(true)
    },
    dismissOutside(event: Event) {
      if (this.profileView && !this.$el.contains(event.target as Node)) this.closeProfile()
    },
    async openSettings() {
      const request = ++this.settingsRequest
      this.profileView = 'settings'
      this.loadingSettings = true
      this.settingsError = ''
      this.weekStart = null
      this.$nextTick(() => (this.$refs.settingsHeading as HTMLElement | undefined)?.focus())
      try {
        const saved: WeekStart | null = await this.$store.dispatch('getWeekStart')
        if (request === this.settingsRequest) this.weekStart = saved ?? 'sunday'
      } catch {
        if (request === this.settingsRequest) this.settingsError = 'Unable to load settings.'
      } finally {
        if (request === this.settingsRequest) this.loadingSettings = false
      }
    },
    async applySettings() {
      if (this.loadingSettings || this.savingSettings || !this.weekStart) return
      this.savingSettings = true
      this.settingsError = ''
      try {
        await this.$store.dispatch('setWeekStart', this.weekStart)
      } catch {
        this.settingsError = 'Unable to save settings. Please try again.'
      } finally {
        this.savingSettings = false
      }
      if (!this.settingsError) this.closeProfile(this.$el.contains(document.activeElement))
    },
    async logout() { await this.$store.dispatch('logout'); this.closeProfile() },
    renderGoogle() { if (!this.googleClientId || !window.google || !this.$refs.googleButton) return; window.google.accounts.id.initialize({ client_id: this.googleClientId, callback: ({ credential }: any) => this.$store.dispatch('googleLogin', credential) }); window.google.accounts.id.renderButton(this.$refs.googleButton, { theme: 'outline', size: 'large' }) },
    async fakeLogin() { this.sending = true; this.error = ''; try { await this.$store.dispatch('fakeLogin', this.email); this.open = false } catch (error) { this.error = error instanceof Error ? error.message : 'Unable to sign in' } finally { this.sending = false } },
    async sendLink() { this.sending = true; this.error = ''; this.developmentUrl = ''; try { const result = await authApi.requestMagicLink(this.email); this.message = 'Check your email for a sign-in link.'; this.developmentUrl = result.developmentUrl || '' } catch (error) { this.error = error instanceof Error ? error.message : 'Unable to send link' } finally { this.sending = false } },
  },
})
</script>
<style scoped>
.login { position: relative; }
.profile-trigger {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 6px;
  background: var(--editor-bg);
  font-size: 12px;
  font-weight: 600;
}
.profile-trigger:hover, .profile-trigger[aria-expanded='true'] {
  background: var(--tag-bg);
  border-color: var(--active-line);
  color: var(--accent);
}
.account-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 7px);
  z-index: 20;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 4px 14px #00000018;
  font-size: 12px;
}
.profile-actions { display: grid; width: 152px; padding: 5px; }
.profile-actions button {
  min-height: 34px;
  padding: 8px 9px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  text-align: left;
}
.profile-actions button:hover, .profile-actions button:focus-visible {
  background: var(--collapsed);
  color: var(--accent);
}
.settings { width: min(232px, calc(100vw - 16px)); padding: 12px; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.settings-heading h2 { margin: 0; font-size: 13px; font-weight: 600; }
.settings-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
}
.settings-close:not(:disabled):hover { background: var(--collapsed); }
.settings fieldset { min-width: 0; border: 0; margin: 0; padding: 0; }
.settings legend { padding: 0; }
.week-options { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.week-options label {
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius: var(--radius);
}
.week-options label.selected { background: var(--tag-bg); border-color: var(--active-line); }
.settings fieldset:not(:disabled) label, .settings fieldset:not(:disabled) input { cursor: pointer; }
.settings fieldset:not(:disabled) label:not(.selected):hover { background: var(--collapsed); }
.week-options input { margin: 0; accent-color: var(--accent); }
.settings-status { margin: 8px 0 0; }
.settings-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
.apply { min-height: 32px; padding: 4px 10px; }
.apply:not(:disabled):not([aria-disabled]):hover { background: var(--collapsed); border-color: var(--active-line); }
.settings .apply[aria-disabled='true'] { cursor: wait; opacity: .6; }
.popover { border-radius: .5rem; padding: 1rem; position: absolute; right: 0; top: calc(100% + .5rem); width: 18rem; z-index: 10; }
.popover form, .popover label { display: grid; gap: .5rem; }
.or { color: #64748b; margin: .75rem; text-align: center; }
.message { color: #047857; }
.error { color: #b91c1c; }
</style>
