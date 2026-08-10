import { Module } from '@nestjs/common';
import { GeneratorsController } from './generators.controller';
import { GeneratorsService } from './generators.service';

@Module({ controllers: [GeneratorsController], providers: [GeneratorsService], exports: [GeneratorsService] })
export class GeneratorsModule {}
