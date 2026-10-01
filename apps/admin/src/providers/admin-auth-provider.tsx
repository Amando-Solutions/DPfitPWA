import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  browserLocalPersistence,
  getIdTokenResult,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"
import { useQueryClient } from "@tanstack/react-query"

import {
  firebaseAuth,
  isFirebaseConfigured,
} from "@/lib/firebase"
import {
  AdminAuthContext,
  type AdminAuthStatus,
} from "@/providers/admin-auth-context"

const ADMIN_CLAIM = "dpfitAdmin"

function authErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "not-authorized") {
      return "This account is not the provisioned DP Fit admin."
    }

    if (error.message.includes("auth/invalid-credential")) {
      return "The email or password is incorrect."
    }

    if (error.message.includes("auth/too-many-requests")) {
      return "Too many attempts. Wait a moment, then try again."
    }

    if (error.message.includes("auth/network-request-failed")) {
      return "The sign-in service could not be reached. Check your connection."
    }
  }

  return "Sign-in could not be completed. Please try again."
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AdminAuthStatus>(
    isFirebaseConfigured ? "loading" : "unconfigured",
  )
  const [user, setUser] = useState<User | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseAuth) {
      return
    }

    let isActive = true

    void setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {
      // Firebase still provides a safe in-memory fallback if local persistence fails.
    })

    const unsubscribe = onIdTokenChanged(firebaseAuth, async (nextUser) => {
      if (!isActive) {
        return
      }

      if (!nextUser) {
        queryClient.clear()
        setUser(null)
        setStatus("signed-out")
        return
      }

      setStatus("loading")

      try {
        const token = await getIdTokenResult(nextUser, true)

        if (token.claims[ADMIN_CLAIM] !== true) {
          await firebaseSignOut(firebaseAuth)
          if (isActive) {
            queryClient.clear()
            setUser(null)
            setErrorMessage("This account is not the provisioned DP Fit admin.")
            setStatus("signed-out")
          }
          return
        }

        if (isActive) {
          setUser(nextUser)
          setErrorMessage(null)
          setStatus("authorized")
        }
      } catch (error) {
        if (isActive) {
          queryClient.clear()
          setUser(null)
          setErrorMessage(authErrorMessage(error))
          setStatus("signed-out")
        }
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [queryClient])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) {
      setStatus("unconfigured")
      return
    }

    setErrorMessage(null)
    setStatus("loading")

    try {
      await setPersistence(firebaseAuth, browserLocalPersistence)
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password,
      )
      const token = await getIdTokenResult(credential.user, true)

      if (token.claims[ADMIN_CLAIM] !== true) {
        await firebaseSignOut(firebaseAuth)
        throw new Error("not-authorized")
      }

      setUser(credential.user)
      setStatus("authorized")
    } catch (error) {
      setUser(null)
      setErrorMessage(authErrorMessage(error))
      setStatus("signed-out")
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!firebaseAuth) {
      return
    }

    setStatus("loading")
    await firebaseSignOut(firebaseAuth)
    setUser(null)
    setErrorMessage(null)
    setStatus("signed-out")
  }, [])

  const clearError = useCallback(() => setErrorMessage(null), [])

  const value = useMemo(
    () => ({ status, user, errorMessage, signIn, signOut, clearError }),
    [status, user, errorMessage, signIn, signOut, clearError],
  )

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  )
}
