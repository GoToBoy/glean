import type {
  FeedFetchLatestRunResponse,
  FeedFetchRun,
  FeedFetchRunHistoryResponse,
  FeedFetchStageEvent,
} from '@glean/types'

export const FEED_FETCH_STAGE_SEQUENCE = [
  'queue_wait',
  'resolve_attempt_urls',
  'fetch_xml',
  'parse_feed',
  'process_entries',
  'backfill_content',
  'store_results',
  'complete',
] as const

const FEED_FETCH_STAGE_LABELS: Record<string, string> = {
  queue_wait: 'Queued',
  resolve_attempt_urls: 'Resolve source path',
  fetch_xml: 'Fetch feed XML',
  parse_feed: 'Parse feed',
  process_entries: 'Process entries',
  backfill_content: 'Backfill content',
  store_results: 'Store results',
  complete: 'Complete',
}

const FEED_FETCH_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  in_progress: 'Refreshing',
  not_modified: 'No changes',
  success: 'Completed',
  error: 'Failed',
}

export interface FeedFetchProgressViewModel {
  statusLabel: string
  stageLabel: string
  stageProgressLabel: string | null
  summaryText: string | null
  estimatedStartLabel: string | null
  estimatedFinishLabel: string | null
  nextFetchLabel: string | null
  predictionLabel: string | null
  progressPercent: number
  isActive: boolean
}

export interface FeedFetchProgressStageItem {
  label: string
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  summary?: string | null
  startedLabel?: string | null
  finishedLabel?: string | null
  durationLabel?: string | null
}

export interface FeedFetchProgressDetailItem {
  label: string
  value: string
}

export interface FeedFetchProgressHistoryItem {
  id: string
  title: string
  description?: string | null
  statusLabel?: string | null
  durationLabel?: string | null
}

export function formatFeedFetchDateTime(value: string | null | undefined): string | null {
  if (!value) return null
  return new Date(value).toLocaleString()
}

export function formatFeedFetchDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
): string | null {
  if (!startedAt || !finishedAt) return null
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

export function formatFeedFetchStageLabel(stageName: string | null | undefined): string {
  if (!stageName) return FEED_FETCH_STAGE_LABELS.queue_wait
  return FEED_FETCH_STAGE_LABELS[stageName] ?? stageName.split('_').join(' ')
}

export function getFeedFetchStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Not started'
  return FEED_FETCH_STATUS_LABELS[status] ?? status
}

export function mapFeedFetchRunToViewModel(
  run: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined
): FeedFetchProgressViewModel | null {
  if (!run) return null
  if (!run.status) {
    return {
      statusLabel: run.next_fetch_at ? 'Scheduled' : 'Not started',
      stageLabel: run.next_fetch_at ? 'Waiting for next fetch window' : 'No persisted fetch run yet',
      stageProgressLabel: null,
      summaryText: null,
      estimatedStartLabel: formatFeedFetchDateTime(run.next_fetch_at),
      estimatedFinishLabel: null,
      nextFetchLabel: formatFeedFetchDateTime(run.next_fetch_at),
      predictionLabel: null,
      progressPercent: 0,
      isActive: false,
    }
  }

  const currentStage = run.current_stage ?? (run.status === 'queued' ? 'queue_wait' : 'complete')
  const stageIndex = Math.max(
    0,
    FEED_FETCH_STAGE_SEQUENCE.indexOf(
      currentStage as (typeof FEED_FETCH_STAGE_SEQUENCE)[number]
    )
  )
  const progressPercent =
    run.status === 'success' || run.status === 'not_modified'
      ? 100
      : Math.round((stageIndex / (FEED_FETCH_STAGE_SEQUENCE.length - 1)) * 100)
  const stageProgressNumerator =
    run.status === 'success' || run.status === 'not_modified'
      ? FEED_FETCH_STAGE_SEQUENCE.length - 1
      : Math.min(stageIndex + 1, FEED_FETCH_STAGE_SEQUENCE.length - 1)

  const summary = run.summary_json ?? {}
  const summaryParts = [
    typeof summary.new_entries === 'number' ? `New ${summary.new_entries}` : null,
    typeof summary.total_entries === 'number' ? `Total ${summary.total_entries}` : null,
    typeof summary.backfill_failed_count === 'number' && summary.backfill_failed_count > 0
      ? `Backfill failed ${summary.backfill_failed_count}`
      : null,
    summary.fallback_used ? 'RSSHub fallback used' : null,
  ].filter(Boolean)

  return {
    statusLabel: getFeedFetchStatusLabel(run.status),
    stageLabel: formatFeedFetchStageLabel(currentStage),
    stageProgressLabel: `${stageProgressNumerator}/${FEED_FETCH_STAGE_SEQUENCE.length - 1}`,
    summaryText: summaryParts.length > 0 ? summaryParts.join(' · ') : null,
    estimatedStartLabel: formatFeedFetchDateTime(run.predicted_start_at),
    estimatedFinishLabel: formatFeedFetchDateTime(run.predicted_finish_at),
    nextFetchLabel: formatFeedFetchDateTime(run.next_fetch_at),
    predictionLabel:
      run.predicted_start_at || run.predicted_finish_at ? 'Prediction based on recent runs' : null,
    progressPercent,
    isActive: run.status === 'queued' || run.status === 'in_progress',
  }
}

