export const themes = ['system', 'light', 'dark'] as const
export type Theme = typeof themes[number]
export const themeStorageKey = 'katavti.theme'

export function isTheme(value: unknown): value is Theme {
  return themes.some(theme => theme === value)
}

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(themeStorageKey)
    return isTheme(saved) ? saved : 'system'
  } catch { return 'system' }
}

export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? systemDark ? 'dark' : 'light' : theme
}

export function rememberTheme(theme: Theme) {
  try { localStorage.setItem(themeStorageKey, theme) } catch { /* Theme works without storage. */ }
}
