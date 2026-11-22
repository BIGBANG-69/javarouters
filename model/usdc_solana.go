package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	PaymentMethodUsdcSolana   = "usdc_solana"
	PaymentProviderUsdcSolana = "usdc_solana"

	// UsdcSolanaDepositHeld is a deposit that could not be credited because
	// the wallet would exceed its limit; the next deposit retries it.
	UsdcSolanaDepositHeld     = "held"
	UsdcSolanaDepositCredited = "credited"

	// UsdcSolanaAtomicPerUSD is USDC's 6 decimals; 1 USDC is credited as 1 USD.
	UsdcSolanaAtomicPerUSD int64 = 1_000_000
)

// UsdcSolanaAddress is a user's personal deposit address. The private key is
// stored encrypted (see service/usdc_solana.go). HeldAtomic is deposited USDC
// that could not be credited yet because of the wallet limit.
// PendingVoucherId is a deposit voucher the user applied for their next
// deposit.
type UsdcSolanaAddress struct {
	Id               int    `json:"id"`
	UserId           int    `json:"user_id" gorm:"uniqueIndex"`
	OwnerAddress     string `json:"owner_address" gorm:"type:varchar(64);uniqueIndex"`
	TokenAccount     string `json:"token_account" gorm:"type:varchar(64);uniqueIndex"`
	EncryptedKey     string `json:"-" gorm:"type:text"`
	KeyVersion       int    `json:"-"`
	HeldAtomic       int64  `json:"held_atomic"`
	PendingVoucherId int    `json:"pending_voucher_id" gorm:"index"`
	ScanCursor       string `json:"-" gorm:"type:varchar(128)"`
	NeedsSweep       bool   `json:"-"`
	SweepSignature   string `json:"-" gorm:"type:varchar(128)"`
	SweepSentAt      int64  `json:"-"`
	LastActivityAt   int64  `json:"-" gorm:"index"`
	LastScannedAt    int64  `json:"-" gorm:"index"`
	CreatedAt        int64  `json:"created_at"`
}

// UsdcSolanaDeposit is one incoming transfer. Signature and UserId are
// unique together, so a transaction is counted once per user no matter who
// reports it or how often; one transaction paying two users credits both.
type UsdcSolanaDeposit struct {
	Id           int    `json:"id"`
	Signature    string `json:"signature" gorm:"type:varchar(128);uniqueIndex:idx_usdc_sol_deposit_sig_user"`
	UserId       int    `json:"user_id" gorm:"uniqueIndex:idx_usdc_sol_deposit_sig_user;index"`
	AmountAtomic int64  `json:"amount_atomic"`
	Slot         int64  `json:"slot"`
	BlockTime    int64  `json:"block_time"`
	Status       string `json:"status" gorm:"type:varchar(16);index"`
	TradeNo      string `json:"trade_no" gorm:"type:varchar(255)"`
	VoucherCode  string `json:"voucher_code" gorm:"type:varchar(32)"`
	BonusAtomic  int64  `json:"bonus_atomic"`
	CreatedAt    int64  `json:"created_at"`
}

func GetUsdcSolanaAddressByUserId(userId int) (*UsdcSolanaAddress, error) {
	var address UsdcSolanaAddress
	if err := DB.Where("user_id = ?", userId).First(&address).Error; err != nil {
		return nil, err
	}
	return &address, nil
}

// CreateUsdcSolanaAddress stores address unless the user already has one,
// and returns the stored row, so concurrent first requests converge.
func CreateUsdcSolanaAddress(address *UsdcSolanaAddress) (*UsdcSolanaAddress, error) {
	now := common.GetTimestamp()
	address.Id = 0
	address.CreatedAt = now
	address.LastActivityAt = now
	err := DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, DoNothing: true}).
		Create(address).Error
	if err != nil {
		return nil, err
	}
	return GetUsdcSolanaAddressByUserId(address.UserId)
}

