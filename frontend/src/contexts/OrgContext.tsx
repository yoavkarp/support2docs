import { createContext, useContext, useState, type ReactNode } from 'react'

interface OrgContextValue {
  activeOrgId: string | null
  setActiveOrgId: (id: string) => void
}

const OrgContext = createContext<OrgContextValue>({
  activeOrgId: null,
  setActiveOrgId: () => {},
})

export function OrgProvider({ children }: { children: ReactNode }) {
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(
    () => localStorage.getItem('activeOrgId'),
  )

  function setActiveOrgId(id: string) {
    localStorage.setItem('activeOrgId', id)
    setActiveOrgIdState(id)
  }

  return (
    <OrgContext.Provider value={{ activeOrgId, setActiveOrgId }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useActiveOrg() {
  return useContext(OrgContext)
}
