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
import { describe, expect, it } from 'vitest'

import {
  buildSnippet,
  resolveApiBaseUrl,
  SNIPPET_LANGUAGES,
  snippetToCopy,
} from '../switch-snippet'

const BASE = 'https://javarouters.example'

describe('resolveApiBaseUrl', () => {
  it('uses the configured server address without trailing slashes', () => {
    expect(resolveApiBaseUrl(' https://api.example/ ', 'https://site')).toBe(
      'https://api.example'
    )
  })

  it.each([undefined, '', '   ', 42])(
    'falls back to the site origin when the server address is %j',
    (value) => {
      expect(resolveApiBaseUrl(value, 'https://site/')).toBe('https://site')
    }
  )
})

describe('buildSnippet', () => {
  it.each(SNIPPET_LANGUAGES)(
    'swaps exactly one provider line for the JavaRouters line in %s',
    (language) => {
      const lines = buildSnippet(language, BASE, 'claude-sonnet-4.6')
      const removed = lines.filter((line) => line.kind === 'removed')
      const added = lines.filter((line) => line.kind === 'added')

      expect(removed).toHaveLength(1)
      expect(added).toHaveLength(1)
      expect(added[0].text).toContain(BASE)
      expect(removed[0].text).not.toContain(BASE)
    }
  )

  it('copies the changed code without the removed line', () => {
    const copied = snippetToCopy(buildSnippet('claude-code', BASE, 'm'))

    expect(copied).toBe(
      [
        `export ANTHROPIC_BASE_URL=${BASE}`,
        'export ANTHROPIC_AUTH_TOKEN=$JAVAROUTERS_API_KEY',
        'claude',
      ].join('\n')
    )
  })

  it('puts the chosen model in the curl request body', () => {
    const copied = snippetToCopy(buildSnippet('curl', BASE, 'gpt-5.4'))

    expect(copied).toContain(`curl ${BASE}/v1/chat/completions`)
    expect(copied).toContain('"model": "gpt-5.4"')
  })
})
