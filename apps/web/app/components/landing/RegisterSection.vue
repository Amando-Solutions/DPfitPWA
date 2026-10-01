<script setup lang="ts">
import { detectTimezone, isTimezone } from '~/data/timezones'
import { APP_NAME, EQUIPMENT, NEXT_STEPS, TRAINING_SPLIT } from '~/data/landing'

/**
 * "book your slot": the offer on the left, the form on the right.
 *
 * The form records the registration (`POST /api/register`), which answers with
 * a Selar checkout URL. Payment happens on Selar's own page, so the moment the
 * URL is in hand this card turns into the design's "one last step" panel and
 * the browser leaves for Selar — the panel's own link is there for anyone
 * whose navigation is slow or blocked. What happens after payment belongs to
 * `pages/registration/complete.vue`.
 *
 * Nothing about the access code passes through this component. It is minted
 * when Selar reports the sale, emailed, and never shown to the browser.
 */
const { challenge, weeks, price, perWeek, startsLong, closesLong, opensLong, state } = useCohortLabels()
const rawPrice = usePrice()

interface RegistrationDetails {
  firstName: string
  lastName: string
  email: string
  whatsapp: string
  timezone: string
}

/** Fired with the validated answers just before the browser leaves for Selar. */
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
  control?: 'select'
  type?: string
  placeholder?: string
  autocomplete?: string
  inputmode?: 'text' | 'email' | 'tel'
  /** Returns an error message, or an empty string when the value is fine. */
  validate: (value: string) => string
}

const required = (value: string) => value.trim().length > 0

/**
 * The same five fields the server validates in `register.post.ts`. WhatsApp
 * stays although the design reference leaves it out: the cohort's group chat
 * runs on it, the server requires it, and it pre-fills Selar's checkout.
 */
const FIELDS: Field[] = [
  {
    name: 'firstName',
    label: 'First name',
    type: 'text',
    autocomplete: 'given-name',
    validate: (v) => (required(v) ? '' : 'Tell us what to call you.'),
  },
  {
    name: 'lastName',
    label: 'Last name',
    type: 'text',
    autocomplete: 'family-name',
    validate: (v) => (required(v) ? '' : 'We need your last name too.'),
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'you@email.com',
    autocomplete: 'email',
    inputmode: 'email',
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
    validate: (v) =>
      !required(v)
        ? 'Enter your phone number.'
        : /^\+?[\d\s().-]{7,}$/.test(v.trim())
          ? ''
          : 'Include the country code, like +234 801 234 5678.',
  },
  {
    name: 'timezone',
    label: 'Your timezone',
    control: 'select',
    placeholder: 'Select your timezone',
    validate: (v) =>
      !required(v)
        ? 'This decides which call slot suits you.'
        : isTimezone(v)
          ? ''
          : 'Pick your timezone from the list.',
  },
]

const nameFields = FIELDS.slice(0, 2)
const otherFields = FIELDS.slice(2)

const errors = reactive<Partial<Record<FieldName, string>>>({})
const attempted = ref(false)

/** In flight, and stays true once a checkout URL is in hand. */
const submitting = ref(false)
/** The Selar URL, once the registration is recorded. Swaps the card's contents. */
const checkoutUrl = ref<string | null>(null)
const failure = ref('')

/** True while the timezone is still the one the browser guessed. */
const tzDetected = ref(false)

onMounted(() => {
  // On mount rather than in the initial state: a zone resolved during SSR is
  // the server's zone, not the visitor's.
  if (!form.timezone) {
    form.timezone = detectTimezone()
    tzDetected.value = Boolean(form.timezone)
  }
})

const open = computed(() => Boolean(challenge.value?.registrationOpen && rawPrice.value))

const actionLabel = computed(() => {
  if (submitting.value) return 'taking you to payment…'
  if (open.value) return 'book a slot ↗'
  if (state.value === 'upcoming') return 'enrolment opens soon'
  if (state.value === 'closed') return 'enrolment is closed'
  return 'registration unavailable'
})

/** The line under the button. */
const footnote = computed(() => {
  if (state.value === 'upcoming' && opensLong.value) {
    return { strong: `Enrolment opens ${opensLong.value}.`, rest: closesLong.value ? `It closes ${closesLong.value}.` : '' }
  }
  if (state.value === 'closed') return { strong: 'Enrolment for this cohort is closed.', rest: '' }
  if (closesLong.value) return { strong: `Enrolment closes ${closesLong.value}.`, rest: 'Your next steps are sent to your email.' }
  return { strong: '', rest: 'Your next steps are sent to your email.' }
})

