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

export type SnippetLanguage = 'python' | 'node' | 'curl' | 'claude-code'

export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = [
  'python',
  'node',
  'curl',
  'claude-code',
]

export type SnippetLine = {
  kind: 'context' | 'removed' | 'added'
  text: string
}

export const DEFAULT_SNIPPET_MODEL = 'claude-sonnet-4.6'

/** The public API origin: the configured server address, else this site. */
export function resolveApiBaseUrl(
  serverAddress: unknown,
  fallbackOrigin: string
): string {
  const configured =
    typeof serverAddress === 'string' ? serverAddress.trim() : ''
  return (configured || fallbackOrigin).replace(/\/+$/, '')
}

const context = (text: string): SnippetLine => ({ kind: 'context', text })
const removed = (text: string): SnippetLine => ({ kind: 'removed', text })
const added = (text: string): SnippetLine => ({ kind: 'added', text })

/** One provider line swapped for the JavaRouters line; the rest is unchanged. */
export function buildSnippet(
  language: SnippetLanguage,
  baseUrl: string,
  model: string
): SnippetLine[] {
  switch (language) {
    case 'python':
      return [
        context('import os'),
        context('from openai import OpenAI'),
        context(''),
        context('client = OpenAI('),
        removed('    base_url="https://api.openai.com/v1",'),
        added(`    base_url="${baseUrl}/v1",`),
        context('    api_key=os.environ["JAVAROUTERS_API_KEY"],'),
        context(')'),
      ]
    case 'node':
      return [
        context('import OpenAI from "openai";'),
        context(''),
        context('const client = new OpenAI({'),
        removed('  baseURL: "https://api.openai.com/v1",'),
        added(`  baseURL: "${baseUrl}/v1",`),
        context('  apiKey: process.env.JAVAROUTERS_API_KEY,'),
        context('});'),
      ]
    case 'curl':
      return [
        removed('curl https://api.openai.com/v1/chat/completions \\'),
        added(`curl ${baseUrl}/v1/chat/completions \\`),
        context('  -H "Authorization: Bearer $JAVAROUTERS_API_KEY" \\'),
        context('  -H "Content-Type: application/json" \\'),
        context(
          `  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Halo"}]}'`
        ),
      ]
    case 'claude-code':
      return [
        removed('export ANTHROPIC_BASE_URL=https://api.anthropic.com'),
        added(`export ANTHROPIC_BASE_URL=${baseUrl}`),
        context('export ANTHROPIC_AUTH_TOKEN=$JAVAROUTERS_API_KEY'),
        context('claude'),
      ]
  }
}

/** The code after the change, which is what the copy action puts on the clipboard. */
export function snippetToCopy(lines: SnippetLine[]): string {
  return lines
    .filter((line) => line.kind !== 'removed')
    .map((line) => line.text)
    .join('\n')
}
