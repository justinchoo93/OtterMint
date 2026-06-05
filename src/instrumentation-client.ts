import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Undefined when NEXT_PUBLIC_SENTRY_DSN is unset → the SDK no-ops in the
  // browser and transmits nothing.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  spotlight: process.env.NODE_ENV === "development",
});

// Lets Sentry tie errors to App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
