import { createContext } from "react"
import type { User } from "firebase/auth"

export type AdminAuthStatus =
  | "loading"
  | "signed-out"
  | "authorized"
  | "unconfigured"

export type AdminAuthContextValue = {
  status: AdminAuthStatus
  user: User | null
  errorMessage: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)
