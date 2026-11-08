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
import { Link, useSearch } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { IdrRateNote, ModelDetailsDrawer } from '@/features/pricing/components'
import { useDisplayCurrency } from '@/features/pricing/hooks/use-display-currency'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { JavaRoutersFooter } from '../layout/footer'
import { toPriceListRow } from '../lib/price-list'
import { PriceBoard } from './price-board'

/** The public /pricing page, set as the full JavaRouters kurs board. */
export function JavaRoutersPricing() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/pricing/' })
  const isAuthenticated = useAuthStore((state) => Boolean(state.auth.user))
  const { status } = useStatus()
  const pricing = usePricingData()
  const displayCurrency = useDisplayCurrency()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const rows = useMemo(
    () => pricing.models.map(toPriceListRow),
    [pricing.models]
  )
  const selectedModel = selectedModelName
    ? (pricing.models.find((model) => model.model_name === selectedModelName) ??
      null)
    : null
  const docsLink =
    typeof status?.docs_link === 'string' && status.docs_link
      ? status.docs_link
      : null
  const showIdrNote =
    displayCurrency.currency === 'IDR' && displayCurrency.idrRate !== null

  return (
    <PublicLayout showMainContainer={false}>
      <main>
        <section className='mx-auto max-w-6xl px-4 pt-24 pb-20 sm:px-6 sm:pt-28 lg:pb-24'>
          <div className='flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
            <div>
              <h1 className='font-display text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl'>
                {t('Model Square')}
              </h1>
              <p className='text-muted-foreground mt-4 max-w-2xl text-lg leading-relaxed text-pretty'>
                {rows.length > 0
                  ? t(
                      '{{count}} AI models behind one API key. Official prices are struck through beside ours.',
                      { count: rows.length }
                    )
                  : t(
                      'Every AI model behind one API key. Official prices are struck through beside ours.'
                    )}
              </p>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Button
                className='h-11 rounded-lg px-5 text-sm font-semibold'
                render={
                  <Link to={isAuthenticated ? '/dashboard' : '/sign-up'} />
                }
              >
                {isAuthenticated ? t('Open console') : t('Create account')}
                <ArrowRight aria-hidden='true' data-icon='inline-end' />
              </Button>
              {docsLink && (
                <Button
                  variant='outline'
                  className='h-11 rounded-lg px-5 text-sm font-semibold'
                  render={<a href={docsLink} />}
                >
                  {t('Read the docs')}
                </Button>
              )}
            </div>
          </div>

          <div className='mt-10'>
            <PriceBoard
              rows={rows}
              isLoading={pricing.isLoading}
              hasError={Boolean(pricing.error)}
              onRetry={() => void pricing.refetch()}
              onSelectModel={setSelectedModelName}
              initialQuery={search.search}
              currency={
                displayCurrency.idrRate ? displayCurrency.currency : undefined
              }
              onCurrencyChange={displayCurrency.setCurrency}
              pricesKey={displayCurrency.renderKey}
              footerNote={
                showIdrNote && displayCurrency.idrRate ? (
                  <IdrRateNote
                    key={displayCurrency.renderKey}
                    rate={displayCurrency.idrRate}
                  />
                ) : null
              }
            />
          </div>
        </section>
      </main>
      <JavaRoutersFooter />

      {selectedModel && (
        <ModelDetailsDrawer
          open
          onOpenChange={(open) => {
            if (!open) setSelectedModelName(null)
          }}
          model={selectedModel}
          groupRatio={pricing.groupRatio}
          usableGroup={pricing.usableGroup}
          endpointMap={
            pricing.endpointMap as Record<
              string,
              { path?: string; method?: string }
            >
          }
          autoGroups={pricing.autoGroups}
          priceRate={pricing.priceRate}
          usdExchangeRate={pricing.usdExchangeRate}
          tokenUnit='M'
          showRechargePrice={false}
        />
      )}
    </PublicLayout>
  )
}
