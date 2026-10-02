<script setup lang="ts">
/*
  An access code for another cohort, from somebody who is already a member.

  On the ended screen, the one screen such a member can reach: the cohort is
  over, so an accepted code moves them straight in. (The server's clock decides
  that; if it says not yet, the code is held, `store.nextCohort` says so, and
  the ended screen offers the move once it is.)

  A move goes where any member goes once they are in, and the form stays frozen
  on the way, as every write does: unfreezing for a frame would offer a code
  box for a code that is already spent.
*/
import { DataSourceError } from '~/lib/datasource'
import { FIRST_SETUP_STEP } from '~/middleware/auth.global'

/** Out to the screen as well, so it can freeze its own controls for the length of it. */
const busy = defineModel<boolean>('busy', { default: false })

const router = useRouter()
const store = useAppStore()

const code = ref('')
const error = ref('')

watch(code, () => {
  if (error.value) error.value = ''
})

const submit = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await store.joinCohort(code.value)
    if (result.moved) {
      await router.replace(store.gate.value === 'needs-setup' ? FIRST_SETUP_STEP : '/home')
      return
    }
    code.value = ''
  } catch (cause) {
    error.value = cause instanceof DataSourceError ? cause.message : 'Something went wrong. Try again.'
  }
  busy.value = false
}
</script>

<template>
  <!-- A real form, so Enter submits; see the access-code screen. -->
  <form novalidate class="flex flex-col gap-3" :aria-busy="busy || undefined" @submit.prevent="submit">
    <div class="transition-opacity duration-150" :class="busy && 'opacity-60'" :inert="busy">
      <TextField
        v-model="code"
        label="Access code"
        placeholder="ENTER YOUR CODE"
        autocomplete="off"
        mono
        :error="error"
      />
    </div>
    <AppButton type="submit" :disabled="busy">
      {{ busy ? 'Joining…' : 'Join cohort' }}
    </AppButton>
  </form>
</template>
