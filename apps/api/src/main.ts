import 'reflect-metadata';
import './config/load-dotenv';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ENV, type Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: env.webOrigins,
    // The API authenticates with a bearer token, so no cookies cross origins and
    // there is no CSRF surface to defend.
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Share-Token'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on port ${env.PORT}`);
}

void bootstrap();
