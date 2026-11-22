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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import i18next from 'i18next'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { BadgeCell } from '@/components/data-table/core/badge-cell'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
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
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../../components/settings-form-layout'
import { SettingsSection } from '../../components/settings-section'
import {
  createDepositVoucher,
  deleteDepositVoucher,
  DEPOSIT_VOUCHER_DISABLED,
  DEPOSIT_VOUCHER_ENABLED,
  getDepositVouchers,
  updateDepositVoucher,
  type ApiResponse,
  type DepositVoucher,
  type DepositVoucherInput,
} from './api'

const VOUCHERS_QUERY_KEY = ['deposit-vouchers'] as const
// Vouchers are few; one page covers them.
const VOUCHER_PAGE_SIZE = 100

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,32}$/, {
      message: 'Voucher code must be 3-32 letters, digits, - or _',
    }),
  name: z.string().trim().max(64),
  bonusPercent: z.coerce.number().int().min(1).max(100),
  maxBonusUsd: z.coerce.number().min(0),
  minDepositUsd: z.coerce.number().min(0),
  maxUses: z.coerce.number().int().min(0),
  perUserLimit: z.coerce.number().int().min(0),
  expiresOn: z.string(),
  enabled: z.boolean(),
})

type Values = z.infer<typeof schema>

/** A yyyy-mm-dd date ends at 23:59:59 local time; empty means never. */
function dateToExpiry(value: string): number {
  if (!value) return 0
  const end = new Date(`${value}T23:59:59`)
  return Number.isNaN(end.getTime()) ? 0 : Math.floor(end.getTime() / 1000)
}

function expiryToDate(expiresAt: number): string {
  if (!expiresAt) return ''
  const date = new Date(expiresAt * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toValues(voucher: DepositVoucher | null): Values {
  return {
    code: voucher?.code ?? '',
    name: voucher?.name ?? '',
    bonusPercent: voucher?.bonus_percent ?? 10,
    maxBonusUsd: voucher?.max_bonus_usd ?? 0,
    minDepositUsd: voucher?.min_deposit_usd ?? 0,
    maxUses: voucher?.max_uses ?? 0,
    perUserLimit: voucher?.per_user_limit ?? 1,
    expiresOn: expiryToDate(voucher?.expires_at ?? 0),
    enabled:
      (voucher?.status ?? DEPOSIT_VOUCHER_ENABLED) !== DEPOSIT_VOUCHER_DISABLED,
  }
}

function useSaveVoucher(onDone: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DepositVoucherInput): Promise<ApiResponse> =>
      input.id
        ? updateDepositVoucher({ ...input, id: input.id })
        : createDepositVoucher(input),
    onSuccess: (response, input) => {
      if (!response.success) {
        handleServerError(response, i18next.t('Failed to save voucher'))
        return
      }
      toast.success(
        input.id ? i18next.t('Voucher updated') : i18next.t('Voucher created')
      )
      queryClient.invalidateQueries({ queryKey: VOUCHERS_QUERY_KEY })
      onDone()
    },
    onError: (error: Error) => {
      handleServerError(error, i18next.t('Failed to save voucher'))
    },
  })
}

function VoucherFormDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  voucher: DepositVoucher | null
}) {
  const { t } = useTranslation()
  const isEditing = props.voucher !== null
  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: toValues(props.voucher),
  })
  const save = useSaveVoucher(() => props.onOpenChange(false))

  useEffect(() => {
    if (props.open) form.reset(toValues(props.voucher))
  }, [props.open, props.voucher, form])

  const onSubmit = (values: Values) => {
    save.mutate({
      id: props.voucher?.id,
      code: values.code,
      name: values.name,
      bonus_percent: values.bonusPercent,
      max_bonus_usd: values.maxBonusUsd,
      min_deposit_usd: values.minDepositUsd,
      max_uses: values.maxUses,
      per_user_limit: values.perUserLimit,
      expires_at: dateToExpiry(values.expiresOn),
      status: values.enabled
        ? DEPOSIT_VOUCHER_ENABLED
        : DEPOSIT_VOUCHER_DISABLED,
    })
  }

  const numberField = (
    name:
      | 'bonusPercent'
      | 'maxBonusUsd'
      | 'minDepositUsd'
      | 'maxUses'
      | 'perUserLimit',
    label: string,
    description: string,
    step = '1'
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type='number' min={0} step={step} {...field} />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={isEditing ? t('Edit voucher') : t('Create voucher')}
      description={t(
        'A voucher adds a bonus percentage to the next USDC deposit of the user who applies it.'
      )}
      contentClassName='max-h-[min(85dvh,var(--dialog-available-height))] overflow-y-auto sm:max-w-xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={save.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            onClick={form.handleSubmit(onSubmit)}
            disabled={save.isPending}
          >
            {isEditing ? t('Save') : t('Create')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='grid items-start gap-4 sm:grid-cols-2'
          autoComplete='off'
        >
          <FormField
            control={form.control}
            name='code'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Code')}</FormLabel>
                <FormControl>
                  <Input
                    className='font-mono uppercase'
                    disabled={isEditing}
                    placeholder='HEMAT20'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {isEditing
                    ? t('The code cannot be changed after creation.')
                    : t('Letters, digits, - or _. Stored in uppercase.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('Optional, for your reference')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {numberField(
            'bonusPercent',
            t('Bonus (%)'),
            t('Percentage of the deposit added as bonus, 1–100.')
          )}
          {numberField(
            'maxBonusUsd',
            t('Maximum bonus (USD)'),
            t('0 means no cap.'),
            '0.01'
          )}
          {numberField(
            'minDepositUsd',
            t('Minimum deposit (USD)'),
            t('Smaller deposits are credited without the bonus. 0 means none.'),
            '0.01'
          )}
          {numberField(
            'maxUses',
            t('Total uses'),
            t('Bonuses paid across all users. 0 means unlimited.')
          )}
          {numberField(
            'perUserLimit',
            t('Uses per user'),
            t('0 means unlimited.')
          )}
          <FormField
            control={form.control}
            name='expiresOn'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Expires on')}</FormLabel>
                <FormControl>
                  <Input type='date' {...field} />
                </FormControl>
                <FormDescription>
                  {t('Leave empty to never expire.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem className='sm:col-span-2'>
                <SettingsSwitchContent>
                  <FormLabel>{t('Active')}</FormLabel>
                  <FormDescription>
                    {t('Inactive vouchers cannot be applied and pay no bonus.')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}

export function DepositVouchersSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DepositVoucher | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DepositVoucher | null>(null)

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: VOUCHERS_QUERY_KEY,
    queryFn: async () => {
      const response = await getDepositVouchers(1, VOUCHER_PAGE_SIZE)
      if (!response.success || !response.data) throw response
      return response.data.items ?? []
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteDepositVoucher(id),
    onSuccess: (response) => {
      if (!response.success) {
        handleServerError(response, t('Failed to delete voucher'))
        return
      }
      toast.success(t('Voucher deleted'))
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: VOUCHERS_QUERY_KEY })
    },
    onError: (error: Error) => {
      handleServerError(error, t('Failed to delete voucher'))
    },
  })

  const now = Math.floor(Date.now() / 1000)

  return (
    <SettingsSection title={t('Deposit Vouchers')}>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Users apply a code before depositing USDC; the bonus is added to that deposit automatically.'
          )}
        </p>
        <Button
          size='sm'
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className='mr-1.5 h-4 w-4' />
          {t('Create voucher')}
        </Button>
      </div>

      {isLoading ? (
        <div className='text-muted-foreground py-8 text-center text-sm'>
          {t('Loading...')}
        </div>
      ) : (
        <StaticDataTable
          data={vouchers}
          getRowKey={(voucher) => voucher.id}
          emptyClassName='text-sm'
          emptyContent={t('No vouchers yet.')}
          columns={[
            {
              id: 'code',
              header: t('Code'),
              cellClassName: 'font-mono font-medium',
              cell: (voucher) => (
                <div>
                  <div>{voucher.code}</div>
                  {voucher.name && (
                    <div className='text-muted-foreground font-sans text-xs font-normal'>
                      {voucher.name}
                    </div>
                  )}
                </div>
              ),
            },
            {
              id: 'bonus',
              header: t('Bonus'),
              cell: (voucher) =>
                voucher.max_bonus_usd > 0
                  ? t('{{percent}}%, up to ${{amount}}', {
                      percent: voucher.bonus_percent,
                      amount: voucher.max_bonus_usd,
                    })
                  : `${voucher.bonus_percent}%`,
            },
            {
              id: 'min',
              header: t('Minimum deposit'),
              cell: (voucher) =>
                voucher.min_deposit_usd > 0
                  ? `$${voucher.min_deposit_usd}`
                  : '—',
            },
            {
              id: 'uses',
              header: t('Used'),
              cell: (voucher) =>
                voucher.max_uses > 0
                  ? `${voucher.used_count} / ${voucher.max_uses}`
                  : String(voucher.used_count),
            },
            {
              id: 'expires',
              header: t('Expires'),
              cell: (voucher) =>
                voucher.expires_at > 0
                  ? formatTimestampToDate(voucher.expires_at)
                  : t('Never'),
            },
            {
              id: 'status',
              header: t('Status'),
              cell: (voucher) => {
                const expired =
                  voucher.expires_at > 0 && voucher.expires_at <= now
                const usedUp =
                  voucher.max_uses > 0 && voucher.used_count >= voucher.max_uses
                let label = t('Active')
                let variant: 'success' | 'neutral' = 'success'
                if (voucher.status === DEPOSIT_VOUCHER_DISABLED) {
                  label = t('Inactive')
                  variant = 'neutral'
                } else if (expired) {
                  label = t('Expired')
                  variant = 'neutral'
                } else if (usedUp) {
                  label = t('Used up')
                  variant = 'neutral'
                }
                return (
                  <BadgeCell>
                    <StatusBadge
                      label={label}
                      variant={variant}
                      copyable={false}
                    />
                  </BadgeCell>
                )
              },
            },
            {
              id: 'actions',
              header: t('Actions'),
              className: 'text-right',
              cellClassName: 'text-right',
              cell: (voucher) => (
                <StaticRowActions
                  editLabel={t('Edit')}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  onEdit={() => {
                    setEditing(voucher)
                    setDialogOpen(true)
                  }}
                  onDelete={() => setDeleteTarget(voucher)}
                />
              ),
            },
          ]}
        />
      )}

      <VoucherFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        voucher={editing}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Delete voucher')}
        desc={t(
          'Delete voucher {{code}}? Users who applied it lose the pending bonus. Bonuses already paid are kept.',
          { code: deleteTarget?.code ?? '' }
        )}
        destructive
        isLoading={remove.isPending}
        handleConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </SettingsSection>
  )
}
