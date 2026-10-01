export const usePrice = () => {
  const challenge = useChallenge()
  return computed(() => challenge.value?.price ?? null)
}
