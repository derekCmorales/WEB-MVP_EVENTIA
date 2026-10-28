#!/bin/sh
set -eu
cd /app/apps/api

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "[api] Falta POSTGRES_PASSWORD en Environment del servicio api." >&2
  exit 1
fi

# Se reconstruye siempre: Openship no interpola el compose.
HOST="${POSTGRES_HOST:-postgres}"
export DATABASE_URL="postgresql://${POSTGRES_USER:-eventia}:${POSTGRES_PASSWORD}@${HOST}:5432/${POSTGRES_DB:-eventia}"
echo "[api] DATABASE_URL → ${HOST}:5432/${POSTGRES_DB:-eventia}"

echo "[api] esperando postgres y aplicando migraciones..."
i=0
until node_modules/.bin/prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[api] postgres no respondió a tiempo (¿el servicio postgres está Running?)" >&2
    exit 1
  fi
  echo "[api] postgres no listo, reintento ${i}/30..."
  sleep 2
done

# La semilla vacía todas las tablas: solo corre si aún no hay usuarios.
if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  if node /app/deploy/db-is-empty.cjs; then
    echo "[api] base vacía, cargando semilla de demo..."
    node_modules/.bin/tsx src/seed.ts
  else
    echo "[api] ya hay usuarios, no se carga la semilla"
  fi
fi

echo "[api] arrancando Nest en 0.0.0.0:${PORT:-3001}"
exec node dist/main.js
