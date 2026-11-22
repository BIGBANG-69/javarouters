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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../../components/settings-form-layout'
import { SettingsPageFormActions } from '../../components/settings-page-context'
import { SettingsSection } from '../../components/settings-section'
import { useUpdateOption } from '../../hooks/use-update-option'
import { getUsdcSolanaAdminInfo, USDC_ATOMIC_PER_USD } from './api'

const LAMPORTS_PER_SOL = 1_000_000_000
// A sweep costs about 0.002 SOL when the treasury token account must be
// created and a few thousand lamports otherwise; warn well before it runs out.
const LOW_FEE_PAYER_LAMPORTS = 20_000_000

const schema = z.object({
  enabled: z.boolean(),
  treasuryAddress: z
    .string()
    .trim()
    .regex(/^$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/, {
      message: 'Enter a Solana wallet address',
    }),
  // Write-only: the saved URL may carry an API key, so it is never loaded back.
  // Empty means keep the current endpoint.
  rpcUrl: z
    .string()
    .trim()
    .max(2048)
    .regex(/^$|^https?:\/\/[^\s/?#]+\S*$/i, {
      message: 'Enter a URL that starts with https:// or http://',
    }),
})

const RPC_URL_OPTION_KEY = 'usdc_solana_setting.rpc_url_secret'

const RPC_SOURCE_LABELS: Record<string, string> = {
  admin: 'Admin setting',
  env: 'SOLANA_RPC_URL',
  default: 'Public default',
}

type Values = z.infer<typeof schema>

function usd(atomic: number | undefined): string {
  return ((atomic ?? 0) / USDC_ATOMIC_PER_USD).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className='rounded-md border px-3 py-2'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='text-base font-semibold tabular-nums'>{props.value}</div>
    </div>
  )
}

function StatusRow(props: {
  label: string
  children: ReactNode
  danger?: boolean
}) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <span className='text-muted-foreground shrink-0'>{props.label}</span>
      <span
        className={
          props.danger
            ? 'text-destructive flex min-w-0 items-center gap-1 font-medium'
            : 'flex min-w-0 items-center gap-1 font-medium'
        }
      >
        {props.children}
      </span>
    </div>
  )
}

