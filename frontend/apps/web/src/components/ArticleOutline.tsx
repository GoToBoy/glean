import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { List, X, ChevronRight } from 'lucide-react'

interface HeadingItem {
  id: string
  text: string
  level: number
  element: HTMLElement
}

interface ArticleOutlineProps {
  /** Reference to the article content container */
  contentRef: React.RefObject<HTMLElement | null>
  /** Reference to the scroll container */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  /** Whether the component is in mobile view */
  isMobile?: boolean
  /** Class name for positioning */
  className?: string
  /** Callback when headings are extracted, reports whether outline has content */
  onHasHeadings?: (hasHeadings: boolean) => void
}

/**
 * Hook to track reading progress
 */
function useReadingProgress(scrollContainerRef: React.RefObject<HTMLDivElement | null>) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const maxScroll = scrollHeight - clientHeight
      if (maxScroll <= 0) {
        setProgress(100)
        return
      }
      const currentProgress = Math.round((scrollTop / maxScroll) * 100)
      setProgress(Math.min(100, Math.max(0, currentProgress)))
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Initial calculation

    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [scrollContainerRef])

  return progress
}

/**
 * Extract headings from article content
 */
function extractHeadings(container: HTMLElement): HeadingItem[] {
  const headings: HeadingItem[] = []
  const elements = container.querySelectorAll('h1, h2, h3, h4')

  elements.forEach((el, index) => {
    const element = el as HTMLElement
    const level = parseInt(element.tagName.charAt(1))
    const text = element.textContent?.trim() || ''

    if (text) {
      // Generate or use existing ID
      let id = element.id
      if (!id) {
        id = `heading-${index}-${text.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}`
        element.id = id
      }

      headings.push({ id, text, level, element })
    }
  })

  return headings
}

/**
 * ArticleOutline component
 *
 * Displays a table of contents extracted from the article headings.
 * Features smooth scroll-to-heading and active heading tracking.
 * Shows on scroll, hides after idle.
 */
