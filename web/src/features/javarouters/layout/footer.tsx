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
import { useTranslation } from 'react-i18next'

import {
  LegalLinks,
  ProjectAttribution,
} from '@/components/layout/components/footer'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'

const FOOTER_LINK_CLASS =
  'text-muted-foreground hover:text-foreground text-sm transition-colors'

export function JavaRoutersFooter() {
  const { t } = useTranslation()
  const { systemName, logo, footerHtml } = useSystemConfig()
  const { status } = useStatus()
  const docsLink =
    typeof status?.docs_link === 'string' && status.docs_link
      ? status.docs_link
      : null
  const currentYear = new Date().getFullYear()

  return (
    <footer className='border-border/70 border-t'>
      <div className='mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'>
        <div>
          <Link to='/' className='flex items-center gap-2.5'>
            {logo && (
              <img
                src={logo}
                alt=''
                className='size-7 rounded-md object-contain'
              />
            )}
            <span className='font-display text-base font-semibold tracking-tight'>
              {systemName}
            </span>
          </Link>
          <p className='text-muted-foreground mt-3 max-w-xs text-sm leading-relaxed'>
            {t('One API for every AI model, priced under official.')}
          </p>
          {footerHtml && (
            <div
              className='custom-footer text-muted-foreground mt-4 text-sm'
              dangerouslySetInnerHTML={{ __html: footerHtml }}
            />
          )}
        </div>

        <nav aria-label={t('Product')}>
          <p className='text-sm font-semibold'>{t('Product')}</p>
          <ul className='mt-3 space-y-2.5'>
            <li>
              <Link to='/pricing' className={FOOTER_LINK_CLASS}>
                {t('Models and prices')}
              </Link>
            </li>
            <li>
              <Link to='/dashboard' className={FOOTER_LINK_CLASS}>
                {t('Console')}
              </Link>
            </li>
            {docsLink && (
              <li>
                <a
                  href={docsLink}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={FOOTER_LINK_CLASS}
                >
                  {t('Docs')}
                </a>
              </li>
            )}
          </ul>
        </nav>

        <nav aria-label={t('Company')}>
          <p className='text-sm font-semibold'>{t('Company')}</p>
          <ul className='mt-3 space-y-2.5'>
            <li>
              <Link to='/about' className={FOOTER_LINK_CLASS}>
                {t('About')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className='border-border/70 border-t'>
        <div className='text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span>
              &copy; {currentYear} {systemName}
            </span>
            <LegalLinks leadingSeparator />
          </div>
          {/* Full muted contrast keeps the required attribution readable. */}
          <span className='[&_span]:text-muted-foreground'>
            <ProjectAttribution currentYear={currentYear} inline />
          </span>
        </div>
      </div>
    </footer>
  )
}
