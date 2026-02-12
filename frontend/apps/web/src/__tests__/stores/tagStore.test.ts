import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@glean/api-client', () => ({
  tagService: {
    getTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    batchOperation: vi.fn(),
  },
}))

vi.mock('@glean/logger', () => ({
  logger: { error: vi.fn() },
}))

import { useTagStore } from '@/stores/tagStore'
import { tagService } from '@glean/api-client'
import { createMockTag, createMockTagWithCounts } from '../helpers/mockData'

describe('tagStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTagStore.setState({
      tags: [],
      loading: false,
      error: null,
    })
  })

  it('should have correct initial state', () => {
    const state = useTagStore.getState()
    expect(state.tags).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  describe('fetchTags', () => {
    it('should fetch tags successfully', async () => {
      const tags = [createMockTagWithCounts({ id: 't1', name: 'React', bookmark_count: 3, entry_count: 0 })]
      vi.mocked(tagService.getTags).mockResolvedValue({ tags })

      await useTagStore.getState().fetchTags()

      expect(useTagStore.getState().tags).toEqual(tags)
      expect(useTagStore.getState().loading).toBe(false)
    })

    it('should set error on failure', async () => {
      vi.mocked(tagService.getTags).mockRejectedValue(new Error('Network error'))

      await useTagStore.getState().fetchTags()

      expect(useTagStore.getState().error).toBe('Failed to load tags')
      expect(useTagStore.getState().loading).toBe(false)
    })
  })

  describe('createTag', () => {
    it('should create a tag and refresh', async () => {
      const tag = createMockTag({ id: 't1', name: 'New' })
      vi.mocked(tagService.createTag).mockResolvedValue(tag)
      vi.mocked(tagService.getTags).mockResolvedValue({ tags: [createMockTagWithCounts({ ...tag, bookmark_count: 0, entry_count: 0 })] })

      const result = await useTagStore.getState().createTag({ name: 'New' })

      expect(result).toEqual(tag)
      expect(tagService.createTag).toHaveBeenCalledWith({ name: 'New' })
      expect(tagService.getTags).toHaveBeenCalled()
    })

    it('should return null on failure', async () => {
      vi.mocked(tagService.createTag).mockRejectedValue(new Error('fail'))

      const result = await useTagStore.getState().createTag({ name: 'New' })

      expect(result).toBeNull()
      expect(useTagStore.getState().error).toBe('Failed to create tag')
    })
  })

  describe('updateTag', () => {
    it('should update a tag and refresh', async () => {
      const tag = createMockTag({ id: 't1', name: 'Updated' })
      vi.mocked(tagService.updateTag).mockResolvedValue(tag)
      vi.mocked(tagService.getTags).mockResolvedValue({ tags: [] })

      const result = await useTagStore.getState().updateTag('t1', { name: 'Updated' })

      expect(result).toEqual(tag)
      expect(tagService.updateTag).toHaveBeenCalledWith('t1', { name: 'Updated' })
    })

    it('should return null on failure', async () => {
      vi.mocked(tagService.updateTag).mockRejectedValue(new Error('fail'))

      const result = await useTagStore.getState().updateTag('t1', { name: 'Updated' })

      expect(result).toBeNull()
      expect(useTagStore.getState().error).toBe('Failed to update tag')
    })
  })

  describe('deleteTag', () => {
    it('should delete a tag and refresh', async () => {
      vi.mocked(tagService.deleteTag).mockResolvedValue(undefined)
      vi.mocked(tagService.getTags).mockResolvedValue({ tags: [] })

      const result = await useTagStore.getState().deleteTag('t1')

      expect(result).toBe(true)
      expect(tagService.deleteTag).toHaveBeenCalledWith('t1')
    })

    it('should return false on failure', async () => {
      vi.mocked(tagService.deleteTag).mockRejectedValue(new Error('fail'))

      const result = await useTagStore.getState().deleteTag('t1')

      expect(result).toBe(false)
      expect(useTagStore.getState().error).toBe('Failed to delete tag')
    })
  })

  describe('batchAddTag', () => {
    it('should batch add tag and return affected count', async () => {
      vi.mocked(tagService.batchOperation).mockResolvedValue({ affected: 3 })
      vi.mocked(tagService.getTags).mockResolvedValue({ tags: [] })

      const result = await useTagStore.getState().batchAddTag('t1', 'bookmark', ['b1', 'b2', 'b3'])

      expect(result).toBe(3)
      expect(tagService.batchOperation).toHaveBeenCalledWith({
        action: 'add',
        tag_id: 't1',
        target_type: 'bookmark',
        target_ids: ['b1', 'b2', 'b3'],
      })
    })

    it('should return 0 on failure', async () => {
      vi.mocked(tagService.batchOperation).mockRejectedValue(new Error('fail'))

      const result = await useTagStore.getState().batchAddTag('t1', 'bookmark', ['b1'])

      expect(result).toBe(0)
    })
  })

  describe('batchRemoveTag', () => {
    it('should batch remove tag and return affected count', async () => {
      vi.mocked(tagService.batchOperation).mockResolvedValue({ affected: 2 })
      vi.mocked(tagService.getTags).mockResolvedValue({ tags: [] })

      const result = await useTagStore.getState().batchRemoveTag('t1', 'user_entry', ['e1', 'e2'])

      expect(result).toBe(2)
      expect(tagService.batchOperation).toHaveBeenCalledWith({
        action: 'remove',
        tag_id: 't1',
        target_type: 'user_entry',
        target_ids: ['e1', 'e2'],
      })
    })

    it('should return 0 on failure', async () => {
      vi.mocked(tagService.batchOperation).mockRejectedValue(new Error('fail'))

      const result = await useTagStore.getState().batchRemoveTag('t1', 'bookmark', ['b1'])

      expect(result).toBe(0)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      useTagStore.setState({
        tags: [createMockTagWithCounts({ id: 't1', name: 'Tag', bookmark_count: 1, entry_count: 0 })],
        loading: true,
        error: 'some error',
      })

      useTagStore.getState().reset()

      const state = useTagStore.getState()
      expect(state.tags).toEqual([])
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
    })
  })
})
