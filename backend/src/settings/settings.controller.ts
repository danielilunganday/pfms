import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Put(':key')
  set(@Param('key') key: string, @Body() body: { value: string; description?: string }) {
    return this.settings.set(key, body.value, body.description);
  }

  @Get('config-options')
  listConfigOptions(@Query('listType') listType: string) {
    return this.settings.listConfigOptions(listType);
  }

  @Post('config-options')
  addConfigOption(@Body() body: { listType: string; value: string; sortOrder?: number }) {
    return this.settings.addConfigOption(body.listType, body.value, body.sortOrder ?? 0);
  }

  @Get('currencies')
  listCurrencies() {
    return this.settings.listCurrencies();
  }

  @Post('currencies')
  upsertCurrency(@Body() body: { code: string; name: string; symbol: string }) {
    return this.settings.upsertCurrency(body.code, body.name, body.symbol);
  }
}
