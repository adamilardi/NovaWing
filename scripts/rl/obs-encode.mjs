/**
 * Shared observation encoder for NovaWing RL.
 *
 * Implementation lives in runtime-pure.js (single source for Node + in-page).
 * Contract version OBS_VERSION must match rl/contract.py / policy JSON.
 */
import { runtime } from './load-runtime.mjs';

export const OBS_VERSION = runtime.OBS_VERSION;
export const OBS_SIZE = runtime.OBS_SIZE;
export const ACTION_SIZE = runtime.ACTION_SIZE;
export const K_ENEMIES = runtime.K_ENEMIES;
export const K_OBSTACLES = runtime.K_OBSTACLES;
export const K_BULLETS = runtime.K_BULLETS;
export const K_WALLS = runtime.K_WALLS;
export const K_POWERUPS = runtime.K_POWERUPS;
export const K_BANDS = runtime.K_BANDS;
export const OBS_LAYOUT = runtime.OBS_LAYOUT;

export const encodeObservation = runtime.encodeObservation;
export const encodeAction = runtime.encodeAction;
export const decodeAction = runtime.decodeAction;
