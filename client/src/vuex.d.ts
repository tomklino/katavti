import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { Store } from 'vuex'
import type { State } from './store'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: Store<State>
    $route: RouteLocationNormalizedLoaded
    $router: Router
  }
}

export {}
