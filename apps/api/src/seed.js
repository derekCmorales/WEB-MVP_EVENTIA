import { hashPassword } from './shared/password.js'

export const DEMO_PASSWORD = 'demo1234'

export function createSeedData() {
  const passwordHash = hashPassword(DEMO_PASSWORD)
  return {
    usuarios: [
      {
        id: 'usr-ana',
        nombre: 'Ana López',
        correo: 'ana@eventia.dev',
        passwordHash,
        token: 'token-ana-demo',
        creadoEn: '2026-10-01T15:00:00.000Z',
      },
      {
        id: 'usr-luis',
        nombre: 'Luis García',
        correo: 'luis@eventia.dev',
        passwordHash,
        token: 'token-luis-demo',
        creadoEn: '2026-10-01T15:05:00.000Z',
      },
    ],
    eventos: [
      {
        id: 'evt-cine',
        titulo: 'Cine al aire libre',
        descripcion:
          'Proyección de cortos locales al anochecer. Lleva una manta; el cupo es pequeño a propósito para probar la inscripción.',
        lugar: 'Jardín central',
        fecha: '2026-10-11T19:00',
        cupo: 2,
        organizadorId: 'usr-luis',
        creadoEn: '2026-10-02T18:00:00.000Z',
      },
      {
        id: 'evt-foto',
        titulo: 'Taller de fotografía nocturna',
        descripcion:
          'Recorrido corto para practicar luz, encuadre y exposición. No necesitas cámara profesional.',
        lugar: 'Centro cultural del barrio',
        fecha: '2026-10-18T11:00',
        cupo: 12,
        organizadorId: 'usr-ana',
        creadoEn: '2026-10-02T18:10:00.000Z',
      },
      {
        id: 'evt-bici',
        titulo: 'Ruta en bicicleta por el centro',
        descripcion:
          'Paseo de ritmo tranquilo con una parada para desayunar. El punto de encuentro es el kiosco principal.',
        lugar: 'Kiosco principal',
        fecha: '2026-10-25T08:00',
        cupo: 15,
        organizadorId: 'usr-luis',
        creadoEn: '2026-10-03T12:00:00.000Z',
      },
    ],
    inscripciones: [
      {
        id: 'ins-luis-cine',
        usuarioId: 'usr-luis',
        eventoId: 'evt-cine',
        creadoEn: '2026-10-03T16:00:00.000Z',
      },
    ],
  }
}
