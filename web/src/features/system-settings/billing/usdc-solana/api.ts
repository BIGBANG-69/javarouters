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
import { api } from '@/lib/api'

export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

/** Amounts ending in _atomic are USDC base units: 1 USDC = 1,000,000. */
export const USDC_ATOMIC_PER_USD = 1_000_000

export interface UsdcSolanaStats {
  addresses: number
  awaiting_sweep: number
  credited_deposits: number
  credited_atomic: number
  bonus_atomic: number
  held_deposits: number
  held_atomic: number
}

export interface UsdcSolanaRuntimeStatus {
  configured: boolean
  error?: string
  mint?: string
  fee_payer?: string
  fee_payer_lamports?: number
  sweeping?: boolean
  sweep_min_atomic?: number
  /** Where the RPC endpoint comes from: the admin setting, SOLANA_RPC_URL, or the public default. */
  rpc_source?: 'admin' | 'env' | 'default'
  /** Host only: the full URL may carry a provider API key and is never returned. */
  rpc_host?: string
  rpc_ok?: boolean
  rpc_error?: string
}

export interface UsdcSolanaAdminInfo {
  stats: UsdcSolanaStats
  available: boolean
  status: UsdcSolanaRuntimeStatus
}

export interface DepositVoucher {
  id: number
  code: string
  name: string
  bonus_percent: number
  max_bonus_usd: number
  min_deposit_usd: number
  max_uses: number
  per_user_limit: number
  used_count: number
  expires_at: number
  status: number
  created_at: number
}

export const DEPOSIT_VOUCHER_ENABLED = 1
export const DEPOSIT_VOUCHER_DISABLED = 2

export interface DepositVoucherPage {
  items: DepositVoucher[]
  total: number
  page: number
  page_size: number
}

export type DepositVoucherInput = Omit<
  DepositVoucher,
  'id' | 'used_count' | 'created_at'
> & { id?: number }

export async function getUsdcSolanaAdminInfo(): Promise<
  ApiResponse<UsdcSolanaAdminInfo>
> {
  const res = await api.get('/api/usdc-solana/stats')
  return res.data
}

export async function getDepositVouchers(
  page: number,
  pageSize: number
): Promise<ApiResponse<DepositVoucherPage>> {
  const res = await api.get('/api/deposit-voucher/', {
    params: { p: page, page_size: pageSize },
  })
  return res.data
}

export async function createDepositVoucher(
  voucher: DepositVoucherInput
): Promise<ApiResponse<DepositVoucher>> {
  const res = await api.post('/api/deposit-voucher/', voucher)
  return res.data
}

export async function updateDepositVoucher(
  voucher: DepositVoucherInput & { id: number }
): Promise<ApiResponse> {
  const res = await api.put('/api/deposit-voucher/', voucher)
  return res.data
}

export async function deleteDepositVoucher(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/deposit-voucher/${id}`)
  return res.data
}
