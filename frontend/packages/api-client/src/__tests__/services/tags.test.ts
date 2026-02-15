import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TagService } from '../../services/tags'
import { createMockClient } from '../helpers'

describe('TagService', () => {
  let service: TagService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new TagService(mockClient)
  })

  it('should get all tags', async () => {
    const response = { tags: [{ id: 't1', name: 'React' }] }
    vi.mocked(mockClient.get).mockResolvedValue(response)

    const result = await service.getTags()

    expect(mockClient.get).toHaveBeenCalledWith('/tags')
    expect(result).toEqual(response)
  })

  it('should get a specific tag', async () => {
    const tag = { id: 't1', name: 'React' }
    vi.mocked(mockClient.get).mockResolvedValue(tag)

    const result = await service.getTag('t1')

    expect(mockClient.get).toHaveBeenCalledWith('/tags/t1')
    expect(result).toEqual(tag)
  })

  it('should create a tag', async () => {
    const tag = { id: 't1', name: 'New Tag' }
    vi.mocked(mockClient.post).mockResolvedValue(tag)

    const result = await service.createTag({ name: 'New Tag' })

    expect(mockClient.post).toHaveBeenCalledWith('/tags', { name: 'New Tag' })
    expect(result).toEqual(tag)
  })

  it('should update a tag', async () => {
    const tag = { id: 't1', name: 'Updated' }
    vi.mocked(mockClient.patch).mockResolvedValue(tag)

    const result = await service.updateTag('t1', { name: 'Updated' })

    expect(mockClient.patch).toHaveBeenCalledWith('/tags/t1', { name: 'Updated' })
    expect(result).toEqual(tag)
  })

  it('should delete a tag', async () => {
    vi.mocked(mockClient.delete).mockResolvedValue(undefined)

    await service.deleteTag('t1')

    expect(mockClient.delete).toHaveBeenCalledWith('/tags/t1')
  })

  it('should perform batch operation', async () => {
    const response = { affected: 3 }
    vi.mocked(mockClient.post).mockResolvedValue(response)

    const result = await service.batchOperation({
      action: 'add',
      tag_id: 't1',
      target_type: 'bookmark',
      target_ids: ['b1', 'b2', 'b3'],
    })

    expect(mockClient.post).toHaveBeenCalledWith('/tags/batch', {
      action: 'add',
      tag_id: 't1',
      target_type: 'bookmark',
      target_ids: ['b1', 'b2', 'b3'],
    })
    expect(result).toEqual(response)
  })
})
