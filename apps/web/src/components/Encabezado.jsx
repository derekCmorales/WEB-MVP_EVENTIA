const ENLACES = [
  { nombre: 'explorar', etiqueta: 'Explorar' },
  { nombre: 'publicar', etiqueta: 'Publicar', requiereSesion: true },
  { nombre: 'inscripciones', etiqueta: 'Mis inscripciones', requiereSesion: true },
]

export function Encabezado({ vista, sesion, onNavegar, onSalir }) {
  return (
    <header className="barra">
      <button type="button" className="marca" onClick={() => onNavegar({ nombre: 'explorar' })}>
        <span className="marca-signo" aria-hidden="true" />
        EventIA
      </button>
      <nav className="menu" aria-label="Principal">
        {ENLACES.map((enlace) => (
          <button
            key={enlace.nombre}
            type="button"
            className={vista.nombre === enlace.nombre ? 'activo' : undefined}
            onClick={() => onNavegar({ nombre: enlace.nombre }, enlace.requiereSesion)}
          >
            {enlace.etiqueta}
          </button>
        ))}
      </nav>
      <div className="sesion">
        {sesion ? (
          <>
            <span>{sesion.usuario.nombre}</span>
            <button type="button" onClick={onSalir}>
              Salir
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onNavegar({ nombre: 'acceso' })}>
              Entrar
            </button>
            <button type="button" className="solido" onClick={() => onNavegar({ nombre: 'registro' })}>
              Registrarme
            </button>
          </>
        )}
      </div>
    </header>
  )
}
