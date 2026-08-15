import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TransactionsService } from './transactions.service';

const RECEIPT_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.heic']);

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly txns: TransactionsService) {}

  @Post('income')
  createIncome(@Body() body: any) {
    return this.txns.createIncome(body);
  }

  @Post('expense')
  createExpense(@Body() body: any) {
    return this.txns.createExpense(body);
  }

  @Post('transfer')
  createTransfer(@Body() body: any) {
    return this.txns.createTransfer(body);
  }

  @Get()
  list(@Query() query: any) {
    return this.txns.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.txns.get(id);
  }

  @Patch(':id/mark-received')
  markReceived(@Param('id') id: string) {
    return this.txns.markIncomeReceived(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.txns.delete(id);
  }

  @Post(':id/receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — phone photos can be large
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'receipts'),
        filename: (_req, file, cb) => cb(null, `${uuid()}${extname(file.originalname).toLowerCase()}`),
      }),
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!RECEIPT_ALLOWED_EXT.has(ext)) return cb(new BadRequestException(`Unsupported file type "${ext}"`), false);
        cb(null, true);
      },
    }),
  )
  uploadReceipt(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name: "file")');
    return this.txns.attachReceipt(id, `/uploads/receipts/${file.filename}`);
  }
}