// TouchUsdcSolanaAddress marks the address as watched closely for a while,
// because its owner is looking at the deposit page.
func TouchUsdcSolanaAddress(id int) error {
	return DB.Model(&UsdcSolanaAddress{}).Where("id = ?", id).
		Update("last_activity_at", common.GetTimestamp()).Error
}

// ListUsdcSolanaAddressesToScan returns the addresses due for a scan, least
// recently scanned first: every tick while the owner was active in the last
// two hours or funds await a sweep, every 10 minutes for owners active this
// week, and every 6 hours otherwise.
func ListUsdcSolanaAddressesToScan(now int64, limit int) ([]UsdcSolanaAddress, error) {
	var addresses []UsdcSolanaAddress
	err := DB.Where("last_scanned_at < ?", now-25).
		Where(DB.Where("needs_sweep = ?", true).
			Or("last_activity_at >= ?", now-2*3600).
			Or("last_activity_at >= ? AND last_scanned_at < ?", now-7*24*3600, now-10*60).
			Or("last_scanned_at < ?", now-6*3600)).
		Order("last_scanned_at asc").
		Limit(limit).
		Find(&addresses).Error
	return addresses, err
}

// RecordUsdcSolanaScan stores how far the address history was read.
func RecordUsdcSolanaScan(id int, cursor string, scannedAt int64) error {
	updates := map[string]any{"last_scanned_at": scannedAt}
	if cursor != "" {
		updates["scan_cursor"] = cursor
	}
	return DB.Model(&UsdcSolanaAddress{}).Where("id = ?", id).Updates(updates).Error
}

// RecordUsdcSolanaSweep stores a sent sweep, or clears NeedsSweep once the
// token account is empty (signature == "").
func RecordUsdcSolanaSweep(id int, signature string, sentAt int64) error {
	if signature == "" {
		return DB.Model(&UsdcSolanaAddress{}).Where("id = ?", id).Update("needs_sweep", false).Error
	}
	return DB.Model(&UsdcSolanaAddress{}).Where("id = ?", id).
		Updates(map[string]any{"sweep_signature": signature, "sweep_sent_at": sentAt}).Error
}

func ListUsdcSolanaDepositsByUser(userId int, limit int) ([]UsdcSolanaDeposit, error) {
	var deposits []UsdcSolanaDeposit
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(limit).Find(&deposits).Error
	return deposits, err
}

// UsdcSolanaStats summarizes deposits for the admin settings page.
type UsdcSolanaStats struct {
	Addresses      int64 `json:"addresses"`
	AwaitingSweep  int64 `json:"awaiting_sweep"`
	CreditedCount  int64 `json:"credited_deposits"`
	CreditedAtomic int64 `json:"credited_atomic"`
	BonusAtomic    int64 `json:"bonus_atomic"`
	HeldDeposits   int64 `json:"held_deposits"`
	HeldAtomic     int64 `json:"held_atomic"`
}

func GetUsdcSolanaStats() (UsdcSolanaStats, error) {
	var stats UsdcSolanaStats
	if err := DB.Model(&UsdcSolanaAddress{}).Count(&stats.Addresses).Error; err != nil {
		return stats, err
	}
	if err := DB.Model(&UsdcSolanaAddress{}).Where("needs_sweep = ?", true).Count(&stats.AwaitingSweep).Error; err != nil {
		return stats, err
	}
	for _, row := range []struct {
		status string
		count  *int64
		sum    *int64
		bonus  *int64
	}{
		{UsdcSolanaDepositCredited, &stats.CreditedCount, &stats.CreditedAtomic, &stats.BonusAtomic},
		{UsdcSolanaDepositHeld, &stats.HeldDeposits, &stats.HeldAtomic, nil},
	} {
		var total struct {
			TotalCount  int64
			TotalAtomic int64
			TotalBonus  int64
		}
		err := DB.Model(&UsdcSolanaDeposit{}).
			Select("count(*) as total_count, coalesce(sum(amount_atomic), 0) as total_atomic, coalesce(sum(bonus_atomic), 0) as total_bonus").
			Where("status = ?", row.status).Scan(&total).Error
		if err != nil {
			return stats, err
		}
		*row.count, *row.sum = total.TotalCount, total.TotalAtomic
		if row.bonus != nil {
			*row.bonus = total.TotalBonus
		}
	}
	return stats, nil
}

