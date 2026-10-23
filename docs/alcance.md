# Alcance de esta versión

## Hecho

- Registro, sesión con refresh rotativo, cierre, perfil, exportación y borrado de cuenta.
- Eventos de aforo general, publicación, edición, borrado si no hay ventas, asistentes, invitación a la puerta y bitácora.
- Apartado con vencimiento, orden idempotente, cobro falso y Stripe en modo prueba con webhook firmado.
- Boleto con QR firmado que rota, transferencia con aceptación, reembolso según política y lista de espera.
- Fila con posición aleatoria antes de abrir y orden de llegada después.
- Puerta en línea, manifiesto firmado, cola local y conciliación.
- Semilla, Compose de Postgres y Redis, pruebas unitarias, de integración y de extremo a extremo, y el flujo de GitHub Actions.
- Rol ADMIN. El panel aprueba o suspende organizadores, suspende cuentas, retira eventos y muestra ingresos, embudo, check-in y la bitácora. Quien no es admin recibe 403.
- Métricas del organizador: ventas por día, boletos por tipo, entradas en vivo y lista de espera.
- La portada muestra el contenido sin esperar al scroll ni a JavaScript. La animación solo se suma si el sistema permite movimiento.

El modelo admite zona con asientos. La API los aparta de uno en uno y la prueba de carrera cubre ese caso. La pantalla todavía no dibuja un mapa de asientos: publicar un evento desde la web crea aforo general.

## Dejado para después

- Pases de Apple Wallet y Google Wallet.
- Varias puertas sincronizadas por WebRTC. Hoy cada puerta descarga el manifiesto y concilia con la API.
- Passkeys y un segundo factor real. El gancho de sesión existe; no hay proveedor.
- KMS o un gestor de secretos. Las llaves entran por entorno.
- Cifrado de columnas. El correo tiene que seguir siendo buscable para la transferencia.
- Una corrida k6 de miles de personas. El script de `load/` es la sonda; la garantía de cupo es la prueba de concurrencia.
- Sentry y el SDK de OpenTelemetry. La bitácora y `/v1/health` cubren el diagnóstico de esta versión.
- CodeQL, Trivy, cosign y SBOM en el pipeline. El flujo actual construye, prueba y recorre la compra.
- Editor de mapa de asientos y descripciones en markdown. El texto se guarda plano.
- CAPTCHA de un proveedor concreto.
- Cobros en quetzales. Stripe no liquida GTQ; los precios están en USD.