const details = computed(() => [
  { label: 'Starts', value: startsLong.value ?? 'To be announced' },
  { label: 'Where', value: APP_NAME },
  { label: 'Training', value: TRAINING_SPLIT },
  { label: 'Equipment', value: EQUIPMENT },
])

function validateField(field: Field) {
  const message = field.validate(form[field.name])
  if (message) errors[field.name] = message
  else delete errors[field.name]
  return !message
}

// Only scold after the first submit, so nobody is told their email is
// incomplete while they are still typing it.
function onInput(field: Field) {
  if (field.name === 'timezone') tzDetected.value = false
  if (attempted.value) validateField(field)
  if (failure.value) failure.value = ''
}

const failureMessage = (cause: unknown) => {
  const message = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
  return message || 'We could not reach the server. Check your connection and try again.'
}

async function onSubmit() {
  if (submitting.value || checkoutUrl.value || !open.value || !challenge.value || !rawPrice.value) return

  attempted.value = true
  failure.value = ''
  const ok = FIELDS.map(validateField).every(Boolean)
  if (!ok) {
    const firstBad = FIELDS.find((f) => errors[f.name])
    if (firstBad) document.getElementById(`register-${firstBad.name}`)?.focus()
    return
  }

  submitting.value = true
  try {
    const result = await $fetch<{ ok: true; checkoutUrl: string }>('/api/register', {
      method: 'POST',
      body: {
        ...form,
        cohortId: challenge.value.id,
        amountMinor: rawPrice.value.minor,
        currency: rawPrice.value.currency,
      },
    })

    emit('submit', { ...form })
    checkoutUrl.value = result.checkoutUrl
    // `assign`, not `replace`: Back from Selar should land on this page.
    window.location.assign(result.checkoutUrl)
  } catch (cause) {
    failure.value = failureMessage(cause)
    // Reset only on failure. On the way to Selar the form stays locked so a
    // second press cannot open a second registration.
    submitting.value = false
  }
}

const inputClass = (name: FieldName) => [
  'h-[52px] w-full rounded-[14px] border bg-white px-4 font-landing text-[15px] text-lp-ink',
  'transition-[border-color,box-shadow] duration-300 placeholder:text-[#8a8399]',
  'focus:border-lp-ink focus:shadow-[0_0_0_3px_rgba(29,22,40,0.12)] focus:outline-none',
  errors[name] ? 'border-[#b3261e]' : 'border-lp-field-edge',
]
</script>

