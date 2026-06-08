// Shared mutable ref — CloudWipe sets this true while a wipe is active.
// CloudScene reads it in useFrame to skip rendering when the scene is covered.
export const wipeActive = { current: false }
