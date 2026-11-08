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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import type { PublicStats } from '../../lib/public-stats'
import { UsageStats, UsageStatsSection } from '../usage-stats'

const DAY = 86400
const START = 1_800_000_000

const STATS: PublicStats = {
  visible: true,
  window_days: 7,
  requests: 18_200,
  tokens: 12_400_000,
  cache_read_tokens: 1_000_000,
  cache_creation_tokens: 200_000,
  success_rate: 0.994,
  average_response_seconds: 2.4,
  top_models: [
    { model_name: 'claude-sonnet-4.6', requests: 9_000, tokens: 6_000_000 },
    { model_name: 'deepseek-v4-pro', requests: 4_500, tokens: 3_000_000 },
  ],
  daily: Array.from({ length: 7 }, (_, index) => ({
    start: START + index * DAY,
    requests: 2_600,
    tokens: index === 6 ? 0 : 2_000_000,
  })),
  generated_at: START + 7 * DAY,
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <UsageStatsSection />
    </QueryClientProvider>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('landing usage statistics', () => {
  it('shows tokens, requests with success rate, and response time for the window', () => {
    render(<UsageStats stats={STATS} />)

    expect(
      screen.getByRole('heading', { name: 'Platform activity, last 7 days' })
    ).toBeVisible()
    expect(screen.getByText('12.4M')).toBeVisible()
    expect(screen.getByText('1.2M of them cache tokens')).toBeVisible()
    expect(screen.getByText('18.2K')).toBeVisible()
    expect(screen.getByText('99.4% completed successfully')).toBeVisible()
    expect(screen.getByText('2.4 s')).toBeVisible()
  })

  it('ranks the most used models with their request counts', () => {
    render(<UsageStats stats={STATS} />)
    const list = screen.getByRole('list')
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('1claude-sonnet-4.69,000 requests')
    expect(items[1]).toHaveTextContent('2deepseek-v4-pro4,500 requests')
  })

  it('gives screen readers every day of the token chart as a table', () => {
    render(<UsageStats stats={STATS} />)
    const table = screen.getByRole('table', { name: 'Tokens per day' })
    const rows = within(table).getAllByRole('row')

    expect(rows).toHaveLength(7)
    expect(rows[0]).toHaveTextContent('2,000,000')
    expect(rows[6]).toHaveTextContent('0')
  })

  it('leaves out the success rate when no outcome was recorded', () => {
    render(<UsageStats stats={{ ...STATS, success_rate: null }} />)
    expect(screen.queryByText(/completed successfully/)).toBeNull()
  })

  it('renders nothing while the server keeps the statistics hidden', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { success: true, data: { visible: false } } })
    renderSection()

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/public/stats'))
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('renders nothing when the statistics cannot be loaded', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
    renderSection()

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('shows the section once the server publishes the statistics', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: STATS },
    })
    renderSection()

    expect(
      await screen.findByRole('heading', {
        name: 'Platform activity, last 7 days',
      })
    ).toBeVisible()
  })
})
