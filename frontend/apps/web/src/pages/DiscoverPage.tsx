import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { discoverService } from '@glean/api-client'
import { useTranslation } from '@glean/i18n'
import { Button } from '@glean/ui'
import { Compass, RefreshCw } from 'lucide-react'
import { clearSubscriptionCache, subscriptionKeys } from '../hooks/useSubscriptions'

const discoverKeys = {
  all: ['discover'] as const,
  list: (refresh?: boolean) => [...discoverKeys.all, 'list', refresh ?? false] as const,
}

export default function DiscoverPage() {
  const { t } = useTranslation('feeds')
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: discoverKeys.list(false),
    queryFn: () => discoverService.listSources({ limit: 30 }),
  })

  const refreshMutation = useMutation({
    mutationFn: () => discoverService.listSources({ limit: 30, refresh: true }),
    onSuccess: (nextData) => {
      queryClient.setQueryData(discoverKeys.list(false), nextData)
    },
  })

  const subscribeMutation = useMutation({
    mutationFn: (candidateId: string) => discoverService.markSubscribed(candidateId),
    onSuccess: (_, candidateId) => {
      queryClient.setQueryData(discoverKeys.list(false), (prev: typeof data) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.filter((item) => item.id !== candidateId),
          total: Math.max(0, prev.total - 1),
        }
      })
      clearSubscriptionCache()
      queryClient.invalidateQueries({ queryKey: discoverKeys.all })
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (candidateId: string) =>
      discoverService.submitFeedback(candidateId, { feedback_type: 'dismiss_source' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoverKeys.all })
    },
  })

  const items = useMemo(() => data?.items ?? [], [data?.items])
  const topicLabel = (topic: string) => {
    const key = `discover.topics.${topic}`
    const translated = t(key)
    return translated === key ? topic : translated
  }
  const displayReason = (reason: string | null) => {
    if (!reason) return null
    if (reason.toLowerCase().includes('curated seed')) return null
    return reason
  }

  return (
    <div className="bg-background h-full overflow-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-foreground text-3xl font-bold">{t('discover.title')}</h1>
              <p className="text-muted-foreground text-sm">
                {t('discover.subtitle')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshMutation.isPending || isFetching ? 'animate-spin' : ''}`}
            />
            {t('discover.refresh')}
          </Button>
        </div>

        {(isLoading || isFetching) && items.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border p-6 text-sm">
            {t('discover.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border p-6 text-sm">
            {t('discover.empty')}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((candidate) => {
              const reason = displayReason(candidate.reason)
              return (
                <div
                  key={candidate.id}
                  className="bg-card rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                    <div className="text-foreground truncate text-sm font-medium">
                      {candidate.title || candidate.feed_url}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{candidate.feed_url}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-600">
                        {t('discover.topic')}: {topicLabel(candidate.topic)}
                      </span>
                      <span className="rounded bg-green-500/10 px-2 py-0.5 text-green-600">
                        {t('discover.score')}: {candidate.discovery_score.toFixed(2)}
                      </span>
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-600">
                        {t('discover.quality')}: {candidate.quality_score.toFixed(2)}
                      </span>
                    </div>
                      {reason ? <p className="text-muted-foreground mt-2 text-xs">{reason}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => subscribeMutation.mutate(candidate.id)}
                        disabled={subscribeMutation.isPending}
                      >
                        {t('discover.subscribe')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismissMutation.mutate(candidate.id)}
                        disabled={dismissMutation.isPending}
                      >
                        {t('discover.dismiss')}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
