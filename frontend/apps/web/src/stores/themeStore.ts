import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

/**
 * Get the system's preferred color scheme.
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Resolve theme to actual dark/light value.
 */
function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme()
  }
  return theme
}

/**
 * Apply theme to the document root element.
 */
function applyTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement
  if (resolvedTheme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.removeAttribute('data-theme')
  }
}

// Media query for system theme changes
let mediaQuery: MediaQueryList | null = null
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null

/**
 * Setup listener for system theme changes.
 */
function setupSystemThemeListener(callback: () => void) {
  if (typeof window === 'undefined') return

  // Clean up existing listener
  if (mediaQuery && mediaQueryListener) {
    mediaQuery.removeEventListener('change', mediaQueryListener)
  }

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQueryListener = () => callback()
  mediaQuery.addEventListener('change', mediaQueryListener)
}

/**
 * Theme store for managing application theme.
 * 
 * Supports 'dark', 'light', and 'system' (follows OS preference).
 * Persists theme preference to localStorage and applies it to the document.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: getSystemTheme(),
      setTheme: (theme: Theme) => {
        const resolved = resolveTheme(theme)
        set({ theme, resolvedTheme: resolved })
        applyTheme(resolved)

        // Setup or remove system theme listener based on selection
        if (theme === 'system') {
          setupSystemThemeListener(() => {
            const newResolved = getSystemTheme()
            set({ resolvedTheme: newResolved })
            applyTheme(newResolved)
          })
        }
      },
      toggleTheme: () => {
        const current = get().theme
        const themes: Theme[] = ['dark', 'light', 'system']
        const currentIndex = themes.indexOf(current)
        const newTheme = themes[(currentIndex + 1) % themes.length]
        get().setTheme(newTheme)
      },
    }),
    {
      name: 'glean-theme',
      onRehydrateStorage: () => (state) => {
        // Apply theme on hydration
        if (state) {
          const resolved = resolveTheme(state.theme)
          state.resolvedTheme = resolved
          applyTheme(resolved)

          // Setup system theme listener if needed
          if (state.theme === 'system') {
            setupSystemThemeListener(() => {
              const newResolved = getSystemTheme()
              useThemeStore.setState({ resolvedTheme: newResolved })
              applyTheme(newResolved)
            })
          }
        }
      },
    }
  )
)

/**
 * Initialize theme on app load.
 * Call this in the app entry point to avoid flash of wrong theme.
 */
export function initializeTheme() {
  const storedTheme = localStorage.getItem('glean-theme')
  let theme: Theme = 'system'
  
  if (storedTheme) {
    try {
      const parsed = JSON.parse(storedTheme)
      if (parsed.state?.theme) {
        theme = parsed.state.theme
      }
    } catch {
      // Ignore parse errors
    }
  }

  const resolved = resolveTheme(theme)
  applyTheme(resolved)

  // Setup system theme listener if needed
  if (theme === 'system') {
    setupSystemThemeListener(() => {
      const newResolved = getSystemTheme()
      useThemeStore.setState({ resolvedTheme: newResolved })
      applyTheme(newResolved)
    })
  }
}
