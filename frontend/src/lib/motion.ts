export const sfMotion = {
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeSoft: [0.16, 1, 0.3, 1] as const,
  durations: {
    instant: 0.12,
    fast: 0.18,
    base: 0.24,
    slow: 0.32,
  },
  spring: {
    type: 'spring',
    stiffness: 380,
    damping: 32,
    mass: 0.8,
  } as const,
};
