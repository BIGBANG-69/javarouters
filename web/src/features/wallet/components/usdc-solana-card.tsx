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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  TicketPercent,
  TriangleAlert,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  applyUsdcSolanaVoucher,
  checkUsdcSolanaTransaction,
  createUsdcSolanaAddress,
  getUsdcSolanaInfo,
  removeUsdcSolanaVoucher,
} from '../api'
import {
  USDC_ATOMIC_PER_USD,
  type UsdcSolanaDeposit,
  type UsdcSolanaVoucher,
} from '../types'

const USDC_SOLANA_QUERY_KEY = ['usdc-solana-deposit'] as const

function formatUsdc(atomic: number, locale: string | undefined): string {
  return (atomic / USDC_ATOMIC_PER_USD).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

function shorten(value: string, keep = 6): string {
  return value.length > keep * 2 + 3
    ? `${value.slice(0, keep)}…${value.slice(-keep)}`
    : value
}

/** Fetches the deposit info. The card hides itself when deposits are off. */
function useUsdcSolanaInfo() {
  return useQuery({
    queryKey: USDC_SOLANA_QUERY_KEY,
    queryFn: async () => {
      const response = await getUsdcSolanaInfo()
      if (!response.success || !response.data) {
        throw response
      }
      return response.data
    },
    staleTime: 15_000,
  })
}

function CopyField(props: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className='space-y-1'>
      <div className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </div>
      <div className='bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2'>
        <code className='min-w-0 flex-1 font-mono text-xs break-all'>
          {props.value}
        </code>
        <CopyButton value={props.value} className='h-7 w-7' />
      </div>
      {props.hint && (
        <p className='text-muted-foreground text-xs'>{props.hint}</p>
      )}
    </div>
  )
}

function VoucherSummary({ voucher }: { voucher: UsdcSolanaVoucher }) {
  const { t } = useTranslation()
  const parts = [
    t('{{percent}}% bonus on your next deposit', {
      percent: voucher.bonus_percent,
    }),
  ]
  if (voucher.max_bonus_usd > 0) {
    parts.push(t('up to ${{amount}}', { amount: voucher.max_bonus_usd }))
  }
  if (voucher.min_deposit_usd > 0) {
    parts.push(
      t('minimum deposit ${{amount}}', { amount: voucher.min_deposit_usd })
    )
  }
  if (voucher.expires_at > 0) {
    parts.push(
      t('valid until {{date}}', {
        date: formatTimestampToDate(voucher.expires_at),
      })
    )
  }
  return <span>{parts.join(' · ')}</span>
}

function DepositRow(props: { deposit: UsdcSolanaDeposit }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const deposit = props.deposit
  return (
    <li className='flex items-center justify-between gap-3 py-2 text-sm'>
      <div className='min-w-0'>
        <div className='font-medium'>
          {formatUsdc(deposit.amount_atomic, locale)} USDC
          {deposit.bonus_atomic > 0 && (
            <span className='text-success ml-2 text-xs font-normal'>
              {t('+{{amount}} bonus ({{code}})', {
                amount: formatUsdc(deposit.bonus_atomic, locale),
                code: deposit.voucher_code,
              })}
            </span>
          )}
        </div>
        <a
          href={`https://solscan.io/tx/${deposit.signature}`}
          target='_blank'
          rel='noreferrer'
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-xs'
        >
          {shorten(deposit.signature, 8)}
          <ExternalLink className='h-3 w-3' />
        </a>
      </div>
      <div className='flex shrink-0 flex-col items-end gap-1'>
        <Badge
          variant={deposit.status === 'credited' ? 'secondary' : 'outline'}
        >
          {deposit.status === 'credited' ? t('Credited') : t('On hold')}
        </Badge>
        <span className='text-muted-foreground text-xs'>
          {formatTimestampToDate(deposit.block_time || deposit.created_at)}
        </span>
      </div>
    </li>
  )
}

