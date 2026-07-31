import { createContext, useContext } from 'react'

// Контекст компании + хуки-потребители. Провайдер вынесен в CompanyProvider.jsx,
// чтобы этот модуль экспортировал только не-компоненты (не ломает React Fast Refresh).
export const CompanyContext = createContext(null)

export function useCompany() {
  return useContext(CompanyContext)?.company ?? null
}

export function useRefreshCompany() {
  return useContext(CompanyContext)?.refresh
}

export function useDuplicatesCount() {
  return useContext(CompanyContext)?.duplicatesCount ?? 0
}

export function useRefreshDuplicates() {
  return useContext(CompanyContext)?.refreshDuplicates
}

export function useStorageLow() {
  return useContext(CompanyContext)?.storageLow ?? false
}
