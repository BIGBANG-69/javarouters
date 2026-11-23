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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { BillingHistoryDialog } from '@/features/wallet/components/dialogs/billing-history-dialog'
import { UsdcSolanaCard } from '@/features/wallet/components/usdc-solana-card'
import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en },
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('invokes onDepositSuccess when a checked USDC transaction is credited', async () => {
  const user = userEvent.setup()
  const onDepositSuccess = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        available: true,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        network: 'solana',
        address: 'DepositOwnerAddress111111111111111111111111111',
        token_account: 'DepositTokenAccount11111111111111111111111111',
        pay_url: 'solana:DepositOwnerAddress111111111111111111111111111',
        held_atomic: 0,
        deposits: [],
      },
    },
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        outcome: 'credited',
        credited_atomic: 2_500_000,
        bonus_atomic: 0,
        voucher_code: '',
        quota: 1_250_000,
        bonus_quota: 0,
      },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <UsdcSolanaCard onDepositSuccess={onDepositSuccess} />
      </I18nextProvider>
    </QueryClientProvider>
  )

  const input = await screen.findByPlaceholderText(
    'Paste a Solana signature or Solscan URL…'
  )
  await user.type(input, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
  await user.click(screen.getByRole('button', { name: 'Check transaction' }))

  await waitFor(() => {
    expect(onDepositSuccess).toHaveBeenCalledTimes(1)
  })
})

it('renders USDC (Solana) payment method name and fractional USD amount in billing history', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 1,
        items: [
          {
            id: 1,
            status: 'success',
            amount: 0,
            money: 0.75,
            trade_no: 'USDCSOL-sig-1',
            payment_method: 'usdc_solana',
            create_time: 1,
          },
        ],
      },
    },
  })

  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )

  await screen.findByText('USDCSOL-sig-1')
  expect(screen.getByText('USDC (Solana)')).toBeVisible()
  // The currency formatter follows the runtime locale (e.g. "$0.75" or "US$0,75").
  expect(screen.getByText(/\$0[.,]75/)).toBeVisible()
})
