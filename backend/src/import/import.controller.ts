import { BadRequestException, Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportService, ImportRowResult } from './import.service';

@UseGuards(JwtAuthGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importSvc: ImportService) {}

  @Post('transactions/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No CSV file uploaded (field name: "file")');
    return this.importSvc.preview(file.buffer);
  }

  @Post('transactions/commit')
  async commit(@Body() body: { rows: ImportRowResult['parsed'][] }) {
    if (!body?.rows?.length) throw new BadRequestException('No rows to import');
    return this.importSvc.commit(body.rows);
  }
}
