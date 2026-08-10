import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * عدادات معدل مدعومة بـ Redis (§81).
 * عند تعذر Redis: بديل في الذاكرة — تبقى الحماية قائمة بدل الفتح الكامل (fail-soft موثق).
 */
@Injectable()
export class ThrottlerService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly fallback = new Map<string, { count: number; resetAt: number }>();

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL') as string, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => {
      // تُعالج الأخطاء لكل طلب عبر المسار البديل — لا إسقاط للتطبيق
    });
  }

  async hit(key: string, windowSeconds: number, max: number): Promise<boolean> {
    try {
      const current = await this.redis.incr(key);
      if (current === 1) await this.redis.expire(key, windowSeconds);
      return current <= max;
    } catch {
      const now = Date.now();
      const entry = this.fallback.get(key);
      if (!entry || entry.resetAt <= now) {
        this.fallback.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        if (this.fallback.size > 20_000) this.fallback.clear();
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
