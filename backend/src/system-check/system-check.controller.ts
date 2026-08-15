import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemCheckService } from './system-check.service';

@UseGuards(JwtAuthGuard)
@Controller('system-check')
export class SystemCheckController {
  constructor(private readonly systemCheck: SystemCheckService) {}

  @Get()
  run() {
    return this.systemCheck.runChecks();
  }
}
