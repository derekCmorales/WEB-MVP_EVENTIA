import type { CurrentUser } from '../common/current-user'

declare global {
  namespace Express {
    interface Request {
      user?: CurrentUser
      requestId?: string
    }
  }
}

export {}
