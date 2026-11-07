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

import { LanguageSwitcher } from '@/components/language-switcher'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthValuePanel } from '@/features/javarouters/layout/auth-value-panel'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='bg-background grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
      <div className='flex flex-col'>
        <div className='flex h-16 items-center justify-between px-4 sm:px-8'>
          <Link
            to='/'
            className='flex items-center gap-2.5 transition-opacity hover:opacity-80'
          >
            <span className='relative size-7'>
              {loading ? (
                <Skeleton className='absolute inset-0 rounded-md' />
              ) : (
                <img
                  src={logo}
                  alt={t('Logo')}
                  className='size-7 rounded-md object-contain'
                />
              )}
            </span>
            {loading ? (
              <Skeleton className='h-5 w-24' />
            ) : (
              <span className='font-display text-base font-semibold tracking-tight'>
                {systemName}
              </span>
            )}
          </Link>
          <LanguageSwitcher />
        </div>
        <div className='flex flex-1 items-center justify-center px-4 py-10 sm:px-8'>
          {/* Smaller radius keeps 32px inputs and buttons from turning into pills. */}
          <div className='flex w-full max-w-[420px] flex-col space-y-2 [--radius:0.625rem]'>
            {children}
          </div>
        </div>
      </div>
      <AuthValuePanel />
    </div>
  )
}
