import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required (docker compose up -d)'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET too short'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET too short'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  WEB_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  // 'local': قرص محلي — للتطوير فقط، غير صالح على Vercel (نظام ملفات مؤقت وغير مشترك بين الاستدعاءات).
  // 'vercel-blob': Vercel Blob Storage — يتطلب BLOB_READ_WRITE_TOKEN، وهذا هو المحرك المطلوب في الإنتاج على Vercel.
  STORAGE_DRIVER: z.enum(['local', 'vercel-blob']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.storage'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().default(300),
  // السر المشترك الذي يتحقق منه BillingCronController عند استدعاء Vercel Cron (§92).
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
