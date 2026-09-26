<template>
  <div class="login">
    <template v-if="$store.state.user">
      <span>{{ $store.state.user.name || $store.state.user.email }}</span>
      <button @click="$store.dispatch('logout')">Log out</button>
    </template>
    <template v-else>
      <button @click="open = !open">Log in</button>
      <div v-if="open" class="popover">
        <div v-if="googleClientId" ref="googleButton" />
        <div v-if="googleClientId" class="or">or</div>
        <form @submit.prevent="sendLink">
          <label>Email <input v-model="email" type="email" required placeholder="you@example.com"></label>
          <button :disabled="sending">{{ sending ? 'Sending…' : 'Email me a magic link' }}</button>
        </form>
        <p v-if="message" class="message">{{ message }}</p>
        <a v-if="developmentUrl" :href="developmentUrl">Open development magic link</a>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </template>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { authApi } from '@/api/auth'

declare global { interface Window { google?: any } }
export default defineComponent({
  data: () => ({ open: false, email: '', sending: false, message: '', error: '', developmentUrl: '', googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '' }),
  watch: { open(value) { if (value) this.$nextTick(this.renderGoogle) } },
  methods: {
    renderGoogle() {
      if (!this.googleClientId || !window.google || !this.$refs.googleButton) return
      window.google.accounts.id.initialize({ client_id: this.googleClientId, callback: ({ credential }: any) => this.$store.dispatch('googleLogin', credential) })
      window.google.accounts.id.renderButton(this.$refs.googleButton, { theme: 'outline', size: 'large' })
    },
    async sendLink() {
      this.sending = true; this.error = ''; this.developmentUrl = ''
      try { const result = await authApi.requestMagicLink(this.email); this.message = 'Check your email for a sign-in link.'; this.developmentUrl = result.developmentUrl || '' }
      catch (error) { this.error = error instanceof Error ? error.message : 'Unable to send link' }
      finally { this.sending = false }
    },
  },
})
</script>
<style scoped>
.login { position: relative; }.popover { background: white; border-radius: .5rem; box-shadow: 0 8px 30px #0003; padding: 1rem; position: absolute; right: 0; top: calc(100% + .5rem); width: 18rem; z-index: 10; }.popover form, label { display: grid; gap: .5rem; }.or { color: #64748b; margin: .75rem; text-align: center; }.message { color: #047857; }.error { color: #b91c1c; }
</style>
