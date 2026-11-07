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
