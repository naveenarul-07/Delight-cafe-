import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const CursorContext = createContext(null)

const initial = {
  label: '',
  active: false,
  magnetic: false,
}

export function CursorProvider({ children }) {
  const [cursor, setCursorState] = useState(initial)

  const setCursor = useCallback((next) => {
    setCursorState((prev) => ({ ...prev, ...next }))
  }, [])

  const resetCursor = useCallback(() => {
    setCursorState(initial)
  }, [])

  const value = useMemo(() => ({ cursor, setCursor, resetCursor }), [cursor, setCursor, resetCursor])

  return <CursorContext.Provider value={value}>{children}</CursorContext.Provider>
}

export function useCursor() {
  const ctx = useContext(CursorContext)
  if (!ctx) throw new Error('useCursor must be used within CursorProvider')
  return ctx
}