<template>
  <section id="join" class="mx-auto max-w-300 px-6 pt-34 pb-10">
    <div class="grid grid-cols-1 items-start gap-x-24 gap-y-14 lg:grid-cols-2">
      <!-- The offer. -->
      <div class="lp-reveal flex flex-col gap-6">
        <span class="lp-eyebrow">join the challenge</span>
        <h2 class="lp-h2-lg">book your <span class="serif-accent">slot</span></h2>

        <div class="mt-2 flex flex-col gap-1.5">
          <div class="flex flex-wrap items-baseline gap-3">
            <span class="text-[52px] font-medium tracking-[-0.03em]">{{ price ?? 'Price to be announced' }}</span>
            <span v-if="price && weeks" class="text-[14px] text-lp-soft">for the full {{ weeks }} weeks</span>
          </div>
          <span v-if="perWeek" class="text-[15px] text-lp-soft">
            That's about <b class="font-semibold text-lp-ink">{{ perWeek }} a week</b> for your
            program, coaching, check-ins and community.
          </span>
        </div>

        <dl class="m-0 flex flex-col border-t border-lp-rule">
          <div
            v-for="row in details"
            :key="row.label"
            class="flex justify-between gap-4 border-b border-lp-rule py-3.5 text-[15px]"
          >
            <dt class="text-lp-soft">{{ row.label }}</dt>
            <dd class="m-0 text-right">{{ row.value }}</dd>
          </div>
        </dl>

        <div class="flex flex-col gap-3">
          <span class="text-[13px] font-semibold">What happens next</span>
          <ol class="m-0 grid list-none grid-cols-3 gap-2 p-0">
            <li
              v-for="(step, i) in NEXT_STEPS"
              :key="step"
              class="flex flex-col gap-2 rounded-2xl border border-lp-edge bg-white p-3.5"
            >
              <span class="text-[12px] font-bold text-lp-accent">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="text-[13px] leading-[1.45]">{{ step }}</span>
            </li>
          </ol>
        </div>
      </div>

      <!-- The form card. -->
      <div
        class="lp-reveal rounded-[28px] border border-lp-edge bg-white p-[clamp(24px,4vw,40px)] shadow-[0_30px_60px_-40px_rgba(29,22,40,0.25)]"
      >
        <form v-if="!checkoutUrl" novalidate class="flex flex-col gap-5" @submit.prevent="onSubmit">
          <!-- `inert` while the request is out: the answers are read once, and
               a field still taking input after that would let somebody "fix"
               an email that is no longer going anywhere. -->
          <div
            class="flex flex-col gap-5 transition-opacity duration-150"
            :class="submitting && 'opacity-60'"
            :inert="submitting"
            :aria-busy="submitting || undefined"
          >
            <div class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-5">
              <div v-for="field in nameFields" :key="field.name" class="flex min-w-0 flex-col gap-2">
                <label :for="`register-${field.name}`" class="text-[13px] font-semibold">{{ field.label }}</label>
                <input
                  :id="`register-${field.name}`"
                  v-model="form[field.name]"
                  :type="field.type"
                  :name="field.name"
                  :placeholder="field.placeholder"
                  :autocomplete="field.autocomplete"
                  :aria-invalid="errors[field.name] ? true : undefined"
                  :aria-describedby="errors[field.name] ? `register-${field.name}-error` : undefined"
                  :class="inputClass(field.name)"
                  @input="onInput(field)"
                  @blur="onInput(field)"
                >
                <p v-if="errors[field.name]" :id="`register-${field.name}-error`" class="m-0 text-[12.5px] text-[#b3261e]">
                  {{ errors[field.name] }}
                </p>
              </div>
            </div>

            <div v-for="field in otherFields" :key="field.name" class="flex min-w-0 flex-col gap-2">
              <label :for="`register-${field.name}`" class="text-[13px] font-semibold">{{ field.label }}</label>

              <TimezoneSelect
                v-if="field.control === 'select'"
                :id="`register-${field.name}`"
                v-model="form[field.name]"
                :label="field.label"
                :placeholder="field.placeholder ?? ''"
                :invalid="Boolean(errors[field.name])"
                :describedby="errors[field.name] ? `register-${field.name}-error` : (tzDetected ? 'register-timezone-hint' : undefined)"
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
                :aria-describedby="errors[field.name] ? `register-${field.name}-error` : undefined"
                :class="inputClass(field.name)"
                @input="onInput(field)"
                @blur="onInput(field)"
              >

              <p v-if="errors[field.name]" :id="`register-${field.name}-error`" class="m-0 text-[12.5px] text-[#b3261e]">
                {{ errors[field.name] }}
              </p>
              <span
                v-else-if="field.control === 'select' && tzDetected"
                id="register-timezone-hint"
                class="text-[12px] text-lp-soft"
              >
                Detected from your device. Change it if it's wrong.
              </span>
            </div>
          </div>

          <CtaButton type="submit" block :disabled="submitting || !open">
            {{ actionLabel }}
          </CtaButton>

          <div class="flex flex-wrap items-center justify-center gap-2.5 text-[13px] text-lp-soft">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span>Secure payment via</span>
            <img
              src="/landing/selar-logo.png"
              alt="Selar"
              width="392"
              height="203"
              loading="lazy"
              decoding="async"
              class="h-4 w-auto"
            >
          </div>

          <p class="m-0 text-center text-[13px] leading-[1.6] text-lp-soft">
            <b v-if="footnote.strong" class="font-semibold text-lp-ink">{{ footnote.strong }}</b>
            {{ footnote.rest }}
          </p>

          <!-- Interrupts: the form looked correct and this is the only reason
               nothing happened. -->
          <p
            v-if="failure"
            role="alert"
            class="m-0 rounded-[14px] border border-[#b3261e] bg-[rgba(179,38,30,0.06)] px-4 py-3 text-[14.5px] text-[#b3261e]"
          >
            {{ failure }}
          </p>
        </form>

        <div v-else role="status" class="flex flex-col gap-4.5 py-4">
          <span class="lp-eyebrow">almost there</span>
          <h3 class="m-0 text-[34px] font-medium tracking-[-0.02em]">
            one last step<template v-if="form.firstName.trim()">, <span class="serif-accent">{{ form.firstName.trim() }}</span></template>.
          </h3>
          <p class="m-0 text-[15px] leading-[1.65] text-lp-soft">
            Complete your payment on Selar to secure your slot. Once it's done,
            your next steps and app access details are sent to your email.
          </p>
          <CtaButton :href="checkoutUrl" class="self-start">continue to selar ↗</CtaButton>
        </div>
      </div>
    </div>
  </section>
</template>
