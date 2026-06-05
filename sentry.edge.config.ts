import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Undefined when SENTRY_DSN is unset → the SDK no-ops and transmits nothing.
  dsn: process.env.SENTRY_DSN,
  // 100% of traces in development; tune down for production later.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // When no DSN is set, Sentry will not transmit; Spotlight still shows
  // events locally for verification in development.
  spotlight: process.env.NODE_ENV === "development",
});
