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
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import type { IdrRate } from '../hooks/use-display-currency'

/**
 * States that Rupiah prices are converted estimates, which rate produced them, and that
 * balances and billing stay in USD. Render it only while the IDR display currency is active.
 */
export function IdrRateNote(props: { rate: IdrRate }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  // 1 USD in the active display currency, e.g. "Rp 18.100"
  const rateText = formatBillingCurrencyFromUSD(1, { abbreviate: false })
  const parsedDate = props.rate.date
    ? new Date(`${props.rate.date}T00:00:00Z`)
    : null
  const dateText =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : ''

  let source = t('rate set by the administrator')
  if (props.rate.source === 'ecb') {
    source = dateText
      ? t('ECB reference rate, {{date}}', { date: dateText })
      : t('ECB reference rate')
  }

  return (
    <p className='text-muted-foreground flex items-start gap-2 text-xs leading-relaxed'>
      <Info className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
      <span>
        {t(
          'Rupiah prices are estimates at 1 USD = {{rate}} ({{source}}). Balances and billing stay in USD.',
          { rate: rateText, source }
        )}
      </span>
    </p>
  )
}
