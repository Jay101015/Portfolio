import {interpolate, spring} from 'remotion';

/** A springy scale-in: 0 before `delay`, overshoots a little, settles at 1. */
export const pop = (frame: number, fps: number, delay = 0, damping = 12) => spring({frame: frame - delay, fps, config: {damping, stiffness: 150, mass: 0.7}});

/** Linear fade-in over `len` frames starting at `delay`. */
export const fadeIn = (frame: number, delay = 0, len = 10) => interpolate(frame - delay, [0, len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

/** Deterministic pseudo-random in [0,1) for a seed. */
export const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
