import { INestApplication, Logger } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { json } from 'express'
import { ProblemFilter } from './common/filters'
import { getEnv } from './config/env'
import { RedisService } from './infra/redis.service'

export async function configureApp(app: INestApplication) {
  const env = getEnv()
  app.setGlobalPrefix('v1')
  app.use(helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  }))
  app.use(cookieParser())
  app.use(json({ limit: '100kb', verify: (req, _res, buf) => { (req as { rawBody?: Buffer }).rawBody = buf } }))
  app.enableCors({
    origin: env.WEB_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-csrf-token', 'idempotency-key', 'x-admission-token', 'stripe-signature'],
  })
  app.useGlobalFilters(new ProblemFilter())
  const adapter = app.getHttpAdapter().getInstance() as { set?: (key: string, value: number) => void; disable?: (key: string) => void }
  adapter.set?.('trust proxy', 1)
  adapter.disable?.('x-powered-by')
  await app.get(RedisService).connect()
  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Eventia API')
      .setDescription('Boletos, apartados y check-in. Versión 1.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config))
  }
  Logger.log(JSON.stringify({ msg: 'api configured', env: env.NODE_ENV, payments: env.PAYMENTS_MODE }), 'eventia')
}
