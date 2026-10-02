import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { zoneLabel } from "@/lib/cohort-calendar"
import { currencyScale, formatPrice, type CohortCoachInput, type CohortRegistrationInput } from "@/lib/cohorts"

/** The price as the landing page will show it, or `null` until the fields read as one. */
function pricePreview({ price, currency }: CohortRegistrationInput) {
  const code = currency.trim().toUpperCase()
  const amount = Number(price.replace(/,/g, "").trim())
  if (!price.trim() || !/^[A-Z]{3}$/.test(code) || !Number.isFinite(amount) || amount < 0) return null
  return formatPrice(Math.round(amount * currencyScale(code)), code)
}

/**
 * The landing site's offer: price, code lifetime and the pre-order window.
 * `required` is for a new cohort, which carries its own price and lifetime; an
 * older one may still leave them to the landing site's environment.
 */
export function CohortSalesFields({
  id,
  value,
  onChange,
  zone,
  disabled,
  required = false,
}: {
  id: string
  value: CohortRegistrationInput
  onChange: (value: CohortRegistrationInput) => void
  zone: string
  disabled: boolean
  required?: boolean
}) {
  const set = (patch: Partial<CohortRegistrationInput>) => onChange({ ...value, ...patch })
  const preview = pricePreview(value)
  const someEmpty = !value.price.trim() || !value.currency.trim() || !value.codeTtlDays.trim() || !value.preorderStartsAt
  const state = disabled || undefined

  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-price`}>Price</FieldLabel>
          <Input id={`${id}-price`} inputMode="decimal" value={value.price} placeholder="30000" required={required} disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ price: event.target.value })} />
        </Field>
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-currency`}>Currency</FieldLabel>
          <Input id={`${id}-currency`} value={value.currency} placeholder="NGN" maxLength={3} required={required} disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ currency: event.target.value.toUpperCase() })} />
        </Field>
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-code-days`}>Codes last (days)</FieldLabel>
          <Input id={`${id}-code-days`} type="number" min="1" max="365" inputMode="numeric" value={value.codeTtlDays} required={required} disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ codeTtlDays: event.target.value })} />
        </Field>
      </div>
      <FieldDescription className="-mt-2 text-xs">
        {preview && <>The landing page shows {preview}. </>}Selar charges its own price, so keep the product at the same one. An unused code stays valid this many days after it's emailed.
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-preorder-opens`}>Pre-order opens</FieldLabel>
          <Input id={`${id}-preorder-opens`} type="datetime-local" value={value.preorderStartsAt} disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ preorderStartsAt: event.target.value })} />
        </Field>
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-preorder-closes`}>Pre-order closes</FieldLabel>
          <Input id={`${id}-preorder-closes`} type="datetime-local" value={value.preorderEndsAt} disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ preorderEndsAt: event.target.value })} />
        </Field>
      </div>
      <FieldDescription className="-mt-2 text-xs">
        {zoneLabel(zone)}. Seats sell only in this window, and their codes are emailed once it closes. Members can then sign in and set up until training starts.
        {!required && someEmpty && <> Empty fields fall back to the landing site's environment settings.</>}
      </FieldDescription>
    </FieldGroup>
  )
}

/** The coach members see on their private thread and in @mentions. */
export function CohortCoachFields({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: CohortCoachInput
  onChange: (value: CohortCoachInput) => void
  disabled: boolean
}) {
  const set = (patch: Partial<CohortCoachInput>) => onChange({ ...value, ...patch })
  const state = disabled || undefined

  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input id={`${id}-name`} value={value.name} minLength={2} maxLength={80} required disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ name: event.target.value })} />
        </Field>
        <Field data-disabled={state}>
          <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
          <Input id={`${id}-title`} value={value.title} minLength={2} maxLength={80} required disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ title: event.target.value })} />
        </Field>
      </div>
      <Field data-disabled={state}>
        <FieldLabel htmlFor={`${id}-avatar`}>Avatar URL</FieldLabel>
        <Input id={`${id}-avatar`} type="url" value={value.avatarUrl} maxLength={2048} placeholder="https://…" disabled={disabled} className="h-11 sm:h-8" onChange={(event) => set({ avatarUrl: event.target.value })} />
      </Field>
    </FieldGroup>
  )
}
