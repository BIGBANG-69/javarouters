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
import { getDynamicPricingTiers } from '@/features/pricing/lib/dynamic-price'
import { calculateTokenPrice } from '@/features/pricing/lib/price'
import type { PricingModel } from '@/features/pricing/types'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

/**
 * Share of the official price JavaRouters charges for input and output tokens.
 * Must match `markup` in deploy/inferhub-sync/config.json, which keeps every
 * sold model at this share of its official price.
 */
export const JAVAROUTERS_MARKUP = 0.7

export type ModelFamily = 'claude' | 'gpt' | 'gemini' | 'deepseek' | 'other'

export const MODEL_FAMILIES: readonly ModelFamily[] = [
  'claude',
  'gpt',
  'gemini',
  'deepseek',
  'other',
]

export const RATE_BOARD_ROWS = 5

// Models shown first in each family, newest flagship first. Names missing from
// the live catalog are skipped; the remaining models follow alphabetically.
const FEATURED_MODELS: Record<ModelFamily, readonly string[]> = {
  claude: [
    'claude-sonnet-5.5',
    'claude-opus-5.5',
    'claude-sonnet-4.6',
    'claude-opus-4.8',
    'claude-haiku-4.5',
    'claude-haiku-5.5',
  ],
  gpt: [
    'gpt-6.1-sol',
    'gpt-6-sol',
    'gpt-5.6-terra',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
  ],
  gemini: ['gemini-4-argon', 'gemini-3.1-pro'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4.1-flash'],
  other: [
    'kimi-k3',
    'grok-4.7',
    'glm-5.3',
    'qwen3.8-max',
    'minimax-m3',
    'kimi-k3.1-pro',
  ],
}

export type RateBoardRow = {
  model: string
  family: ModelFamily
  inputPrice: number
  outputPrice: number
  officialInputPrice: number
  officialOutputPrice: number
  savingsPercent: number
}

export function getModelFamily(modelName: string): ModelFamily {
  const name = modelName.toLowerCase()
  if (name.startsWith('claude')) return 'claude'
  if (name.startsWith('gpt') || /^o\d/.test(name)) return 'gpt'
  if (name.startsWith('gemini')) return 'gemini'
  if (name.startsWith('deepseek')) return 'deepseek'
  return 'other'
}

/** Sell price in USD per 1M tokens, or null when it cannot be read as tokens. */
export function getSellPrices(
  model: PricingModel
): { input: number; output: number } | null {
  if (model.billing_mode === 'tiered_expr') {
    const tier = getDynamicPricingTiers(model)[0]
    if (!tier || !('inputPrice' in tier) || tier.billingUnit === 'request') {
      return null
    }
    const input = Number(tier.inputPrice)
    const output = Number(tier.outputPrice)
    return Number.isFinite(input) && Number.isFinite(output)
      ? { input, output }
      : null
  }
  if (model.quota_type !== 0) return null
  const input = calculateTokenPrice(model, 'input', 1)
  const output = calculateTokenPrice(model, 'output', 1)
  return Number.isFinite(input) && Number.isFinite(output)
    ? { input, output }
    : null
}

export function toRateBoardRow(model: PricingModel): RateBoardRow | null {
  const prices = getSellPrices(model)
  if (!prices || prices.input <= 0) return null
  return {
    model: model.model_name,
    family: getModelFamily(model.model_name),
    inputPrice: prices.input,
    outputPrice: prices.output,
    officialInputPrice: prices.input / JAVAROUTERS_MARKUP,
    officialOutputPrice: prices.output / JAVAROUTERS_MARKUP,
    savingsPercent: Math.round((1 - JAVAROUTERS_MARKUP) * 100),
  }
}

function featuredRank(row: RateBoardRow): number {
  const rank = FEATURED_MODELS[row.family].indexOf(row.model)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

/** Rows for one family: featured models first, then the rest by name. */
export function buildRateBoard(
  models: PricingModel[],
  family: ModelFamily,
  limit = RATE_BOARD_ROWS
): RateBoardRow[] {
  return models
    .map(toRateBoardRow)
    .filter((row): row is RateBoardRow => row !== null && row.family === family)
    .sort(
      (a, b) =>
        featuredRank(a) - featuredRank(b) || a.model.localeCompare(b.model)
    )
    .slice(0, limit)
}

/** Families that have at least one token-priced model, in display order. */
export function availableFamilies(models: PricingModel[]): ModelFamily[] {
  const present = new Set(
    models
      .map(toRateBoardRow)
      .filter((row): row is RateBoardRow => row !== null)
      .map((row) => row.family)
  )
  return MODEL_FAMILIES.filter((family) => present.has(family))
}

/** A per-1M price in the site's billing currency, as the pricing page shows it. */
export function formatPerMillion(valueUSD: number): string {
  return formatBillingCurrencyFromUSD(valueUSD, {
    digitsLarge: 2,
    digitsSmall: 4,
    abbreviate: false,
  })
}
