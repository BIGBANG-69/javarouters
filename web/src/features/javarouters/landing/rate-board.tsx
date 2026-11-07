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
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PricingModel } from '@/features/pricing/types'

import {
  availableFamilies,
  buildRateBoard,
  formatPerMillion,
  RATE_BOARD_ROWS,
  type ModelFamily,
  type RateBoardRow,
} from '../lib/rate-board'

// Brand names stay as they are; only the catch-all tab is translated.
const FAMILY_LABELS: Record<Exclude<ModelFamily, 'other'>, string> = {
  claude: 'Claude',
  gpt: 'GPT',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
}

type RateBoardProps = {
  models: PricingModel[]
  isLoading: boolean
  hasError: boolean
  onRetry: () => void
}

function PriceCell(props: { official: number; sell: number }) {
  return (
    <td className='px-4 py-3.5 text-right sm:px-6'>
      <div className='flex flex-col items-end gap-0.5 sm:flex-row sm:items-baseline sm:justify-end sm:gap-2.5'>
        <s className='text-muted-foreground text-xs tabular-nums decoration-[1.5px] sm:text-sm'>
          {formatPerMillion(props.official)}
        </s>
        <span className='text-primary text-sm font-semibold tabular-nums sm:text-base'>
          {formatPerMillion(props.sell)}
        </span>
      </div>
    </td>
  )
}

function RateRow(props: { row: RateBoardRow; index: number }) {
  const { t } = useTranslation()
  return (
    <tr
      className='jr-rate-row border-border/70 border-t'
      style={{ animationDelay: `${props.index * 45}ms` }}
    >
      <th
        scope='row'
        className='px-4 py-3.5 text-left font-mono text-[13px] font-medium sm:px-6 sm:text-sm'
      >
        {props.row.model}
      </th>
      <PriceCell
        official={props.row.officialInputPrice}
        sell={props.row.inputPrice}
      />
      <PriceCell
        official={props.row.officialOutputPrice}
        sell={props.row.outputPrice}
      />
      <td className='hidden px-6 py-3.5 text-right sm:table-cell'>
        <span className='bg-primary/10 text-primary rounded-md px-2 py-1 text-xs font-semibold tabular-nums'>
          {t('Save {{percent}}%', { percent: props.row.savingsPercent })}
        </span>
      </td>
    </tr>
  )
}

function BoardBody(props: RateBoardProps & { rows: RateBoardRow[] }) {
  const { t } = useTranslation()

  if (props.isLoading) {
    return (
      <tbody aria-busy='true'>
        {Array.from({ length: RATE_BOARD_ROWS }, (_, index) => (
          <tr key={index} className='border-border/70 border-t'>
            <td className='px-4 py-4 sm:px-6'>
              <Skeleton className='h-4 w-40' />
            </td>
            <td className='px-4 py-4 sm:px-6'>
              <Skeleton className='ml-auto h-4 w-24' />
            </td>
            <td className='px-4 py-4 sm:px-6'>
              <Skeleton className='ml-auto h-4 w-24' />
            </td>
            <td className='hidden px-6 py-4 sm:table-cell'>
              <Skeleton className='ml-auto h-5 w-16' />
            </td>
          </tr>
        ))}
      </tbody>
    )
  }

  if (props.hasError || props.rows.length === 0) {
    return (
      <tbody>
        <tr className='border-border/70 border-t'>
          <td colSpan={4} className='px-4 py-10 text-center sm:px-6'>
            <p className='text-muted-foreground text-sm'>
              {props.hasError
                ? t('Prices could not be loaded right now.')
                : t('No models are available yet.')}
            </p>
            {props.hasError && (
              <Button
                variant='outline'
                size='sm'
                className='mt-3'
                onClick={props.onRetry}
              >
                {t('Retry')}
              </Button>
            )}
          </td>
        </tr>
      </tbody>
    )
  }

  return (
    <tbody>
      {props.rows.map((row, index) => (
        <RateRow key={row.model} row={row} index={index} />
      ))}
    </tbody>
  )
}

export function RateBoard(props: RateBoardProps) {
  const { t } = useTranslation()
  const families = useMemo(
    () => availableFamilies(props.models),
    [props.models]
  )
  const [selected, setSelected] = useState<ModelFamily | null>(null)
  const family = selected && families.includes(selected) ? selected : families[0]
  const rows = useMemo(
    () => (family ? buildRateBoard(props.models, family) : []),
    [props.models, family]
  )

  return (
    <section
      aria-labelledby='jr-rate-board-title'
      className='border-border bg-card overflow-hidden rounded-xl border'
    >
      <div className='flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <h2 id='jr-rate-board-title' className='sr-only'>
          {t('Model prices')}
        </h2>
        <Tabs
          value={family ?? ''}
          onValueChange={(value) => setSelected(value as ModelFamily)}
        >
          <TabsList
            variant='line'
            className='h-auto flex-wrap justify-start gap-x-4 gap-y-1'
            aria-label={t('Model family')}
          >
            {(families.length > 0 ? families : ['claude' as ModelFamily]).map(
              (item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  disabled={families.length === 0}
                  className='h-8 flex-none px-0 text-sm group-data-[variant=line]/tabs-list:data-active:after:bg-primary'
                >
                  {item === 'other' ? t('Other models') : FAMILY_LABELS[item]}
                </TabsTrigger>
              )
            )}
          </TabsList>
        </Tabs>
        <p className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span aria-hidden='true' className='bg-primary size-1.5 rounded-full' />
          {t('Per 1M tokens · synced automatically every hour')}
        </p>
      </div>

      <div className='overflow-x-auto overflow-y-hidden'>
        <table className='w-full min-w-[22rem] border-collapse text-sm'>
          <thead>
            <tr className='text-muted-foreground border-border/70 border-t text-xs'>
              <th scope='col' className='px-4 py-2.5 text-left font-medium sm:px-6'>
                {t('Model')}
              </th>
              <th scope='col' className='px-4 py-2.5 text-right font-medium sm:px-6'>
                {t('Input')}
              </th>
              <th scope='col' className='px-4 py-2.5 text-right font-medium sm:px-6'>
                {t('Output')}
              </th>
              <th
                scope='col'
                className='hidden px-6 py-2.5 text-right font-medium sm:table-cell'
              >
                {t('Savings')}
              </th>
            </tr>
          </thead>
          <BoardBody {...props} rows={rows} key={family ?? 'none'} />
        </table>
      </div>

      <div className='border-border/70 bg-muted/30 flex flex-col gap-2 border-t px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <p className='text-muted-foreground'>
          {t('Struck-through prices are the providers’ official prices.')}
        </p>
        <Link
          to='/pricing'
          className='text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline'
        >
          {t('See all models and prices')}
          <ArrowRight aria-hidden='true' className='size-3.5' />
        </Link>
      </div>
    </section>
  )
}
