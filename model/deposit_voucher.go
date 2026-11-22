package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	DepositVoucherStatusEnabled  = 1
	DepositVoucherStatusDisabled = 2

	DepositVoucherMaxBonusPercent = 100
	depositVoucherCodeMaxLength   = 32
)

// DepositVoucher is a code a user applies before depositing. The next
// deposit that meets MinDepositUSD gets BonusPercent of the paid amount as
// extra credit, capped at MaxBonusUSD. Zero means "no limit" for
// MaxBonusUSD, MinDepositUSD, MaxUses, PerUserLimit and ExpiresAt.
type DepositVoucher struct {
	Id            int     `json:"id"`
	Code          string  `json:"code" gorm:"type:varchar(32);uniqueIndex"`
	Name          string  `json:"name" gorm:"type:varchar(64)"`
	BonusPercent  int     `json:"bonus_percent"`
	MaxBonusUSD   float64 `json:"max_bonus_usd"`
	MinDepositUSD float64 `json:"min_deposit_usd"`
	MaxUses       int     `json:"max_uses"`
	PerUserLimit  int     `json:"per_user_limit"`
	UsedCount     int     `json:"used_count"`
	ExpiresAt     int64   `json:"expires_at"`
	Status        int     `json:"status"`
	CreatedAt     int64   `json:"created_at"`
}

// DepositVoucherUse is one bonus paid out by a voucher.
type DepositVoucherUse struct {
	Id          int    `json:"id"`
	VoucherId   int    `json:"voucher_id" gorm:"index"`
	UserId      int    `json:"user_id" gorm:"index"`
	DepositRef  string `json:"deposit_ref" gorm:"type:varchar(128);uniqueIndex"`
	PaidAtomic  int64  `json:"paid_atomic"`
	BonusAtomic int64  `json:"bonus_atomic"`
	BonusQuota  int    `json:"bonus_quota"`
	CreatedAt   int64  `json:"created_at"`
}

var (
	ErrDepositVoucherNotFound    = common.NewMessage("Voucher code not found")
	ErrDepositVoucherDisabled    = common.NewMessage("Voucher code is not active")
	ErrDepositVoucherExpired     = common.NewMessage("Voucher code has expired")
	ErrDepositVoucherUsedUp      = common.NewMessage("Voucher code has been fully used")
	ErrDepositVoucherUserLimit   = common.NewMessage("You have already used this voucher code")
	ErrDepositVoucherInvalidCode = common.NewMessage("Voucher code must be 3-32 letters, digits, - or _")
)

