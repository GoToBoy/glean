import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@glean/api-client', () => ({
  tagService: {
    getTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
  },
}))

vi.mock('@glean/logger', () => ({
  logger: { error: vi.fn() },
}))

import { useTags } from '@/hooks/useTags'
import { tagService } from '@glean/api-client'
import { createMockTag, createMockTagWithCounts } from '../helpers/mockData'

describe('useTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return initial state', () => {
    const { result } = renderHook(() => useTags())

    expect(result.current.tags).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should fetch tags successfully', async () => {
    const tags = [createMockTagWithCounts({ id: 't1', name: 'React', bookmark_count: 3, entry_count: 0 })]
    vi.mocked(tagService.getTags).mockResolvedValue({ tags })

    const { result } = renderHook(() => useTags())

    await act(async () => {
      await result.current.fetchTags()
    })

    expect(result.current.tags).toEqual(tags)
    expect(result.current.loading).toBe(false)
  })

  it('should set error on fetch failure', async () => {
    vi.mocked(tagService.getTags).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useTags())

    await act(async () => {
      await result.current.fetchTags()
    })

    expect(result.current.error).toBe('Failed to load tags')
  })

  it('should create a tag and refresh', async () => {
    const tag = createMockTag({ id: 't1', name: 'New' })
    vi.mocked(tagService.createTag).mockResolvedValue(tag)
    vi.mocked(tagService.getTags).mockResolvedValue({ tags: [createMockTagWithCounts({ ...tag, bookmark_count: 0, entry_count: 0 })] })

    const { result } = renderHook(() => useTags())

    let created: unknown
    await act(async () => {
      created = await result.current.createTag({ name: 'New' })
    })

    expect(created).toEqual(tag)
    expect(tagService.createTag).toHaveBeenCalledWith({ name: 'New' })
  })

  it('should update a tag', async () => {
    const tag = createMockTag({ id: 't1', name: 'Updated' })
    vi.mocked(tagService.updateTag).mockResolvedValue(tag)
    vi.mocked(tagService.getTags).mockResolvedValue({ tags: [] })

    const { result } = renderHook(() => useTags())

    let updated: unknown
    await act(async () => {
      updated = await result.current.updateTag('t1', { name: 'Updated' })
    })

    expect(updated).toEqual(tag)
  })

  it('should delete a tag', async () => {
    vi.mocked(tagService.deleteTag).mockResolvedValue(undefined)
    vi.mocked(tagService.getTags).mockResolvedValue({ tags: [] })

    const { result } = renderHook(() => useTags())

    let deleted: unknown
    await act(async () => {
      deleted = await result.current.deleteTag('t1')
    })

    expect(deleted).toBe(true)
  })
})
