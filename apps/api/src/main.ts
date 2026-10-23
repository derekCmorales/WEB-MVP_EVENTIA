import 'reflect-metadata'
import { config as loadEnv } from 'dotenv'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './configure'
import { getEnv } from './config/env'

if (process.env.NODE_ENV !== 'test') loadEnv()

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false })
  await configureApp(app)
  const port = getEnv().PORT
  await app.listen(port)
  console.log(JSON.stringify({ msg: 'eventia api listening', port }))
}

void bootstrap()
