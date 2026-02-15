import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '@/stores/uiStore'

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      showPreferenceScore: false,
    })
  })

  it('should have correct initial state', () => {
    const state = useUIStore.getState()
    expect(state.showPreferenceScore).toBe(false)
  })

  it('should set showPreferenceScore to true', () => {
    useUIStore.getState().setShowPreferenceScore(true)
    expect(useUIStore.getState().showPreferenceScore).toBe(true)
  })

  it('should set showPreferenceScore to false', () => {
    useUIStore.getState().setShowPreferenceScore(true)
    useUIStore.getState().setShowPreferenceScore(false)
    expect(useUIStore.getState().showPreferenceScore).toBe(false)
  })

  it('should persist to localStorage', () => {
    useUIStore.getState().setShowPreferenceScore(true)
    const stored = localStorage.getItem('glean-ui')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.state.showPreferenceScore).toBe(true)
  })
})
