import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import App from '@/App.vue'
import router from '@/router'
import { createStore } from '@/store'

const api = {
  list: async () => [],
  read: async () => ({ content: '', ISODateString: '', tags: [] as Array<[string, string]> }),
  update: async () => '',
  createDaily: async () => [],
  importNote: async () => ({ id: '', note: { content: '', ISODateString: '', tags: [] as Array<[string, string]> } }),
}

describe('Vue 3 bootstrap dependencies', () => {
  it('installs the router and Vuex store on a Vue 3 application', () => {
    const app = createApp(App).use(createStore(api)).use(router)
    expect(app.config.globalProperties.$store).toBeDefined()
    expect(app.config.globalProperties.$router).toBeDefined()
  })
})