// NormalizeDepositVoucherCode uppercases and trims a code, so codes compare
// case-insensitively on every database.
func NormalizeDepositVoucherCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func validDepositVoucherCode(code string) bool {
	if len(code) < 3 || len(code) > depositVoucherCodeMaxLength {
		return false
	}
	for _, r := range code {
		if !(r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

// Validate checks the admin-editable fields and normalizes the code.
func (v *DepositVoucher) Validate() error {
	v.Code = NormalizeDepositVoucherCode(v.Code)
	v.Name = strings.TrimSpace(v.Name)
	if !validDepositVoucherCode(v.Code) {
		return ErrDepositVoucherInvalidCode
	}
	if v.BonusPercent < 1 || v.BonusPercent > DepositVoucherMaxBonusPercent {
		return common.NewMessage("Bonus must be between 1% and 100%")
	}
	if v.MaxBonusUSD < 0 || v.MinDepositUSD < 0 || v.MaxUses < 0 || v.PerUserLimit < 0 || v.ExpiresAt < 0 {
		return common.NewMessage("Voucher limits cannot be negative")
	}
	if v.Status != DepositVoucherStatusDisabled {
		v.Status = DepositVoucherStatusEnabled
	}
	return nil
}

// usableBy reports why v cannot be used by userId right now, or nil.
func (v *DepositVoucher) usableBy(tx *gorm.DB, userId int, now int64) error {
	if v.Status != DepositVoucherStatusEnabled {
		return ErrDepositVoucherDisabled
	}
	if v.ExpiresAt > 0 && now >= v.ExpiresAt {
		return ErrDepositVoucherExpired
	}
	if v.MaxUses > 0 && v.UsedCount >= v.MaxUses {
		return ErrDepositVoucherUsedUp
	}
	if v.PerUserLimit > 0 {
		var used int64
		if err := tx.Model(&DepositVoucherUse{}).Where("voucher_id = ? AND user_id = ?", v.Id, userId).Count(&used).Error; err != nil {
			return err
		}
		if used >= int64(v.PerUserLimit) {
			return ErrDepositVoucherUserLimit
		}
	}
	return nil
}

// BonusAtomic is the bonus for a deposit of paidAtomic USDC base units: the
// voucher percentage, capped at MaxBonusUSD, or zero below MinDepositUSD.
func (v *DepositVoucher) BonusAtomic(paidAtomic int64) int64 {
	paid := decimal.NewFromInt(paidAtomic)
	if v.MinDepositUSD > 0 && paid.LessThan(decimal.NewFromFloat(v.MinDepositUSD).Mul(decimal.NewFromInt(UsdcSolanaAtomicPerUSD))) {
		return 0
	}
	bonus := paid.Mul(decimal.NewFromInt(int64(v.BonusPercent))).Div(decimal.NewFromInt(100)).Floor()
	if v.MaxBonusUSD > 0 {
		maxBonus := decimal.NewFromFloat(v.MaxBonusUSD).Mul(decimal.NewFromInt(UsdcSolanaAtomicPerUSD)).Floor()
		if bonus.GreaterThan(maxBonus) {
			bonus = maxBonus
		}
	}
	if bonus.Sign() <= 0 {
		return 0
	}
	return bonus.IntPart()
}

func GetDepositVouchers(startIdx int, num int) ([]*DepositVoucher, int64, error) {
	var vouchers []*DepositVoucher
	var total int64
	if err := DB.Model(&DepositVoucher{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := DB.Order("id desc").Limit(num).Offset(startIdx).Find(&vouchers).Error
	return vouchers, total, err
}

func GetDepositVoucherById(id int) (*DepositVoucher, error) {
	var voucher DepositVoucher
	if err := DB.First(&voucher, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &voucher, nil
}

func GetDepositVoucherByCode(code string) (*DepositVoucher, error) {
	var voucher DepositVoucher
	err := DB.Where("code = ?", NormalizeDepositVoucherCode(code)).First(&voucher).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDepositVoucherNotFound
	}
	if err != nil {
		return nil, err
	}
	return &voucher, nil
}

func CreateDepositVoucher(voucher *DepositVoucher) error {
	if err := voucher.Validate(); err != nil {
		return err
	}
	voucher.Id = 0
	voucher.UsedCount = 0
	voucher.CreatedAt = common.GetTimestamp()
	var existing int64
	if err := DB.Model(&DepositVoucher{}).Where("code = ?", voucher.Code).Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return common.NewMessage("Voucher code already exists")
	}
	return DB.Create(voucher).Error
}

// UpdateDepositVoucher saves the editable fields; the code and the usage
// count never change after creation.
func UpdateDepositVoucher(voucher *DepositVoucher) error {
	current, err := GetDepositVoucherById(voucher.Id)
	if err != nil {
		return err
	}
	voucher.Code = current.Code
	if err := voucher.Validate(); err != nil {
		return err
	}
	return DB.Model(&DepositVoucher{}).Where("id = ?", voucher.Id).Updates(map[string]any{
		"name":            voucher.Name,
		"bonus_percent":   voucher.BonusPercent,
		"max_bonus_usd":   voucher.MaxBonusUSD,
		"min_deposit_usd": voucher.MinDepositUSD,
		"max_uses":        voucher.MaxUses,
		"per_user_limit":  voucher.PerUserLimit,
		"expires_at":      voucher.ExpiresAt,
		"status":          voucher.Status,
	}).Error
}

// DeleteDepositVoucher removes a voucher and detaches it from every deposit
// address it was applied to. Past bonuses stay in the usage table.
func DeleteDepositVoucher(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&UsdcSolanaAddress{}).Where("pending_voucher_id = ?", id).
			Update("pending_voucher_id", 0).Error; err != nil {
			return err
		}
		return tx.Delete(&DepositVoucher{}, "id = ?", id).Error
	})
}

// ApplyDepositVoucher attaches code to userId's deposit address, so their
// next deposit gets the bonus. It replaces a voucher applied earlier.
func ApplyDepositVoucher(userId int, code string) (*DepositVoucher, error) {
	voucher, err := GetDepositVoucherByCode(code)
	if err != nil {
		return nil, err
	}
	if err := voucher.usableBy(DB, userId, common.GetTimestamp()); err != nil {
		return nil, err
	}
	result := DB.Model(&UsdcSolanaAddress{}).Where("user_id = ?", userId).Update("pending_voucher_id", voucher.Id)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, common.NewMessage("Create your deposit address first")
	}
	return voucher, nil
}

func ClearDepositVoucher(userId int) error {
	return DB.Model(&UsdcSolanaAddress{}).Where("user_id = ?", userId).Update("pending_voucher_id", 0).Error
}

// prepareDepositVoucherBonus runs inside the deposit transaction. It locks
// the voucher and re-checks it, and returns the bonus for paidAtomic in USDC
// base units (0 when the voucher does not apply) and whether the voucher
// should be detached from the address because it can no longer be used.
// Nothing is recorded until recordDepositVoucherUse, which runs only after
// the credit succeeded.
func prepareDepositVoucherBonus(tx *gorm.DB, voucherId int, userId int, paidAtomic int64, now int64) (*DepositVoucher, int64, bool, error) {
	var voucher DepositVoucher
	err := lockForUpdate(tx).Where("id = ?", voucherId).First(&voucher).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, true, nil
	}
	if err != nil {
		return nil, 0, false, err
	}
	if reason := voucher.usableBy(tx, userId, now); reason != nil {
		var message *common.Message
		if errors.As(reason, &message) {
			common.SysLog(common.LogText("deposit voucher %s not applied for user %d: %s", voucher.Code, userId, message.Key))
			return nil, 0, true, nil
		}
		return nil, 0, false, reason
	}
	// Below the voucher's minimum deposit the bonus is 0 and the voucher
	// stays applied for the next deposit.
	return &voucher, voucher.BonusAtomic(paidAtomic), false, nil
}

func recordDepositVoucherUse(tx *gorm.DB, use DepositVoucherUse) error {
	if err := tx.Model(&DepositVoucher{}).Where("id = ?", use.VoucherId).
		Update("used_count", gorm.Expr("used_count + ?", 1)).Error; err != nil {
		return err
	}
	use.Id = 0
	return tx.Create(&use).Error
}
