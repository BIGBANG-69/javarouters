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
import { Link, useRouterState } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HeaderLogo } from '@/components/layout/components/header-logo'
import type { PublicHeaderProps } from '@/components/layout/components/public-header'
import type { TopNavLink } from '@/components/layout/types'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SystemUpdateAction } from '@/features/system-update/system-update-action'
import { useNotifications } from '@/hooks/use-notifications'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

function NavItem(props: {
  link: TopNavLink
  active: boolean
  className: string
  onNavigate?: () => void
}) {
  const label = props.link.title
  if (props.link.external) {
    return (
      <a
        href={props.link.href}
        target='_blank'
        rel='noopener noreferrer'
        aria-disabled={props.link.disabled}
        onClick={props.onNavigate}
        className={props.className}
      >
        {label}
      </a>
    )
  }
  if (props.link.requiresAuth) {
    return (
      <Link
        to='/sign-in'
        search={{ redirect: props.link.href }}
        onClick={props.onNavigate}
        className={props.className}
      >
        {label}
      </Link>
    )
  }
  return (
    <Link
      to={props.link.href}
      disabled={props.link.disabled}
      aria-current={props.active ? 'page' : undefined}
      onClick={props.onNavigate}
      className={props.className}
    >
      {label}
    </Link>
  )
}

export function JavaRoutersPublicHeader(props: PublicHeaderProps) {
  const { t } = useTranslation()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { auth } = useAuthStore()
  const { status } = useStatus()
  const { systemName, logo, loading, logoLoaded } = useSystemConfig()
  const notifications = useNotifications()
  const pathname = useRouterState().location.pathname
  const dynamicLinks = useTopNavLinks()

  const isAuthenticated = Boolean(auth.user)
  const showThemeSwitch = props.showThemeSwitch ?? true
  const showLanguageSwitcher = props.showLanguageSwitcher ?? true
  const showAuthButtons = props.showAuthButtons ?? true
  const showNotifications = props.showNotifications ?? true
  const canRegister =
    status?.register_enabled !== false && !status?.self_use_mode_enabled
  // Home and Console are reachable from the logo and the auth button.
  const links = (dynamicLinks.length > 0 ? dynamicLinks : props.navLinks ?? [])
    .filter((link) => link.href !== '/' && link.href !== '/dashboard')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const navLinkClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'text-foreground'
        : 'text-muted-foreground hover:text-foreground'
    )

  let authArea = (
    <>
      <Button
        variant='ghost'
        className='h-9 rounded-lg px-3 text-sm font-medium'
        render={<Link to='/sign-in' />}
      >
        {t('Sign in')}
      </Button>
      {canRegister && (
        <Button
          className='h-9 rounded-lg px-4 text-sm font-semibold'
          render={<Link to='/sign-up' />}
        >
          {t('Sign up')}
        </Button>
      )}
    </>
  )
  if (isAuthenticated) {
    authArea = (
      <>
        <Button
          className='h-9 rounded-lg px-4 text-sm font-semibold'
          render={<Link to='/dashboard' />}
        >
          {t('Console')}
        </Button>
        <ProfileDropdown />
      </>
    )
  }
  if (loading) authArea = <Skeleton className='h-9 w-36 rounded-lg' />

  return (
    <header
      className={cn(
        'bg-background fixed inset-x-0 top-0 z-50 border-b transition-[border-color,box-shadow] duration-300',
        scrolled || menuOpen
          ? 'border-border shadow-[0_1px_0_rgba(16,24,40,0.02),0_6px_16px_-12px_rgba(16,24,40,0.18)]'
          : 'border-transparent'
      )}
    >
      <div className='mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <Link
            to={props.homeUrl ?? '/'}
            className='flex min-w-0 items-center gap-2.5'
          >
            <span className='flex size-7 shrink-0 items-center justify-center'>
              {props.logo ?? (
                <HeaderLogo
                  src={logo}
                  loading={loading}
                  logoLoaded={logoLoaded}
                  className='size-full rounded-md object-contain'
                />
              )}
            </span>
            <span className='font-display max-w-44 truncate text-base font-semibold tracking-tight'>
              {loading ? (
                <Skeleton className='h-4 w-24' />
              ) : (
                props.siteName || systemName
              )}
            </span>
          </Link>
          <SystemUpdateAction presentation='version' />
        </div>

        <nav
          aria-label={t('Main navigation')}
          className='hidden items-center gap-0.5 lg:flex'
        >
          {links.map((link) => (
            <NavItem
              key={`${link.title}:${link.href}`}
              link={link}
              active={pathname === link.href}
              className={navLinkClass(pathname === link.href)}
            />
          ))}
        </nav>

        <div className='ml-auto hidden items-center gap-1 lg:flex'>
          {showLanguageSwitcher && <LanguageSwitcher />}
          {showThemeSwitch && <ThemeSwitch />}
          {showNotifications && (
            <NotificationPopover
              open={notifications.popoverOpen}
              onOpenChange={notifications.setPopoverOpen}
              unreadCount={notifications.unreadCount}
              activeTab={notifications.activeTab}
              onTabChange={notifications.setActiveTab}
              notice={notifications.notice}
              announcements={notifications.announcements}
              loading={notifications.loading}
            />
          )}
          {showAuthButtons && (
            <div className='ml-2 flex items-center gap-2'>{authArea}</div>
          )}
        </div>

        <div className='ml-auto flex items-center gap-1 lg:hidden'>
          {showThemeSwitch && <ThemeSwitch />}
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-9'
            aria-expanded={menuOpen}
            aria-controls='jr-mobile-menu'
            aria-label={t('Toggle navigation menu')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden='true' /> : <Menu aria-hidden='true' />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <div
          id='jr-mobile-menu'
          className='border-border bg-background border-t lg:hidden'
        >
          <nav
            aria-label={t('Main navigation')}
            className='mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6'
          >
            {links.map((link) => (
              <NavItem
                key={`${link.title}:${link.href}`}
                link={link}
                active={pathname === link.href}
                className={cn(navLinkClass(pathname === link.href), 'px-0 py-3 text-base')}
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
          </nav>
          <div className='border-border/70 mx-auto flex max-w-6xl flex-wrap items-center gap-2 border-t px-4 py-4 sm:px-6'>
            {showLanguageSwitcher && <LanguageSwitcher />}
            {showAuthButtons && (
              <div className='ml-auto flex items-center gap-2'>{authArea}</div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
