// Imprime las cuatro claves de firma de producción listas para pegar en Openship.
// Mismo formato que createKeys() en apps/api/src/infra/keys.service.ts.
import { generateKeyPairSync } from 'node:crypto'

const jwt = generateKeyPairSync('ed25519')
const ticket = generateKeyPairSync('ed25519')
const pkcs8 = ticket.privateKey.export({ type: 'pkcs8', format: 'der' })
const spki = ticket.publicKey.export({ type: 'spki', format: 'der' })
const oneLine = (pem) => pem.toString().trim().replace(/\n/g, '\\n')

console.log(`JWT_PRIVATE_KEY=${oneLine(jwt.privateKey.export({ type: 'pkcs8', format: 'pem' }))}`)
console.log(`JWT_PUBLIC_KEY=${oneLine(jwt.publicKey.export({ type: 'spki', format: 'pem' }))}`)
console.log(`TICKET_PRIVATE_KEY=${Buffer.from(pkcs8).toString('base64')}`)
console.log(`TICKET_PUBLIC_KEY=${Buffer.from(spki).subarray(spki.length - 32).toString('base64')}`)