function UsdcSolanaStatusPanel() {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['usdc-solana-admin'],
    queryFn: async () => {
      const response = await getUsdcSolanaAdminInfo()
      if (!response.success || !response.data) throw response
      return response.data
    },
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className='text-muted-foreground py-4 text-sm'>
        {t('Loading...')}
      </div>
    )
  }

  const { stats, status } = data
  const lamports = status.fee_payer_lamports ?? 0

  async function clearRpcUrl() {
    await updateOption.mutateAsync({ key: RPC_URL_OPTION_KEY, value: '' })
    await queryClient.invalidateQueries({ queryKey: ['usdc-solana-admin'] })
  }

  let notice: ReactNode = null
  if (!status.configured) {
    notice = (
      <Alert variant='destructive'>
        <AlertTitle>
          {t('Server is not configured for USDC deposits')}
        </AlertTitle>
        <AlertDescription>
          {status.error ||
            t(
              'Set SOLANA_DEPOSIT_KEY_SECRET (at least 32 characters, never change it) and restart the server.'
            )}
        </AlertDescription>
      </Alert>
    )
  } else if (!data.available) {
    notice = (
      <Alert>
        <AlertDescription>
          {t(
            'Users do not see USDC deposits until they are enabled here and the payment compliance terms are confirmed.'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-3'>
      {notice}

      {status.configured && (
        <div className='space-y-2 rounded-md border px-3 py-2 text-sm'>
          {status.rpc_source && (
            <StatusRow label={t('RPC endpoint')} danger={!status.rpc_ok}>
              <span className='truncate'>
                {status.rpc_host} ·{' '}
                {t(RPC_SOURCE_LABELS[status.rpc_source] ?? status.rpc_source)} ·{' '}
                {status.rpc_ok
                  ? t('Reachable')
                  : status.rpc_error || t('Unreachable')}
              </span>
              {status.rpc_source === 'admin' && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 shrink-0'
                  disabled={updateOption.isPending}
                  onClick={clearRpcUrl}
                >
                  {t('Use env or default')}
                </Button>
              )}
            </StatusRow>
          )}
          <StatusRow label={t('Sweeping')}>
            {status.sweeping
              ? t('On: deposits move to the treasury automatically')
              : t('Off: set the treasury address and SOLANA_FEE_PAYER_KEY')}
          </StatusRow>
          {status.fee_payer && (
            <>
              <StatusRow label={t('Fee payer')}>
                <code className='truncate font-mono text-xs'>
                  {status.fee_payer}
                </code>
                <CopyButton value={status.fee_payer} className='size-7' />
              </StatusRow>
              <StatusRow
                label={t('Fee payer balance')}
                danger={lamports < LOW_FEE_PAYER_LAMPORTS}
              >
                {(lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}{' '}
                SOL
              </StatusRow>
            </>
          )}
          {status.sweep_min_atomic !== undefined && (
            <StatusRow label={t('Minimum balance to sweep')}>
              {usd(status.sweep_min_atomic)} USDC
            </StatusRow>
          )}
        </div>
      )}

      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        <Stat label={t('Deposit addresses')} value={String(stats.addresses)} />
        <Stat
          label={t('Credited deposits')}
          value={String(stats.credited_deposits)}
        />
        <Stat
          label={t('Credited USDC')}
          value={`$${usd(stats.credited_atomic)}`}
        />
        <Stat
          label={t('Voucher bonus paid')}
          value={`$${usd(stats.bonus_atomic)}`}
        />
        <Stat
          label={t('Awaiting sweep')}
          value={String(stats.awaiting_sweep)}
        />
        <Stat
          label={t('On hold (balance limit)')}
          value={`$${usd(stats.held_atomic)}`}
        />
      </div>
    </div>
  )
}

export function UsdcSolanaSettingsSection({
  defaultValues,
}: {
  defaultValues: { enabled: boolean; treasuryAddress: string }
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: { ...defaultValues, rpcUrl: '' },
  })

  const { isDirty, isSubmitting } = form.formState
  const busy = updateOption.isPending || isSubmitting

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []
    if (values.treasuryAddress !== defaultValues.treasuryAddress) {
      updates.push({
        key: 'usdc_solana_setting.treasury_address',
        value: values.treasuryAddress,
      })
    }
    if (values.enabled !== defaultValues.enabled) {
      updates.push({
        key: 'usdc_solana_setting.enabled',
        value: String(values.enabled),
      })
    }
    if (values.rpcUrl !== '') {
      updates.push({ key: RPC_URL_OPTION_KEY, value: values.rpcUrl })
    }
    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
    form.reset({ ...values, rpcUrl: '' })
    await queryClient.invalidateQueries({ queryKey: ['usdc-solana-admin'] })
  }

  return (
    <SettingsSection title={t('USDC (Solana) Deposits')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={busy}
            isSaveDisabled={!isDirty}
            saveLabel='Save USDC settings'
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable USDC deposits')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Each user gets a personal Solana deposit address. Finalized deposits are credited automatically, with no minimum and no manual review.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={busy}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />
          <FormField
            control={form.control}
            name='treasuryAddress'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Treasury wallet address')}</FormLabel>
                <FormControl>
                  <Input
                    className='font-mono'
                    placeholder={t('Solana wallet address')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Deposits are swept from user addresses to this wallet. Use a wallet you control, such as a hardware wallet, not an exchange deposit address.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='rpcUrl'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Solana RPC URL')}</FormLabel>
                <FormControl>
                  <Input
                    className='font-mono'
                    type='password'
                    autoComplete='off'
                    placeholder={t('Leave empty to keep the current endpoint')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Overrides SOLANA_RPC_URL. The saved URL is never shown again because it may include an API key; the status below shows the host in use.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
      <UsdcSolanaStatusPanel />
    </SettingsSection>
  )
}
