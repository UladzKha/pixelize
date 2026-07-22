import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveLanIp } from './lan-ip';

export interface AppConfigResponse {
  uploadUrl: string;
  lanIp: string;
}

@Controller('api/config')
export class AppConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  get(): AppConfigResponse {
    const lanIp = resolveLanIp(this.config.get<string>('LAN_IP'));
    const frontendPort = this.config.get<string>('FRONTEND_PORT', '5173');
    return { uploadUrl: `http://${lanIp}:${frontendPort}/`, lanIp };
  }
}
