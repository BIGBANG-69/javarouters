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
import type { PricingModel } from '@/features/pricing/types'

import {
  getModelFamily,
  MODEL_FAMILIES,
  toRateBoardRow,
  type ModelFamily,
  type RateBoardRow,
} from './rate-board'

export type PriceListFamily = ModelFamily | 'all'

export type PriceListSort = 'family' | 'cheapest' | 'name'

/** One row of the full price list. `prices` is null when the model is not priced per token. */
export type PriceListRow = {
  model: string
  family: ModelFamily
  vendor: string | null
  prices: RateBoardRow | null
}

export function toPriceListRow(
  model: PricingModel & { vendor_name?: string }
): PriceListRow {
  return {
    model: model.model_name,
    family: getModelFamily(model.model_name),
    vendor: model.vendor_name || null,
    prices: toRateBoardRow(model),
  }
}

/** Number of rows per family tab, including "all". */
export function countByFamily(
  rows: PriceListRow[]
): Record<PriceListFamily, number> {
  const counts: Record<PriceListFamily, number> = {
    all: rows.length,
    claude: 0,
    gpt: 0,
    gemini: 0,
    deepseek: 0,
    other: 0,
  }
  for (const row of rows) counts[row.family] += 1
  return counts
}

function compareRows(sort: PriceListSort) {
  return (a: PriceListRow, b: PriceListRow): number => {
    if (sort === 'cheapest') {
      // Rows without token prices go last.
      const aPrice = a.prices?.inputPrice ?? Number.POSITIVE_INFINITY
      const bPrice = b.prices?.inputPrice ?? Number.POSITIVE_INFINITY
      if (aPrice !== bPrice) return aPrice - bPrice
    }
    if (sort === 'family') {
      const familyOrder =
        MODEL_FAMILIES.indexOf(a.family) - MODEL_FAMILIES.indexOf(b.family)
      if (familyOrder !== 0) return familyOrder
    }
    return a.model.localeCompare(b.model)
  }
}

/**
 * Rows for the price page: one family (or all), matching every word of the query against the
 * model name and vendor, in the chosen order.
 */
export function filterPriceList(
  rows: PriceListRow[],
  options: { family: PriceListFamily; query: string; sort: PriceListSort }
): PriceListRow[] {
  const words = options.query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows
    .filter((row) => options.family === 'all' || row.family === options.family)
    .filter((row) => {
      const haystack = `${row.model} ${row.vendor ?? ''}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
    .sort(compareRows(options.sort))
}
