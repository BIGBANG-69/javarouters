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

import { JavaRoutersFooter } from '../footer'

const systemConfig = vi.hoisted(() => ({
  value: { systemName: 'Java routers', logo: '/logo.png', footerHtml: '' },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (props: { to: string; children: ReactNode; className?: string }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => systemConfig.value,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { user_agreement_enabled: true, docs_link: '' },
    loading: false,
  }),
}))

const PROJECT_LINK = 'https://github.com/QuantumNous/new-api'

beforeEach(() => {
  systemConfig.value = {
    systemName: 'Java routers',
    logo: '/logo.png',
    footerHtml: '',
  }
})

describe('JavaRoutersFooter', () => {
  it('keeps the New API attribution link', () => {
    render(<JavaRoutersFooter />)

    expect(screen.getByRole('link', { name: 'New API' })).toHaveAttribute(
      'href',
      PROJECT_LINK
    )
  })

  it('keeps the attribution when the admin sets custom footer HTML', () => {
    systemConfig.value = {
      ...systemConfig.value,
      footerHtml: '<span>Kontak kami</span>',
    }

    render(<JavaRoutersFooter />)

    expect(screen.getByText('Kontak kami')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New API' })).toHaveAttribute(
      'href',
      PROJECT_LINK
    )
  })

  it('shows configured legal links and hides the docs link when none is set', () => {
    render(<JavaRoutersFooter />)

    expect(screen.getByRole('link', { name: 'User Agreement' })).toHaveAttribute(
      'href',
      '/user-agreement'
    )
    expect(screen.queryByRole('link', { name: 'Docs' })).toBeNull()
  })
})
