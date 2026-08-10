import { Injectable, Logger } from '@nestjs/common';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  tags?: Record<string, string>;
}

/**
 * تجريد تتبع الأخطاء (§128):
 * - الافتراضي: سجل هيكلي (يعمل دائمًا بلا تبعيات).
 * - عند SENTRY_DSN: يُحمَّل @sentry/node ديناميكيًا إن كان مثبتًا.
 * - فشل التتبع لا يمس التطبيق نفسه.
 */
@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger('ErrorTracking');
  private sentry: unknown = null;
  private initAttempted = false;

  private async ensureSentry(): Promise<void> {
    if (this.initAttempted) return;
    this.initAttempted = true;
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return;
    try {
      const Sentry = await import('@sentry/node');
      Sentry.init({ dsn, environment: process.env.NODE_ENV });
      this.sentry = Sentry;
      this.logger.log('Sentry initialized');
    } catch {
      this.logger.warn('SENTRY_DSN set but @sentry/node not installed — falling back to structured logs');
    }
  }

  capture(exception: unknown, context: ErrorContext = {}): void {
    void this.ensureSentry().then(() => {
      try {
        const sentry = this.sentry as {
          withScope?: (cb: (scope: { setExtras: (e: Record<string, unknown>) => void }) => void) => void;
          captureException?: (e: unknown) => void;
        } | null;
        if (sentry?.withScope && sentry.captureException) {
          sentry.withScope((scope) => {
            scope.setExtras({ ...context });
            sentry.captureException!(exception);
          });
        } else {
          this.logger.error(
            JSON.stringify({
              error: exception instanceof Error ? { message: exception.message, stack: exception.stack } : String(exception),
              ...context,
            }),
          );
        }
      } catch {
        // لا يفشل التطبيق بسبب التتبع (§128)
      }
    });
  }
}
