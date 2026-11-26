<template>
  <div class="login">
    <template v-if="$store.state.user">
      <button class="avatar-button" aria-label="Open profile menu" @click="menuOpen = !menuOpen">
        <span class="avatar">{{ initials }}</span>
      </button>
      <div v-if="menuOpen" class="profile-menu">
        <button type="button" @click="openSettings">Settings</button>
        <button type="button" @click="logout">Log out</button>
      </div>
      <div v-if="settingsOpen" class="settings-backdrop" @click.self="closeSettings">
        <section class="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" @keydown.esc="closeSettings">
          <button type="button" class="close" aria-label="Close settings" :disabled="savingSettings" @click="closeSettings">×</button>
          <h2 id="settings-title">Settings</h2>
          <form @submit.prevent="applySettings">
            <fieldset :disabled="loadingSettings || savingSettings || !weekStart">
              <legend>Week starts at</legend>
              <label v-for="option in weekOptions" :key="option.value">
                <input v-model="weekStart" type="radio" name="week-start" :value="option.value"> {{ option.label }}
              </label>
            </fieldset>
            <p v-if="loadingSettings" role="status">Loading settings…</p>
            <p v-if="settingsError" class="error" role="alert">{{ settingsError }}</p>
            <div class="settings-actions">
              <button type="submit" class="apply" :disabled="loadingSettings || savingSettings || !weekStart">{{ savingSettings ? 'Applying…' : 'Apply' }}</button>
            </div>
          </form>
        </section>
      </div>
    </template>
    <template v-else>
      <button @click="open = !open">Log in</button>
      <div v-if="open" class="popover">
        <div v-if="googleClientId" ref="googleButton" /><div v-if="googleClientId" class="or">or</div>
        <form @submit.prevent="sendLink"><label>Email <input v-model="email" type="email" required placeholder="you@example.com"></label><button :disabled="sending">{{ sending ? 'Sending…' : 'Email me a magic link' }}</button><button v-if="development" type="button" :disabled="sending || !email.trim()" @click="fakeLogin">Fake log in (dev only)</button></form>
        <p v-if="message" class="message">{{ message }}</p><a v-if="developmentUrl" :href="developmentUrl">Open development magic link</a><p v-if="error" class="error">{{ error }}</p>
      </div>
    </template>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { authApi } from '@/api/auth'
import type { WeekStart } from '@/api/notes'
declare global { interface Window { google?: any } }
export default defineComponent({
  data: () => ({
    development: import.meta.env.DEV, open: false, email: '', sending: false, message: '', error: '', developmentUrl: '',
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    menuOpen: false, settingsOpen: false, loadingSettings: false, savingSettings: false, settingsRequest: 0,
    settingsError: '', weekStart: null as WeekStart | null,
    weekOptions: [{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }] as const,
  }),
  computed: { initials(): string { return (this.$store.state.user?.name || this.$store.state.user?.email || 'U').slice(0, 1).toUpperCase() } },
  watch: { open(value) { if (value) this.$nextTick(this.renderGoogle) } },
  methods: {
    async openSettings() {
      const request = ++this.settingsRequest
      this.menuOpen = false
      this.settingsOpen = true
      this.loadingSettings = true
      this.settingsError = ''
      this.weekStart = null
      try {
        const saved: WeekStart | null = await this.$store.dispatch('getWeekStart')
        if (request === this.settingsRequest) this.weekStart = saved ?? 'sunday'
      } catch {
        if (request === this.settingsRequest) this.settingsError = 'Unable to load settings.'
      } finally {
        if (request === this.settingsRequest) this.loadingSettings = false
      }
    },
    closeSettings() {
      if (!this.savingSettings) this.settingsOpen = false
    },
    async applySettings() {
      if (this.loadingSettings || this.savingSettings || !this.weekStart) return
      this.savingSettings = true
      this.settingsError = ''
      try {
        await this.$store.dispatch('setWeekStart', this.weekStart)
        this.settingsOpen = false
      } catch {
        this.settingsError = 'Unable to save settings. Please try again.'
      } finally {
        this.savingSettings = false
      }
    },
    async logout() { await this.$store.dispatch('logout'); this.menuOpen = false },
    renderGoogle() { if (!this.googleClientId || !window.google || !this.$refs.googleButton) return; window.google.accounts.id.initialize({ client_id: this.googleClientId, callback: ({ credential }: any) => this.$store.dispatch('googleLogin', credential) }); window.google.accounts.id.renderButton(this.$refs.googleButton, { theme: 'outline', size: 'large' }) },
    async fakeLogin() { this.sending = true; this.error = ''; try { await this.$store.dispatch('fakeLogin', this.email); this.open = false } catch (error) { this.error = error instanceof Error ? error.message : 'Unable to sign in' } finally { this.sending = false } },
    async sendLink() { this.sending = true; this.error = ''; this.developmentUrl = ''; try { const result = await authApi.requestMagicLink(this.email); this.message = 'Check your email for a sign-in link.'; this.developmentUrl = result.developmentUrl || '' } catch (error) { this.error = error instanceof Error ? error.message : 'Unable to send link' } finally { this.sending = false } },
  },
})
</script>
<style scoped>
.login { position: relative; }.avatar-button { border: 0; background: none; padding: 0; cursor: pointer; }.avatar { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: #64748b; color: white; font-weight: 700; }.profile-menu { position: absolute; right: 0; top: calc(100% + .5rem); display: grid; gap: .25rem; min-width: 8rem; padding: .5rem; background: white; border-radius: .5rem; box-shadow: 0 8px 30px #0003; z-index: 10; }.profile-menu button { text-align: left; }.popover { background: white; border-radius: .5rem; box-shadow: 0 8px 30px #0003; padding: 1rem; position: absolute; right: 0; top: calc(100% + .5rem); width: 18rem; z-index: 10; }.popover form, label { display: grid; gap: .5rem; }.or { color: #64748b; margin: .75rem; text-align: center; }.message { color: #047857; }.error { color: #b91c1c; }.settings-backdrop { position: fixed; inset: 0; display: grid; place-items: center; background: #0005; z-index: 20; }.settings { position: relative; width: min(22rem, calc(100vw - 2rem)); padding: 1.5rem; background: var(--surface); border-radius: .75rem; box-shadow: 0 12px 40px #0005; }
.settings fieldset { border: 0; margin: 0; padding: 0; }
.settings legend { padding: 0; }
.settings label { display: block; margin: .75rem 0; }
.settings-actions { display: flex; justify-content: flex-end; margin-top: .75rem; }
.apply { background: var(--accent); color: var(--on-accent); padding: .4rem .9rem; }
.close { position: absolute; right: .75rem; top: .5rem; border: 0; background: none; font-size: 1.5rem; cursor: pointer; }
</style>
