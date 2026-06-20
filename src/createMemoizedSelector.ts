import type {
  AnyFunction,
  DefaultMemoizeFields,
  EqualityFn,
  SelectorArray,
  Simplify
} from './types'

import { createSelectorCreator } from './createSelectorCreator'

interface CacheEntry<Result = unknown> {
  key: string
  value: Result
}

interface LruCache<Result = unknown> {
  get(key: string): Result | undefined
  put(key: string, value: Result): void
  getEntries(): CacheEntry<Result>[]
  clear(): void
}

function createLruCache<Result>(maxSize: number): LruCache<Result> {
  let entries: CacheEntry<Result>[] = []

  function get(key: string): Result | undefined {
    const cacheIndex = entries.findIndex(entry => entry.key === key)

    if (cacheIndex > -1) {
      const entry = entries[cacheIndex]

      if (cacheIndex > 0) {
        entries.splice(cacheIndex, 1)
        entries.unshift(entry)
      }

      return entry.value
    }

    return undefined
  }

  function put(key: string, value: Result): void {
    if (get(key) === undefined) {
      entries.unshift({ key, value })
      if (entries.length > maxSize) {
        entries.pop()
      }
    }
  }

  function getEntries(): CacheEntry<Result>[] {
    return entries
  }

  function clear(): void {
    entries = []
  }

  return { get, put, getEntries, clear }
}

function defaultKeySelector(args: unknown[]): string {
  return JSON.stringify(args)
}

export interface CreateMemoizedSelectorOptions {
  maxSize?: number
  keySelector?: (args: unknown[]) => string
}

export interface MemoizedSelectorFields {
  cache: Map<string, unknown>
}

export function createMemoizedSelector(
  options: CreateMemoizedSelectorOptions = {}
) {
  const { maxSize = 1, keySelector = defaultKeySelector } = options

  function memoizeWithKey<Func extends AnyFunction>(
    func: Func,
    memoizeOptions?: { resultEqualityCheck?: EqualityFn<ReturnType<Func>> }
  ) {
    const cache = createLruCache<ReturnType<Func>>(maxSize)
    const { resultEqualityCheck } = memoizeOptions || {}

    let resultsCount = 0

    function memoized() {
      const args = Array.prototype.slice.call(arguments)
      const key = keySelector(args)
      let value = cache.get(key) as ReturnType<Func> | undefined

      if (value === undefined) {
        const newValue = func.apply(null, arguments as unknown as any[]) as ReturnType<Func>
        resultsCount++

        value = newValue

        if (resultEqualityCheck) {
          const entries = cache.getEntries()
          const matchingEntry = entries.find(entry =>
            resultEqualityCheck(entry.value as ReturnType<Func>, newValue)
          )

          if (matchingEntry) {
            value = matchingEntry.value as ReturnType<Func>
            resultsCount !== 0 && resultsCount--
          }
        }

        cache.put(key, value as ReturnType<Func>)
      }

      return value
    }

    memoized.clearCache = () => {
      cache.clear()
      memoized.resetResultsCount()
    }

    memoized.resultsCount = () => resultsCount

    memoized.resetResultsCount = () => {
      resultsCount = 0
    }

    Object.defineProperty(memoized, 'cache', {
      get() {
        return new Map(cache.getEntries().map(e => [e.key, e.value]))
      }
    })

    return memoized as Func &
      Simplify<DefaultMemoizeFields> &
      MemoizedSelectorFields
  }

  const createSelector = createSelectorCreator({
    memoize: memoizeWithKey,
    argsMemoize: memoizeWithKey
  })

  return createSelector
}
