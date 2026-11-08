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
import { ChevronRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SearchBar } from '@/features/pricing/components/search-bar'
import type { PriceCurrency } from '@/stores/price-currency-store'

import { PriceCell, SavingsChip } from '../landing/rate-board'
import {
  countByFamily,
  filterPriceList,
  type PriceListFamily,
  type PriceListRow,
  type PriceListSort,
} from '../lib/price-list'
import { formatPerMillion, MODEL_FAMILIES } from '../lib/rate-board'

const FAMILY_TABS: readonly PriceListFamily[] = ['all', ...MODEL_FAMILIES]

// Brand names stay as they are; "all" and "other" are translated.
const BRAND_LABELS: Record<string, string> = {
  claude: 'Claude',
  gpt: 'GPT',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
}

const SKELETON_ROWS = 8
// Rows after this settle without delay, so a long list does not trail in.
const STAGGERED_ROWS = 12

export type PriceBoardProps = {
  rows: PriceListRow[]
  isLoading: boolean
  hasError: boolean
  onRetry: () => void
  onSelectModel: (model: string) => void
  initialQuery?: string
  /** Display currency; the IDR/USD switch shows only when this and its handler are set. */
  currency?: PriceCurrency
  onCurrencyChange?: (value: PriceCurrency) => void
  /** Changes when the price formatter switches currency; remounts the rows. */
  pricesKey?: string
  /** Shown in the board footer, e.g. the Rupiah rate note. */
  footerNote?: ReactNode
}

function PriceRow(props: {
  row: PriceListRow
  index: number
  onSelect: (model: string) => void
}) {
  const { t } = useTranslation()
  const prices = props.row.prices
  return (
    <tr
      className='jr-rate-row group border-border/70 hover:bg-muted/40 cursor-pointer border-t transition-colors'
      style={{
        animationDelay: `${Math.min(props.index, STAGGERED_ROWS) * 45}ms`,
      }}
      onClick={() => props.onSelect(props.row.model)}
    >
      <th scope='row' className='px-3 py-3.5 text-left font-normal sm:px-6'>
        <button
          type='button'
          onClick={(event) => {
            event.stopPropagation()
            props.onSelect(props.row.model)
          }}
          className='focus-visible:ring-ring/50 flex items-center gap-1 rounded-sm text-left font-mono text-[13px] font-medium underline-offset-4 outline-none group-hover:underline focus-visible:ring-[3px] sm:text-sm'
        >
          {props.row.model}
          <ChevronRight
            aria-hidden='true'
            className='text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100'
          />
        </button>
        {props.row.vendor && (
          <span className='text-muted-foreground mt-0.5 block text-xs'>
            {props.row.vendor}
          </span>
        )}
      </th>
      {prices ? (
        <>
          <PriceCell
            official={prices.officialInputPrice}
            sell={prices.inputPrice}
          />
          <PriceCell
            official={prices.officialOutputPrice}
            sell={prices.outputPrice}
          />
          <td className='hidden px-6 py-3.5 text-right text-sm tabular-nums md:table-cell'>
            {prices.cacheReadPrice === null ? (
              <span className='text-muted-foreground'>—</span>
            ) : (
              formatPerMillion(prices.cacheReadPrice)
            )}
          </td>
          <td className='hidden px-6 py-3.5 text-right sm:table-cell'>
            <SavingsChip percent={prices.savingsPercent} />
          </td>
        </>
      ) : (
        <td
          colSpan={4}
          className='text-muted-foreground px-4 py-3.5 text-right text-xs sm:px-6'
        >
          {t('Custom pricing, see details')}
        </td>
      )}
    </tr>
  )
}

function BoardMessage(props: { children: ReactNode }) {
  return (
    <tbody>
      <tr className='border-border/70 border-t'>
        <td colSpan={5} className='px-4 py-12 text-center sm:px-6'>
          {props.children}
        </td>
      </tr>
    </tbody>
  )
}

/**
 * The full kurs board: every sold model with the official price struck through beside the
 * JavaRouters price, filterable by family and search, in the chosen display currency.
 */
