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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  formatBillingCurrencyFromUSD,
  getCurrencyLabel,
  setBillingDisplayCurrency,
} from '@/lib/currency'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { CachedPriceCell } from '../components/cached-price-cell'
import { ModelPriceCell } from '../components/model-price-cell'
import { resolvePriceCurrency } from '../hooks/use-display-currency'
import type { PricingModel } from '../types'

const IDR = {
  currencyCode: 'IDR',
  exchangeRate: 18100,
  maxFractionDigitsLarge: 2,
  locale: 'id',
}

// model_ratio 1.5 -> input $3 per 1M tokens; cache_ratio 0.1 -> cache read $0.3 per 1M.
function pricingModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 1,
    model_name: 'example-model',
    quota_type: 0,
    model_ratio: 1.5,
    completion_ratio: 5,
    cache_ratio: 0.1,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
    ...overrides,
  }
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  setBillingDisplayCurrency(null)
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('price page display currency', () => {
  it.each<{
    name: string
    saved: 'IDR' | 'USD' | null
    language: string
    idrAvailable: boolean
    expected: 'IDR' | 'USD'
  }>([
    { name: 'Indonesian visitor without a saved choice gets IDR', saved: null, language: 'id', idrAvailable: true, expected: 'IDR' },
    { name: 'English visitor without a saved choice gets USD', saved: null, language: 'en', idrAvailable: true, expected: 'USD' },
    { name: 'a saved USD choice beats the Indonesian default', saved: 'USD', language: 'id', idrAvailable: true, expected: 'USD' },
    { name: 'a saved IDR choice beats the English default', saved: 'IDR', language: 'en', idrAvailable: true, expected: 'IDR' },
    { name: 'no known IDR rate always shows USD', saved: 'IDR', language: 'id', idrAvailable: false, expected: 'USD' },
  ])('$name', (testCase) => {
    expect(
      resolvePriceCurrency(
        testCase.saved,
        testCase.language,
        testCase.idrAvailable
      )
    ).toBe(testCase.expected)
  })

  it('converts billing prices to IDR while the override is set and back to USD after it is cleared', () => {
    setBillingDisplayCurrency(IDR)
    expect(formatBillingCurrencyFromUSD(3)).toMatch(/^Rp\s54\.300$/)
    expect(getCurrencyLabel()).toBe('IDR')

    setBillingDisplayCurrency(null)
    expect(formatBillingCurrencyFromUSD(3)).toBe('$3')
    expect(getCurrencyLabel()).toBe('USD')
  })

  it('caps IDR amounts at two decimals at or above Rp 1', () => {
    setBillingDisplayCurrency(IDR)
    // $0.003 per 1K tokens = Rp 54.3
    expect(
      formatBillingCurrencyFromUSD(0.003, { digitsLarge: 4, digitsSmall: 6 })
    ).toMatch(/^Rp\s54,3$/)
  })

  it('keeps Rupiah thousands separators in the cached price cell', () => {
    setBillingDisplayCurrency(IDR)
    render(
      <CachedPriceCell model={pricingModel()} options={{ tokenUnit: 'M' }} />
    )
    // Cache read $0.3 per 1M = Rp 5.430, not "Rp 5.43".
    expect(screen.getByText(/^Rp\s5\.430$/)).toBeInTheDocument()
  })

  it('labels table prices with the IDR currency code while the override is set', () => {
    setBillingDisplayCurrency(IDR)
    render(
      <ModelPriceCell model={pricingModel()} options={{ tokenUnit: 'M' }} />
    )
    // Table cells show the bare amount; the caption names the currency.
    expect(screen.getByText('54.300')).toBeInTheDocument()
    expect(screen.getByText('IDR / 1M tokens')).toBeInTheDocument()
  })
})
