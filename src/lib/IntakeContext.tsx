import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { emptyIntake, type IntakeData } from './types'

const STORAGE_KEY = 'customerx.intake.v1'

interface IntakeContextValue {
  data: IntakeData
  update: (patch: Partial<IntakeData>) => void
  reset: () => void
}

const IntakeContext = createContext<IntakeContextValue | null>(null)

function loadInitial(): IntakeData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyIntake, ...JSON.parse(raw) }
  } catch {
    // ignore corrupt storage
  }
  return emptyIntake
}

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<IntakeData>(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // storage full or unavailable — fail silently, data still lives in memory
    }
  }, [data])

  const update = (patch: Partial<IntakeData>) => setData((prev) => ({ ...prev, ...patch }))
  const reset = () => {
    setData(emptyIntake)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  return <IntakeContext.Provider value={{ data, update, reset }}>{children}</IntakeContext.Provider>
}

export function useIntake() {
  const ctx = useContext(IntakeContext)
  if (!ctx) throw new Error('useIntake must be used within IntakeProvider')
  return ctx
}
