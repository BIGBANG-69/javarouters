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

import type { PricingModel } from '@/features/pricing/types'

import {
  countByFamily,
  filterPriceList,
  toPriceListRow,
} from '../price-list'
import {
  availableFamilies,
  buildRateBoard,
  getModelFamily,
  JAVAROUTERS_MARKUP,
  toRateBoardRow,
} from '../rate-board'

function exprModel(name: string, expr: string): PricingModel {
  return {
    model_name: name,
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 0,
    model_price: 0,
    enable_groups: ['default'],
    billing_mode: 'tiered_expr',
    billing_expr: expr,
  } as unknown as PricingModel
}

function tokenModel(name: string, input: number, output: number) {
  return exprModel(
    name,
    `tier("standard", p * ${input} + c * ${output} + cr * ${input / 10})`
  )
}

describe('getModelFamily', () => {
  it.each([
    ['claude-opus-4.8', 'claude'],
    ['gpt-5.4-mini', 'gpt'],
    ['o3-mini', 'gpt'],
    ['gemini-3.1-pro', 'gemini'],
    ['deepseek-v4-pro', 'deepseek'],
    ['kimi-k3', 'other'],
  ])('puts %s in the %s family', (name, family) => {
    expect(getModelFamily(name)).toBe(family)
  })
})

describe('toRateBoardRow', () => {
  it('derives the official price from the sell price and the markup', () => {
    const row = toRateBoardRow(tokenModel('claude-opus-4.8', 3.5, 17.5))

    expect(row).toMatchObject({
      inputPrice: 3.5,
      outputPrice: 17.5,
      savingsPercent: 30,
    })
    expect(row?.officialInputPrice).toBeCloseTo(3.5 / JAVAROUTERS_MARKUP)
    expect(row?.officialOutputPrice).toBeCloseTo(25)
  })

  it('reads legacy ratio pricing as USD per million tokens', () => {
    const model = {
      ...tokenModel('gpt-5.4', 1, 1),
      billing_mode: undefined,
      billing_expr: undefined,
      model_ratio: 0.875,
      completion_ratio: 6,
    } as unknown as PricingModel

    expect(toRateBoardRow(model)).toMatchObject({
      inputPrice: 1.75,
      outputPrice: 10.5,
    })
  })

  it('reads the cache read price from a tiered expression and from a legacy cache ratio', () => {
    expect(
      toRateBoardRow(tokenModel('claude-opus-4.8', 3.5, 17.5))?.cacheReadPrice
    ).toBeCloseTo(0.35)

    const legacy = {
      ...tokenModel('gpt-5.4', 1, 1),
      billing_mode: undefined,
      billing_expr: undefined,
      model_ratio: 1,
      completion_ratio: 4,
      cache_ratio: 0.1,
    } as unknown as PricingModel
    expect(toRateBoardRow(legacy)?.cacheReadPrice).toBeCloseTo(0.2)
  })

  it('reports no cache read price when the model has none', () => {
    const noCache = exprModel('kimi-k3', 'tier("standard", p * 1 + c * 4)')
    expect(toRateBoardRow(noCache)?.cacheReadPrice).toBeNull()
  })

  it('skips models priced per request', () => {
    const perRequest = exprModel('deepseek-search', 'tier("request", fixed(0.00075))')
    const legacyPerCall = {
      ...tokenModel('grok-imagine', 1, 1),
      billing_mode: undefined,
      quota_type: 1,
    } as unknown as PricingModel

    expect(toRateBoardRow(perRequest)).toBeNull()
    expect(toRateBoardRow(legacyPerCall)).toBeNull()
  })
})

describe('buildRateBoard', () => {
  const models = [
    tokenModel('claude-a-unlisted', 1, 5),
    tokenModel('claude-haiku-4.5', 0.7, 3.5),
    tokenModel('claude-sonnet-4.6', 2.1, 10.5),
    tokenModel('gpt-5.4', 1.75, 10.5),
    tokenModel('claude-opus-4.8', 3.5, 17.5),
  ]

  it('lists featured models first, then the rest by name, for one family', () => {
    expect(buildRateBoard(models, 'claude').map((row) => row.model)).toEqual([
      'claude-sonnet-4.6',
      'claude-opus-4.8',
      'claude-haiku-4.5',
      'claude-a-unlisted',
    ])
  })

  it('stops at the row limit', () => {
    expect(buildRateBoard(models, 'claude', 2)).toHaveLength(2)
  })

  it('lists only families that have token-priced models, in display order', () => {
    expect(availableFamilies(models)).toEqual(['claude', 'gpt'])
    expect(availableFamilies([])).toEqual([])
  })
})

describe('price list', () => {
  const rows = [
    { ...tokenModel('kimi-k3', 0.6, 2.5), vendor_name: 'Moonshot' },
    { ...tokenModel('claude-opus-4.8', 3.5, 17.5), vendor_name: 'Anthropic' },
    { ...tokenModel('gpt-5.4', 1.75, 10.5), vendor_name: 'OpenAI' },
    {
      ...exprModel('deepseek-search', 'tier("request", fixed(0.00075))'),
      vendor_name: 'DeepSeek',
    },
  ].map(toPriceListRow)
  const names = (list: typeof rows) => list.map((row) => row.model)

  it('keeps per-request models as rows without token prices', () => {
    const row = rows.find((item) => item.model === 'deepseek-search')
    expect(row).toMatchObject({ family: 'deepseek', vendor: 'DeepSeek' })
    expect(row?.prices).toBeNull()
  })

  it('counts rows per family tab', () => {
    expect(countByFamily(rows)).toEqual({
      all: 4,
      claude: 1,
      gpt: 1,
      gemini: 0,
      deepseek: 1,
      other: 1,
    })
  })

  it('orders all models by family, then by name', () => {
    expect(
      names(filterPriceList(rows, { family: 'all', query: '', sort: 'family' }))
    ).toEqual(['claude-opus-4.8', 'gpt-5.4', 'deepseek-search', 'kimi-k3'])
  })

  it('orders by input price with unpriced models last when sorting cheapest first', () => {
    expect(
      names(
        filterPriceList(rows, { family: 'all', query: '', sort: 'cheapest' })
      )
    ).toEqual(['kimi-k3', 'gpt-5.4', 'claude-opus-4.8', 'deepseek-search'])
  })

  it('keeps only one family when a family tab is chosen', () => {
    expect(
      names(filterPriceList(rows, { family: 'gpt', query: '', sort: 'name' }))
    ).toEqual(['gpt-5.4'])
  })

  it('matches every query word against the model name or the vendor, ignoring case', () => {
    expect(
      names(
        filterPriceList(rows, {
          family: 'all',
          query: 'ANTHROPIC opus',
          sort: 'name',
        })
      )
    ).toEqual(['claude-opus-4.8'])
    expect(
      filterPriceList(rows, { family: 'all', query: 'opus openai', sort: 'name' })
    ).toEqual([])
  })
})
