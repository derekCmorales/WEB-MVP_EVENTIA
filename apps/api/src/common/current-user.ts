export type CurrentUser = {
  id: string
  email: string
  role: 'ATTENDEE' | 'ORGANIZER' | 'STAFF' | 'ADMIN'
  name: string
}