export function ArticleOutline({
  contentRef,
  scrollContainerRef,
  isMobile = false,
  className = '',
  onHasHeadings,
}: ArticleOutlineProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(true) // Start visible (unblurred) on initial load
  const [isHovered, setIsHovered] = useState(false)
  const [isInInitialPeriod, setIsInInitialPeriod] = useState(true) // Track initial 5-second visibility period
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null) // For the initial 5s delay
  // Flag to prevent scroll handler from updating activeId during programmatic scroll
  const isScrollingToHeadingRef = useRef(false)
  const scrollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Track reading progress
  const progress = useReadingProgress(scrollContainerRef)

  // Track isHovered in a ref for use in initial timer callback
  const isHoveredRef = useRef(isHovered)
  useEffect(() => {
    isHoveredRef.current = isHovered
  }, [isHovered])

  // Initial 5 second delay before blurring (desktop only)
  useEffect(() => {
    if (isMobile) return
    
    // Start the 5 second timer on initial load
    initialHideTimeoutRef.current = setTimeout(() => {
      setIsInInitialPeriod(false) // End the initial period
      if (!isHoveredRef.current) {
        setIsVisible(false)
      }
    }, 5000)

    return () => {
      if (initialHideTimeoutRef.current) {
        clearTimeout(initialHideTimeoutRef.current)
      }
    }
  }, [isMobile])

  // Extract headings when content changes
  useEffect(() => {
    if (contentRef.current) {
      // Wait for content to render
      const timer = setTimeout(() => {
        if (contentRef.current) {
          const extracted = extractHeadings(contentRef.current)
          setHeadings(extracted)
          onHasHeadings?.(extracted.length > 0)
          if (extracted.length > 0) {
            setActiveId(extracted[0].id)
          }
        }
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [contentRef, onHasHeadings])

  // Track active heading based on scroll position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer || headings.length === 0) return

    const handleScroll = () => {
      // Skip updating activeId if we're in the middle of a programmatic scroll
      if (isScrollingToHeadingRef.current) return

      const scrollTop = scrollContainer.scrollTop
      const containerRect = scrollContainer.getBoundingClientRect()

      // Find the heading that's currently in view
      let currentHeading: HeadingItem | null = null

      for (const heading of headings) {
        const rect = heading.element.getBoundingClientRect()
        const relativeTop = rect.top - containerRect.top

        // Consider a heading "active" when it's in the top third of the viewport
        if (relativeTop <= containerRect.height * 0.33) {
          currentHeading = heading
        } else {
          break
        }
      }

      if (currentHeading) {
        setActiveId(currentHeading.id)
      } else if (scrollTop < 50) {
        // At the very top, activate the first heading
        setActiveId(headings[0]?.id || null)
      }
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Initial check

    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [headings, scrollContainerRef])

  // Show outline on fast scroll, hide on slow scroll (desktop only)
  // Initially visible, blur when user starts slow scrolling, unblur on fast scroll
  useEffect(() => {
    if (isMobile) return

    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    let lastScrollTop = scrollContainer.scrollTop
    let lastScrollTime = performance.now()
    // Threshold in viewport heights per second (e.g., 3.5 = scrolling 3.5x viewport height per second)
    const VELOCITY_THRESHOLD_VH_PER_SEC = 4

    const handleScroll = () => {
      const currentScrollTop = scrollContainer.scrollTop
      const currentTime = performance.now()
      const timeDelta = currentTime - lastScrollTime
      const viewportHeight = scrollContainer.clientHeight
      
      if (timeDelta > 0 && viewportHeight > 0) {
        const scrollDelta = Math.abs(currentScrollTop - lastScrollTop)
        // Convert to viewport heights per second for resolution-independent measurement
        const velocityVhPerSec = (scrollDelta / viewportHeight) / (timeDelta / 1000)
        
        if (velocityVhPerSec > VELOCITY_THRESHOLD_VH_PER_SEC) {
          // Fast scroll - show (unblur) outline
          setIsVisible(true)
          setIsInInitialPeriod(false) // End initial period on user interaction
          // Clear any existing hide timeouts (including initial)
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
          }
          if (initialHideTimeoutRef.current) {
            clearTimeout(initialHideTimeoutRef.current)
          }
          // Set hide timeout if not hovered
          if (!isHovered) {
            hideTimeoutRef.current = setTimeout(() => {
              setIsVisible(false)
            }, 2000) // Hide after 2 seconds of no fast scrolling
          }
        }
      }
      
      lastScrollTop = currentScrollTop
      lastScrollTime = currentTime
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      if (initialHideTimeoutRef.current) {
        clearTimeout(initialHideTimeoutRef.current)
      }
    }
  }, [isMobile, scrollContainerRef, isHovered])

  // Keep visible when hovered
  useEffect(() => {
    if (isHovered) {
      // Clear all hide timeouts when hovering
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      if (initialHideTimeoutRef.current) {
        clearTimeout(initialHideTimeoutRef.current)
      }
      setIsVisible(true)
    } else if (!isMobile && !isInInitialPeriod) {
      // Start hide timer when mouse leaves (but not during initial 5-second period)
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false)
      }, 800)
    }
  }, [isHovered, isMobile, isInInitialPeriod])

  // Auto-hide outline on scroll (mobile)
  useEffect(() => {
    if (!isMobile) return

    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    let lastScrollY = 0
    let ticking = false

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop
      const scrollDelta = currentScrollY - lastScrollY

      if (currentScrollY < 50) {
        setIsVisible(true)
      } else if (scrollDelta > 10) {
        setIsVisible(false)
        setIsOpen(false)
      } else if (scrollDelta < -10) {
        setIsVisible(true)
      }

      lastScrollY = currentScrollY
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(handleScroll)
        ticking = true
      }
    }

    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollContainerRef])

  // Calculate minimum heading level for proper indentation
  // Must be before early return to maintain hooks order
  const minLevel = useMemo(
    () => (headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1),
    [headings]
  )

  // Handle heading click - prevent flicker by locking activeId during scroll
  const handleHeadingClick = useCallback(
    (heading: HeadingItem) => {
      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) return

      // Set active immediately
      setActiveId(heading.id)

      // Lock the activeId from being updated by scroll handler
      isScrollingToHeadingRef.current = true

      // Clear any existing timeout
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current)
      }

      const containerRect = scrollContainer.getBoundingClientRect()
      const headingRect = heading.element.getBoundingClientRect()
      const relativeTop = headingRect.top - containerRect.top + scrollContainer.scrollTop

      scrollContainer.scrollTo({
        top: relativeTop - 80, // Offset for header
        behavior: 'smooth',
      })

      // Use scroll event to detect when scrolling stops
      // This handles variable-length smooth scroll animations
      const detectScrollEnd = () => {
        if (scrollingTimeoutRef.current) {
          clearTimeout(scrollingTimeoutRef.current)
        }
        // Unlock after 150ms of no scrolling (scroll stopped)
        scrollingTimeoutRef.current = setTimeout(() => {
          isScrollingToHeadingRef.current = false
          scrollContainer.removeEventListener('scroll', detectScrollEnd)
        }, 150)
      }

      scrollContainer.addEventListener('scroll', detectScrollEnd, { passive: true })
      // Fallback timeout in case scrollTo finishes immediately (already at position)
      detectScrollEnd()

      if (isMobile) {
        setIsOpen(false)
      }
    },
    [scrollContainerRef, isMobile]
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current)
      }
    }
  }, [])

  // Don't render if no headings
  if (headings.length === 0) return null

  // Mobile floating button + drawer
  if (isMobile) {
    return (
      <>
        {/* Floating button with progress ring */}
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-card/90 shadow-lg backdrop-blur-sm transition-all duration-300 ease-out ${
            isVisible && !isOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
          } ${className}`}
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
          aria-label="Show outline"
        >
          {/* Progress ring SVG */}
          <svg className="absolute inset-0 h-12 w-12 -rotate-90" viewBox="0 0 48 48">
            <circle
              cx="24"
              cy="24"
              r="22"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="2"
              opacity="0.3"
            />
            <circle
              cx="24"
              cy="24"
              r="22"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 138.2} 138.2`}
              className="transition-all duration-150 ease-out"
            />
          </svg>
          <List className="h-5 w-5 text-primary" />
        </button>

        {/* Drawer backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setIsOpen(false)}
        />

        {/* Drawer */}
        <div
          className={`fixed inset-y-0 right-0 z-50 w-[280px] max-w-[85vw] bg-card shadow-2xl transition-transform duration-300 ease-out ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col">
            {/* Header with progress */}
            <div className="border-b border-border/50 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-primary" />
                  <span className="font-display text-sm font-semibold text-foreground">
                    Table of Contents
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium tabular-nums text-primary">
                    {progress}%
                  </span>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-border/30">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Heading list */}
            <nav className="flex-1 overflow-y-auto py-2">
              <ul className="space-y-px px-2">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <button
                      onClick={() => handleHeadingClick(heading)}
                      className={`group flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                        activeId === heading.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      }`}
                      style={{ paddingLeft: `${(heading.level - minLevel) * 12 + 12}px` }}
                    >
                      <ChevronRight
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                          activeId === heading.id ? 'rotate-90 text-primary' : 'text-muted-foreground/50'
                        }`}
                      />
                      <span className="line-clamp-2">{heading.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Footer */}
            <div className="border-t border-border/50 px-4 py-2 text-center">
              <span className="text-xs text-muted-foreground">
                {headings.length} section{headings.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Desktop: Sticky outline in reserved sidebar space
  // When hidden, show dots placeholder while keeping structure visible
  return (
    <div
      className={`outline-sidebar h-full ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-hidden">
        {/* Content with text fade effect - structure always visible */}
        <div
          className={`transition-all duration-500 ease-in-out ${
            isVisible ? '' : 'pointer-events-none'
          }`}
        >
          {/* Header with progress */}
          <div className="mb-2 px-2">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <List className={`h-3 w-3 transition-opacity duration-500 ${isVisible ? 'text-primary/70' : 'text-muted-foreground/20'}`} />
                <span className={`text-[10px] font-medium uppercase tracking-wider transition-opacity duration-500 ${isVisible ? 'text-muted-foreground/70' : 'text-muted-foreground/20'}`}>
                  Contents
                </span>
              </div>
              <span className={`text-[10px] font-medium tabular-nums transition-opacity duration-500 ${isVisible ? 'text-primary/80' : 'text-muted-foreground/20'}`}>
                {progress}%
              </span>
            </div>
            {/* Progress bar - always primary color */}
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-border/30">
              <div
                className="h-full rounded-full bg-primary/60 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Heading list */}
          <nav className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            {/* Progress line - moved further left */}
            <div className="relative pl-4">
              {/* Background track */}
              <div className="absolute left-0 top-0 h-full w-px bg-border/40" />
              {/* Progress fill - always primary color */}
              <div
                className="absolute left-0 top-0 w-px bg-primary/50 transition-all duration-500 ease-out"
                style={{ height: `${progress}%` }}
              />
              
              <ul className="space-y-px">
                {headings.map((heading) => {
                  const isActive = activeId === heading.id
                  return (
                    <li key={heading.id} className="relative">
                      {/* Active indicator - always visible when active */}
                      {isActive && (
                        <div
                          className="absolute -left-4 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-500"
                          style={{ boxShadow: isVisible ? '0 0 8px hsl(var(--primary) / 0.5)' : '0 0 4px hsl(var(--primary) / 0.3)' }}
                        />
                      )}
                      <button
                        onClick={() => handleHeadingClick(heading)}
                        disabled={!isVisible}
                        className="group relative flex w-full items-center py-1.5 text-left text-[12px] leading-snug min-h-[1.5rem]"
                        style={{ paddingLeft: `${(heading.level - minLevel) * 8}px` }}
                      >
                        {/* Text content with blur effect - keeps same visual weight */}
                        <span 
                          className={`block line-clamp-1 ${
                            isVisible
                              ? isActive
                                ? 'text-primary font-medium'
                                : 'text-muted-foreground/70 hover:text-foreground'
                              : isActive
                                ? 'text-primary/40'
                                : 'text-muted-foreground/25'
                          }`}
                          style={{
                            filter: isVisible ? 'blur(0px)' : 'blur(3px)',
                            // Fast transition when revealing (hover), slower when hiding
                            transition: isVisible 
                              ? 'filter 200ms ease-out, color 150ms ease-out'
                              : 'filter 500ms cubic-bezier(0.4, 0, 0.2, 1), color 300ms ease-out',
                          }}
                        >
                          {heading.text}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </nav>

          {/* Footer */}
          <div className="mt-3 px-2">
            <span className={`text-[10px] transition-opacity duration-500 ${isVisible ? 'text-muted-foreground/50' : 'text-muted-foreground/15'}`}>
              {headings.length} sections
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

