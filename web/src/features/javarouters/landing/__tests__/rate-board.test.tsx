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
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { RateBoard } from '../rate-board'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (props: { to: string; children: ReactNode; className?: string }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

function model(name: string, input: number, output: number): PricingModel {
  return {
    model_name: name,
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 0,
    model_price: 0,
    enable_groups: ['default'],
    billing_mode: 'tiered_expr',
    billing_expr: `tier("standard", p * ${input} + c * ${output})`,
  } as unknown as PricingModel
}

const MODELS = [
  model('claude-opus-4.8', 3.5, 17.5),
  model('claude-haiku-4.5', 0.7, 3.5),
  model('gpt-5.4', 1.75, 10.5),
]

function renderBoard(overrides: Partial<Parameters<typeof RateBoard>[0]> = {}) {
  const onRetry = vi.fn()
  render(
    <RateBoard
      models={MODELS}
      isLoading={false}
      hasError={false}
      onRetry={onRetry}
      {...overrides}
    />
  )
  return { onRetry }
}

function modelRows() {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('rowheader').length > 0)
}

describe('RateBoard', () => {
  it('shows the first family with the official price struck beside ours', () => {
    renderBoard()

    const rows = modelRows()
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'claude-opus-4.8',
      'claude-haiku-4.5',
    ])
    // The formatter follows the runtime locale, so accept either decimal mark.
    const [inputCell] = within(rows[0]).getAllByRole('cell')
    expect(inputCell.querySelector('s')?.textContent).toMatch(/^\$5$/)
    expect(inputCell.textContent).toMatch(/\$3[.,]5/)
  })

  it('switches rows when another family tab is chosen', async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(screen.getByRole('tab', { name: 'GPT' }))

    expect(
      modelRows().map((row) => within(row).getByRole('rowheader').textContent)
    ).toEqual(['gpt-5.4'])
  })

  it('shows skeleton rows and no model rows while loading', () => {
    renderBoard({ models: [], isLoading: true })

    expect(modelRows()).toHaveLength(0)
    expect(document.querySelector('tbody[aria-busy="true"]')).not.toBeNull()
  })

  it('offers a retry when prices fail to load', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderBoard({ models: [], hasError: true })

    expect(screen.getByText('Prices could not be loaded right now.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says so when no token-priced model exists', () => {
    renderBoard({ models: [] })

    expect(screen.getByText('No models are available yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('links to the full price list', () => {
    renderBoard()

    expect(
      screen.getByRole('link', { name: /See all models and prices/ })
    ).toHaveAttribute('href', '/pricing')
  })
})
