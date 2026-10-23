# Eventia

Plataforma para publicar eventos con cupo real, apartar un lugar, pagar y entrar con un pase QR que rota solo.

La interfaz está en español. El código, en inglés.

## Qué incluye

- Landing y app en Astro 5, con islas de React solo donde hay estado (explorar, evento, pago, cartera, organizador, puerta, fila y cuenta).
- API NestJS en `/v1`: identidad, catálogo, apartados, órdenes, boletos, fila, puerta y bitácora.
- Postgres (Prisma) y Redis. Sin Redis la API sigue en pie: el límite de peticiones y el barrido de apartados usan memoria.
- Pagos en modo prueba. Con llaves `sk_test_` de Stripe se crea un PaymentIntent y el webhook firma la emisión. Sin llaves, el cobro falso emite el boleto al instante.

## Arranque local

Hace falta Node 22 y pnpm 10.33.4.

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm --filter @eventia/qr build
pnpm --filter @eventia/schemas build
pnpm --filter api exec prisma migrate deploy
pnpm --filter api db:seed
pnpm --filter api dev
pnpm --filter web dev
```

La web queda en http://127.0.0.1:4321 y reenvía `/v1` a la API en el puerto 3001. Las cookies de sesión son del mismo sitio. En producción el mismo reenvío lo hace el servidor de Astro (`API_PROXY`) o un proxy inverso. El webhook de Stripe debe llegar directo a la API.

Cuentas de la semilla, contraseña `demo1234` (o `EVENTIA_DEMO_PASSWORD`):

| Correo | Para qué |
| --- | --- |
| ana@eventia.dev | Organizadora del taller |
| luis@eventia.dev | Organizador del cine y la ruta |
| staff@eventia.dev | Puerta de ambas organizaciones |
| maya@eventia.dev | Ya tiene el pase del cine |
| admin@eventia.dev | Administración de la plataforma |
| nora@eventia.dev | Organizadora pendiente de aprobación |

`docker compose --profile app up --build` levanta también la API y la web. En ese perfil hay que definir las llaves Ed25519 si `NODE_ENV=production`.

## Pruebas

```bash
pnpm --filter api test:unit
USE_EXTERNAL_DB=1 DATABASE_URL=postgresql://eventia:eventia@localhost:5432/eventia_test pnpm --filter api test:integration
pnpm --filter web exec playwright test
```

Sin `USE_EXTERNAL_DB`, la integración levanta Postgres 16 y Redis 7 con Testcontainers. La prueba de concurrencia aparta 25 veces un cupo de 5 y comprueba que solo entran 5 boletos.

El script `load/oversell.k6.js` es una sonda opcional. La prueba que cierra el cupo es la de Vitest.

## Diseño

La landing que ya estaba aprobada sigue siendo la base visual: neutros cálidos, un solo acento cobalto `#2F4BFF`, Inter Tight, Inter y JetBrains Mono. Los tokens viven en `packages/tokens`.

## Documentos

- [Arquitectura](docs/arquitectura.md)
- [Controles de seguridad](docs/fase-3-seguridad.md)
- [Qué quedó y qué se dejó](docs/alcance.md)
- OpenAPI en `/docs` cuando la API no está en producción
