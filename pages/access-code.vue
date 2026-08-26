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
  <div class="access [flex:1] [min-height:0] [display:flex] [flex-direction:column] [padding:40px_24px_24px] [position:relative] [overflow:hidden] lg:[padding:44px_44px_36px]">
    <div class="access__glow [position:absolute] [width:260px] [height:260px] [top:-80px] [right:-80px] [border-radius:50%] [background:radial-gradient(circle,_var(--rose-ring),_transparent_70%)] [filter:blur(8px)] [pointer-events:none]" />

    <div class="access__intro [position:relative] [margin-top:auto] [margin-bottom:24px] [display:flex] [flex-direction:column] [gap:8px] lg:[margin-top:0] lg:[margin-bottom:28px]">
      <BrandWordmark size="lg" stacked />
      <EyebrowLabel tone="muted"
        >6-week recomp challenge · Cohort 01</EyebrowLabel
      >
      <h1 class="access__title [margin:6px_0_4px] [font-family:var(--font-display)] [font-weight:900] [font-size:30px] [line-height:1.08] [letter-spacing:-0.5px] [color:var(--ink)] lg:[font-size:36px]">
        Let's get<br /><span class="access__title--rose [color:var(--rose)]">your glow back.</span>
      </h1>
      <p class="access__sub [margin:0] [color:var(--violet-45)] [font-size:14px] [line-height:1.45] lg:[font-size:15px]">
        Enter the access code sent to your email after your payment was
        confirmed.
      </p>
    </div>

    <AppCard variant="raised" class="access__card [display:flex] [flex-direction:column] [gap:16px] [box-shadow:var(--shadow-raised)]">
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

    <p class="access__hint muted [margin:18px_0_0] [text-align:center] [font-size:13px]">
      Can’t find your code? Check spam or
      <NuxtLink to="/access-code" class="access__link [color:var(--rose)] [font-weight:700]">contact support</NuxtLink>.
    </p>

    <p class="access__dev [margin-top:auto] [text-align:center] [font-family:var(--font-data)] [font-size:11px] [color:var(--text-muted)] lg:[margin-top:28px]">Demo code: <strong>{{ accessCodes[0] }}</strong></p>
  </div>
</template>
