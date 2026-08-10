import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** فحوصات الصحة (§126) — خفيفة ولا تكشف تفاصيل داخلية */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    const db = await this.checkDb();
    return {
      status: db ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database: db ? 'up' : 'down' },
    };
  }

  @Public()
  @Get('liveness')
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('readiness')
  async readiness() {
    const db = await this.checkDb();
    return {
      status: db ? 'ready' : 'not_ready',
      checks: { database: db ? 'up' : 'down' },
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
