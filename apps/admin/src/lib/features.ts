// Build-time feature flags. Enable one with VITE_FEATURE_<NAME>=true in .env.local.
export const features = {
  // Program reward economy (points, badges, ranks). Hidden until the PWA side is ready.
  programRewards: import.meta.env.VITE_FEATURE_PROGRAM_REWARDS === "true",
}
