import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildObsidianExportFileName,
  buildObsidianMarkdown,
  clearObsidianDirectoryHandle,
  downloadMarkdownFile,
  isObsidianExportSupported,
  loadObsidianDirectoryHandle,
  saveObsidianDirectoryHandle,
} from '../../lib/obsidianExport'
import { createMockEntry } from '../helpers/mockData'

describe('obsidianExport', () => {
  const originalShowDirectoryPicker = (
    window as Window & { showDirectoryPicker?: unknown }
  ).showDirectoryPicker
  const originalIndexedDB = window.indexedDB

  afterEach(async () => {
    await clearObsidianDirectoryHandle()
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: originalShowDirectoryPicker,
    })
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      writable: true,
      value: originalIndexedDB,
    })
  })

  it('builds a safe export file name', () => {
    const entry = createMockEntry({
      id: '12345678-aaaa-bbbb-cccc-1234567890ab',
      title: 'A / tricky : title?',
      published_at: '2025-03-01T12:00:00.000Z',
    })

    expect(buildObsidianExportFileName(entry)).toBe('2025-03-01 A - tricky - title- [12345678].md')
  })

  it('includes translation block when provided', () => {
    const entry = createMockEntry({
      id: '12345678-aaaa-bbbb-cccc-1234567890ab',
      title: 'Test Entry',
      url: 'https://example.com/post',
      author: 'Author',
      published_at: '2025-03-01T12:00:00.000Z',
    })

    const markdown = buildObsidianMarkdown({
      entry,
      original: 'Original body',
      translated: 'Translated body',
      targetLanguage: 'zh-CN',
    })

    expect(markdown).toContain('translation_included: true')
    expect(markdown).toContain('translation_language: "zh-CN"')
    expect(markdown).toContain('## Original')
    expect(markdown).toContain('Original body')
    expect(markdown).toContain('## Translation')
    expect(markdown).toContain('Translated body')
  })

  it('treats chromium browsers with file system access support as supported', () => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      writable: true,
      value: {},
    })
    Object.defineProperty(window.navigator, 'brave', {
      configurable: true,
      value: {},
    })

    expect(isObsidianExportSupported()).toBe(true)
  })

  it('does not require indexeddb when directory picker is available', () => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    expect(isObsidianExportSupported()).toBe(true)
  })

  it('falls back to in-memory directory handles when indexeddb is unavailable', async () => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    const handle = {
      name: 'Vault',
      getFileHandle: vi.fn(),
    }

    await saveObsidianDirectoryHandle(handle)

    await expect(loadObsidianDirectoryHandle()).resolves.toBe(handle)
  })

  it('downloads markdown when direct folder access is unavailable', () => {
    const entry = createMockEntry({
      id: '12345678-aaaa-bbbb-cccc-1234567890ab',
      title: 'Download me',
      published_at: '2025-03-01T12:00:00.000Z',
    })
    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        const anchor = originalCreateElement('a')
        vi.spyOn(anchor, 'click').mockImplementation(() => {})
        vi.spyOn(anchor, 'remove').mockImplementation(() => {})
        return anchor
      }
      return originalCreateElement(tagName)
    })
    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:glean-download')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const fileName = downloadMarkdownFile(entry, '# exported')

    expect(fileName).toBe('2025-03-01 Download me [12345678].md')
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(createElementSpy).toHaveBeenCalledWith('a')
    const anchor = createElementSpy.mock.results[0]?.value as HTMLAnchorElement
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(anchor.remove).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:glean-download')
    expect(appendChildSpy).toHaveBeenCalledTimes(1)

    createElementSpy.mockRestore()
  })
})
