# Fase 3 — Controles de seguridad en EventIA

Implementación de mejoras a partir de la revisión de seguridad. Cada control incluye prueba automatizada en `apps/api/test/seguridad.test.js` (ejecutar con `pnpm test`).

---

## Control 1: Solo el organizador autorizado modifica su evento

| Elemento | Descripción |
| --- | --- |
| **Problema identificado** | Si cualquier usuario autenticado pudiera editar o borrar eventos ajenos, un atacante alteraría actividades, cupos o datos del organizador legítimo. |
| **Riesgo OWASP relacionado** | [A01:2021 – Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/) (control de acceso roto / IDOR horizontal). |
| **Corrección aplicada** | Regla en `EventoService.#exigirPropietario`: compara `evento.organizadorId` con el id de la sesión y responde **403** en `PATCH` y `DELETE`. Las rutas usan `req.usuario.id`, no un organizador enviado por el cliente. |
| **Prueba realizada** | Test `solo el organizador puede modificar su evento`: Luis intenta `PATCH` y `DELETE` sobre `evt-foto` (de Ana); ambos devuelven **403** y el título del evento no cambia. |
| **Resultado** | Operaciones no autorizadas rechazadas; solo el organizador puede modificar o eliminar su evento. |

---

## Control 2: Inscripciones privadas (sin suplantación de identidad)

| Elemento | Descripción |
| --- | --- |
| **Problema identificado** | Un cliente malicioso podría enviar `usuarioId` en query o body para intentar listar o crear inscripciones de otra persona, aunque la ruta diga `/yo/`. |
| **Riesgo OWASP relacionado** | [A01:2021 – Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/). |
| **Corrección aplicada** | Middleware `rechazarIdentidadAjena` en rutas de inscripciones: si `usuarioId` o `userId` en query/body no coincide con `req.usuario.id`, responde **403**. El listado sigue usando únicamente el id de sesión en el servicio. |
| **Prueba realizada** | Tests `no se pueden consultar inscripciones ajenas…` y `no se puede inscribir en nombre de otro usuario`: Ana con `?usuarioId=usr-luis` o `body.usuarioId` recibe **403** y no aparecen inscripciones ajenas. |
| **Resultado** | El sistema rechaza explícitamente intentos de acceder o inscribir en nombre de otro usuario. |

---

## Control 3: Credenciales sensibles vía variables de entorno

| Elemento | Descripción |
| --- | --- |
| **Problema identificado** | Contraseña demo y tokens de sesión fijos (`token-ana-demo`) en código/semilla permitían autenticación predecible sin login. |
| **Riesgo OWASP relacionado** | [A02:2021 – Cryptographic Failures](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/) y [A05:2021 – Security Misconfiguration](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/) (secretos en código / configuración insegura). |
| **Corrección aplicada** | `leerConfig()` lee `EVENTIA_DEMO_PASSWORD` y `EVENTIA_CORS_ORIGIN`. La semilla genera tokens aleatorios (`randomBytes`). Plantilla en `apps/api/.env.example`. CORS restringible al origen del frontend. |
| **Prueba realizada** | Test `los tokens de demostración ya no son valores fijos predecibles`: dos semillas producen tokens distintos y distintos de `token-ana-demo`. |
| **Resultado** | Ya no hay tokens demo adivinables; la contraseña demo se configura por entorno en despliegues reales. |

---

## Cómo ejecutar las pruebas

```bash
pnpm test
```

Archivos relevantes:

- `apps/api/src/modules/eventos/evento.service.js` — propiedad del evento
- `apps/api/src/shared/identidad.js` — anti-suplantación en inscripciones
- `apps/api/src/shared/config.js` — variables de entorno
- `apps/api/test/seguridad.test.js` — pruebas de rechazo 403
