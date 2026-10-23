import { Injectable, OnModuleInit } from '@nestjs/common'
import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { getEnv } from '../config/env'
import { unauthorized } from '../common/problem'

type StoredKeys = {
  jwtPrivatePem: string
  jwtPublicPem: string
  ticketPrivateB64: string
  ticketPublicB64: string
}

@Injectable()
export class KeysService implements OnModuleInit {
  private jwtPrivate!: Awaited<ReturnType<typeof importPKCS8>>
  private jwtPublic!: Awaited<ReturnType<typeof importSPKI>>
  ticketPrivate!: Uint8Array
  ticketPublicRaw!: Uint8Array
  kid = 'eventia-dev-1'

  async onModuleInit() {
    const env = getEnv()
    this.kid = env.TICKET_KID
    const stored = this.resolve(env)
    this.jwtPrivate = await importPKCS8(stored.jwtPrivatePem, 'EdDSA')
    this.jwtPublic = await importSPKI(stored.jwtPublicPem, 'EdDSA')
    this.ticketPrivate = Buffer.from(stored.ticketPrivateB64, 'base64')
    this.ticketPublicRaw = Buffer.from(stored.ticketPublicB64, 'base64')
  }

  async signAccess(user: { id: string; email: string; role: string }) {
    return new SignJWT({ email: user.email, role: user.role, purpose: 'access' })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid })
      .setSubject(user.id)
      .setIssuer('eventia')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.jwtPrivate)
  }

  async signAdmit(userId: string, sessionId: string, expiresAt: Date) {
    return new SignJWT({ purpose: 'admit', sid: sessionId })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid })
      .setSubject(userId)
      .setIssuer('eventia')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.jwtPrivate)
  }

  async verifyAccess(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.jwtPublic, { issuer: 'eventia', algorithms: ['EdDSA'] })
      if (!payload.sub) throw unauthorized('La sesión no es válida')
      return payload as { sub: string; purpose?: string; sid?: string; email?: string; role?: string }
    } catch (error) {
      if (error instanceof Error && 'getStatus' in error) throw error
      throw unauthorized('La sesión no es válida')
    }
  }

  private resolve(env: ReturnType<typeof getEnv>): StoredKeys {
    if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY && env.TICKET_PRIVATE_KEY && env.TICKET_PUBLIC_KEY) {
      return {
        jwtPrivatePem: env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        jwtPublicPem: env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
        ticketPrivateB64: env.TICKET_PRIVATE_KEY,
        ticketPublicB64: env.TICKET_PUBLIC_KEY,
      }
    }
    if (env.NODE_ENV === 'production') throw new Error('Faltan claves de firma')
    const path = join(process.cwd(), 'data', 'dev-keys.json')
    if (env.NODE_ENV !== 'test' && existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8')) as StoredKeys
    }
    const created = createKeys()
    if (env.NODE_ENV !== 'test') {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(created, null, 2))
    }
    return created
  }
}

export function createKeys(): StoredKeys {
  const jwt = generateKeyPairSync('ed25519')
  const ticket = generateKeyPairSync('ed25519')
  const pkcs8 = ticket.privateKey.export({ type: 'pkcs8', format: 'der' })
  const spki = ticket.publicKey.export({ type: 'spki', format: 'der' })
  return {
    jwtPrivatePem: jwt.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    jwtPublicPem: jwt.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    ticketPrivateB64: Buffer.from(pkcs8).toString('base64'),
    ticketPublicB64: Buffer.from(spki).subarray(spki.length - 32).toString('base64'),
  }
}
