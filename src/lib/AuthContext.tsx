import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { currentUser, isSignedIn, signOut as apiSignOut, type User } from './auth'

interface AuthValue {
  user: User | null
  /** True until the first /me round-trip settles, so gates don't flash. */
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSignedIn())

  const refresh = useCallback(async () => {
    if (!isSignedIn()) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setUser(await currentUser())
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await apiSignOut()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, refresh, signOut }), [user, loading, refresh, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
