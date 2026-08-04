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

// B66: есть ли ошибки в журнале фоновых задач — для треугольника у пункта меню
// «Журнал фоновых задач» и у иконки «Настройки».
export function useJobsAlert() {
  return useContext(CompanyContext)?.jobsAlert ?? false
}

export function useRefreshJobsAlert() {
  return useContext(CompanyContext)?.refreshJobsAlert
}
