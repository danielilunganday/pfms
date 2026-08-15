// Must be the very first import: populates process.env from .env before any
// other module (e.g. AuthModule's JwtModule.register) is required — those
// read process.env at decorator-evaluation time, which happens at import
// time, before Nest's own ConfigModule would otherwise get a chance to.
import 'dotenv/config';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(
    helmet({
      // Uploaded receipt images are fetched cross-origin by the PWA frontend
      // (different dev port / prod domain) — CORP would otherwise block them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  // Uploaded receipt/photo attachments — served as static files under /uploads.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`PFMS backend listening on http://localhost:${port}/api`);
}
bootstrap();
