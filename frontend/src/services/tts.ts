/**
 * Backwards-compatible entry point for the speech layer.
 *
 * Historically every page imported the Web Speech API helpers from here. The
 * implementation now lives in `services/speech/`, split into a provider
 * abstraction (browser + local offline service) and a controller. This file
 * stays as the stable import path so existing call sites keep working.
 */

export * from './speech/index.ts'