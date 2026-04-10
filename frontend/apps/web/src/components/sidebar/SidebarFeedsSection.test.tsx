import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarFeedsSection } from './SidebarFeedsSection'

vi.mock('@glean/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('../../hooks/useSubscriptions', () => ({
  useBatchDeleteSubscriptions: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteSubscription: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRefreshFeed: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateSubscription: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../../hooks/useEntries', () => ({
  useMarkAllRead: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../../stores/folderStore', () => ({
  useFolderStore: () => ({
    deleteFolder: vi.fn(),
    updateFolder: vi.fn(),
    reorderFolders: vi.fn(),
  }),
}))

describe('SidebarFeedsSection', () => {
  it('renders today-board directly below smart and marks it active when selected', () => {
    render(
      <SidebarFeedsSection
        isSidebarOpen
        isMobileSidebarOpen={false}
        isFeedsSectionExpanded
        onToggleFeedsSection={vi.fn()}
        onAddFeed={vi.fn()}
        onCreateFolder={vi.fn()}
        onRefreshAll={vi.fn()}
        refreshAllPending={false}
        onImportOPML={vi.fn()}
        importPending={false}
        onExportOPML={vi.fn()}
        exportPending={false}
        onFeedSelect={vi.fn()}
        onFeedHover={vi.fn()}
        onFolderHover={vi.fn()}
        onSmartViewSelect={vi.fn()}
        onTodayBoardViewSelect={vi.fn()}
        isSmartView={false}
        isTodayBoardView
        isReaderPage
        currentFeedId={undefined}
        currentFolderId={undefined}
        feedFolders={[]}
        subscriptionsByFolder={{}}
        ungroupedSubscriptions={[]}
        expandedFolders={new Set()}
        toggleFolder={vi.fn()}
        draggedFeed={null}
        setDraggedFeed={vi.fn()}
        dragOverFolderId={null}
        setDragOverFolderId={vi.fn()}
      />
    )

    const smartButton = screen.getByRole('button', { name: 'smart' })
    const todayBoardButton = screen.getByRole('button', { name: 'todayBoard' })
    const allFeedsButton = screen.getByRole('button', { name: 'allFeeds' })

    expect(
      smartButton.compareDocumentPosition(todayBoardButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      todayBoardButton.compareDocumentPosition(allFeedsButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(todayBoardButton.className).toContain('bg-primary/10')
    expect(smartButton.className).toContain('text-muted-foreground')
  })
})
