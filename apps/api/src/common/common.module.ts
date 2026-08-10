import { Global, Module } from '@nestjs/common';
import { GeneratorScopeService } from './generator-scope.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [GeneratorScopeService, StorageService],
  exports: [GeneratorScopeService, StorageService],
})
export class CommonModule {}
