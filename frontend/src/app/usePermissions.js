import { useAuth } from './AuthContext.jsx'
import { computePermissions } from '../shared/permissions.js'

export function usePermissions() {
  const { user } = useAuth()
  return computePermissions(user)
}

export function Can({ perm, children }) {
  const perms = usePermissions()
  return perms[perm] ? children : null
}