// UsdcSolanaCreditOutcome says what happened to a reported deposit.
type UsdcSolanaCreditOutcome string

const (
	UsdcSolanaOutcomeDuplicate UsdcSolanaCreditOutcome = "duplicate"
	UsdcSolanaOutcomeHeld      UsdcSolanaCreditOutcome = "held"
	UsdcSolanaOutcomeCredited  UsdcSolanaCreditOutcome = "credited"
)

type UsdcSolanaCreditResult struct {
	Outcome        UsdcSolanaCreditOutcome `json:"outcome"`
	CreditedAtomic int64                   `json:"credited_atomic"`
	BonusAtomic    int64                   `json:"bonus_atomic"`
	VoucherCode    string                  `json:"voucher_code,omitempty"`
	Quota          int                     `json:"quota"`
	BonusQuota     int                     `json:"bonus_quota"`
}

func usdcAtomicToUSD(atomic int64) decimal.Decimal {
	return decimal.NewFromInt(atomic).Div(decimal.NewFromInt(UsdcSolanaAtomicPerUSD))
}

func usdcAtomicToQuota(atomic int64) (int, error) {
	return common.WalletQuotaFromDecimalStrict(usdcAtomicToUSD(atomic).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
}

// CreditUsdcSolanaDeposit records a finalized deposit to userId's address and
// credits it right away, with any bonus from the voucher the user applied.
// There is no minimum and no manual review. A signature already recorded is
// a no-op, so the watcher and a manual check can both report it safely. Only
// when crediting would exceed the wallet limit does the deposit stay held;
// the next deposit retries the whole held amount.
func CreditUsdcSolanaDeposit(userId int, deposit UsdcSolanaDeposit, callerIp string) (UsdcSolanaCreditResult, error) {
	result := UsdcSolanaCreditResult{}
	if deposit.Signature == "" || deposit.AmountAtomic <= 0 {
		return result, errors.New("invalid usdc deposit")
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		// Locking the address serializes the watcher and manual checks for
		// one user, so the duplicate check below cannot race.
		var address UsdcSolanaAddress
		if err := lockForUpdate(tx).Where("user_id = ?", userId).First(&address).Error; err != nil {
			return err
		}
		var existing int64
		if err := tx.Model(&UsdcSolanaDeposit{}).Where("signature = ? AND user_id = ?", deposit.Signature, userId).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			result.Outcome = UsdcSolanaOutcomeDuplicate
			return nil
		}

		now := common.GetTimestamp()
		deposit.Id = 0
		deposit.UserId = userId
		deposit.CreatedAt = now
		deposit.Status = UsdcSolanaDepositHeld
		deposit.TradeNo = ""
		deposit.VoucherCode = ""
		deposit.BonusAtomic = 0
		if err := tx.Create(&deposit).Error; err != nil {
			return err
		}
		paidAtomic := address.HeldAtomic + deposit.AmountAtomic
		addressUpdates := map[string]any{"needs_sweep": true}

		var voucher *DepositVoucher
		var bonusAtomic int64
		if address.PendingVoucherId > 0 {
			var detach bool
			var err error
			voucher, bonusAtomic, detach, err = prepareDepositVoucherBonus(tx, address.PendingVoucherId, userId, deposit.AmountAtomic, now)
			if err != nil {
				return err
			}
			if detach {
				addressUpdates["pending_voucher_id"] = 0
			}
		}

		quota, err := usdcAtomicToQuota(paidAtomic + bonusAtomic)
		bonusQuota := 0
		if err == nil && bonusAtomic > 0 {
			bonusQuota, err = usdcAtomicToQuota(bonusAtomic)
		}
		if err == nil && quota > 0 {
			err = creditTopUpQuota(tx, userId, quota, nil)
		} else if err == nil {
			err = ErrInvalidTopUpQuota
		}
		switch {
		case err == nil:
		case errors.Is(err, ErrTopUpQuotaLimitExceeded) || errors.Is(err, ErrInvalidTopUpQuota):
			common.SysError(common.LogText("usdc solana deposit for user %d held: %v", userId, err))
			result.Outcome = UsdcSolanaOutcomeHeld
			addressUpdates["held_atomic"] = paidAtomic
			return tx.Model(&UsdcSolanaAddress{}).Where("id = ?", address.Id).Updates(addressUpdates).Error
		default:
			return err
		}

		paidUSD := usdcAtomicToUSD(paidAtomic)
		topUp := TopUp{
			UserId:          userId,
			Amount:          paidUSD.IntPart(),
			Money:           paidUSD.InexactFloat64(),
			TradeNo:         fmt.Sprintf("USDCSOL-%s-%d", deposit.Signature, userId),
			PaymentMethod:   PaymentMethodUsdcSolana,
			PaymentProvider: PaymentProviderUsdcSolana,
			CreateTime:      now,
			CompleteTime:    now,
			Status:          common.TopUpStatusSuccess,
		}
		if err := tx.Create(&topUp).Error; err != nil {
			return err
		}
		if err := tx.Model(&UsdcSolanaDeposit{}).
			Where("user_id = ? AND status = ?", userId, UsdcSolanaDepositHeld).
			Updates(map[string]any{"status": UsdcSolanaDepositCredited, "trade_no": topUp.TradeNo}).Error; err != nil {
			return err
		}
		if bonusAtomic > 0 {
			if err := recordDepositVoucherUse(tx, DepositVoucherUse{
				VoucherId:   voucher.Id,
				UserId:      userId,
				DepositRef:  topUp.TradeNo,
				PaidAtomic:  deposit.AmountAtomic,
				BonusAtomic: bonusAtomic,
				BonusQuota:  bonusQuota,
				CreatedAt:   now,
			}); err != nil {
				return err
			}
			if err := tx.Model(&UsdcSolanaDeposit{}).Where("id = ?", deposit.Id).
				Updates(map[string]any{"voucher_code": voucher.Code, "bonus_atomic": bonusAtomic}).Error; err != nil {
				return err
			}
			// A voucher pays one bonus per application.
			addressUpdates["pending_voucher_id"] = 0
			result.VoucherCode = voucher.Code
		}
		addressUpdates["held_atomic"] = 0
		result.Outcome = UsdcSolanaOutcomeCredited
		result.CreditedAtomic = paidAtomic
		result.BonusAtomic = bonusAtomic
		result.Quota = quota
		result.BonusQuota = bonusQuota
		return tx.Model(&UsdcSolanaAddress{}).Where("id = ?", address.Id).Updates(addressUpdates).Error
	})
	if err != nil {
		return UsdcSolanaCreditResult{}, err
	}
	if result.Outcome == UsdcSolanaOutcomeCredited {
		syncCreditUserQuotaCache(userId, result.Quota, common.LogText("usdc solana topup"))
		RecordTopupLog(userId, common.NewMessage("{{provider}} top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}", map[string]any{
			"provider": "USDC (Solana)",
			"quota":    logger.FormatQuota(result.Quota - result.BonusQuota),
			"amount":   usdcAtomicToUSD(result.CreditedAtomic).StringFixed(2),
		}), callerIp, PaymentMethodUsdcSolana, PaymentMethodUsdcSolana)
		if result.BonusQuota > 0 {
			RecordTopupLog(userId, common.NewMessage("Voucher {{code}} bonus added: {{quota}}", map[string]any{
				"code":  result.VoucherCode,
				"quota": logger.FormatQuota(result.BonusQuota),
			}), callerIp, PaymentMethodUsdcSolana, PaymentMethodUsdcSolana)
		}
	}
	return result, nil
}
