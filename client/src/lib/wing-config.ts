/**
 * The institution named on the registration screen.
 *
 * The design's copy reads "A few things {Institution} asks us to collect", and the
 * prototype hardcoded the literal `[Institution]`. Per-deployment for now, from a build
 * variable, because the real answer is per-tenant: the platform already assigns an
 * institution from the signup URL's domain, and this should be resolved from the same
 * place once the signup route knows which tenant it is serving.
 *
 * Named `wing-config` rather than `config` — `server/config.ts` is the secrets loader and
 * two files with that name in one repo is a search result nobody reads twice.
 */
export const INSTITUTION_NAME = import.meta.env.VITE_INSTITUTION_NAME || "your university";
