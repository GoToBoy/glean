import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '../../services/ai'
import { createMockClient } from '../helpers'

describe('AIService', () => {
  let service: AIService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new AIService(mockClient)
  })

  it('should get today summary', async () => {
    const summary = {
      id: 'summary-1',
      user_id: 'user-1',
      date: '2026-04-17',
      timezone: 'UTC',
      model: 'local-qwen',
      title: 'Daily Brief',
      summary: 'Read this first.',
      highlights: [],
      topics: [],
      recommended_entry_ids: [],
      metadata: {},
      created_at: '2026-04-17T00:00:00Z',
      updated_at: '2026-04-17T00:00:00Z',
    }
    vi.mocked(mockClient.get).mockResolvedValue(summary)

    const result = await service.getTodaySummary({ date: '2026-04-17' })

    expect(mockClient.get).toHaveBeenCalledWith('/ai/today-summary', {
      params: { date: '2026-04-17' },
    })
    expect(result).toEqual(summary)
  })
})
