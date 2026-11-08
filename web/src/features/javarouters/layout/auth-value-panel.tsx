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
import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'

import { toRateBoardRow } from '../lib/rate-board'

const VALUE_POINTS = [
  'About 30% under the official price, synced every hour',
  'OpenAI and Anthropic compatible endpoints',
  'One API key for Claude, GPT, Gemini and more',
] as const

/** The emerald side of the auth pages: what the account gets you. */
export function AuthValuePanel() {
  const { t } = useTranslation()
  const pricing = usePricingData()
  const modelCount = useMemo(
    () => pricing.models.filter((model) => toRateBoardRow(model) !== null).length,
    [pricing.models]
  )

  return (
    <aside className='bg-primary text-primary-foreground hidden flex-col justify-between p-12 lg:flex xl:p-16'>
      <p className='text-primary-foreground/80 text-sm font-medium tabular-nums'>
        {modelCount > 0
          ? t('{{count}} models available today', { count: modelCount })
          : ' '}
      </p>
      <div className='max-w-md'>
        <p className='font-display text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance xl:text-5xl'>
          {t('One API for every AI model.')}
        </p>
        <ul className='mt-10 space-y-4'>
          {VALUE_POINTS.map((point) => (
            <li key={point} className='flex gap-3 text-base'>
              <Check
                aria-hidden='true'
                className='text-primary-foreground/90 mt-0.5 size-5 shrink-0'
              />
              <span>{t(point)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className='text-primary-foreground/75 text-sm'>
        {t('Create API keys, top up and track usage from one console.')}
      </p>
    </aside>
  )
}
