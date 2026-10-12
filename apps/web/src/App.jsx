import { useEffect, useState } from 'react'
import { obtenerYo } from './api.js'
import { Acceso } from './components/Acceso.jsx'
import { DetalleEvento } from './components/DetalleEvento.jsx'
import { Encabezado } from './components/Encabezado.jsx'
import { Explorar } from './components/Explorar.jsx'
import { MisInscripciones } from './components/MisInscripciones.jsx'
import { PublicarEvento } from './components/PublicarEvento.jsx'
import { Registro } from './components/Registro.jsx'

const CLAVE = 'eventia-sesion'

function leerSesion() {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.usuario?.id) return null
    return parsed
  } catch {
    return null
  }
}

export function App() {
  const [vista, setVista] = useState({ nombre: 'explorar' })
  const [sesion, setSesion] = useState(leerSesion)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!sesion?.token) return undefined
    let activo = true
    obtenerYo(sesion.token).catch((error) => {
      if (!activo || error.status !== 401) return
      localStorage.removeItem(CLAVE)
      setSesion(null)
    })
    return () => {
      activo = false
    }
  }, [sesion?.token])

  function guardarSesion(datos) {
    const siguiente = { token: datos.token, usuario: datos.usuario }
    localStorage.setItem(CLAVE, JSON.stringify(siguiente))
    setSesion(siguiente)
    setVista(vista.despues ?? { nombre: 'explorar' })
  }

  function navegar(destino, requiereSesion = false) {
    if (requiereSesion && !sesion) {
      setVista({ nombre: 'acceso', despues: destino })
      return
    }
    setVista(destino)
  }

  function salir() {
    localStorage.removeItem(CLAVE)
    setSesion(null)
    setVista({ nombre: 'explorar' })
  }

  function refrescar() {
    setRecarga((valor) => valor + 1)
  }

  return (
    <>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <Encabezado vista={vista} sesion={sesion} onNavegar={navegar} onSalir={salir} />
      <main id="contenido">
        {vista.nombre === 'explorar' ? (
          <Explorar recarga={recarga} onAbrir={(eventoId) => setVista({ nombre: 'detalle', eventoId })} />
        ) : null}
        {vista.nombre === 'detalle' ? (
          <DetalleEvento
            eventoId={vista.eventoId}
            sesion={sesion}
            onInscrito={refrescar}
            onEliminado={() => {
              refrescar()
              setVista({ nombre: 'explorar' })
            }}
            onRequiereSesion={() => setVista({ nombre: 'acceso', despues: vista })}
          />
        ) : null}
        {vista.nombre === 'publicar' && sesion ? (
          <PublicarEvento
            token={sesion.token}
            onCreado={(eventoId) => {
              refrescar()
              setVista({ nombre: 'detalle', eventoId })
            }}
          />
        ) : null}
        {vista.nombre === 'inscripciones' && sesion ? (
          <MisInscripciones
            token={sesion.token}
            recarga={recarga}
            onAbrir={(eventoId) => setVista({ nombre: 'detalle', eventoId })}
          />
        ) : null}
        {vista.nombre === 'acceso' ? (
          <Acceso onListo={guardarSesion} onIrRegistro={() => setVista({ nombre: 'registro', despues: vista.despues })} />
        ) : null}
        {vista.nombre === 'registro' ? (
          <Registro onListo={guardarSesion} onIrAcceso={() => setVista({ nombre: 'acceso', despues: vista.despues })} />
        ) : null}
      </main>
    </>
  )
}
