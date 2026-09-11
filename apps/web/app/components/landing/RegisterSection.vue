<script setup lang="ts">
import { PRICE } from '~/data/landing'
import { detectTimezone, isTimezone } from '~/data/timezones'

/**
 * The whole of registration on this site: the details the coach needs before
 * anyone pays.
 *
 * One form, no progress bar. Payment happens on Selar's own checkout at its own
 * URL, so a step indicator here would be counting steps this page cannot show
 * and does not own. `POST /api/register` records the attempt and answers with a
 * checkout URL, and this component's last act is to navigate to it — so there
 * is no success state here at all. What happens after payment belongs to
 * `pages/registration/complete.vue`.
 *
 * Nothing about the access code passes through this component. It is not
 * minted until Selar reports the sale, it is delivered by email, and the
 * browser is never told what it is.
 */

interface RegistrationDetails {
  firstName: string
  lastName: string
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
const emit = defineEmits<{ submit: [RegistrationDetails] }>()

const form = reactive<RegistrationDetails>({
  firstName: '',
  lastName: '',
  email: '',
  whatsapp: '',
  timezone: '',
})

type FieldName = keyof RegistrationDetails

interface Field {
  name: FieldName
  label: string
  /** Rendered as `TimezoneSelect` rather than an `<input>`. Only one field is. */
  control?: 'select'
  type?: string
  placeholder?: string
  /** Absent on the time zone, which is a button and has nothing to fill. */
  autocomplete?: string
  inputmode?: 'text' | 'email' | 'tel'
  /**
   * How many of the six columns the field takes on the widest layout.
   *
   * Two apiece for the name and the email, which fills the first row; four for
   * the time zone, because it is the one field holding a sentence — "New York
   * City, Brooklyn — Eastern Time (GMT-05:00)" — and a narrower one shows the
   * first two words of it.
   */
  columns: 2 | 4
  /** Returns an error message, or an empty string when the value is fine. */
  validate: (value: string) => string
}

/**
 * Tailwind reads class names out of the source, so it cannot see one that is
 * assembled at runtime. A lookup, not a template string.
 */
const COLUMN_CLASS: Record<Field['columns'], string> = {
  2: 'xl:col-span-2',
  4: 'sm:col-span-2 xl:col-span-4',
}

const required = (value: string) => value.trim().length > 0

const FIELDS: Field[] = [
  // Two fields rather than one. The coach addresses people by their first
  // name — in the access-code email, in the group chat — and splitting a
  // typed "full name" on whitespace guesses wrong the moment somebody has two
  // given names or none. Asking is the only way to actually know.
  {
    name: 'firstName',
    label: 'First name',
    type: 'text',
    autocomplete: 'given-name',
    columns: 2,
    validate: (v) => (required(v) ? '' : 'Tell us what to call you.'),
  },
  {
    name: 'lastName',
    label: 'Last name',
    type: 'text',
    autocomplete: 'family-name',
    columns: 2,
    validate: (v) => (required(v) ? '' : 'We need your last name too.'),
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    autocomplete: 'email',
    inputmode: 'email',
    columns: 2,
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
    columns: 2,
    // The group chat runs on WhatsApp, so this is how someone actually gets
    // into the cohort. Digits, spaces and the usual punctuation, seven or more.
    validate: (v) =>
      !required(v)
        ? 'Enter your phone number.'
        : /^\+?[\d\s().-]{7,}$/.test(v.trim())
          ? ''
          : 'Include the country code, like +234 801 234 5678.',
  },
  // A picker, where this was once a text input asking for "e.g. Lagos, WAT".
  // The live calls run in two slots and this is the answer that decides which
  // one somebody is pointed at, so it is the single field where a typo costs
  // a person a call — and nothing downstream can tell a typo from a place it
  // has not heard of. The list and what it stores are in `~/data/timezones`.
  {
    name: 'timezone',
    label: 'Time zone',
    control: 'select',
    placeholder: 'Select your time zone',
    columns: 4,
    validate: (v) =>
      !required(v)
        ? 'This decides which call slot suits you.'
        : isTimezone(v)
          ? ''
          : 'Pick your time zone from the list.',
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

/**
 * The browser already knows where it is, so the field starts answered.
 *
 * On mount rather than in the form's initial state, because this page is
 * prerendered: a zone resolved while the state is built is resolved during the
 * build, which bakes the build machine's zone into the HTML every visitor is
 * served — and hydrates into a mismatch besides. A zone the list does not carry
 * resolves to `''` and leaves the placeholder showing, which is the honest
 * answer: a wrong zone sitting in a filled-looking field is never re-read.
 */
onMounted(() => {
  if (!form.timezone) form.timezone = detectTimezone()
})

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
        <form novalidate @submit.prevent="onSubmit">
          <!-- Six columns, counted in twos: the two halves of a name and the
               email fill the first row, the phone number and the time zone the
               second — the picker taking four of them because it is the only
               field holding a sentence. Two-up below that, which keeps a name
               on one line and gives the picker a row of its own.

               `inert` from the moment the request goes out and, like the
               button, never lifted on the way through: the answers below are
               what the registration was recorded against and what the access
               code will be emailed to, and they are read once, here, before
               the browser leaves for Selar. A field that still takes input
               after that lets somebody correct their email onto a screen whose
               value no longer goes anywhere — they pay, and the code is
               delivered to the address they can see they changed.

               `inert` rather than `disabled` on each control: it is one
               attribute on the row that already exists, so it cannot miss a
               field as fields are added, and it reaches inside the time-zone
               picker — its button and its panel both — where `disabled` would
               have to be threaded through as a prop. -->
          <!-- `grid-cols-1` is not decoration. Unset, the single column on a
               phone is an implicit `auto` track sized to its widest item's
               *max*-content — which for the time-zone button is the whole
               untruncated label, so the track ran past the card and gave the
               page a horizontal scrollbar. The class compiles to
               `minmax(0, 1fr)`, the column the other two breakpoints were
               already getting. -->
          <div
            class="grid grid-cols-1 gap-5 transition-opacity duration-150 sm:grid-cols-2 xl:grid-cols-6"
            :class="(submitting || done) && 'opacity-60'"
            :inert="submitting || done"
            :aria-busy="submitting || undefined"
          >
            <div
              v-for="field in FIELDS"
              :key="field.name"
              class="flex min-w-0 flex-col gap-1.75"
              :class="COLUMN_CLASS[field.columns]"
            >
              <label
                :for="`register-${field.name}`"
                class="font-data text-[11.5px] tracking-[0.06em] text-soft uppercase"
              >
                {{ field.label }}
              </label>

              <!-- The time zone, which is the one field with no text input
                   behind it at all: see `TimezoneSelect`. Picking is the only
                   way a value arrives, so re-validating on change is enough —
                   there is no half-typed state to scold anybody for. -->
              <TimezoneSelect
                v-if="field.control === 'select'"
                :id="`register-${field.name}`"
                v-model="form[field.name]"
                :label="field.label"
                :placeholder="field.placeholder ?? ''"
                :invalid="Boolean(errors[field.name])"
                :describedby="
                  errors[field.name] ? `register-${field.name}-error` : undefined
                "
                @update:model-value="onInput(field)"
              />

              <input
                v-else
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
