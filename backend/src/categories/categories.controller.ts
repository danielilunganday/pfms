import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  create(@Body() body: any) {
    return this.categories.create(body);
  }

  @Get()
  list(@Query('kind') kind?: 'INCOME' | 'EXPENSE') {
    return this.categories.list(kind);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.categories.deactivate(id);
  }

  @Patch(':id/rename')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.categories.rename(id, body.name);
  }
}
