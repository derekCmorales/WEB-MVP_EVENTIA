export function calcularCupoDisponible(cupo, inscritos) {
  return Math.max(0, cupo - inscritos)
}
