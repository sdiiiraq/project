import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { createApp } from '../src/bootstrap';

/**
 * دالة Vercel اللاخادومية — بديل app.listen() (§ متطلب توافق Vercel).
 * ملف [...path].ts يلتقط كل مسار تحت /api/* تلقائيًا (اتفاقية Vercel
 * لمسارات الدوال الديناميكية) دون الحاجة لأي rewrites في vercel.json.
 *
 * التخزين المؤقت عبر النطاق العام (module scope) يجعل نسخة Nest/Express
 * تُبنى مرة واحدة فقط لكل حاوية دافئة (warm lambda) بدل إعادة إنشائها في
 * كل طلب — وهذا ضروري للأداء ولتفادي استنزاف اتصالات قاعدة البيانات.
 */
let cachedServer: express.Express | undefined;
let bootstrapPromise: Promise<express.Express> | undefined;

async function getServer(): Promise<express.Express> {
  if (cachedServer) return cachedServer;
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const expressInstance = express();
      const app = await createApp(expressInstance);
      // لا enableShutdownHooks هنا: في بيئة لاخادومية قد تُجمَّد الحاوية
      // (freeze) بين الطلبات، واستدعاء خطافات الإغلاق عند التجميد يقطع
      // اتصالات Prisma/Redis لحاوية ما زالت ستُعاد استخدامها لاحقًا.
      await app.init();
      cachedServer = expressInstance;
      return expressInstance;
    })();
  }
  return bootstrapPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const server = await getServer();
  server(req as unknown as express.Request, res as unknown as express.Response);
}

export const config = {
  api: {
    // تعطيل معالجة الجسم المدمجة في Vercel — Express/Nest (body-parser) يتولى ذلك
    bodyParser: false,
  },
};
