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
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

/** Platform usage aggregated across all users, from GET /api/public/stats. */
export type PublicStats = {
  visible: true
  window_days: number
  requests: number
  tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  /** 0 to 1; null when no request outcome was recorded */
  success_rate: number | null
  average_response_seconds: number
  top_models: { model_name: string; requests: number; tokens: number }[]
  daily: { start: number; requests: number; tokens: number }[]
  generated_at: number
}

export type PublicStatsResponse = PublicStats | { visible: false }

async function getPublicStats(): Promise<PublicStatsResponse> {
  const res = await api.get('/api/public/stats')
  return requireServerSuccess(res.data).data as PublicStatsResponse
}

/**
 * The landing page statistics. The server hides them until the last 7 days reach the admin's
 * request threshold; a hidden result, an error or loading all render nothing.
 */
export function usePublicStats(): PublicStats | null {
  const { data } = useQuery({
    queryKey: ['public-stats'],
    queryFn: getPublicStats,
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
  return data?.visible ? data : null
}
