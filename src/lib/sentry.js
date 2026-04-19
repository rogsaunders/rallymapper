import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

// Derive a meaningful environment label so Sentry alert rules can filter
// precisely. Three distinct values:
//   development — local dev server  → events suppressed entirely
//   beta        — beta.app.routemapper.net (VITE_BETA_MODE=true)
//   production  — app.routemapper.net
const environment = import.meta.env.DEV
  ? "development"
  : import.meta.env.VITE_BETA_MODE === "true"
    ? "beta"
    : "production";

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: `routemapper@${__APP_VERSION__}`,
    // Suppress all events from local dev sessions — eliminates inbox noise.
    enabled: !import.meta.env.DEV,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 0,
  });
}

export { Sentry };