export function PriceBoard(props: PriceBoardProps) {
  const { t } = useTranslation()
  const [family, setFamily] = useState<PriceListFamily>('all')
  const [query, setQuery] = useState(props.initialQuery ?? '')
  const [sort, setSort] = useState<PriceListSort>('family')

  const counts = useMemo(() => countByFamily(props.rows), [props.rows])
  const visibleRows = useMemo(
    () => filterPriceList(props.rows, { family, query, sort }),
    [props.rows, family, query, sort]
  )
  const sortItems = [
    { value: 'family', label: t('By model family') },
    { value: 'cheapest', label: t('Cheapest input first') },
    { value: 'name', label: t('Name (A-Z)') },
  ]

  let body: ReactNode
  if (props.isLoading) {
    body = (
      <tbody aria-busy='true'>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <tr key={index} className='border-border/70 border-t'>
            <td className='px-4 py-4 sm:px-6'>
              <Skeleton className='h-4 w-44' />
            </td>
            <td className='px-4 py-4 sm:px-6'>
              <Skeleton className='ml-auto h-4 w-24' />
            </td>
            <td className='px-4 py-4 sm:px-6'>
              <Skeleton className='ml-auto h-4 w-24' />
            </td>
            <td className='hidden px-6 py-4 md:table-cell'>
              <Skeleton className='ml-auto h-4 w-16' />
            </td>
            <td className='hidden px-6 py-4 sm:table-cell'>
              <Skeleton className='ml-auto h-5 w-16' />
            </td>
          </tr>
        ))}
      </tbody>
    )
  } else if (props.hasError) {
    body = (
      <BoardMessage>
        <p className='text-muted-foreground text-sm'>
          {t('Prices could not be loaded right now.')}
        </p>
        <Button
          variant='outline'
          size='sm'
          className='mt-3'
          onClick={props.onRetry}
        >
          {t('Retry')}
        </Button>
      </BoardMessage>
    )
  } else if (visibleRows.length === 0) {
    body = (
      <BoardMessage>
        <p className='text-muted-foreground text-sm'>
          {query.trim()
            ? t('No models match "{{query}}".', { query: query.trim() })
            : t('No models are available yet.')}
        </p>
        {query.trim() && (
          <Button
            variant='outline'
            size='sm'
            className='mt-3'
            onClick={() => setQuery('')}
          >
            {t('Clear search')}
          </Button>
        )}
      </BoardMessage>
    )
  } else {
    body = (
      <tbody key={`${family}:${props.pricesKey ?? ''}`}>
        {visibleRows.map((row, index) => (
          <PriceRow
            key={row.model}
            row={row}
            index={index}
            onSelect={props.onSelectModel}
          />
        ))}
      </tbody>
    )
  }

  return (
    <section
      aria-labelledby='jr-price-board-title'
      className='border-border bg-card overflow-hidden rounded-xl border'
    >
      <h2 id='jr-price-board-title' className='sr-only'>
        {t('Model prices')}
      </h2>

      <div className='flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between'>
        {/* One scrollable line of tabs on narrow screens instead of wrapping. */}
        <Tabs
          value={family}
          onValueChange={(value) => setFamily(value as PriceListFamily)}
          className='-mx-4 min-w-0 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0'
        >
          <TabsList
            variant='line'
            className='h-auto w-max flex-nowrap justify-start gap-x-5'
            aria-label={t('Model family')}
          >
            {FAMILY_TABS.filter(
              (item) => item === 'all' || counts[item] > 0
            ).map((item) => (
              <TabsTrigger
                key={item}
                value={item}
                className='group-data-[variant=line]/tabs-list:data-active:after:bg-primary h-8 flex-none gap-1.5 px-0 text-sm'
              >
                {item === 'all' && t('All models')}
                {item === 'other' && t('Other models')}
                {item !== 'all' && item !== 'other' && BRAND_LABELS[item]}
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {counts[item]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span aria-hidden='true' className='bg-primary size-1.5 rounded-full' />
          {t('Per 1M tokens · synced automatically every hour')}
        </p>
      </div>

      <div className='border-border/70 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <SearchBar
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder={t('Search model or provider')}
          className='w-full sm:max-w-sm'
        />
        <div className='flex flex-wrap items-center gap-2'>
          {props.currency && props.onCurrencyChange && (
            <ToggleGroup
              value={[props.currency]}
              onValueChange={(values) => {
                if (values[0] === 'IDR' || values[0] === 'USD') {
                  props.onCurrencyChange?.(values[0])
                }
              }}
              variant='outline'
              size='sm'
              aria-label={t('Price currency')}
            >
              <ToggleGroupItem value='IDR'>IDR</ToggleGroupItem>
              <ToggleGroupItem value='USD'>USD</ToggleGroupItem>
            </ToggleGroup>
          )}
          <Select
            items={sortItems}
            value={sort}
            onValueChange={(value) => setSort(value as PriceListSort)}
          >
            <SelectTrigger size='sm' aria-label={t('Sort models')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='overflow-x-auto overflow-y-hidden'>
        <table className='w-full min-w-[22rem] border-collapse text-sm'>
          <thead>
            <tr className='text-muted-foreground border-border/70 border-t text-xs'>
              <th scope='col' className='px-3 py-2.5 text-left font-medium sm:px-6'>
                {t('Model')}
              </th>
              <th scope='col' className='px-3 py-2.5 text-right font-medium sm:px-6'>
                {t('Input')}
              </th>
              <th scope='col' className='px-3 py-2.5 text-right font-medium sm:px-6'>
                {t('Output')}
              </th>
              <th
                scope='col'
                className='hidden px-6 py-2.5 text-right font-medium md:table-cell'
              >
                {t('Cache read')}
              </th>
              <th
                scope='col'
                className='hidden px-6 py-2.5 text-right font-medium sm:table-cell'
              >
                {t('Savings')}
              </th>
            </tr>
          </thead>
          {body}
        </table>
      </div>

      <div className='border-border/70 bg-muted/30 flex flex-col gap-2 border-t px-4 py-3 text-xs sm:px-6'>
        <p className='text-muted-foreground'>
          {t(
            'Struck-through prices are the providers’ official prices. Select a model for its endpoints and code examples.'
          )}
        </p>
        {props.footerNote}
      </div>
    </section>
  )
}
