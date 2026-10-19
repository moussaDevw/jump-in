import { Global, Module } from '@nestjs/common';
import { CodeGeneratorService } from './services/code-generator.service';
import { GeoSpatialService } from './services/geospatial.service';

@Global()
@Module({
  providers: [CodeGeneratorService, GeoSpatialService],
  exports: [CodeGeneratorService, GeoSpatialService],
})
export class CommonModule {}
