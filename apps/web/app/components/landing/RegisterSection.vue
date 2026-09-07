<script setup lang="ts">
import { PRICE, REGISTER_STEPS } from '~/data/landing'

/**
 * Step one of three: the details the coach needs before anyone pays.
 *
 * The step it ends on is the handover to Selar. `POST /api/register` records
 * the attempt and answers with a checkout URL, and this component's last act is
 * to navigate to it — so there is no success state here at all. What happens
 * after payment belongs to `pages/registration/complete.vue`.
 *
 * Nothing about the access code passes through this component. It is not
 * minted until Selar reports the sale, it is delivered by email, and the
 * browser is never told what it is.
 */

interface RegistrationStepOne {
  fullName: string
  email: string
  whatsapp: string
  timezone: string
}

/**
 * Fired with the validated answers just before the browser leaves for Selar.
 *
 * Nothing listens to it today. It is kept because it is the only moment the
 * page knows who is about to pay, which is what an analytics or pixel call
 * would need — and because the navigation that follows makes it the last thing
 * this component ever does.
 */
const emit = defineEmits<{ submit: [RegistrationStepOne] }>()

const form = reactive<RegistrationStepOne>({
  fullName: '',
  email: '',
  whatsapp: '',
  timezone: '',
})

type FieldName = keyof RegistrationStepOne

interface Field {
  name: FieldName
  label: string
  type: string
  placeholder?: string
  autocomplete: string
  inputmode?: 'text' | 'email' | 'tel'
  /** Returns an error message, or an empty string when the value is fine. */
  validate: (value: string) => string
}

const required = (value: string) => value.trim().length > 0

const FIELDS: Field[] = [
  {
    name: 'fullName',
    label: 'Full name',
    type: 'text',
    autocomplete: 'name',
    validate: (v) => (required(v) ? '' : 'Tell us what to call you.'),
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    autocomplete: 'email',
    inputmode: 'email',
    // Deliberately permissive. The only thing worth catching in the browser is
    // a value that could not possibly be deliverable; anything stricter starts
    // rejecting real addresses, and the confirmation mail is the real check.
    validate: (v) =>
      !required(v)
        ? 'We need an email to send your access details to.'
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
          ? ''
          : 'That address looks incomplete.',
  },
  {
    name: 'whatsapp',
    label: 'WhatsApp number',
    type: 'tel',
    placeholder: '+234…',
    autocomplete: 'tel',
    inputmode: 'tel',
    // The group chat runs on WhatsApp, so this is how someone actually gets
    // into the cohort. Digits, spaces and the usual punctuation, seven or more.
    validate: (v) =>
      !required(v)
        ? 'The group chat runs on WhatsApp, so we need your number.'
        : /^\+?[\d\s().-]{7,}$/.test(v.trim())
          ? ''
          : 'Include the country code, like +234 801 234 5678.',
  },
  {
    name: 'timezone',
    label: 'Time zone / country',
    type: 'text',
    placeholder: 'e.g. Lagos, WAT',
    autocomplete: 'country-name',
    // Not a picker: the live calls run in two slots and this is what decides
    // which one someone is pointed at, so a human-readable answer is enough.
    validate: (v) =>
      required(v) ? '' : 'This decides which call slot suits you.',
  },
]

/** Populated on the first submit attempt, then kept live as fields are fixed. */
const errors = reactive<Partial<Record<FieldName, string>>>({})
const attempted = ref(false)
const done = ref(false)

/**
 * In flight, and stays true once a checkout URL is in hand.
 *
 * Never reset on the success path: the browser is on its way to Selar, and a
 * button that springs back to life during that navigation is an invitation to
 * start a second checkout.
 */
const submitting = ref(false)

/**
 * A failure that belongs to the form rather than to any one field — the server
 * refusing, or not answering at all. Kept apart from `errors` because nothing
 * on the form is wrong when this is set and pointing at a field would be a lie.
 */
const failure = ref('')


function validateField(field: Field) {
  const message = field.validate(form[field.name])
  if (message) errors[field.name] = message
  else delete errors[field.name]
  return !message
}

// Re-validating on input before the first submit would scold someone for an
// incomplete email while they are still typing it, so it only starts once they
// have asked to continue.
function onInput(field: Field) {
  if (attempted.value) validateField(field)
  if (failure.value) failure.value = ''
}

/**
 * What went wrong, in the server's words where it gave any.
 *
 * `$fetch` throws with the JSON body on `data`, and the route sets
 * `statusMessage` to something a person can act on — being rate-limited, most
 * usefully. A network failure has no body at all, which is what the fallback
 * is for.
 */
const failureMessage = (cause: unknown) => {
  const message = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
  return message || 'We could not reach the server. Check your connection and try again.'
}

