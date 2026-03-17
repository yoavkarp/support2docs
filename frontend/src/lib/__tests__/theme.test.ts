import { describe, it, expect, beforeEach } from 'vitest'
import { getTheme, toggleTheme, applyTheme, initTheme } from '../theme'

const STORAGE_KEY = 'theme'

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
  document.documentElement.classList.remove('light')
}

describe('theme.ts', () => {
  beforeEach(() => {
    clearStorage()
  })

  describe('getTheme()', () => {
    it('returns "dark" when localStorage has no value (default)', () => {
      expect(getTheme()).toBe('dark')
    })

    it('returns "dark" when localStorage value is "dark"', () => {
      localStorage.setItem(STORAGE_KEY, 'dark')
      expect(getTheme()).toBe('dark')
    })

    it('returns "light" when localStorage value is "light"', () => {
      localStorage.setItem(STORAGE_KEY, 'light')
      expect(getTheme()).toBe('light')
    })

    it('returns "dark" (fallback) for an unrecognised value', () => {
      localStorage.setItem(STORAGE_KEY, 'INVALID_THEME')
      expect(getTheme()).toBe('dark')
    })

    it('returns "dark" (fallback) for an empty string', () => {
      localStorage.setItem(STORAGE_KEY, '')
      expect(getTheme()).toBe('dark')
    })
  })

  describe('applyTheme()', () => {
    it('adds "light" class to document root when theme is "light"', () => {
      applyTheme('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })

    it('removes "light" class from document root when theme is "dark"', () => {
      document.documentElement.classList.add('light')
      applyTheme('dark')
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('persists the theme to localStorage', () => {
      applyTheme('light')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    })

    it('persists "dark" to localStorage', () => {
      applyTheme('dark')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    })
  })

  describe('initTheme()', () => {
    it('applies "dark" when no theme is stored', () => {
      initTheme()
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('applies "light" when "light" is stored', () => {
      localStorage.setItem(STORAGE_KEY, 'light')
      initTheme()
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })

    it('applies "dark" (fallback) for an invalid stored value', () => {
      localStorage.setItem(STORAGE_KEY, 'garbage')
      initTheme()
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  describe('toggleTheme()', () => {
    it('returns "light" when current theme is "dark"', () => {
      localStorage.setItem(STORAGE_KEY, 'dark')
      const next = toggleTheme()
      expect(next).toBe('light')
    })

    it('returns "dark" when current theme is "light"', () => {
      localStorage.setItem(STORAGE_KEY, 'light')
      const next = toggleTheme()
      expect(next).toBe('dark')
    })

    it('applies the toggled theme to the document root', () => {
      localStorage.setItem(STORAGE_KEY, 'dark')
      toggleTheme()
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })

    it('persists the toggled theme to localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'dark')
      toggleTheme()
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    })

    it('defaults to toggling from "dark" when no preference is stored', () => {
      const next = toggleTheme()
      expect(next).toBe('light')
    })
  })
})
