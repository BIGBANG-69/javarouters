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
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JavaRoutersPublicHeader } from '../public-header'

const state = vi.hoisted(() => ({
  user: null as null | { id: number },
  status: { register_enabled: true } as Record<string, unknown>,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (props: {
    to: string
    search?: { redirect?: string }
    children: ReactNode
    className?: string
  }) => {
    const query = props.search?.redirect
      ? `?redirect=${encodeURIComponent(props.search.redirect)}`
      : ''
    return (
      <a href={`${props.to}${query}`} className={props.className}>
        {props.children}
      </a>
    )
  },
  useRouterState: () => ({ location: { pathname: '/' } }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ auth: { user: state.user } }),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: state.status, loading: false }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Java routers',
    logo: '/logo.png',
    loading: false,
    logoLoaded: true,
  }),
}))
vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => [
    { title: 'Home', href: '/' },
    { title: 'Console', href: '/dashboard' },
    { title: 'Model Square', href: '/pricing', requiresAuth: true },
    { title: 'About', href: '/about' },
  ],
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({}),
}))
vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: () => null,
}))
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => <button type='button'>Profile menu</button>,
}))
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => null,
}))
vi.mock('@/components/theme-switch', () => ({ ThemeSwitch: () => null }))
vi.mock('@/features/system-update/system-update-action', () => ({
  SystemUpdateAction: () => null,
}))

beforeEach(() => {
  state.user = null
  state.status = { register_enabled: true }
})

function navLinkNames() {
  const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0]
  return [...nav.querySelectorAll('a')].map((link) => link.textContent)
}

describe('JavaRoutersPublicHeader', () => {
  it('offers sign in and sign up to visitors', () => {
    render(<JavaRoutersPublicHeader />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in'
    )
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/sign-up'
    )
  })

  it('hides sign up when registration is closed', () => {
    state.status = { register_enabled: false }

    render(<JavaRoutersPublicHeader />)

    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull()
  })

  it('takes signed-in users to the console', () => {
    state.user = { id: 1 }

    render(<JavaRoutersPublicHeader />)

    expect(screen.getByRole('link', { name: 'Console' })).toHaveAttribute(
      'href',
      '/dashboard'
    )
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('leaves home and console out of the nav and sends gated links to sign in', () => {
    render(<JavaRoutersPublicHeader />)

    expect(navLinkNames()).toEqual(['Model Square', 'About'])
    expect(screen.getByRole('link', { name: 'Model Square' })).toHaveAttribute(
      'href',
      '/sign-in?redirect=%2Fpricing'
    )
  })
})
