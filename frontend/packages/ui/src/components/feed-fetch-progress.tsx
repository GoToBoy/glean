'use client'

import { Badge } from './Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './Card'
import { Progress, ProgressIndicator, ProgressTrack } from './progress'

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

export interface FeedFetchProgressProps {
  title: string
  statusLabel: string
  stageLabel: string
  stageProgressLabel?: string | null
  progressPercent: number
  summaryText?: string | null
  estimatedStartLabel?: string | null
  estimatedFinishLabel?: string | null
  predictionLabel?: string | null
  stages?: FeedFetchProgressStageItem[]
  details?: FeedFetchProgressDetailItem[]
  history?: FeedFetchProgressHistoryItem[]
  historyTitle?: string
  emptyHistoryLabel?: string
  historyLoading?: boolean
}

export interface FeedFetchInlineStatusProps {
  statusLabel: string
  stageLabel: string
  stageProgressLabel?: string | null
  progressPercent: number
  summaryText?: string | null
  estimatedStartLabel?: string | null
  estimatedFinishLabel?: string | null
  nextFetchLabel?: string | null
}

export function FeedFetchProgress({
  title,
  statusLabel,
  stageLabel,
  stageProgressLabel,
  progressPercent,
  summaryText,
  estimatedStartLabel,
  estimatedFinishLabel,
  predictionLabel,
  stages = [],
  details = [],
  history = [],
  historyTitle = 'Recent runs',
  emptyHistoryLabel = 'No fetch history yet.',
  historyLoading = false,
}: FeedFetchProgressProps) {
  return (
    <Card className="border-border/80">
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{stageLabel}</CardDescription>
            {stageProgressLabel ? (
              <p className="text-muted-foreground text-xs">Stage progress: {stageProgressLabel}</p>
            ) : null}
          </div>
          <Badge variant={statusVariant(statusLabel)}>{statusLabel}</Badge>
        </div>
        <Progress aria-label={title} value={progressPercent}>
          <ProgressTrack>
            <ProgressIndicator style={{ width: `${progressPercent}%` }} />
          </ProgressTrack>
        </Progress>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {summaryText ? <p className="text-foreground/80">{summaryText}</p> : null}
        {estimatedStartLabel || estimatedFinishLabel ? (
          <div className="text-muted-foreground grid gap-1">
            {estimatedStartLabel ? <p>Estimated start: {estimatedStartLabel}</p> : null}
            {estimatedFinishLabel ? <p>Estimated finish: {estimatedFinishLabel}</p> : null}
            {predictionLabel ? <p>{predictionLabel}</p> : null}
          </div>
        ) : null}
        {details.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="rounded-lg border px-3 py-2">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">{detail.label}</p>
                <p className="mt-1 font-medium">{detail.value}</p>
              </div>
            ))}
          </div>
        ) : null}
        {stages.length > 0 ? (
          <div className="space-y-2">
            {stages.map((stage) => (
              <div
                key={`${stage.label}-${stage.status}`}
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="font-medium">{stage.label}</p>
                  {stage.summary ? (
                    <p className="text-muted-foreground text-xs">{stage.summary}</p>
                  ) : null}
                  {(stage.startedLabel || stage.finishedLabel || stage.durationLabel) ? (
                    <p className="text-muted-foreground text-xs">
                      {[stage.startedLabel ? `Start ${stage.startedLabel}` : null, stage.finishedLabel ? `Finish ${stage.finishedLabel}` : null, stage.durationLabel ? `Duration ${stage.durationLabel}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                <Badge size="sm" variant={stageVariant(stage.status)}>
                  {stage.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">{historyTitle}</p>
          {historyLoading ? (
            <p className="text-muted-foreground text-sm">Loading recent runs…</p>
          ) : history.length > 0 ? (
            history.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="font-medium">{item.title}</p>
                  {item.description ? (
                    <p className="text-muted-foreground text-xs">{item.description}</p>
                  ) : null}
                  {item.durationLabel ? (
                    <p className="text-muted-foreground text-xs">Duration {item.durationLabel}</p>
                  ) : null}
                </div>
                {item.statusLabel ? (
                  <Badge size="sm" variant={statusVariant(item.statusLabel)}>
                    {item.statusLabel}
                  </Badge>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">{emptyHistoryLabel}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function FeedFetchInlineStatus({
  statusLabel,
  stageLabel,
  stageProgressLabel,
  progressPercent,
  summaryText,
  estimatedStartLabel,
  estimatedFinishLabel,
  nextFetchLabel,
}: FeedFetchInlineStatusProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="sm" variant={statusVariant(statusLabel)}>
          {statusLabel}
        </Badge>
        <span className="text-muted-foreground text-xs">{stageLabel}</span>
        {stageProgressLabel ? (
          <span className="text-muted-foreground text-xs">Stage {stageProgressLabel}</span>
        ) : null}
        {estimatedStartLabel ? (
          <span className="text-muted-foreground text-xs">ETA start: {estimatedStartLabel}</span>
        ) : null}
        {estimatedFinishLabel ? (
          <span className="text-muted-foreground text-xs">ETA finish: {estimatedFinishLabel}</span>
        ) : null}
        {nextFetchLabel ? (
          <span className="text-muted-foreground text-xs">Next fetch: {nextFetchLabel}</span>
        ) : null}
      </div>
      {summaryText ? <p className="text-xs text-foreground/80">{summaryText}</p> : null}
      <Progress aria-label="Feed fetch progress" value={progressPercent}>
        <ProgressTrack className="h-1.5">
          <ProgressIndicator style={{ width: `${progressPercent}%` }} />
        </ProgressTrack>
      </Progress>
    </div>
  )
}

function statusVariant(statusLabel: string) {
  if (statusLabel === 'Completed' || statusLabel === 'No changes') return 'success'
  if (statusLabel === 'Failed') return 'error'
  if (statusLabel === 'Queued') return 'secondary'
  return 'info'
}

function stageVariant(status: FeedFetchProgressStageItem['status']) {
  if (status === 'success') return 'success'
  if (status === 'error') return 'error'
  if (status === 'running') return 'info'
  if (status === 'skipped') return 'outline'
  return 'secondary'
}
