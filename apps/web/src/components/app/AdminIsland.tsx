import { useEffect, useState } from 'react'
import { Bars, Modal, toast } from '@eventia/ui'
import { api, money, when } from '../../lib/api'

type Insights = {
  salesCents: number
  ticketsSold: number
  refundCents: number
  refunds: number
  checkInRate: number
  utilization: number
  funnel: { holds: number; orders: number; paid: number; checkins: number }
  series: { day: string; cents: number }[]
  topEvents: { id: string; title: string; cents: number; sold: number; capacity: number }[]
}
type UserRow = { id: string; email: string; name: string; role: string; suspended: boolean }
type OrgRow = { id: string; name: string; status: string; verified: boolean; events: number; owners: { name: string; email: string }[] }
type EventRow = { id: string; title: string; status: string; city: string; orgName: string; sold: number; capacity: number }
type Audit = { id: string; action: string; actor: string | null; at: string }

export default function AdminIsland() {
  const [insights, setInsights] = useState<Insights | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<UserRow | null>(null)

  async function load() {
    const [picture, people, organizers, catalog, trail] = await Promise.all([
      api<Insights>('/v1/admin/insights'),
      api<{ data: UserRow[] }>('/v1/admin/users'),
      api<{ data: OrgRow[] }>('/v1/admin/organizers'),
      api<{ data: EventRow[] }>('/v1/admin/events'),
      api<{ data: Audit[] }>('/v1/admin/audit'),
    ])
    setInsights(picture)
    setUsers(people.data)
    setOrgs(organizers.data)
    setEvents(catalog.data)
    setAudit(trail.data)
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
  }, [])

  async function saveOrg(id: string, body: { status?: string; verified?: boolean }) {
    await api(`/v1/admin/organizers/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    toast('Organización actualizada')
    await load()
  }

  async function eventStatus(id: string, status: string) {
    setEvents((rows) => rows.map((row) => row.id === id ? { ...row, status } : row))
    try {
      await api(`/v1/admin/events/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast('Evento moderado')
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'No se pudo moderar')
      await load()
    }
  }

  async function suspend(user: UserRow) {
    await api(`/v1/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ suspended: !user.suspended }) })
    setConfirm(null)
    toast(user.suspended ? 'Cuenta reactivada' : 'Cuenta suspendida')
    await load()
  }

  if (error) return <p className="err">{error}. Solo el equipo de Eventia entra aquí. <a href="/entrar">Entrar</a></p>
  if (!insights) return <p className="help">Cargando el panel…</p>

  return (
    <div className="stack">
      <div className="eyebrow">Administración</div>
      <h1 style={{ fontSize: 52 }}>La plataforma.</h1>
      <div className="grid-cards">
        <div className="card panel"><div className="mono">Ingresos</div><div className="price">{money(insights.salesCents)}</div></div>
        <div className="card panel"><div className="mono">Boletos</div><div className="price">{insights.ticketsSold}</div></div>
        <div className="card panel"><div className="mono">Reembolsos</div><div className="price">{money(insights.refundCents)}</div><p className="help">{insights.refunds} órdenes</p></div>
        <div className="card panel"><div className="mono">Check-in</div><div className="price">{insights.checkInRate}%</div></div>
        <div className="card panel"><div className="mono">Cupo usado</div><div className="price">{insights.utilization}%</div></div>
      </div>
      <div className="card panel stack">
        <h2 style={{ fontSize: 28 }}>Ventas en el tiempo</h2>
        <Bars series={insights.series} />
        <p className="help">Embudo: {insights.funnel.holds} apartados, {insights.funnel.orders} órdenes, {insights.funnel.paid} pagos, {insights.funnel.checkins} entradas.</p>
      </div>
      <div className="card panel stack">
        <h2 style={{ fontSize: 28 }}>Eventos con más venta</h2>
        {insights.topEvents.map((event) => (
          <div key={event.id} className="between">
            <span>{event.title}</span>
            <span className="mono">{money(event.cents)} · {event.sold}/{event.capacity}</span>
          </div>
        ))}
        {insights.topEvents.length === 0 && <p className="help">Aún no hay ventas en estas dos semanas.</p>}
      </div>
      <div className="card panel stack">
        <h2 style={{ fontSize: 28 }}>Organizadores</h2>
        {orgs.map((org) => (
          <div key={org.id} className="between">
            <div>
              <strong>{org.name}</strong>
              <p className="help">{org.status}{org.verified ? ' · verificado' : ''} · {org.events} eventos · {org.owners.map((owner) => owner.email).join(', ')}</p>
            </div>
            <div className="row">
              {org.status !== 'ACTIVE' && <button className="btn btn-a ui-press" type="button" onClick={() => saveOrg(org.id, { status: 'ACTIVE', verified: true })}>Aprobar</button>}
              {org.status === 'ACTIVE' && <button className="btn btn-s" type="button" onClick={() => saveOrg(org.id, { status: 'SUSPENDED' })}>Suspender</button>}
              {!org.verified && org.status === 'ACTIVE' && <button className="btn btn-s" type="button" onClick={() => saveOrg(org.id, { verified: true })}>Verificar</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="card panel stack">
        <h2 style={{ fontSize: 28 }}>Moderar eventos</h2>
        <table className="plain">
          <thead><tr><th>Evento</th><th>Estado</th><th>Cupo</th><th></th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.title}<div className="help">{event.orgName} · {event.city}</div></td>
                <td className="mono">{event.status}</td>
                <td className="mono">{event.sold}/{event.capacity}</td>
                <td>{event.status === 'PUBLISHED'
                  ? <button className="btn btn-s" type="button" onClick={() => eventStatus(event.id, 'CANCELLED')}>Retirar</button>
                  : <button className="btn btn-s" type="button" onClick={() => eventStatus(event.id, 'PUBLISHED')}>Publicar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card panel stack">
        <h2 style={{ fontSize: 28 }}>Personas</h2>
        {users.map((user) => (
          <div key={user.id} className="between">
            <div><strong>{user.name}</strong><p className="help">{user.email} · {user.role}{user.suspended ? ' · suspendida' : ''}</p></div>
            <button className="btn btn-s" type="button" onClick={() => setConfirm(user)}>{user.suspended ? 'Reactivar' : 'Suspender'}</button>
          </div>
        ))}
      </div>
      <div className="card panel stack">
        <h2 style={{ fontSize: 28 }}>Bitácora</h2>
        {audit.slice(0, 20).map((row) => (
          <div key={row.id} className="between"><span className="mono">{row.action} · {row.actor}</span><span className="help">{when(row.at)}</span></div>
        ))}
      </div>
      {confirm && (
        <Modal title={confirm.suspended ? 'Reactivar cuenta' : 'Suspender cuenta'} onClose={() => setConfirm(null)}>
          <p>{confirm.name} dejará de entrar si la suspendes. Los boletos que ya compró siguen en la base.</p>
          <button className="btn btn-a" type="button" onClick={() => suspend(confirm)}>Confirmar</button>
        </Modal>
      )}
    </div>
  )
}
