import type { AppConfig } from '../config/index.js'
import { SessionManager } from '../services/session-manager.js'
import { FileSessionBackend } from './file-session-backend.js'

export function createSessionManager<T>(config: AppConfig['sessions']) {
  switch (config.module) {
    case 'filesystem':
      return SessionManager.initialize<T>(new FileSessionBackend<T>(config.filesystem), config)
  }
}
