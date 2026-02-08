import { useTranslation } from '@glean/i18n'
import { MenuItem, MenuSeparator } from '@glean/ui'
import { ChevronRight, Plus, Tag, Trash2, Pencil } from 'lucide-react'
import type { TagWithCounts } from '@glean/types'
import { SidebarTagItem } from './SidebarItem'

interface SidebarTagsSectionProps {
  isSidebarOpen: boolean
  isMobileSidebarOpen: boolean
  isTagSectionExpanded: boolean
  onToggleTagSection: () => void
  tags: TagWithCounts[]
  currentBookmarkTagId?: string
  onSelectTag: (tagId?: string) => void
  onCreateTag: () => void
  onEditTag: (tag: TagWithCounts) => void
  onDeleteTag: (tag: TagWithCounts) => void
}

export function SidebarTagsSection({
  isSidebarOpen,
  isMobileSidebarOpen,
  isTagSectionExpanded,
  onToggleTagSection,
  tags,
  currentBookmarkTagId,
  onSelectTag,
  onCreateTag,
  onEditTag,
  onDeleteTag,
}: SidebarTagsSectionProps) {
  const { t } = useTranslation(['feeds', 'bookmarks'])

  return (
    <>
      {(isSidebarOpen || isMobileSidebarOpen) && (
        <div className="mb-1 flex items-center justify-between md:mb-2">
          <button
            onClick={onToggleTagSection}
            className="text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 px-2 text-[10px] font-semibold tracking-wider uppercase transition-colors md:px-3 md:text-xs"
            aria-label={isTagSectionExpanded ? 'Collapse tags section' : 'Expand tags section'}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isTagSectionExpanded ? 'rotate-90' : ''}`}
            />
            {t('sidebar.tags')}
          </button>
          <button
            onClick={onCreateTag}
            className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
            title={t('sidebar.tags')}
            aria-label="Create new tag"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {!isSidebarOpen && !isMobileSidebarOpen && (
        <button
          onClick={onCreateTag}
          className="group text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200"
          title="Tags"
          aria-label="Create new tag"
        >
          <Tag className="h-5 w-5" />
        </button>
      )}

      {isTagSectionExpanded && (
        <>
          {(isSidebarOpen || isMobileSidebarOpen) && tags.length > 0 && (
            <div className="space-y-0.5">
              {tags.map((tag) => (
                <SidebarTagItem
                  key={tag.id}
                  color={tag.color}
                  icon={<Tag />}
                  label={tag.name}
                  isActive={currentBookmarkTagId === tag.id}
                  onClick={() => onSelectTag(tag.id)}
                  badge={tag.bookmark_count}
                  menuContent={
                    <>
                      <MenuItem onClick={() => onEditTag(tag)}>
                        <Pencil className="h-4 w-4" />
                        <span>{t('common.edit')}</span>
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem variant="destructive" onClick={() => onDeleteTag(tag)}>
                        <Trash2 className="h-4 w-4" />
                        <span>{t('common.delete')}</span>
                      </MenuItem>
                    </>
                  }
                />
              ))}
            </div>
          )}

          {(isSidebarOpen || isMobileSidebarOpen) && tags.length === 0 && (
            <p className="text-muted-foreground/60 px-4 py-1.5 text-xs md:px-5 md:py-2">
              {t('common.noTagsYet')}
            </p>
          )}
        </>
      )}
    </>
  )
}
