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
import i18next from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { createLanguageDetector, detectionOptions } from '../detection'
import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
  toIntlLocale,
} from '../languages'

async function detectLanguage() {
  const instance = i18next.createInstance()
  await instance.use(createLanguageDetector()).init({
    resources: { en: { translation: {} }, id: { translation: {} } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'id'],
    detection: detectionOptions,
  })
  return instance.language
}

afterEach(() => {
  localStorage.clear()
})

describe('interface language detection', () => {
  it('gives a new visitor Indonesian regardless of the browser language', async () => {
    expect(await detectLanguage()).toBe('id')
    expect(localStorage.getItem('i18nextLng')).toBe('id')
  })

  it('keeps a language the visitor picked earlier', async () => {
    localStorage.setItem('i18nextLng', 'en')

    expect(await detectLanguage()).toBe('en')
  })

  it('maps a stored Chinese browser tag onto the interface code', async () => {
    localStorage.setItem('i18nextLng', 'zh-CN')

    expect(await detectLanguage()).toBe('zhCN')
  })
})

describe('Indonesian interface language', () => {
  it('is offered first in the language switcher', () => {
    expect(INTERFACE_LANGUAGE_OPTIONS[0]).toEqual({
      code: 'id',
      label: 'Bahasa Indonesia',
    })
  })

  it('is accepted as a saved preference and as an Intl locale', () => {
    expect(normalizeInterfaceLanguage('id')).toBe('id')
    expect(toIntlLocale('id')).toBe('id')
  })
})
