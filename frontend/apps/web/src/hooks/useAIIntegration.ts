import { useQuery } from '@tanstack/react-query'
import { aiService, systemService } from '@glean/api-client'
import type { AIDailySummaryResponse, AIIntegrationStatusResponse } from '@glean/types'

export const AI_INTEGRATION_STATUS_KEY = ['ai-integration-status']

export const aiSummaryKeys = {
  all: ['ai-summary'] as const,
  today: (date: string) => [...aiSummaryKeys.all, 'today', date] as const,
}

export function useAIIntegrationStatus() {
  return useQuery<AIIntegrationStatusResponse>({
    queryKey: AI_INTEGRATION_STATUS_KEY,
    queryFn: () => systemService.getAIIntegrationStatus(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

export function useAITodaySummary(params: { date: string; enabled: boolean }) {
  return useQuery<AIDailySummaryResponse>({
    queryKey: aiSummaryKeys.today(params.date),
    queryFn: () => aiService.getTodaySummary({ date: params.date }),
    enabled: params.enabled,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
