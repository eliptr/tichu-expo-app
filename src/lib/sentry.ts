import * as Sentry from '@sentry/react-native';

import { env } from './env';

let initialized = false;

export function initSentry() {
  if (initialized) {
    return;
  }

  initialized = true;
  Sentry.init({
    dsn: env.sentryDsn || undefined,
    enabled: Boolean(env.sentryDsn),
  });
}

export function captureError(error: unknown) {
  Sentry.captureException(error);
}

export function wrapWithSentry<TComponent>(component: TComponent): TComponent {
  return Sentry.wrap(component as never) as TComponent;
}
