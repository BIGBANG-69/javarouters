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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

const STEPS = [
  {
    title: 'Create an account',
    body: 'Sign up with your email. No credit card needed to register.',
  },
  {
    title: 'Top up your balance',
    body: 'Usage is deducted per token from your balance. No monthly fee.',
  },
  {
    title: 'Create an API key',
    body: 'Make a key in the console, then use it in your app or coding tool.',
  },
] as const

const FACTS = [
  {
    term: 'Servers in Singapore',
    detail: 'Low latency from Indonesia and the rest of Southeast Asia.',
  },
  {
    term: 'Prices that follow the market',
    detail:
      'Prices sync automatically every hour and stay about 30% under the official price.',
  },
  {
    term: 'OpenAI and Anthropic compatible',
    detail:
      'The /v1/chat/completions, /v1/responses and /v1/messages endpoints work as the official APIs do.',
  },
  {
    term: 'One balance for every model',
    detail:
      'One API key for Claude, GPT, Gemini, DeepSeek, Kimi, Qwen and more.',
  },
] as const

export function GettingStarted() {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby='jr-steps-title'
      className='border-border/70 border-y'
    >
      <div className='mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24'>
        <h2
          id='jr-steps-title'
          className='font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl'
        >
          {t('Start in three steps')}
        </h2>
        <ol className='mt-12 grid gap-10 md:grid-cols-3 md:gap-0'>
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className='md:border-border/70 relative md:border-l md:px-8 md:first:border-l-0 md:first:pl-0'
            >
              <span className='text-primary font-display text-sm font-semibold tabular-nums'>
                {index + 1}
              </span>
              <h3 className='mt-2 text-lg font-semibold tracking-tight'>
                {t(step.title)}
              </h3>
              <p className='text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed'>
                {t(step.body)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Facts() {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby='jr-facts-title'
      className='mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24'
    >
      <h2
        id='jr-facts-title'
        className='font-display text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl lg:sticky lg:top-28 lg:self-start'
      >
        {t('Why JavaRouters')}
      </h2>
      <dl className='divide-border/70 border-border/70 divide-y border-y'>
        {FACTS.map((fact) => (
          <div
            key={fact.term}
            className='grid gap-1 py-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8'
          >
            <dt className='font-semibold tracking-tight'>{t(fact.term)}</dt>
            <dd className='text-muted-foreground text-sm leading-relaxed'>
              {t(fact.detail)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function ClosingCta(props: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby='jr-closing-title'
      className='bg-primary text-primary-foreground'
    >
      <div className='mx-auto flex max-w-6xl flex-col gap-8 px-4 py-20 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-24'>
        <div className='max-w-2xl'>
          <h2
            id='jr-closing-title'
            className='font-display text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl'
          >
            {t('Start with one API key.')}
          </h2>
          <p className='text-primary-foreground/85 mt-4 text-base leading-relaxed sm:text-lg'>
            {t(
              'Create an account in a minute, top up, and use every model right away.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap gap-3'>
          <Button
            className='bg-background text-foreground hover:bg-background/90 h-11 rounded-lg px-5 text-sm font-semibold'
            render={
              <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
            }
          >
            {props.isAuthenticated ? t('Open console') : t('Create account')}
            <ArrowRight aria-hidden='true' data-icon='inline-end' />
          </Button>
          <Button
            variant='outline'
            className='border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground h-11 rounded-lg bg-transparent px-5 text-sm font-semibold dark:bg-transparent'
            render={<Link to='/pricing' />}
          >
            {t('See prices')}
          </Button>
        </div>
      </div>
    </section>
  )
}
