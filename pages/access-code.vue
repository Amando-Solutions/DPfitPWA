<script setup lang="ts">
// 04 · Access Code (idle) + 05 · Access Code Error
definePageMeta({ layout: 'default' })

import { accessCodes } from '~/data/program'
import { DataSourceError } from '~/lib/datasource'

const router = useRouter()
const store = useAppStore()

const code = ref('')
const error = ref('')
const busy = ref(false)

const submit = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.redeemAccessCode(code.value)
    await router.push('/setup/about-you')
  } catch (cause) {
    error.value =
      cause instanceof DataSourceError
        ? cause.message
        : 'Something went wrong. Try again.'
  } finally {
    busy.value = false
  }
}

// Clear the error as soon as the member edits the field.
watch(code, () => {
  if (error.value) error.value = ''
})
</script>

<template>
  <div class="access">
    <div class="access__glow" />

    <div class="access__intro">
      <BrandWordmark size="lg" stacked />
      <EyebrowLabel color="var(--violet-45)"
        >6-week recomp challenge · Cohort 01</EyebrowLabel
      >
      <h1 class="access__title">
        Let's get<br /><span class="access__title--rose">your glow back.</span>
      </h1>
      <p class="access__sub">
        Enter the access code sent to your email after your payment was
        confirmed.
      </p>
    </div>

    <AppCard variant="raised" class="access__card">
      <TextField
        v-model="code"
        label="Access code"
        placeholder="ENTER YOUR CODE"
        mono
        :error="error"
      />
      <AppButton glow icon-right="arrowRight" :disabled="busy" @click="submit">
        {{ busy ? 'Checking…' : 'Continue' }}
      </AppButton>
    </AppCard>

    <p class="access__hint muted">
      Can’t find your code? Check spam or
      <NuxtLink to="/access-code" class="access__link">contact support</NuxtLink>.
    </p>

    <p class="access__dev">Demo code: <strong>{{ accessCodes[0] }}</strong></p>
  </div>
</template>

<style scoped lang="scss">
.access {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 40px 24px 24px;
  position: relative;

  &__glow {
    position: absolute;
    width: 260px;
    height: 260px;
    top: -80px;
    right: -80px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(200, 30, 92, 0.25), transparent 70%);
    filter: blur(8px);
  }

  &__intro {
    position: relative;
    margin-top: auto;
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__title {
    margin: 6px 0 4px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 30px;
    line-height: 1.08;
    letter-spacing: -0.5px;
    color: var(--ink);

    &--rose {
      color: var(--rose);
    }
  }

  &__sub {
    margin: 0;
    color: var(--violet-45);
    font-size: 14px;
    line-height: 1.45;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: var(--shadow-raised);
  }

  &__hint {
    margin: 18px 0 0;
    text-align: center;
    font-size: 13px;
  }

  &__link {
    color: var(--rose);
    font-weight: 700;
  }

  &__dev {
    margin-top: auto;
    text-align: center;
    font-family: var(--font-data);
    font-size: 11px;
    color: rgba(36, 27, 46, 0.35);
  }
}

// Desktop: the flow sits in a card, so the auto-margins that stretched the
// screen on a phone give way to fixed spacing.
@media (min-width: 1024px) {
  .access {
    padding: 44px 44px 36px;

    &__intro {
      margin-top: 0;
      margin-bottom: 28px;
    }

    &__title {
      font-size: 36px;
    }

    &__sub {
      font-size: 15px;
    }

    &__dev {
      margin-top: 28px;
    }
  }
}

</style>
