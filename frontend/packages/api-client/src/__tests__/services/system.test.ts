import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SystemService } from '../../services/system'
import { createMockClient } from '../helpers'

describe('SystemService', () => {
  let service: SystemService
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockClient()
    service = new SystemService(mockClient)
  })

  it('should get vectorization status', async () => {
    const status = {
      enabled: true,
      status: 'idle',
      has_error: false,
      error_message: null,
      rebuild_progress: null,
    }
    vi.mocked(mockClient.get).mockResolvedValue(status)

    const result = await service.getVectorizationStatus()

    expect(mockClient.get).toHaveBeenCalledWith('/system/vectorization-status')
    expect(result).toEqual(status)
  })
})
