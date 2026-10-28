# Despliegue — Openship (Mac → VPS)

Cómo subir **Eventia** al VPS desde la app de escritorio de Openship. Es el mismo flujo que misupertostada.
El desarrollo local no cambia: `docker compose up -d` (Postgres + Redis) y `pnpm --filter api dev` / `pnpm --filter web dev`.

---

## Qué corre dónde

| Dónde | Qué | Cuándo |
|---|---|---|
| **Tu Mac** | App Openship (plano de control) y el build de las imágenes | Solo mientras la tienes abierta |
| **VPS** | Postgres 16 + Redis 7 + API (Nest) + web (Astro) + OpenResty de Openship | 24/7 |

El navegador solo habla con la **web**. El servidor de Astro reenvía `/v1` a la API por la red interna de Docker (`API_PROXY=http://api:3001`). Web y API comparten origen, así que las cookies no necesitan configuración extra. Solo hace falta **un dominio**.

---

## Si ya tienes el VPS de misupertostada

Usa el mismo servidor `produccion` en Openship. No repitas la clave SSH, el firewall ni el swap.

Los puertos no chocan:

| Proyecto | Puertos del host |
|---|---|
| misupertostada | 3000 (web), 3001 (api), 5432 (postgres) |
| eventia | 4321 (web), 3101 (api) |

Postgres y Redis de eventia no se publican. Eventia suma ~1.5 GB de tope de RAM (en reposo usa ~210 MB).

Si es un VPS nuevo, sigue las secciones «Una vez en el VPS» y «Openship en el Mac» de `DEPLOY.md` de misupertostada.

---

## Openship en el Mac

1. Abre Openship → **Nuevo proyecto** → carpeta de este repo (o el remoto de GitHub).
2. Target: **Server** → `produccion`. Isolation: **Sandboxed (Docker)**.
3. **Build: This Machine**, con Docker Desktop abierto. El compose fija `linux/amd64`. Construir en el Mac también evita el `apt-get` en el VPS (la imagen de la API instala `openssl` para Prisma).
4. Genera los secretos en el Mac:

   ```bash
   node deploy/generate-keys.mjs   # JWT_* y TICKET_*
   openssl rand -hex 24            # POSTGRES_PASSWORD
   ```

5. En **Environment**, pega las claves de `deploy/openship.env.example` con sus valores. Los secretos van en el panel, nunca en git.
6. Dominio (registro A a la IP del VPS):
   - `web` :4321 → `https://eventos.TU-DOMINIO`
   - Pon ese mismo valor en `WEB_ORIGIN`, sin slash final.
7. Deploy.

`openship.json` apunta a `deploy/docker-compose.yml`. No hace falta el asistente de framework.

---

## Variables

Plantilla: `deploy/openship.env.example`.

| Clave | Notas |
|---|---|
| `POSTGRES_PASSWORD` | La leen `postgres` y `api`. Solo red interna. |
| `WEB_ORIGIN` | URL pública del web, exacta. La API rechaza con 403 «Origen no permitido» cualquier POST de otro origen. |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | PEM Ed25519 en una línea con `\n`. Firman la sesión. |
| `TICKET_PRIVATE_KEY`, `TICKET_PUBLIC_KEY` | Base64. Firman el QR del pase. Si las cambias, los pases emitidos dejan de validar en la puerta. |
| `PAYMENTS_MODE` | `fake` emite el boleto al instante. |
| `SEED_ON_BOOT` | `true` carga las cuentas y eventos de demo del README, **solo si la base no tiene usuarios**. Se puede dejar en `true`. |
| `EVENTIA_DEMO_PASSWORD` | Contraseña de las cuentas de demo. Obligatoria con la semilla; no uses `demo1234` en un dominio público. |

Sin las cuatro claves de firma, la API no arranca en production (`apps/api/src/config/env.ts`).

---

## Primer arranque

El contenedor `api`, al subir:

1. Arma `DATABASE_URL` con `POSTGRES_*` y espera a Postgres (30 reintentos).
2. `prisma migrate deploy`.
3. Si `SEED_ON_BOOT=true` y no hay usuarios: semilla de demo.
4. Arranca Nest en `:3001`.

Entra en `https://eventos.TU-DOMINIO/entrar` con `admin@eventia.dev` y tu `EVENTIA_DEMO_PASSWORD`.

---

## Stripe (opcional)

Con `PAYMENTS_MODE=auto` y una llave `sk_test_`, el cobro pasa por Stripe y el boleto se emite cuando llega el webhook. Para eso:

1. Añade un segundo dominio: `api` :3101 → `https://api-eventos.TU-DOMINIO`.
2. En Stripe, webhook a `https://api-eventos.TU-DOMINIO/v1/payments/stripe/webhook`.
3. Pega `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` en Environment y redeploy `api`.

---

## Qué no hacer

- Cambiar las claves `TICKET_*` con eventos vendidos.
- Construir en el VPS si comparte caja con misupertostada: el build de Astro + Nest compite por RAM.
- `docker compose --profile app` en el VPS: ese perfil es de la raíz, para desarrollo.

---

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| Login o cualquier POST da 403 «Origen no permitido» | `WEB_ORIGIN` ≠ dominio real. Debe ser `https://…` exacto, sin slash final. |
| 403 «Falta el token CSRF» | El navegador no guardó la cookie `eventia_csrf`: revisa que el sitio cargue por HTTPS. |
| API reinicia con «Faltan secretos en producción» | Falta alguna de `JWT_*` o `TICKET_*`. |
| API: «Falta POSTGRES_PASSWORD» | La variable no llegó al servicio `api`. |
| `[api] postgres no respondió a tiempo` | El servicio `postgres` no está Running; mira sus logs. |
| La web da 502 en `/v1/…` | La API no está healthy o la web no resuelve `api`. Logs de `api`. |
| `exec format error` | Imagen ARM en VPS x86. Docker Desktop debe construir `linux/amd64`. |
| `/v1/health` → `redis: down` | La API sigue funcionando con memoria; revisa el servicio `redis`. |

---

## Archivos de este flujo

```
openship.json                # composePath → deploy/
deploy/docker-compose.yml    # postgres + redis + api + web, límites
deploy/Dockerfile.api        # pnpm build, Node 22 + openssl (Prisma)
deploy/Dockerfile.web        # Astro node standalone, proxy /v1 → api
deploy/entrypoint-api.sh     # migrate → semilla si la base está vacía → node
deploy/db-is-empty.cjs       # ¿hay usuarios? (lo usa el entrypoint)
deploy/generate-keys.mjs     # claves Ed25519 de producción
deploy/openship.env.example  # plantilla de secretos
```