export function mapFeedFetchStageEventsToItems(
  stages: FeedFetchStageEvent[] | null | undefined
): FeedFetchProgressStageItem[] {
  return (stages ?? []).map((stage) => ({
    label: formatFeedFetchStageLabel(stage.stage_name),
    status: normalizeStageStatus(stage.status),
    summary: stage.summary,
    startedLabel: formatFeedFetchDateTime(stage.started_at),
    finishedLabel: formatFeedFetchDateTime(stage.finished_at),
    durationLabel: formatFeedFetchDuration(stage.started_at, stage.finished_at),
  }))
}

export function buildFeedFetchProgressDetails(args: {
  latestRun: FeedFetchLatestRunResponse | FeedFetchRun | null | undefined
  fallbackLastFinishedAt?: string | null
  fallbackLastSuccessAt?: string | null
}): FeedFetchProgressDetailItem[] {
  const { latestRun, fallbackLastFinishedAt, fallbackLastSuccessAt } = args
  return [
    {
      label: 'Path',
      value:
        latestRun?.path_kind === 'rsshub_primary'
          ? 'RSSHub primary'
          : latestRun?.path_kind === 'rsshub_fallback'
            ? 'RSSHub fallback'
            : latestRun?.path_kind === 'direct_feed'
              ? 'Direct feed'
              : 'Unknown',
    },
    {
      label: 'Last finished',
      value:
        formatFeedFetchDateTime(latestRun?.finished_at) ??
        formatFeedFetchDateTime(fallbackLastFinishedAt) ??
        'Never',
    },
    {
      label: 'Last success',
      value:
        formatFeedFetchDateTime(
          latestRun?.finished_at && latestRun?.status !== 'error'
            ? latestRun.finished_at
            : fallbackLastSuccessAt
        ) ?? 'Never',
    },
    {
      label: 'Next fetch',
      value: formatFeedFetchDateTime(latestRun?.next_fetch_at) ?? 'Not scheduled yet',
    },
  ]
}

export function buildFeedFetchHistoryItems(
  history: FeedFetchRunHistoryResponse | null | undefined
): FeedFetchProgressHistoryItem[] {
  return (
    history?.items.slice(0, 10).map((run) => ({
      id: run.id,
      title: `${getFeedFetchStatusLabel(run.status)} · ${formatFeedFetchStageLabel(run.current_stage)}`,
      description:
        [
          formatFeedFetchDateTime(run.finished_at ?? run.started_at ?? run.queue_entered_at),
          mapFeedFetchRunToViewModel(run)?.summaryText ?? null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      statusLabel: getFeedFetchStatusLabel(run.status),
      durationLabel: formatFeedFetchDuration(run.started_at, run.finished_at),
    })) ?? []
  )
}

function normalizeStageStatus(
  status: string | null | undefined
): FeedFetchProgressStageItem['status'] {
  if (status === 'running') return 'running'
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  if (status === 'skipped') return 'skipped'
  return 'pending'
}
