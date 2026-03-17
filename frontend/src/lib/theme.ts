/**
 * Theme initialization — must run before React renders to prevent flash of wrong theme.
 * Called from main.tsx before createRoot().
 */
export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

/** Safely parse a raw localStorage value into a Theme, falling back to 'dark'. */
function parseTheme(raw: string | null): Theme {
  if (raw === 'dark' || raw === 'light') return raw
  return 'dark'
}

export function initTheme(): void {
  const stored = parseTheme(localStorage.getItem(STORAGE_KEY))
  applyTheme(stored)
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.add('light')
  } else {
    root.classList.remove('light')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

export function getTheme(): Theme {
  return parseTheme(localStorage.getItem(STORAGE_KEY))
}

export function toggleTheme(): Theme {
  const current = getTheme()
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
