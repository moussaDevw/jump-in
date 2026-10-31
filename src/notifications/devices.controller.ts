import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    const device = await this.devicesService.registerDevice(userId, dto);
    return ApiResponse.success(device, 'Device push token registered successfully');
  }

  @Delete(':pushToken')
  @HttpCode(HttpStatus.OK)
  async revokeDevice(
    @CurrentUser('id') userId: string,
    @Param('pushToken') pushToken: string,
  ) {
    await this.devicesService.revokeDevice(userId, pushToken);
    return ApiResponse.success(null, 'Device push token revoked successfully');
  }
}
