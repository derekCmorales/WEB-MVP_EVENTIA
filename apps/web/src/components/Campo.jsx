export function Campo({ id, etiqueta, multilinea = false, ...props }) {
  const control = multilinea ? (
    <textarea id={id} {...props} />
  ) : (
    <input id={id} {...props} />
  )

  return (
    <label className="campo" htmlFor={id}>
      <span>{etiqueta}</span>
      {control}
    </label>
  )
}
