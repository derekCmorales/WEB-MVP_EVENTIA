import { z } from 'zod'

const email = z.string().trim().toLowerCase().email().max(160)
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'La fecha no es válida')

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'El nombre admite máximo 80 caracteres'),
  email,
  password: z.string().min(8, 'La contraseña debe tener entre 8 y 72 caracteres').max(72, 'La contraseña debe tener entre 8 y 72 caracteres'),
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
})

export const refundPolicySchema = z.enum(['FLEXIBLE', 'MODERATE', 'STRICT'])

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(120),
  summary: z.string().trim().min(1, 'El resumen es obligatorio').max(200),
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(4000),
  city: z.string().trim().min(1, 'La ciudad es obligatoria').max(80),
  venueName: z.string().trim().min(1, 'El lugar es obligatorio').max(160),
  address: z.string().trim().min(1).max(200),
  startsAt: isoDate,
  endsAt: isoDate,
  zoneName: z.string().trim().min(1).max(80).default('General'),
  kind: z.enum(['GA', 'SEATED']).default('GA'),
  capacity: z.number().int().min(1, 'El cupo debe ser un entero entre 1 y 100000').max(100000),
  ticketName: z.string().trim().min(1).max(80).default('General'),
  priceCents: z.number().int().min(0).max(10_000_000),
  feeCents: z.number().int().min(0).max(1_000_000).default(0),
  currency: z.string().trim().length(3).default('USD'),
  refundPolicy: refundPolicySchema.default('MODERATE'),
  queueEnabled: z.boolean().default(false),
  publish: z.boolean().default(true),
  seats: z.array(z.object({
    row: z.string().trim().min(1).max(8),
    number: z.number().int().min(1).max(500),
    accessible: z.boolean().default(false),
  })).max(500).optional(),
})

export const patchEventSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  refundPolicy: refundPolicySchema.optional(),
  capacity: z.number().int().min(1).max(100000).optional(),
}).refine((value) => Object.keys(value).length > 0, 'No hay datos para actualizar')

export const holdSchema = z.object({
  sessionId: z.string().min(1),
  items: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.number().int().min(1).max(10),
    seatIds: z.array(z.string().min(1)).max(10).optional(),
  })).min(1).max(5),
})

export const orderSchema = z.object({
  holdId: z.string().min(1),
})

export const transferSchema = z.object({
  toEmail: email,
})

export const refundSchema = z.object({
  reason: z.string().trim().min(1, 'Indica el motivo').max(300),
})

export const checkInSchema = z.object({
  token: z.string().min(10),
  deviceId: z.string().trim().min(1).max(80),
  offline: z.boolean().optional(),
})

export const reconcileSchema = z.object({
  deviceId: z.string().trim().min(1).max(80),
  items: z.array(z.object({
    token: z.string().min(10),
    at: isoDate,
  })).min(1).max(200),
})

export const waitlistSchema = z.object({
  sessionId: z.string().min(1),
  ticketTypeId: z.string().min(1),
})

export const inviteStaffSchema = z.object({
  email,
})

export const queueJoinSchema = z.object({
  deviceId: z.string().trim().min(1).max(80).optional(),
})

export const listEventsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(80).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type CreateEventInput = z.infer<typeof createEventSchema>
export type PatchEventInput = z.infer<typeof patchEventSchema>
export type HoldInput = z.infer<typeof holdSchema>
export type OrderInput = z.infer<typeof orderSchema>
export type TransferInput = z.infer<typeof transferSchema>
export type RefundInput = z.infer<typeof refundSchema>
export type CheckInInput = z.infer<typeof checkInSchema>
export type ReconcileInput = z.infer<typeof reconcileSchema>
export type WaitlistInput = z.infer<typeof waitlistSchema>
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>
export type QueueJoinInput = z.infer<typeof queueJoinSchema>
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>

export const adminUserPatchSchema = z.object({
  role: z.enum(['ATTENDEE', 'ORGANIZER', 'STAFF', 'ADMIN']).optional(),
  suspended: z.boolean().optional(),
}).refine((value) => value.role !== undefined || value.suspended !== undefined, 'No hay datos para actualizar')

export const adminOrgPatchSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  verified: z.boolean().optional(),
}).refine((value) => value.status !== undefined || value.verified !== undefined, 'No hay datos para actualizar')

export const adminEventPatchSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']),
})

export type AdminUserPatch = z.infer<typeof adminUserPatchSchema>
export type AdminOrgPatch = z.infer<typeof adminOrgPatchSchema>
export type AdminEventPatch = z.infer<typeof adminEventPatchSchema>
