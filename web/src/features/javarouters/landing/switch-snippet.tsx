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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import {
  buildSnippet,
  SNIPPET_LANGUAGES,
  snippetToCopy,
  type SnippetLanguage,
  type SnippetLine,
} from '../lib/switch-snippet'

const LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  python: 'Python',
  node: 'Node.js',
  curl: 'curl',
  'claude-code': 'Claude Code',
}

const LINE_STYLES: Record<SnippetLine['kind'], string> = {
  context: 'text-foreground/80',
  removed: 'bg-destructive/8 text-destructive/90 line-through decoration-1',
  added: 'bg-primary/10 text-foreground font-medium',
}

const LINE_MARKERS: Record<SnippetLine['kind'], string> = {
  context: ' ',
  removed: '−',
  added: '+',
}

type SwitchSnippetProps = {
  baseUrl: string
  model: string
}

export function SwitchSnippet(props: SwitchSnippetProps) {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<SnippetLanguage>('python')
  const lines = buildSnippet(language, props.baseUrl, props.model)

  return (
    <section
      aria-labelledby='jr-switch-title'
      className='mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24'
    >
      <div className='max-w-md'>
        <h2
          id='jr-switch-title'
          className='font-display text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl'
        >
          {t('Change one line. That’s it.')}
        </h2>
        <p className='text-muted-foreground mt-4 text-base leading-relaxed text-pretty'>
          {t(
            'The OpenAI SDK, the Anthropic SDK and tools like Claude Code, Cursor or Cline keep working. Point the base URL at JavaRouters and use your JavaRouters API key.'
          )}
        </p>
      </div>

      <div className='border-border bg-card min-w-0 overflow-hidden rounded-xl border'>
        <div className='border-border/70 flex items-center justify-between gap-2 border-b px-3 py-2 sm:px-4'>
          <Tabs
            value={language}
            onValueChange={(value) => setLanguage(value as SnippetLanguage)}
          >
            <TabsList
              variant='line'
              className='h-auto flex-wrap justify-start gap-x-3'
              aria-label={t('Code example language')}
            >
              {SNIPPET_LANGUAGES.map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  className='h-8 flex-none px-0 text-[13px] group-data-[variant=line]/tabs-list:data-active:after:bg-primary'
                >
                  {LANGUAGE_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <CopyButton
            value={snippetToCopy(lines)}
            size='sm'
            variant='ghost'
            tooltip={t('Copy code')}
            successTooltip={t('Copied')}
            aria-label={t('Copy code')}
          />
        </div>
        <pre className='overflow-x-auto py-3 font-mono text-[13px] leading-6'>
          <code>
            {lines.map((line) => (
              <span
                key={`${language}:${line.kind}:${line.text}`}
                data-kind={line.kind}
                className={cn('flex min-w-max px-3 sm:px-4', LINE_STYLES[line.kind])}
              >
                <span
                  aria-hidden='true'
                  className='text-muted-foreground/70 w-5 shrink-0 select-none'
                >
                  {LINE_MARKERS[line.kind]}
                </span>
                {line.kind !== 'context' && (
                  <span className='sr-only'>
                    {line.kind === 'removed' ? t('Removed line:') : t('Added line:')}{' '}
                  </span>
                )}
                <span>{line.text || ' '}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </section>
  )
}
