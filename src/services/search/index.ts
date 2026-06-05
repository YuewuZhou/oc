export type { SearchResult } from './types.js'

export type SearchBackend = 'openai-native'

export function getActiveSearchBackend(): SearchBackend {
  return 'openai-native'
}

export function isAnySearchAvailable(): boolean {
  return !!process.env.OPENAI_SEARCH_MODEL
}

// Tool-based search is removed — all search goes through OPENAI_SEARCH_MODEL
// (gpt-4o-search-preview) via the OpenAI shim. Set OPENAI_SEARCH_MODEL=gpt-4o-search-preview.
export async function search(_query: string, _signal?: AbortSignal): Promise<import('./types.js').SearchResult[]> {
  return []
}
