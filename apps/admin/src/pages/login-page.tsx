import { useState, type FormEvent } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { AlertCircleIcon, ArrowRightIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useAdminAuth } from "@/hooks/use-admin-auth"

type LoginLocationState = {
  from?: string
}

export function LoginPage() {
  const location = useLocation()
  const { status, errorMessage, signIn, clearError } = useAdminAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const isSubmitting = status === "loading"
  const isConfigured = status !== "unconfigured"
  const destination =
    (location.state as LoginLocationState | null)?.from ?? "/cohort-pulse"

  if (status === "authorized") {
    return <Navigate to={destination} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await signIn(email, password)
    } catch {
      // The provider maps Firebase errors to a safe, actionable message.
    }
  }

  return (
    <main className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(20rem,0.8fr)_minmax(34rem,1.2fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:min-h-svh lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full border border-sidebar-border" />
        <div className="absolute -right-3 -bottom-3 size-56 rounded-full bg-foundation/10" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary font-mono text-sm font-semibold text-sidebar-primary-foreground">
            DP
          </span>
          <div>
            <p className="font-semibold tracking-tight">DP FIT</p>
            <p className="text-xs text-sidebar-foreground/60">Admin operations</p>
          </div>
        </div>

        <div className="relative max-w-xl">
          <h1 className="text-5xl leading-[0.96] font-semibold tracking-tighter text-balance xl:text-6xl">
            Issue access. Get members moving.
          </h1>
        </div>
      </section>

      <section className="flex min-h-svh items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-mono text-xs font-semibold text-primary-foreground">
                DP
              </span>
              <span className="font-semibold tracking-tight">DP FIT</span>
            </div>
            <Badge variant="outline">Admin</Badge>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="gap-3 border-b">
              <div>
                <CardTitle className="text-2xl tracking-tight">Sign in to admin</CardTitle>
              </div>
            </CardHeader>

            <CardContent>
              <form id="admin-login-form" onSubmit={handleSubmit}>
                <FieldGroup>
                  {!isConfigured && (
                    <Alert>
                      <AlertCircleIcon />
                      <AlertTitle>Firebase setup required</AlertTitle>
                      <AlertDescription>
                        Add the Firebase web configuration to your local .env file before signing in.
                      </AlertDescription>
                    </Alert>
                  )}

                  {errorMessage && (
                    <Alert variant="destructive">
                      <AlertCircleIcon />
                      <AlertTitle>Sign-in failed</AlertTitle>
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  )}

                  <Field>
                    <FieldLabel htmlFor="admin-email">Email address</FieldLabel>
                    <Input
                      id="admin-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        clearError()
                      }}
                      placeholder="admin@dpfit.com"
                      disabled={!isConfigured || isSubmitting}
                      required
                      className="h-11"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="admin-password">Password</FieldLabel>
                    <Input
                      id="admin-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        clearError()
                      }}
                      disabled={!isConfigured || isSubmitting}
                      minLength={6}
                      required
                      className="h-11"
                    />
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    className="h-11 w-full"
                    disabled={!isConfigured || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        Verifying access
                      </>
                    ) : (
                      <>
                        Continue to dashboard
                        <ArrowRightIcon data-icon="inline-end" />
                      </>
                    )}
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>

          </Card>
        </div>
      </section>
    </main>
  )
}
