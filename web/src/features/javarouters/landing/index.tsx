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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useStatus } from '@/hooks/use-status'

import { JavaRoutersFooter } from '../layout/footer'
import { toRateBoardRow, type RateBoardRow } from '../lib/rate-board'
import {
  DEFAULT_SNIPPET_MODEL,
  resolveApiBaseUrl,
} from '../lib/switch-snippet'
import { RateBoard } from './rate-board'
import { ClosingCta, Facts, GettingStarted } from './sections'
import { SwitchSnippet } from './switch-snippet'
import { UsageStatsSection } from './usage-stats'

export function JavaRoutersLanding(props: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const pricing = usePricingData()

  const sellableRows = useMemo(
    () =>
      pricing.models
        .map(toRateBoardRow)
        .filter((row): row is RateBoardRow => row !== null),
    [pricing.models]
  )
  const snippetModel =
    sellableRows.find((row) => row.model === DEFAULT_SNIPPET_MODEL)?.model ??
    sellableRows.find((row) => row.family === 'claude')?.model ??
    DEFAULT_SNIPPET_MODEL
  const baseUrl = resolveApiBaseUrl(
    status?.server_address,
    window.location.origin
  )

  return (
    <>
      <main>
        <section className='mx-auto max-w-6xl px-4 pt-24 pb-8 sm:px-6 sm:pt-28'>
          <h1 className='font-display text-[clamp(2.25rem,5.2vw,4.25rem)] leading-[1.04] font-semibold tracking-[-0.035em] text-balance'>
            <span className='block'>{t('One API for every AI model.')}</span>
            <span className='text-primary block'>
              {t('Priced under official.')}
            </span>
          </h1>
          <p className='text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed text-pretty'>
            {sellableRows.length > 0
              ? t(
                  'Reach {{count}} models — Claude, GPT, Gemini, DeepSeek and more — with one API key that works with the OpenAI and Anthropic SDKs.',
                  { count: sellableRows.length }
                )
              : t(
                  'Reach Claude, GPT, Gemini, DeepSeek and more with one API key that works with the OpenAI and Anthropic SDKs.'
                )}
          </p>
          <div className='mt-8 flex flex-wrap gap-3'>
            <Button
              className='h-11 rounded-lg px-5 text-sm font-semibold'
              render={
                <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
              }
            >
              {props.isAuthenticated ? t('Open console') : t('Create account')}
              <ArrowRight aria-hidden='true' data-icon='inline-end' />
            </Button>
            <Button
              variant='outline'
              className='h-11 rounded-lg px-5 text-sm font-semibold'
              render={<Link to='/pricing' />}
            >
              {t('See all prices')}
            </Button>
          </div>

          <div className='mt-12'>
            <RateBoard
              models={pricing.models}
              isLoading={pricing.isLoading}
              hasError={Boolean(pricing.error)}
              onRetry={() => void pricing.refetch()}
            />
          </div>
        </section>

        <UsageStatsSection />
        <SwitchSnippet baseUrl={baseUrl} model={snippetModel} />
        <GettingStarted />
        <Facts />
        <ClosingCta isAuthenticated={props.isAuthenticated} />
      </main>
      <JavaRoutersFooter />
    </>
  )
}
