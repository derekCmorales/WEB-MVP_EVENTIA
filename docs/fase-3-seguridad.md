# Controles de seguridad

Los tres controles de la primera versión siguen vigentes. Las pruebas ya no viven en el archivo JSON de Express: están en `apps/api/test/integration/platform.spec.ts` y `apps/api/test/unit/domain.spec.ts`.

## Control 1: solo quien publicó modifica el evento

| Elemento | Descripción |
| --- | --- |
| **Problema** | Un usuario autenticado podría editar o borrar el evento de otra persona. |
| **OWASP** | API1:2023 BOLA y A01:2021 Broken Access Control. |
| **Corrección** | `CatalogService.requireManager` compara la membresía real (dueño u organizador) o el rol ADMIN. La ruta usa el id de la sesión. Responde 403 con un detalle que menciona quién publicó el evento. |
| **Prueba** | Luis hace `PATCH` y `DELETE` sobre el evento de Ana. Ambos 403 y el título no cambia. |

## Control 2: no se actúa en nombre de otra persona

| Elemento | Descripción |
| --- | --- |
| **Problema** | Un cliente podría enviar `userId` o `usuarioId` para leer o crear recursos ajenos. |
| **OWASP** | API1:2023 BOLA, API3:2023 BOPLA. |
| **Corrección** | `AuthGuard` rechaza con 403 si `userId`, `usuarioId`, `holderId` u `organizadorId` no coinciden con la sesión. El boleto de otra persona responde 404, para no confirmar que existe. |
| **Prueba** | `GET /v1/tickets/mine?userId=…` devuelve 403. Leer el boleto de otra cuenta devuelve 404. |

## Control 3: secretos fuera del código

| Elemento | Descripción |
| --- | --- |
| **Problema** | Contraseñas y tokens fijos en el código permiten entrar sin login. |
| **OWASP** | A02:2021 Cryptographic Failures y A05:2021 Security Misconfiguration. |
| **Corrección** | La contraseña de demostración sale de `EVENTIA_DEMO_PASSWORD`. En producción la API no arranca sin las llaves Ed25519. Las de desarrollo se generan y se guardan en `apps/api/data`, fuera de git. El refresh es aleatorio y se guarda solo su hash. |
| **Prueba** | La semilla no contiene un token de sesión. Reutilizar un refresh revocado invalida la familia y responde 401. |

## Controles que se suman

| Control | Dónde se prueba |
| --- | --- |
| Cupo atómico, cero sobreventa | 25 apartados paralelos sobre cupo 5; quedan 5 boletos |
| Un asiento, dos compradores | Solo uno obtiene el apartado |
| Idempotencia | La misma clave repite el recurso; otro cuerpo con la misma clave es 409 |
| Webhook de Stripe | Firma inválida 400; la firma válida emite un solo boleto aunque se repita |
| QR | Ventana de 30 s; una captura vieja o alterada no verifica |
| Puerta | Quien no es del equipo recibe 403. El pase transferido queda `REVOKED`. El segundo ingreso es `DUPLICATE` |
| Reembolso | La política del evento fija el monto. Un boleto ya usado no se reembolsa |
| Contraseña | Argon2id. Mínimo 8 caracteres en el esquema compartido |
| CSRF y origen | Mutaciones exigen cookie y encabezado, y el origen tiene que estar en `WEB_ORIGIN` |
| Bitácora | El hash encadena el registro anterior y no depende del orden de las claves |

La puerta sin conexión verifica la firma en el navegador con la clave pública del manifiesto y concilia después. No guarda la clave privada.
