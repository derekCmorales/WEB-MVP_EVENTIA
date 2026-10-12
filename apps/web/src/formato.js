export function formatoFecha(valor) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fecha)
}

export function textoCupo(disponibles) {
  if (disponibles <= 0) return 'Cupo agotado'
  if (disponibles === 1) return '1 lugar disponible'
  return `${disponibles} lugares disponibles`
}