async function onSubmit() {
  // Re-entrancy guard. Enter and a click both land here, and a second request
  // while the first is open would issue against an address that is about to
  // have a code.
  if (submitting.value || done.value) return

  attempted.value = true
  failure.value = ''
  const ok = FIELDS.map(validateField).every(Boolean)
  if (!ok) {
    // Send focus to the first thing that needs fixing, rather than leaving the
    // page still and the error somewhere off screen.
    const firstBad = FIELDS.find((f) => errors[f.name])
    if (firstBad) document.getElementById(`register-${firstBad.name}`)?.focus()
    return
  }

  submitting.value = true
  try {
    const result = await $fetch<{ ok: true; checkoutUrl: string }>('/api/register', {
      method: 'POST',
      body: { ...form },
    })

    emit('submit', { ...form })
    done.value = true

    // `assign`, not `replace`: Selar's checkout has its own way back and so
    // does the browser, and that somewhere is this page with the form still
    // filled in.
    window.location.assign(result.checkoutUrl)
  } catch (cause) {
    failure.value = failureMessage(cause)
    // Reset only on failure. On the way to Selar the button stays disabled,
    // because the navigation has not visibly started yet and a second press
    // would open a second registration.
    submitting.value = false
  }
}
</script>

<template>
  <section id="register" class="bg-page py-20 lg:py-30">
    <PageContainer>
      <div class="max-w-155">
        <p class="eyebrow-section text-rose-fill">Register, then pay</p>
        <h2 class="title-section mt-4.5 text-ink">Register for your spot.</h2>
        <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
          Fill this in once. Your program access and nutrition guidance are set
          up from what you enter here, and payment comes right after.
        </p>
      </div>

      <div
        class="mt-12 rounded-card border border-[rgba(36,27,46,0.12)] bg-white p-6 shadow-[0_30px_35px_rgba(36,27,46,0.09)] sm:p-10 lg:mt-13 lg:p-12.25"
      >
        <!-- Three steps, one bar each. `aria-current` rather than colour alone
             is what tells a screen reader which one is live. -->
        <ol class="flex gap-4.5">
          <li
            v-for="(step, i) in REGISTER_STEPS"
            :key="step"
            class="flex-1"
            :aria-current="i === 0 ? 'step' : undefined"
          >
            <span
              class="block h-1 rounded-pill"
              :class="i === 0 ? 'bg-rose-fill' : 'bg-rule'"
            />
            <span
              class="mt-2.5 block font-data text-[10px] tracking-[0.12em] text-soft uppercase"
            >
              {{ step }}
            </span>
          </li>
        </ol>

        <form class="mt-8 lg:mt-8.5" novalidate @submit.prevent="onSubmit">
          <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="field in FIELDS" :key="field.name" class="flex flex-col gap-1.75">
              <label
                :for="`register-${field.name}`"
                class="font-data text-[11.5px] tracking-[0.06em] text-soft uppercase"
              >
                {{ field.label }}
              </label>
              <input
                :id="`register-${field.name}`"
                v-model="form[field.name]"
                :type="field.type"
                :name="field.name"
                :placeholder="field.placeholder"
                :autocomplete="field.autocomplete"
                :inputmode="field.inputmode"
                :aria-invalid="errors[field.name] ? true : undefined"
                :aria-describedby="
                  errors[field.name] ? `register-${field.name}-error` : undefined
                "
                class="h-11.5 rounded-field border bg-field px-3.75 font-body text-[15px] text-ink transition-colors placeholder:text-[#757575] focus:outline-none focus-visible:border-rose-fill focus-visible:ring-2 focus-visible:ring-rose-ring"
                :class="
                  errors[field.name]
                    ? 'border-rose-fill'
                    : 'border-field-edge'
                "
                @input="onInput(field)"
                @blur="onInput(field)"
              >
              <p
                v-if="errors[field.name]"
                :id="`register-${field.name}-error`"
                class="font-body text-[13px] text-rose-fill"
              >
                {{ errors[field.name] }}
              </p>
            </div>
          </div>

          <!-- Stays put and stays disabled once a checkout URL is in hand.
               The browser is mid-navigation to Selar at that point, and a
               button that springs back to life opens a second checkout. -->
          <div class="mt-7 flex flex-wrap items-center gap-3.5 lg:mt-7">
            <CtaButton type="submit" variant="ink" :disabled="submitting || done">
              {{ submitting ? 'Taking you to payment…' : `Continue to payment · ${PRICE}` }}
            </CtaButton>
            <p class="font-body text-[13.5px] text-ink-mute">
              Secure checkout with Selar. Your access code is emailed once
              payment clears.
            </p>
          </div>

          <!-- `role="alert"` rather than `status`: this interrupts, because the
               form looked correct and the failure is the only reason nothing
               happened. -->
          <p
            v-if="failure"
            role="alert"
            class="mt-6 rounded-field border border-rose-fill bg-[rgba(200,30,92,0.06)] px-4 py-3 font-body text-[14.5px] text-rose-fill"
          >
            {{ failure }}
          </p>

        </form>
      </div>
    </PageContainer>
  </section>
</template>
