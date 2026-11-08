/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'
import { setBillingDisplayCurrency } from '@/lib/currency'

import { toPriceListRow } from '../../lib/price-list'
import { PriceBoard, type PriceBoardProps } from '../price-board'

function model(name: string, vendor: string, input: number, output: number) {
  return {
    model_name: name,
    vendor_name: vendor,
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 0,
    model_price: 0,
    enable_groups: ['default'],
    billing_mode: 'tiered_expr',
    billing_expr: `tier("standard", p * ${input} + c * ${output} + cr * ${input / 10})`,
  } as unknown as PricingModel & { vendor_name: string }
}

const ROWS = [
  model('claude-opus-4.8', 'Anthropic', 3.5, 17.5),
  model('gpt-5.4', 'OpenAI', 1.75, 10.5),
  model('kimi-k3', 'Moonshot', 0.6, 2.5),
].map(toPriceListRow)

function renderBoard(overrides: Partial<PriceBoardProps> = {}) {
  const props: PriceBoardProps = {
    rows: ROWS,
    isLoading: false,
    hasError: false,
    onRetry: vi.fn(),
    onSelectModel: vi.fn(),
    ...overrides,
  }
  render(<PriceBoard {...props} />)
  return props
}

function bodyRowNames() {
  const table = screen.getByRole('table')
  return within(table)
    .getAllByRole('rowheader')
    .map((cell) => within(cell).getByRole('button').textContent)
}

// Pin USD formatting to en-US so expectations do not depend on the machine's locale.
beforeEach(() =>
  setBillingDisplayCurrency({
    currencyCode: 'USD',
    exchangeRate: 1,
    locale: 'en-US',
  })
)
afterEach(() => setBillingDisplayCurrency(null))

describe('JavaRouters price board', () => {
  it('lists every model with the official price struck through beside the sell price', () => {
    renderBoard()
    expect(bodyRowNames()).toEqual(['claude-opus-4.8', 'gpt-5.4', 'kimi-k3'])
    const row = screen.getByRole('button', { name: 'claude-opus-4.8' })
      .closest('tr') as HTMLElement
    expect(within(row).getByText('$5').tagName).toBe('S')
    expect(within(row).getByText('$3.5')).toBeInTheDocument()
    expect(within(row).getByText('$0.35')).toBeInTheDocument()
    expect(within(row).getByText('Save 30%')).toBeInTheDocument()
  })

  it('shows only one family after its tab is chosen, with per-family counts', async () => {
    const user = userEvent.setup()
    renderBoard()
    const tabs = screen.getByRole('tablist', { name: 'Model family' })
    expect(within(tabs).getByRole('tab', { name: /All models\s*3/ })).toBeVisible()
    expect(within(tabs).queryByRole('tab', { name: /Gemini/ })).toBeNull()

    await user.click(within(tabs).getByRole('tab', { name: /GPT\s*1/ }))
    expect(bodyRowNames()).toEqual(['gpt-5.4'])
  })

  it('filters by provider name and offers to clear a search with no matches', async () => {
    const user = userEvent.setup()
    renderBoard()
    const search = screen.getByPlaceholderText('Search model or provider')

    await user.type(search, 'anthropic')
    expect(bodyRowNames()).toEqual(['claude-opus-4.8'])

    await user.clear(search)
    await user.type(search, 'mistral')
    expect(screen.getByText('No models match "mistral".')).toBeVisible()
    // The empty state's own button, not the search field's clear icon.
    await user.click(
      within(screen.getByRole('table')).getByRole('button', {
        name: 'Clear search',
      })
    )
    expect(bodyRowNames()).toHaveLength(3)
  })

  it('opens a model when its row or name is chosen', async () => {
    const user = userEvent.setup()
    const props = renderBoard()
    await user.click(screen.getByRole('button', { name: 'gpt-5.4' }))
    expect(props.onSelectModel).toHaveBeenCalledWith('gpt-5.4')
    expect(props.onSelectModel).toHaveBeenCalledTimes(1)
  })

  it('switches the display currency and shows the switch only when offered', async () => {
    const user = userEvent.setup()
    const onCurrencyChange = vi.fn()
    renderBoard({ currency: 'IDR', onCurrencyChange })
    const group = screen.getByRole('group', { name: 'Price currency' })
    expect(within(group).getByRole('button', { name: 'IDR' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await user.click(within(group).getByRole('button', { name: 'USD' }))
    expect(onCurrencyChange).toHaveBeenCalledWith('USD')
  })

  it('omits the currency switch when no currency is offered', () => {
    renderBoard()
    expect(screen.queryByRole('group', { name: 'Price currency' })).toBeNull()
  })

  it('shows Rupiah prices while the IDR display currency is active', () => {
    setBillingDisplayCurrency({
      currencyCode: 'IDR',
      exchangeRate: 18100,
      maxFractionDigitsLarge: 2,
      locale: 'id',
    })
    renderBoard()
    const row = screen.getByRole('button', { name: 'claude-opus-4.8' })
      .closest('tr') as HTMLElement
    expect(within(row).getByText(/^Rp\s63\.350$/)).toBeInTheDocument()
  })

  it('offers a retry when prices fail to load', async () => {
    const user = userEvent.setup()
    const props = renderBoard({ hasError: true })
    expect(
      screen.getByText('Prices could not be loaded right now.')
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('marks the table busy while prices load', () => {
    renderBoard({ isLoading: true })
    expect(
      screen.getByRole('table').querySelector('tbody[aria-busy="true"]')
    ).not.toBeNull()
  })
})
