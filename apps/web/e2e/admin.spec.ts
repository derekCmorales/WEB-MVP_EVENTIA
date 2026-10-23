import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const shots = '/opt/cursor/artifacts/screenshots'

test('el admin ve la plataforma y una cuenta normal no', async ({ page }) => {
  await mkdir(shots, { recursive: true })
  await page.goto('/entrar')
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible()
  await page.getByLabel('Correo').fill('ana@eventia.dev')
  await page.getByLabel('Contraseña').fill('demo1234')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/explorar/)
  await page.goto('/admin')
  await expect(page.getByText('Solo el equipo de Eventia')).toBeVisible()

  await page.goto('/entrar')
  await expect(page.locator('form[data-hydrated="true"]')).toBeVisible()
  await page.getByLabel('Correo').fill('admin@eventia.dev')
  await page.getByLabel('Contraseña').fill('demo1234')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/explorar/)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'La plataforma.' })).toBeVisible()
  await expect(page.getByText('Sala Nora')).toBeVisible()
  await page.screenshot({ path: `${shots}/10-admin.png`, fullPage: true })
  await page.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText('Organización actualizada')).toBeVisible()
  await page.screenshot({ path: `${shots}/10-admin-aprobado.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/explorar')
  await page.locator('.mobile-nav summary').click()
  await expect(page.locator('.mobile-nav a[href="/cuenta"]')).toBeVisible()
  await page.screenshot({ path: `${shots}/11-menu-movil.png` })
})
