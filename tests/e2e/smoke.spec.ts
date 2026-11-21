import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function noSeriousA11y(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${where}: ${v.id} (${v.nodes.length}) ${v.nodes.map((n) => n.target.join(" ") + " :: " + (n.failureSummary ?? "")).join(" | ")}`)).toEqual([])
}

async function addEqualExpense(page: Page, gid: string, title: string, amount: string, payer: string) {
  await page.goto(`/g/${gid}/expense/new`)
  await page.getByLabel('What was it?').fill(title)
  await page.getByLabel('Amount', { exact: true }).fill(amount)
  await page.getByLabel('Paid by').selectOption({ label: payer })
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
}

test('dinner for three: split, settle, persist, exact-mode guard, a11y, demo', async ({ page }) => {
  // 1. Empty state → create a group
  await page.goto('/')
  await expect(page.getByText('No groups yet. Start one for a trip, a house, or tonight’s dinner.')).toBeVisible()
  await noSeriousA11y(page, 'home')
  await page.getByRole('button', { name: 'Start a group' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a group' })
  await dialog.getByLabel('Group name').fill('Test Dinner')
  const person = dialog.getByLabel('People', { exact: true })
  for (const n of ['Ada', 'Ben', 'Cy']) {
    await person.fill(n)
    await person.press('Enter')
  }
  await dialog.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Test Dinner' })).toBeVisible()
  const gid = new URL(page.url()).pathname.split('/')[2] as string

  // 2. Two equal expenses (no remainders)
  await addEqualExpense(page, gid, 'Pizza', '90.00', 'Ada')
  await addEqualExpense(page, gid, 'Drinks', '30.00', 'Ben')
  await noSeriousA11y(page, 'group')

  // 3. Settle up
  await page.getByRole('link', { name: 'Settle up' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settle up' })).toBeVisible()
  await expect(page.getByTestId('balance-Ada')).toHaveText('Ada gets back $50.00')
  await expect(page.getByTestId('balance-Ben')).toHaveText('Ben owes $10.00')
  await expect(page.getByTestId('balance-Cy')).toHaveText('Cy owes $40.00')
  const transfers = page.getByTestId('transfer')
  await expect(transfers).toHaveCount(2)
  await expect(transfers.nth(0)).toContainText('Ben→ pays Ada $10.00')
  await expect(transfers.nth(1)).toContainText('Cy→ pays Ada $40.00')
  await noSeriousA11y(page, 'settle')

  // 4. Mark Ben → Ada paid; persists across reload
  await page.getByRole('button', { name: 'Mark paid: Ben pays Ada $10.00' }).click()
  await expect(transfers).toHaveCount(1)
  await page.waitForTimeout(400) // debounced save
  await page.reload()
  await expect(page.getByTestId('transfer')).toHaveCount(1)
  await expect(page.getByTestId('balance-Ben')).toHaveText('Ben is square')

  // 5. Exact mode, 1¢ short → message + Save disabled
  await page.goto(`/g/${gid}/expense/new`)
  await page.getByLabel('What was it?').fill('Dessert')
  await page.getByLabel('Amount', { exact: true }).fill('45.00')
  await page.getByRole('radio', { name: 'Exact amounts' }).check()
  await page.getByLabel('Ada', { exact: true }).fill('20.00')
  await page.getByLabel('Ben', { exact: true }).fill('15.00')
  await page.getByLabel('Cy', { exact: true }).fill('9.99')
  await expect(page.getByText('1¢ left to assign').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save expense' })).toBeDisabled()

  // 7. Demo trip
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo trip' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Lakehouse Weekend' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Cabin rental/ })).toBeVisible()
  await expect(page.getByText('Sample data, delete anytime.')).toBeVisible()

  // 8. About page: pitch content renders and passes a11y
  await page.getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'About Split Easy' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Try it in 30 seconds' })).toBeVisible()
  await noSeriousA11y(page, 'about')
})
