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
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import { usePublicStats, type PublicStats } from '../lib/public-stats'

function Figure(props: { label: string; value: string; detail?: string }) {
  return (
    <div className='border-border/70 border-t py-5 first:border-t-0 sm:border-t-0 sm:border-l sm:px-6 sm:py-0 sm:first:border-l-0 sm:first:pl-0'>
      <dt className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </dt>
      {/* Proportional figures: a lone headline number reads tighter than tabular digits. */}
      <dd className='font-display mt-2 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl'>
        {props.value}
      </dd>
      {props.detail && (
        <dd className='text-muted-foreground mt-1 text-sm tabular-nums'>
          {props.detail}
        </dd>
      )}
    </div>
  )
}

/** Tokens per rolling day, drawn as emerald bars with a screen-reader table beside them. */
function DailyTokens(props: { daily: PublicStats['daily']; locale?: string }) {
  const { t } = useTranslation()
  const peak = Math.max(1, ...props.daily.map((day) => day.tokens))
  const dayLabel = (start: number) =>
    // The bucket covers the 24 hours after `start`; label it by the day it ends on.
    new Date((start + 86400) * 1000).toLocaleDateString(props.locale, {
      weekday: 'short',
    })

  return (
    <figure className='mt-10'>
      <figcaption className='text-muted-foreground text-xs font-medium'>
        {t('Tokens per day')}
      </figcaption>
      <div aria-hidden='true' className='mt-4 flex h-32 items-end gap-2 sm:gap-3'>
        {props.daily.map((day) => (
          <div
            key={day.start}
            className='flex h-full flex-1 flex-col items-center justify-end gap-2'
          >
            <div
              className='bg-primary w-full max-w-12 rounded-t-sm'
              style={{
                height: `${Math.max(2, (day.tokens / peak) * 100)}%`,
                opacity: day.tokens > 0 ? 1 : 0.25,
              }}
              title={formatNumber(day.tokens, props.locale)}
            />
            <span className='text-muted-foreground text-[11px]'>
              {dayLabel(day.start)}
            </span>
          </div>
        ))}
      </div>
      <table className='sr-only'>
        <caption>{t('Tokens per day')}</caption>
        <tbody>
          {props.daily.map((day) => (
            <tr key={day.start}>
              <th scope='row'>{dayLabel(day.start)}</th>
              <td>{formatNumber(day.tokens, props.locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export function UsageStats(props: { stats: PublicStats }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = props.stats
  const cacheTokens = stats.cache_read_tokens + stats.cache_creation_tokens
  const topRequests = Math.max(1, ...stats.top_models.map((m) => m.requests))
  const successRate =
    stats.success_rate === null
      ? null
      : new Intl.NumberFormat(locale, {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(stats.success_rate)

  return (
    <section
      aria-labelledby='jr-usage-title'
      className='border-border/70 border-t'
    >
      <div className='mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <h2
            id='jr-usage-title'
            className='font-display text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl'
          >
            {t('Platform activity, last {{days}} days', {
              days: stats.window_days,
            })}
          </h2>
          <p className='text-muted-foreground flex items-center gap-2 text-xs'>
            <span aria-hidden='true' className='bg-primary size-1.5 rounded-full' />
            {t('Live from the gateway’s usage records · updated every 5 minutes')}
          </p>
        </div>

        <div className='mt-12 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16'>
          <div>
            <dl className='grid sm:grid-cols-3'>
              <Figure
                label={t('Tokens processed')}
                value={formatCompactNumber(stats.tokens, locale)}
                detail={
                  cacheTokens > 0
                    ? t('{{value}} of them cache tokens', {
                        value: formatCompactNumber(cacheTokens, locale),
                      })
                    : undefined
                }
              />
              <Figure
                label={t('Requests')}
                value={formatCompactNumber(stats.requests, locale)}
                detail={
                  successRate
                    ? t('{{rate}} completed successfully', {
                        rate: successRate,
                      })
                    : undefined
                }
              />
              <Figure
                label={t('Average response time')}
                value={t('{{seconds}} s', {
                  seconds: formatNumber(stats.average_response_seconds, locale),
                })}
                detail={t('per completed request')}
              />
            </dl>
            <DailyTokens daily={stats.daily} locale={locale} />
          </div>

          {stats.top_models.length > 0 && (
            <div>
              <h3 className='text-muted-foreground text-xs font-medium'>
                {t('Most used models')}
              </h3>
              <ol className='divide-border/70 border-border/70 mt-4 divide-y border-y'>
                {stats.top_models.map((model, index) => (
                  <li key={model.model_name} className='py-3.5'>
                    <div className='flex items-baseline justify-between gap-4'>
                      <span className='flex min-w-0 items-baseline gap-3'>
                        <span className='text-primary font-display text-sm font-semibold tabular-nums'>
                          {index + 1}
                        </span>
                        <span className='truncate font-mono text-[13px] font-medium sm:text-sm'>
                          {model.model_name}
                        </span>
                      </span>
                      <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                        {t('{{value}} requests', {
                          value: formatNumber(model.requests, locale),
                        })}
                      </span>
                    </div>
                    <div className='bg-muted mt-2 h-1 overflow-hidden rounded-full'>
                      <div
                        className='bg-primary h-full rounded-full'
                        style={{
                          width: `${(model.requests / topRequests) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Renders the statistics only while the server publishes them. */
export function UsageStatsSection() {
  const stats = usePublicStats()
  return stats ? <UsageStats stats={stats} /> : null
}
