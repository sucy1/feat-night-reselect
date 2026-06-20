import { createMemoizedSelector } from 'reselect'
import type { RootState } from './testUtils'
import { localTest, toggleCompleted } from './testUtils'

describe('createMemoizedSelector', () => {
  test('Basic memoization with default maxSize=1', () => {
    const createSelector = createMemoizedSelector()

    let called = 0
    const selectA = createSelector(
      (state: { a: number }) => state.a,
      a => {
        called++
        return a * 2
      }
    )

    const state1 = { a: 1 }
    expect(selectA(state1)).toBe(2)
    expect(selectA(state1)).toBe(2)
    expect(called).toBe(1)

    const state2 = { a: 2 }
    expect(selectA(state2)).toBe(4)
    expect(called).toBe(2)

    expect(selectA(state1)).toBe(2)
    expect(called).toBe(3)
  })

  test('Cache hit with same arguments', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let called = 0
    const selector = createSelector(
      (state: { value: number }) => state.value,
      value => {
        called++
        return value * value
      }
    )

    expect(selector({ value: 2 })).toBe(4)
    expect(selector({ value: 2 })).toBe(4)
    expect(selector({ value: 2 })).toBe(4)
    expect(called).toBe(1)
  })

  test('LRU cache eviction when maxSize is exceeded', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return `result-${id}`
      }
    )

    selector({ id: 1 })
    expect(funcCalls).toBe(1)

    selector({ id: 2 })
    expect(funcCalls).toBe(2)

    selector({ id: 3 })
    expect(funcCalls).toBe(3)

    selector({ id: 4 })
    expect(funcCalls).toBe(4)

    selector({ id: 1 })
    expect(funcCalls).toBe(5)

    selector({ id: 3 })
    expect(funcCalls).toBe(5)
  })

  test('LRU reorders on cache hit', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return `result-${id}`
      },
      {
        devModeChecks: { identityFunctionCheck: 'never', inputStabilityCheck: 'never' }
      }
    )

    selector({ id: 1 })
    selector({ id: 2 })
    selector({ id: 3 })
    expect(funcCalls).toBe(3)
    expect(selector.dependencyRecomputations()).toBe(3)

    selector({ id: 1 })
    expect(funcCalls).toBe(3)
    expect(selector.dependencyRecomputations()).toBe(3)

    const cacheAfterHit = Array.from(selector.cache.keys())
    expect(cacheAfterHit[0]).toBe('[{"id":1}]')
    expect(cacheAfterHit[1]).toBe('[{"id":3}]')
    expect(cacheAfterHit[2]).toBe('[{"id":2}]')

    selector({ id: 4 })
    expect(selector.dependencyRecomputations()).toBe(4)

    const cacheAfterEvict = Array.from(selector.cache.keys())
    expect(cacheAfterEvict).toHaveLength(3)
    expect(cacheAfterEvict).toContain('[{"id":1}]')
    expect(cacheAfterEvict).toContain('[{"id":3}]')
    expect(cacheAfterEvict).toContain('[{"id":4}]')
    expect(cacheAfterEvict).not.toContain('[{"id":2}]')

    selector({ id: 1 })
    expect(selector.dependencyRecomputations()).toBe(4)

    selector({ id: 2 })
    expect(selector.dependencyRecomputations()).toBe(5)

    const cacheAfterReadd = Array.from(selector.cache.keys())
    expect(cacheAfterReadd[0]).toBe('[{"id":2}]')
    expect(cacheAfterReadd).toContain('[{"id":1}]')
    expect(cacheAfterReadd).toContain('[{"id":4}]')
    expect(cacheAfterReadd).not.toContain('[{"id":3}]')
  })

  test('Custom keySelector', () => {
    const createSelector = createMemoizedSelector({
      maxSize: 2,
      keySelector: args => {
        const [state] = args as [{ id: number; name: string }]
        return `custom-key-${state.id}`
      }
    })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number; name: string }) => state,
      state => {
        funcCalls++
        return `${state.id}-${state.name}`
      }
    )

    expect(selector({ id: 1, name: 'a' })).toBe('1-a')
    expect(funcCalls).toBe(1)

    expect(selector({ id: 1, name: 'b' })).toBe('1-a')
    expect(funcCalls).toBe(1)

    expect(selector({ id: 2, name: 'c' })).toBe('2-c')
    expect(funcCalls).toBe(2)
  })

  test('keySelector receives all arguments', () => {
    const argsMemoizeCalls: unknown[][] = []
    const memoizeCalls: unknown[][] = []
    const createSelector = createMemoizedSelector({
      maxSize: 3,
      keySelector: args => {
        const isMemoize = args.length === 1 && typeof args[0] === 'string'
        if (isMemoize) {
          memoizeCalls.push([...args])
        } else {
          argsMemoizeCalls.push([...args])
        }
        return JSON.stringify(args)
      }
    })

    const selector = createSelector(
      (state: { a: number }, extra: string) => state.a + extra,
      value => `transformed-${value}`,
      {
        devModeChecks: { identityFunctionCheck: 'never' }
      }
    )

    selector({ a: 1 }, 'test')

    expect(argsMemoizeCalls.length).toBeGreaterThan(0)
    const firstArgsMemoizeCall = argsMemoizeCalls[0]
    expect(firstArgsMemoizeCall.length).toBe(2)
    expect(firstArgsMemoizeCall[0]).toEqual({ a: 1 })
    expect(firstArgsMemoizeCall[1]).toBe('test')

    expect(memoizeCalls.length).toBeGreaterThan(0)
    const firstMemoizeCall = memoizeCalls[0]
    expect(firstMemoizeCall.length).toBe(1)
    expect(firstMemoizeCall[0]).toBe('1test')
  })

  test('.cache property exposes cache contents', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => `value-${id}`
    )

    selector({ id: 1 })
    selector({ id: 2 })

    const cache = selector.cache
    expect(cache).toBeInstanceOf(Map)
    expect(cache.size).toBe(2)
    expect(cache.get('[{"id":1}]')).toBe('value-1')
    expect(cache.get('[{"id":2}]')).toBe('value-2')
  })

  test('.cache reflects LRU order after access', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => `val-${id}`,
      {
        devModeChecks: { identityFunctionCheck: 'never' }
      }
    )

    selector({ id: 1 })
    selector({ id: 2 })
    selector({ id: 3 })

    selector({ id: 1 })

    const cacheEntries = Array.from(selector.cache.entries())
    expect(cacheEntries[0][0]).toBe('[{"id":1}]')
    expect(cacheEntries[1][0]).toBe('[{"id":3}]')
    expect(cacheEntries[2][0]).toBe('[{"id":2}]')
  })

  test('.cache is a copy, not a reference', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => `val-${id}`,
      {
        devModeChecks: { identityFunctionCheck: 'never' }
      }
    )

    selector({ id: 1 })

    const cache = selector.cache
    cache.set('fake', 'value')

    expect(selector.cache.has('fake')).toBe(false)
    expect(selector.cache.size).toBe(1)
  })

  test('clearCache works correctly', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return `result-${id}`
      },
      {
        devModeChecks: { identityFunctionCheck: 'never', inputStabilityCheck: 'never' }
      }
    )

    selector({ id: 1 })
    selector({ id: 2 })
    expect(funcCalls).toBe(2)
    expect(selector.cache.size).toBe(2)

    selector.clearCache()
    selector.memoizedResultFunc.clearCache()

    expect(selector.cache.size).toBe(0)
    selector({ id: 1 })
    expect(funcCalls).toBe(3)
  })

  test('Multiple input selectors', () => {
    const createSelector = createMemoizedSelector({ maxSize: 2 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { a: number; b: number }) => state.a,
      (state: { a: number; b: number }) => state.b,
      (a, b) => {
        funcCalls++
        return a + b
      }
    )

    expect(selector({ a: 1, b: 2 })).toBe(3)
    expect(funcCalls).toBe(1)
    expect(selector({ a: 1, b: 2 })).toBe(3)
    expect(funcCalls).toBe(1)

    expect(selector({ a: 3, b: 4 })).toBe(7)
    expect(funcCalls).toBe(2)

    expect(selector({ a: 1, b: 2 })).toBe(3)
    expect(funcCalls).toBe(2)
  })

  test('Selector with params', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selectTodoById = createSelector(
      (state: { todos: { id: number; text: string }[] }, id: number) =>
        state.todos.find(t => t.id === id),
      todo => {
        funcCalls++
        return todo?.text ?? 'not found'
      }
    )

    const state = {
      todos: [
        { id: 1, text: 'todo 1' },
        { id: 2, text: 'todo 2' },
        { id: 3, text: 'todo 3' }
      ]
    }

    expect(selectTodoById(state, 1)).toBe('todo 1')
    expect(funcCalls).toBe(1)

    expect(selectTodoById(state, 2)).toBe('todo 2')
    expect(funcCalls).toBe(2)

    expect(selectTodoById(state, 1)).toBe('todo 1')
    expect(funcCalls).toBe(2)

    expect(selectTodoById(state, 3)).toBe('todo 3')
    expect(funcCalls).toBe(3)

    expect(selectTodoById(state, 4)).toBe('not found')
    expect(funcCalls).toBe(4)

    expect(selectTodoById(state, 1)).toBe('todo 1')
    expect(funcCalls).toBe(4)
  })

  test('resultEqualityCheck option', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { items: number[] }) => state.items,
      items => {
        funcCalls++
        return items.map(i => i * 2)
      },
      {
        memoizeOptions: {
          resultEqualityCheck: (a: number[], b: number[]) =>
            a.length === b.length && a.every((val, i) => val === b[i])
        }
      }
    )

    const result1 = selector({ items: [1, 2, 3] })
    expect(funcCalls).toBe(1)
    expect(result1).toEqual([2, 4, 6])

    const result2 = selector({ items: [1, 2, 3] })
    expect(funcCalls).toBe(1)
    expect(result2).toBe(result1)
  })

  test('withTypes works correctly', () => {
    const createSelector = createMemoizedSelector({ maxSize: 2 })

    interface AppState {
      user: { id: number; name: string }
    }

    const createAppSelector = createSelector.withTypes<AppState>()

    let funcCalls = 0
    const selectUserName = createAppSelector(
      [state => state.user],
      user => {
        funcCalls++
        return user.name
      }
    )

    const state: AppState = { user: { id: 1, name: 'Alice' } }
    expect(selectUserName(state)).toBe('Alice')
    expect(selectUserName(state)).toBe('Alice')
    expect(funcCalls).toBe(1)
  })

  localTest(
    'Integration with Redux store',
    ({ store, state }) => {
      const createSelector = createMemoizedSelector({ maxSize: 2 })

      interface AppState extends RootState {}

      const createAppSelector = createSelector.withTypes<AppState>()

      let funcCalls = 0
      const selectTodoIds = createAppSelector(
        [s => s.todos],
        todos => {
          funcCalls++
          return todos.map(t => t.id)
        },
        {
          devModeChecks: { identityFunctionCheck: 'never' }
        }
      )

      const ids1 = selectTodoIds(store.getState())
      expect(funcCalls).toBe(1)
      expect(selectTodoIds(store.getState())).toBe(ids1)
      expect(funcCalls).toBe(1)

      store.dispatch(toggleCompleted(0))

      const ids2 = selectTodoIds(store.getState())
      expect(funcCalls).toBe(2)
      expect(ids2).toEqual(ids1)
    }
  )

  test('maxSize set to 0 defaults to size 1', () => {
    const createSelector = createMemoizedSelector({ maxSize: 0 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return `result-${id}`
      }
    )

    selector({ id: 1 })
    expect(funcCalls).toBe(1)
    expect(selector.cache.size).toBe(1)

    selector({ id: 2 })
    expect(funcCalls).toBe(2)
    expect(selector.cache.size).toBe(1)

    selector({ id: 1 })
    expect(funcCalls).toBe(3)
  })

  test('maxSize set to negative number defaults to size 1', () => {
    const createSelector = createMemoizedSelector({ maxSize: -5 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return `result-${id}`
      }
    )

    selector({ id: 10 })
    expect(funcCalls).toBe(1)

    selector({ id: 20 })
    expect(funcCalls).toBe(2)

    selector({ id: 10 })
    expect(funcCalls).toBe(3)
  })

  test('Caching a value of undefined works correctly', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { value?: number }) => state.value,
      value => {
        funcCalls++
        return value !== undefined ? value * 2 : undefined
      },
      {
        devModeChecks: { identityFunctionCheck: 'never' }
      }
    )

    const result1 = selector({})
    expect(funcCalls).toBe(1)
    expect(result1).toBeUndefined()

    const result2 = selector({})
    expect(funcCalls).toBe(1)
    expect(result2).toBeUndefined()

    const result3 = selector({ value: 5 })
    expect(funcCalls).toBe(2)
    expect(result3).toBe(10)

    const result4 = selector({})
    expect(funcCalls).toBe(2)
    expect(result4).toBeUndefined()
    expect(result4).toBe(result1)
  })

  test('Cache eviction works correctly including undefined values', () => {
    const createSelector = createMemoizedSelector({ maxSize: 2 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return id > 0 ? id * 10 : undefined
      },
      {
        devModeChecks: { identityFunctionCheck: 'never' }
      }
    )

    selector({ id: 0 })
    expect(funcCalls).toBe(1)
    expect(selector({ id: 0 })).toBeUndefined()

    selector({ id: 1 })
    expect(funcCalls).toBe(2)
    expect(selector.cache.size).toBe(2)

    selector({ id: 2 })
    expect(funcCalls).toBe(3)
    expect(selector.cache.size).toBe(2)

    selector({ id: 0 })
    expect(funcCalls).toBe(4)
    expect(selector({ id: 0 })).toBeUndefined()
    expect(funcCalls).toBe(4)
  })

  test('Caching null values works correctly', () => {
    const createSelector = createMemoizedSelector({ maxSize: 2 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { item: { id: number } | null }) => state.item,
      item => {
        funcCalls++
        return item?.id ?? null
      },
      {
        devModeChecks: { identityFunctionCheck: 'never' }
      }
    )

    const result1 = selector({ item: null })
    expect(funcCalls).toBe(1)
    expect(result1).toBeNull()

    const result2 = selector({ item: null })
    expect(funcCalls).toBe(1)
    expect(result2).toBeNull()

    const result3 = selector({ item: { id: 42 } })
    expect(funcCalls).toBe(2)
    expect(result3).toBe(42)
  })

  test('Custom keySelector that generates same key for different args', () => {
    const createSelector = createMemoizedSelector({
      maxSize: 3,
      keySelector: args => {
        const [state] = args as [{ type: string; id: number; extra: string }]
        return `${state.type}-${state.id}`
      }
    })

    let funcCalls = 0
    const selector = createSelector(
      (state: { type: string; id: number; extra: string }) => state,
      state => {
        funcCalls++
        return `${state.type}-${state.id}-${state.extra}`
      }
    )

    expect(selector({ type: 'user', id: 1, extra: 'first' })).toBe('user-1-first')
    expect(funcCalls).toBe(1)

    expect(selector({ type: 'user', id: 1, extra: 'second' })).toBe('user-1-first')
    expect(funcCalls).toBe(1)

    expect(selector({ type: 'post', id: 1, extra: 'third' })).toBe('post-1-third')
    expect(funcCalls).toBe(2)

    expect(selector({ type: 'user', id: 2, extra: 'fourth' })).toBe('user-2-fourth')
    expect(funcCalls).toBe(3)
  })

  test('keySelector works with complex nested state arguments', () => {
    const createSelector = createMemoizedSelector({ maxSize: 5 })

    interface ComplexState {
      user: {
        profile: {
          id: number
          settings: { theme: string }
        }
      }
    }

    let funcCalls = 0
    const selector = createSelector(
      (state: ComplexState) => state.user.profile.settings.theme,
      theme => {
        funcCalls++
        return `theme:${theme}`
      }
    )

    const state1: ComplexState = {
      user: { profile: { id: 1, settings: { theme: 'dark' } } }
    }

    expect(selector(state1)).toBe('theme:dark')
    expect(funcCalls).toBe(1)

    expect(selector(state1)).toBe('theme:dark')
    expect(funcCalls).toBe(1)

    const state2: ComplexState = {
      user: { profile: { id: 1, settings: { theme: 'light' } } }
    }

    expect(selector(state2)).toBe('theme:light')
    expect(funcCalls).toBe(2)
  })

  test('resultEqualityCheck with keySelector preserves reference', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    interface Todo {
      id: number
      name: string
    }

    const todos1: Todo[] = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' }
    ]
    const todos2: Todo[] = todos1.slice()
    todos2[0] = { ...todos2[0], name: 'c' }

    let funcCalls = 0
    const selector = createSelector(
      (state: { todos: Todo[] }) => state.todos,
      todos => {
        funcCalls++
        return todos.map(t => t.id)
      },
      {
        memoizeOptions: {
          resultEqualityCheck: (a: number[], b: number[]) =>
            a.length === b.length && a.every((v, i) => v === b[i])
        }
      }
    )

    const ids1 = selector({ todos: todos1 })
    expect(funcCalls).toBe(1)
    expect(ids1).toEqual([1, 2])

    const ids2 = selector({ todos: todos1 })
    expect(funcCalls).toBe(1)
    expect(ids2).toBe(ids1)

    const ids3 = selector({ todos: todos2 })
    expect(funcCalls).toBe(2)
    expect(ids3).toBe(ids1)
  })

  test('resultEqualityCheck is not called on first computation', () => {
    const resultEqualityCheckSpy = vi.fn((a: number[], b: number[]) =>
      a.length === b.length && a.every((v, i) => v === b[i])
    )

    const createSelector = createMemoizedSelector({ maxSize: 3 })
    const selector = createSelector(
      (state: { items: number[] }) => state.items,
      items => items.map(i => i * 2),
      {
        memoizeOptions: { resultEqualityCheck: resultEqualityCheckSpy }
      }
    )

    selector({ items: [1, 2, 3] })
    expect(resultEqualityCheckSpy).not.toHaveBeenCalled()

    selector({ items: [1, 2, 3] })
    expect(resultEqualityCheckSpy).not.toHaveBeenCalled()
  })

  test('Large scale LRU cache stress test', () => {
    const maxSize = 100
    const createSelector = createMemoizedSelector({ maxSize })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return `result-${id}`
      }
    )

    for (let i = 0; i < maxSize; i++) {
      selector({ id: i })
    }
    expect(funcCalls).toBe(maxSize)
    expect(selector.cache.size).toBe(maxSize)

    for (let i = 0; i < maxSize; i++) {
      selector({ id: i })
    }
    expect(funcCalls).toBe(maxSize)

    selector({ id: maxSize + 1 })
    expect(funcCalls).toBe(maxSize + 1)
    expect(selector.cache.size).toBe(maxSize)

    const cacheKeys = Array.from(selector.cache.keys())
    expect(cacheKeys).not.toContain('[{"id":0}]')
    expect(cacheKeys).toContain(`[{"id":${maxSize + 1}}]`)
  })

  test('LRU with interleaved access patterns', () => {
    const createSelector = createMemoizedSelector({ maxSize: 4 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { id: number }) => state.id,
      id => {
        funcCalls++
        return id * 10
      },
      {
        devModeChecks: { identityFunctionCheck: 'never', inputStabilityCheck: 'never' }
      }
    )

    selector({ id: 1 })
    selector({ id: 2 })
    selector({ id: 3 })
    selector({ id: 4 })
    expect(funcCalls).toBe(4)

    selector({ id: 2 })
    selector({ id: 3 })
    expect(funcCalls).toBe(4)

    const keys1 = Array.from(selector.cache.keys())
    expect(keys1[0]).toBe('[{"id":3}]')
    expect(keys1[1]).toBe('[{"id":2}]')
    expect(keys1[2]).toBe('[{"id":4}]')
    expect(keys1[3]).toBe('[{"id":1}]')

    selector({ id: 5 })
    selector({ id: 6 })
    expect(funcCalls).toBe(6)

    const keys2 = Array.from(selector.cache.keys())
    expect(keys2).toHaveLength(4)
    expect(keys2).toContain('[{"id":6}]')
    expect(keys2).toContain('[{"id":5}]')
    expect(keys2).toContain('[{"id":3}]')
    expect(keys2).toContain('[{"id":2}]')
    expect(keys2).not.toContain('[{"id":1}]')
    expect(keys2).not.toContain('[{"id":4}]')
  })

  test('memoizedResultFunc.cache exposes the result function cache', () => {
    const createSelector = createMemoizedSelector({ maxSize: 3 })

    let funcCalls = 0
    const selector = createSelector(
      (state: { a: number; b: number }) => state.a,
      (state: { a: number; b: number }) => state.b,
      (a, b) => {
        funcCalls++
        return a + b
      }
    )

    selector({ a: 1, b: 2 })
    selector({ a: 3, b: 4 })

    expect(selector.memoizedResultFunc.cache).toBeInstanceOf(Map)
    expect(selector.memoizedResultFunc.cache.size).toBe(2)
    expect(selector.memoizedResultFunc.cache.get('[1,2]')).toBe(3)
    expect(selector.memoizedResultFunc.cache.get('[3,4]')).toBe(7)
  })

  test('withTypes with multiple input selectors and parameters', () => {
    interface AppState {
      users: { id: number; name: string; age: number }[]
      posts: { userId: number; title: string }[]
    }

    const createSelector = createMemoizedSelector({ maxSize: 5 })
    const createAppSelector = createSelector.withTypes<AppState>()

    let funcCalls = 0
    const selectUserPosts = createAppSelector(
      [
        state => state.users,
        state => state.posts,
        (state, userId: number) => userId
      ],
      (users, posts, userId) => {
        funcCalls++
        const user = users.find(u => u.id === userId)
        const userPosts = posts.filter(p => p.userId === userId)
        return { user, posts: userPosts }
      }
    )

    const state: AppState = {
      users: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 }
      ],
      posts: [
        { userId: 1, title: 'Post 1' },
        { userId: 1, title: 'Post 2' },
        { userId: 2, title: 'Post 3' }
      ]
    }

    const result1 = selectUserPosts(state, 1)
    expect(funcCalls).toBe(1)
    expect(result1.user?.name).toBe('Alice')
    expect(result1.posts).toHaveLength(2)

    const result2 = selectUserPosts(state, 1)
    expect(funcCalls).toBe(1)
    expect(result2).toBe(result1)

    const result3 = selectUserPosts(state, 2)
    expect(funcCalls).toBe(2)
    expect(result3.user?.name).toBe('Bob')

    const result4 = selectUserPosts(state, 1)
    expect(funcCalls).toBe(2)
    expect(result4).toBe(result1)
  })

  localTest(
    'Multiple dispatches maintain cache correctly',
    ({ store }) => {
      const createSelector = createMemoizedSelector({ maxSize: 6 })

      interface AppState extends RootState {}

      const createAppSelector = createSelector.withTypes<AppState>()

      let funcCalls = 0
      const selectCompletedCount = createAppSelector(
        [s => s.todos],
        todos => {
          funcCalls++
          return todos.filter(t => t.completed).length
        },
        {
          devModeChecks: { identityFunctionCheck: 'never' }
        }
      )

      const initialCompleted = selectCompletedCount(store.getState())
      expect(selectCompletedCount.dependencyRecomputations()).toBe(1)
      const initialValue = initialCompleted

      store.dispatch(toggleCompleted(0))
      const afterToggle0 = selectCompletedCount(store.getState())
      expect(selectCompletedCount.dependencyRecomputations()).toBe(2)

      store.dispatch(toggleCompleted(1))
      const afterToggle1 = selectCompletedCount(store.getState())
      expect(selectCompletedCount.dependencyRecomputations()).toBe(3)

      store.dispatch(toggleCompleted(2))
      const afterToggle2 = selectCompletedCount(store.getState())
      expect(selectCompletedCount.dependencyRecomputations()).toBe(4)

      store.dispatch(toggleCompleted(3))
      const afterToggle3 = selectCompletedCount(store.getState())
      expect(selectCompletedCount.dependencyRecomputations()).toBe(5)

      store.dispatch(toggleCompleted(4))
      const afterToggle4 = selectCompletedCount(store.getState())
      expect(selectCompletedCount.dependencyRecomputations()).toBe(6)

      expect(selectCompletedCount.cache.size).toBeLessThanOrEqual(6)

      const cacheSizeBefore = selectCompletedCount.cache.size
      store.dispatch(toggleCompleted(5))
      selectCompletedCount(store.getState())
      expect(selectCompletedCount.cache.size).toBeLessThanOrEqual(6)
      expect(selectCompletedCount.cache.size).toBe(cacheSizeBefore)
    }
  )

  localTest(
    'maxSize 0 or negative still works correctly with Redux store',
    ({ store }) => {
      for (const size of [0, -1, -10]) {
        const createSelector = createMemoizedSelector({ maxSize: size })
        interface AppState extends RootState {}

        const createAppSelector = createSelector.withTypes<AppState>()

        let funcCalls = 0
        const selectTodoTitles = createAppSelector(
          [s => s.todos],
          todos => {
            funcCalls++
            return todos.map(t => t.title)
          }
        )

        const titles1 = selectTodoTitles(store.getState())
        expect(funcCalls).toBe(1)
        expect(selectTodoTitles(store.getState())).toBe(titles1)
        expect(funcCalls).toBe(1)

        store.dispatch(toggleCompleted(0))

        const titles2 = selectTodoTitles(store.getState())
        expect(funcCalls).toBe(2)
        expect(titles2).toEqual(titles1)
      }
    }
  )

  test('Key collision with custom keySelector still works correctly', () => {
    const createSelector = createMemoizedSelector({
      maxSize: 10,
      keySelector: args => {
        const [state] = args as [{ category: string; productId: number; variant: string }]
        return `${state.category}-${state.productId}`
      }
    })

    let funcCalls = 0
    const selector = createSelector(
      (state: { category: string; productId: number; variant: string }) => state,
      state => {
        funcCalls++
        return `${state.category}-${state.productId}-${state.variant}`
      }
    )

    expect(selector({ category: 'books', productId: 1, variant: 'hardcover' })).toBe(
      'books-1-hardcover'
    )
    expect(funcCalls).toBe(1)

    expect(selector({ category: 'books', productId: 1, variant: 'paperback' })).toBe(
      'books-1-hardcover'
    )
    expect(funcCalls).toBe(1)

    expect(selector({ category: 'books', productId: 2, variant: 'ebook' })).toBe(
      'books-2-ebook'
    )
    expect(funcCalls).toBe(2)
  })
})
