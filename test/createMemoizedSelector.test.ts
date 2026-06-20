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
})
