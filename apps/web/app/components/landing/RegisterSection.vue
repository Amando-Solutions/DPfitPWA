<script setup lang="ts">
import { REGISTER_STEPS } from '~/data/landing'

/**
 * Step one of three: the details the coach needs before anyone pays.
 *
 * Steps two and three ("Your stats", "Personalise") are designed in the same
 * Figma file but are separate pages, so this component's job ends at a valid,
 * captured step one. It emits the answers and leaves the handoff to whatever
 * owns the rest of the flow — see the note on `submit` below.
 */

interface RegistrationStepOne {
  fullName: string
  email: string
  whatsapp: string
  timezone: string
}

/**
 * Fired once, with a validated payload, when someone completes step one.
 *
 * Nothing is persisted or charged here on purpose: the section's own eyebrow
 * says "Register, then pay", and the button's caption promises nothing is
 * charged yet. When steps two and three exist, the page listening to this is
 * where the answers get carried into them.
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
}

function onSubmit() {
  attempted.value = true
  const ok = FIELDS.map(validateField).every(Boolean)
  if (!ok) {
    // Send focus to the first thing that needs fixing, rather than leaving the
    // page still and the error somewhere off screen.
    const firstBad = FIELDS.find((f) => errors[f.name])
    if (firstBad) document.getElementById(`register-${firstBad.name}`)?.focus()
    return
  }
  done.value = true
  emit('submit', { ...form })
}
</script>

<template>
  <section id="register" class="bg-page py-20 lg:py-[120px]">
    <PageContainer>
      <div class="max-w-[620px]">
        <p class="eyebrow-section text-[var(--rose-fill)]">Register, then pay</p>
        <h2 class="title-section mt-[18px] text-ink">Register for your spot.</h2>
        <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
          Fill this in once. Your program access and nutrition guidance are set
          up from what you enter here, and payment comes right after.
        </p>
      </div>

      <div
        class="mt-12 rounded-card border border-[rgba(36,27,46,0.12)] bg-white p-6 shadow-[0_30px_35px_rgba(36,27,46,0.09)] sm:p-10 lg:mt-[52px] lg:p-[49px]"
      >
        <!-- Three steps, one bar each. `aria-current` rather than colour alone
             is what tells a screen reader which one is live. -->
        <ol class="flex gap-[18px]">
          <li
            v-for="(step, i) in REGISTER_STEPS"
            :key="step"
            class="flex-1"
            :aria-current="i === 0 ? 'step' : undefined"
          >
            <span
              class="block h-1 rounded-pill"
              :class="i === 0 ? 'bg-[var(--rose-fill)]' : 'bg-[var(--rule)]'"
            />
            <span
              class="mt-2.5 block font-data text-[10px] tracking-[0.12em] text-soft uppercase"
            >
              {{ step }}
            </span>
          </li>
        </ol>

        <form class="mt-8 lg:mt-[34px]" novalidate @submit.prevent="onSubmit">
          <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="field in FIELDS" :key="field.name" class="flex flex-col gap-[7px]">
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
                class="h-[46px] rounded-field border bg-field px-[15px] font-body text-[15px] text-ink transition-colors placeholder:text-[#757575] focus:outline-none focus-visible:border-[var(--rose-fill)] focus-visible:ring-2 focus-visible:ring-[var(--rose-ring)]"
                :class="
                  errors[field.name]
                    ? 'border-[var(--rose-fill)]'
                    : 'border-field-edge'
                "
                @input="onInput(field)"
                @blur="onInput(field)"
              >
              <p
                v-if="errors[field.name]"
                :id="`register-${field.name}-error`"
                class="font-body text-[13px] text-[var(--rose-fill)]"
              >
                {{ errors[field.name] }}
              </p>
            </div>
          </div>

          <div class="mt-7 flex flex-wrap items-center gap-3.5 lg:mt-[28px]">
            <CtaButton type="submit" variant="ink">Continue →</CtaButton>
            <p class="font-body text-[13.5px] text-ink-mute">
              Takes about two minutes. Nothing is charged yet.
            </p>
          </div>

          <!-- `role="status"` so the confirmation is announced when it appears,
               rather than only being visible to someone watching the button. -->
          <p
            v-if="done"
            role="status"
            class="mt-6 rounded-field border border-[rgba(86,100,58,0.28)] bg-[rgba(86,100,58,0.06)] px-4 py-3 font-body text-[14.5px] text-[var(--macro-carbs)]"
          >
            Got it, {{ form.fullName.trim().split(' ')[0] }} — that's step one
            done. Your stats are next, then payment.
          </p>
        </form>
      </div>
    </PageContainer>
  </section>
</template>
