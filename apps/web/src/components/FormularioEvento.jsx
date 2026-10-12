import { Campo } from './Campo.jsx'

export const EVENTO_VACIO = {
  titulo: '',
  descripcion: '',
  lugar: '',
  fecha: '',
  cupo: 10,
}

export function FormularioEvento({ idPrefijo, valor, onChange, onSubmit, textoBoton, error, pendiente }) {
  function actualizar(campo, siguiente) {
    onChange({ ...valor, [campo]: siguiente })
  }

  return (
    <form
      className="formulario"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Campo
        id={`${idPrefijo}-titulo`}
        etiqueta="Título"
        value={valor.titulo}
        onChange={(event) => actualizar('titulo', event.target.value)}
        required
        maxLength={120}
      />
      <Campo
        id={`${idPrefijo}-descripcion`}
        etiqueta="Descripción"
        multilinea
        value={valor.descripcion}
        onChange={(event) => actualizar('descripcion', event.target.value)}
        required
        maxLength={1000}
        rows={4}
      />
      <Campo
        id={`${idPrefijo}-lugar`}
        etiqueta="Lugar"
        value={valor.lugar}
        onChange={(event) => actualizar('lugar', event.target.value)}
        required
        maxLength={160}
      />
      <Campo
        id={`${idPrefijo}-fecha`}
        etiqueta="Fecha y hora"
        type="datetime-local"
        value={valor.fecha}
        onChange={(event) => actualizar('fecha', event.target.value)}
        required
      />
      <Campo
        id={`${idPrefijo}-cupo`}
        etiqueta="Cupo"
        type="number"
        min={1}
        max={500}
        value={valor.cupo}
        onChange={(event) => actualizar('cupo', Number(event.target.value))}
        required
      />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" className="solido" disabled={pendiente}>
        {pendiente ? 'Guardando…' : textoBoton}
      </button>
    </form>
  )
}