export function UsdcSolanaCard(props: {
  onDepositSuccess?: () => void | Promise<void>
  onAvailabilityChange?: (available: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const { data: info, isLoading } = useUsdcSolanaInfo()
  const onAvailabilityChange = props.onAvailabilityChange

  useEffect(() => {
    if (!isLoading) {
      onAvailabilityChange?.(Boolean(info?.available))
    }
  }, [info?.available, isLoading, onAvailabilityChange])

  const [creating, setCreating] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherBusy, setVoucherBusy] = useState(false)
  const [signature, setSignature] = useState('')
  const [checking, setChecking] = useState(false)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: USDC_SOLANA_QUERY_KEY })

  const handleCreate = async () => {
    setCreating(true)
    try {
      const response = await createUsdcSolanaAddress()
      if (!response.success) {
        handleServerError(response, t('Could not create the deposit address'))
        return
      }
      await refresh()
    } catch (error) {
      handleServerError(error, t('Could not create the deposit address'))
    } finally {
      setCreating(false)
    }
  }

  const handleApplyVoucher = async (event: FormEvent) => {
    event.preventDefault()
    const code = voucherCode.trim()
    if (!code) return
    setVoucherBusy(true)
    try {
      const response = await applyUsdcSolanaVoucher(code)
      if (!response.success) {
        handleServerError(response, t('Could not apply the voucher code'))
        return
      }
      toast.success(
        t('Voucher {{code}} applied to your next deposit', {
          code: response.data?.code ?? code.toUpperCase(),
        })
      )
      setVoucherCode('')
      await refresh()
    } catch (error) {
      handleServerError(error, t('Could not apply the voucher code'))
    } finally {
      setVoucherBusy(false)
    }
  }

  const handleRemoveVoucher = async () => {
    setVoucherBusy(true)
    try {
      const response = await removeUsdcSolanaVoucher()
      if (!response.success) {
        handleServerError(response, t('Could not remove the voucher code'))
        return
      }
      await refresh()
    } catch (error) {
      handleServerError(error, t('Could not remove the voucher code'))
    } finally {
      setVoucherBusy(false)
    }
  }

  const handleCheck = async (event: FormEvent) => {
    event.preventDefault()
    const value = signature.trim()
    if (!value) return
    setChecking(true)
    try {
      const response = await checkUsdcSolanaTransaction(value)
      if (!response.success || !response.data) {
        handleServerError(response, t('Could not check the transaction'))
        return
      }
      const result = response.data
      if (result.outcome === 'duplicate') {
        toast.info(t('This transaction was already credited'))
      } else if (result.outcome === 'held') {
        toast.warning(
          result.hold_reason === 'below_minimum_unit'
            ? t(
                'Deposit received, but the amount is too small to credit on its own. It will be credited with your next deposit.'
              )
            : t(
                'Deposit received but your balance is at its limit. It will be credited with your next deposit.'
              )
        )
      } else {
        toast.success(
          result.bonus_quota > 0
            ? t('Credited {{amount}} + {{bonus}} voucher bonus', {
                amount: formatQuota(result.quota - result.bonus_quota),
                bonus: formatQuota(result.bonus_quota),
              })
            : t('Credited {{amount}}', { amount: formatQuota(result.quota) })
        )
      }
      setSignature('')
      if (result.outcome === 'credited') {
        await Promise.all([refresh(), props.onDepositSuccess?.()])
      } else {
        await refresh()
      }
    } catch (error) {
      handleServerError(error, t('Could not check the transaction'))
    } finally {
      setChecking(false)
    }
  }

  if (isLoading) {
    return <Skeleton className='h-48 w-full rounded-xl' />
  }
  if (!info?.available) {
    return null
  }

  return (
    <TitledCard
      title={t('Deposit USDC (Solana)')}
      description={t(
        'Your personal deposit address. Every finalized deposit is credited automatically — no minimum.'
      )}
      icon={<CircleDollarSign className='h-4 w-4' />}
      iconTone='success'
      disableHoverEffect
      contentClassName='space-y-5'
    >
      {!info.address ? (
        <div className='flex flex-col items-start gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Create your own USDC deposit address. It is yours for good — reuse it for every deposit.'
            )}
          </p>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? t('Creating...') : t('Create deposit address')}
          </Button>
        </div>
      ) : (
        <>
          <div className='grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]'>
            <div className='flex flex-col items-center gap-2'>
              <div className='rounded-lg bg-white p-2'>
                <QRCodeSVG value={info.pay_url ?? info.address} size={152} />
              </div>
              <span className='text-muted-foreground text-xs'>
                {t('Scan with Phantom, Backpack or Solflare')}
              </span>
            </div>
            <div className='min-w-0 space-y-3'>
              <CopyField
                label={t('Your USDC deposit address (Solana)')}
                value={info.address}
              />
              <Alert variant='destructive'>
                <TriangleAlert />
                <AlertTitle>{t('Send only USDC on Solana')}</AlertTitle>
                <AlertDescription>
                  {t(
                    'Funds sent on any other network (Ethereum, Polygon, BSC, Tron, Base, Arbitrum…) or as any other token (USDT, SOL, etc.) will be lost — there is no way to recover them.'
                  )}
                </AlertDescription>
              </Alert>
              {(info.held_atomic ?? 0) > 0 && (
                <Alert>
                  <AlertDescription>
                    {t(
                      '{{amount}} USDC is on hold because your balance is at its limit. It is credited with your next deposit.',
                      { amount: formatUsdc(info.held_atomic ?? 0, locale) }
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <section className='space-y-2'>
            <div className='flex items-center gap-2 text-sm font-medium'>
              <TicketPercent className='h-4 w-4' />
              {t('Voucher code')}
            </div>
            {info.voucher ? (
              <div className='bg-success/5 border-success/30 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm'>
                <div className='min-w-0'>
                  <div className='font-mono font-semibold'>
                    {info.voucher.code}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    <VoucherSummary voucher={info.voucher} />
                  </div>
                </div>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 shrink-0'
                  onClick={handleRemoveVoucher}
                  disabled={voucherBusy}
                  aria-label={t('Remove voucher')}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <form onSubmit={handleApplyVoucher} className='flex gap-2'>
                <Input
                  value={voucherCode}
                  onChange={(event) => setVoucherCode(event.target.value)}
                  placeholder={t('Enter a voucher code')}
                  className='font-mono uppercase'
                  maxLength={32}
                />
                <Button
                  type='submit'
                  variant='outline'
                  disabled={voucherBusy || !voucherCode.trim()}
                >
                  {t('Apply')}
                </Button>
              </form>
            )}
            <p className='text-muted-foreground text-xs'>
              {t(
                'Apply a voucher before you send. The bonus is added to your next deposit.'
              )}
            </p>
          </section>

          <section className='space-y-2'>
            <div className='text-sm font-medium'>
              {t('Already sent? Credit instantly with the transaction ID')}
            </div>
            <form onSubmit={handleCheck} className='flex gap-2'>
              <Input
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder={t('Paste a Solana signature or Solscan URL…')}
                className='font-mono text-xs'
              />
              <Button type='submit' disabled={checking || !signature.trim()}>
                {checking ? t('Checking...') : t('Check transaction')}
              </Button>
            </form>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Paste a Solana signature or a Solscan / Explorer URL. Only USDC sent to your deposit address above, after the transaction is finalized (~30–60s). Deposits are also detected automatically within a few minutes.'
              )}
            </p>
          </section>

          <Collapsible>
            <CollapsibleTrigger className='group flex w-full items-center justify-between text-sm font-medium'>
              {t('Sending from a centralized exchange?')}
              <ChevronDown className='h-4 w-4 transition-transform group-data-[panel-open]:rotate-180' />
            </CollapsibleTrigger>
            <CollapsibleContent className='text-muted-foreground space-y-2 pt-2 text-sm'>
              <ul className='list-disc space-y-1 pl-5'>
                <li>{t('Network: Solana')}</li>
                <li>{t('Token: USDC')}</li>
                <li>{t('Memo / tag: leave blank')}</li>
                <li>{t('Address: the one above')}</li>
              </ul>
              <p>
                {t(
                  "Most exchanges (Coinbase, Binance, OKX, Bybit, Kraken) support USDC on Solana. Pick 'Solana' — not 'Ethereum', 'Polygon', 'Tron' or 'Base'."
                )}
              </p>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className='group flex w-full items-center justify-between text-sm font-medium'>
              {t('Need the USDC mint address or Solana Pay link?')}
              <ChevronDown className='h-4 w-4 transition-transform group-data-[panel-open]:rotate-180' />
            </CollapsibleTrigger>
            <CollapsibleContent className='space-y-3 pt-2'>
              <CopyField
                label={t('USDC mint (Mainnet)')}
                value={info.mint}
                hint={t(
                  'The on-chain SPL token contract. Check it matches before sending.'
                )}
              />
              {info.pay_url && (
                <CopyField
                  label={t('Solana Pay URL')}
                  value={info.pay_url}
                  hint={t(
                    'Paste into Phantom / Backpack / Solflare to skip the recipient form.'
                  )}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          {info.deposits && info.deposits.length > 0 && (
            <section className='space-y-1'>
              <div className='text-sm font-medium'>{t('Recent deposits')}</div>
              <ul className='divide-y'>
                {info.deposits.map((deposit) => (
                  <DepositRow key={deposit.id} deposit={deposit} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </TitledCard>
  )
}
