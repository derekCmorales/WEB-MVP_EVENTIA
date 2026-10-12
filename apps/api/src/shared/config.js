export function leerConfig() {
  const corsRaw = process.env.EVENTIA_CORS_ORIGIN?.trim()
  return {
    demoPassword: process.env.EVENTIA_DEMO_PASSWORD?.trim() || 'demo1234',
    corsOrigin: corsRaw && corsRaw.length > 0 ? corsRaw : null,
  }
}
