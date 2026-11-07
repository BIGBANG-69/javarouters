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
import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { setBillingDisplayCurrency } from '@/lib/currency'
import {
  usePriceCurrencyStore,
  type PriceCurrency,
} from '@/stores/price-currency-store'

/** Rupiah amounts on the price page show at most this many decimals at or above Rp 1. */
const IDR_MAX_FRACTION_DIGITS = 2

export type IdrRate = {
  rate: number
  /** "ecb" or "manual" */
  source: string
  /** ECB reference date (YYYY-MM-DD); empty for a manual rate */
  date: string
}

/**
 * The currency the public price page shows: the visitor's saved choice, else IDR for the
 * Indonesian interface and USD for every other language. IDR needs a known rate; without
 * one the page shows USD and offers no switch.
 */
export function resolvePriceCurrency(
  saved: PriceCurrency | null,
  language: string,
  idrAvailable: boolean
): PriceCurrency {
  if (!idrAvailable) return 'USD'
  if (saved) return saved
  return language === 'id' ? 'IDR' : 'USD'
}

/**
 * Picks the price page's display currency and applies it to the billing price formatter
 * for as long as the page is mounted. `renderKey` changes after the formatter switches;
 * use it as a React key so every price below re-renders in the new currency.
 */
export function useDisplayCurrency() {
  const { i18n } = useTranslation()
  const { status } = useStatus()
  const saved = usePriceCurrencyStore((state) => state.currency)
  const setCurrency = usePriceCurrencyStore((state) => state.setCurrency)

  const language = i18n.resolvedLanguage || i18n.language
  const rateValue = Number(status?.idr_exchange_rate)
  const idrRate: IdrRate | null =
    Number.isFinite(rateValue) && rateValue > 0
      ? {
          rate: rateValue,
          source: status?.idr_exchange_rate_source ?? '',
          date: status?.idr_exchange_rate_date ?? '',
        }
      : null
  const currency = resolvePriceCurrency(saved, language, idrRate !== null)
  const locale = toIntlLocale(language)

  const [renderKey, setRenderKey] = useState('initial')
  useLayoutEffect(() => {
    setBillingDisplayCurrency(
      currency === 'IDR'
        ? {
            currencyCode: 'IDR',
            exchangeRate: rateValue,
            maxFractionDigitsLarge: IDR_MAX_FRACTION_DIGITS,
            locale,
          }
        : null
    )
    setRenderKey(`${currency}:${rateValue}:${locale ?? ''}`)
    return () => setBillingDisplayCurrency(null)
  }, [currency, rateValue, locale])

  return { currency, setCurrency, idrRate, renderKey }
}
