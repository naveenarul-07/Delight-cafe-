import { createContext, useContext, useMemo, useState } from 'react'

const LoaderContext = createContext(null)

export function LoaderProvider({ children }) {
  const [loaded, setLoaded] = useState(false)
  const value = useMemo(() => ({ loaded, setLoaded }), [loaded])
  return <LoaderContext.Provider value={value}>{children}</LoaderContext.Provider>
}

export function useLoader() {
  const ctx = useContext(LoaderContext)
  if (!ctx) throw new Error('useLoader must be used within LoaderProvider')
  return ctx
}
