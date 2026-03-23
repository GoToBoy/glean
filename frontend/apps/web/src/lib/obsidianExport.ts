import { format } from 'date-fns'

import type { EntryWithState } from '@glean/types'

import { classifyPreElement } from './preTranslation'
import {
  collectTranslatableBlocks,
  normalizeLooseTextNodes,
  splitBlockByBreaks,
} from './translationRules'

const DB_NAME = 'glean-obsidian-export'
const STORE_NAME = 'handles'
const DIRECTORY_KEY = 'obsidian-directory'
const ORIGINAL_HTML_ATTR = 'data-original-html'
let sessionDirectoryHandle: FileSystemDirectoryHandleLike | null = null

interface FileSystemPermissionDescriptorLike {
  mode?: 'read' | 'readwrite'
}

export interface FileSystemWritableFileStreamLike {
  write(data: string): Promise<void>
  close(): Promise<void>
}

export interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>
}

export interface FileSystemDirectoryHandleLike {
  kind?: 'directory'
  name: string
  queryPermission?: (
    descriptor?: FileSystemPermissionDescriptorLike
  ) => Promise<'granted' | 'denied' | 'prompt'>
  requestPermission?: (
    descriptor?: FileSystemPermissionDescriptorLike
  ) => Promise<'granted' | 'denied' | 'prompt'>
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemFileHandleLike>
}

interface FilePickerWindow extends Window {
  showDirectoryPicker?: (
    options?: FileSystemPermissionDescriptorLike & { id?: string }
  ) => Promise<FileSystemDirectoryHandleLike>
}

export interface TranslationSnapshot {
  original: string
  translated: string
  totalSegments: number
  translatedSegments: number
  isComplete: boolean
}

export interface ObsidianMarkdownPayload {
  entry: EntryWithState
  original: string
  translated?: string | null
  targetLanguage?: string | null
}

function openHandleDatabase(): Promise<IDBDatabase> {
  if (typeof window.indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'))
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

export function isObsidianExportSupported(): boolean {
  const fileWindow = window as FilePickerWindow
  return typeof fileWindow.showDirectoryPicker === 'function'
}

export async function pickObsidianDirectory(): Promise<FileSystemDirectoryHandleLike> {
  const fileWindow = window as FilePickerWindow
  if (!fileWindow.showDirectoryPicker) {
    throw new Error('Directory picker is not supported in this browser')
  }

  return fileWindow.showDirectoryPicker({
    id: 'glean-obsidian-export',
    mode: 'readwrite',
  })
}

export async function saveObsidianDirectoryHandle(
  handle: FileSystemDirectoryHandleLike
): Promise<void> {
  sessionDirectoryHandle = handle
  try {
    const database = await openHandleDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(handle, DIRECTORY_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to save directory handle'))
    })
    database.close()
  } catch {
    // Fall back to in-memory handle storage for browsers that expose
    // File System Access APIs but do not allow persisting handles.
  }
}

export async function loadObsidianDirectoryHandle(): Promise<FileSystemDirectoryHandleLike | null> {
  try {
    const database = await openHandleDatabase()
    const result = await new Promise<FileSystemDirectoryHandleLike | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(DIRECTORY_KEY)
      request.onsuccess = () =>
        resolve((request.result as FileSystemDirectoryHandleLike | undefined) ?? null)
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to load directory handle'))
    })
    database.close()
    sessionDirectoryHandle = result ?? sessionDirectoryHandle
    return result ?? sessionDirectoryHandle
  } catch {
    return sessionDirectoryHandle
  }
}

export async function clearObsidianDirectoryHandle(): Promise<void> {
  sessionDirectoryHandle = null
  try {
    const database = await openHandleDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(DIRECTORY_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to clear directory handle'))
    })
    database.close()
  } catch {
    // No-op when persistent storage is unavailable.
  }
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandleLike,
  requestIfNeeded: boolean
): Promise<boolean> {
  const descriptor = { mode: 'readwrite' as const }
  const queryResult = (await handle.queryPermission?.(descriptor)) ?? 'prompt'
  if (queryResult === 'granted') {
    return true
  }
  if (!requestIfNeeded) {
    return false
  }
  const requestResult = (await handle.requestPermission?.(descriptor)) ?? 'denied'
  return requestResult === 'granted'
}

export function extractArticleTextBlocks(
  root: HTMLElement,
  translatePreUnknown: boolean
): string[] {
  normalizeLooseTextNodes(root, ORIGINAL_HTML_ATTR)
  const blocks = collectTranslatableBlocks(root, translatePreUnknown, classifyPreElement)
  return blocks
    .map((block) => splitBlockByBreaks(block).join('\n').trim())
    .filter((block) => block.length > 0)
}

function escapeFrontmatter(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return cleaned || 'Untitled'
}

export function buildObsidianExportFileName(entry: EntryWithState): string {
  const datePrefix = entry.published_at ? format(new Date(entry.published_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  return `${datePrefix} ${sanitizeFileName(entry.title)} [${entry.id.slice(0, 8)}].md`
}

export function buildObsidianMarkdown({
  entry,
  original,
  translated,
  targetLanguage,
}: ObsidianMarkdownPayload): string {
  const lines = [
    '---',
    `title: "${escapeFrontmatter(entry.title)}"`,
    `url: "${escapeFrontmatter(entry.url)}"`,
    `glean_entry_id: "${entry.id}"`,
    `archived_at: "${new Date().toISOString()}"`,
    `translation_included: ${translated ? 'true' : 'false'}`,
  ]

  if (entry.author) {
    lines.push(`author: "${escapeFrontmatter(entry.author)}"`)
  }
  if (entry.published_at) {
    lines.push(`published_at: "${entry.published_at}"`)
  }
  if (translated && targetLanguage) {
    lines.push(`translation_language: "${targetLanguage}"`)
  }

  lines.push('---', '', `# ${entry.title}`, '', `Source: ${entry.url}`, '', '## Original', '', original.trim())

  if (translated?.trim()) {
    lines.push('', '## Translation', '', translated.trim())
  }

  return `${lines.join('\n').trim()}\n`
}

export async function writeMarkdownToObsidianDirectory(
  handle: FileSystemDirectoryHandleLike,
  entry: EntryWithState,
  markdown: string
): Promise<string> {
  const fileName = buildObsidianExportFileName(entry)
  const fileHandle = await handle.getFileHandle(fileName, { create: true })
  const writer = await fileHandle.createWritable()
  await writer.write(markdown)
  await writer.close()
  return fileName
}

export async function testObsidianDirectoryAccess(
  handle: FileSystemDirectoryHandleLike
): Promise<boolean> {
  return ensureDirectoryPermission(handle, true)
}
