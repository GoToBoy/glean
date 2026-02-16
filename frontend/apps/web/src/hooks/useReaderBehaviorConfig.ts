import { useQuery } from '@tanstack/react-query'
import { systemService, type ReaderBehaviorConfig } from '@glean/api-client'

export const READER_BEHAVIOR_CONFIG_KEY = ['reader-behavior-config']

export function useReaderBehaviorConfig() {
  return useQuery<ReaderBehaviorConfig>({
    queryKey: READER_BEHAVIOR_CONFIG_KEY,
    queryFn: () => systemService.getReaderBehaviorConfig(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
