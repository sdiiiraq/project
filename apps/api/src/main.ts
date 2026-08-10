import { createApp } from './bootstrap';

/**
 * نقطة الدخول للتشغيل التقليدي (nest start / node dist/main.js) — تُستخدم
 * محليًا في التطوير فقط. في الإنتاج على Vercel لا تُستدعى هذه الدالة إطلاقًا؛
 * الدخول الفعلي هو api/[...path].ts (دالة لاخادومية بدون listen دائم).
 */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  process.stdout.write(JSON.stringify({ msg: `API listening on :${port}`, env: process.env.NODE_ENV }) + '\n');
}

void bootstrap();
