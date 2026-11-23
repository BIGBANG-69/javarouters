package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedUsdcSolanaUser(t *testing.T, id int) {
	t.Helper()
	require.NoError(t, DB.Create(&User{
		Id:       id,
		Username: fmt.Sprintf("usdc_user_%d", id),
		AffCode:  fmt.Sprintf("usdc%d", id),
		Status:   common.UserStatusEnabled,
	}).Error)
	_, err := CreateUsdcSolanaAddress(&UsdcSolanaAddress{
		UserId:       id,
		OwnerAddress: fmt.Sprintf("owner-%d", id),
		TokenAccount: fmt.Sprintf("token-%d", id),
	})
	require.NoError(t, err)
}

func usdcTestQuota(t *testing.T, userId int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").First(&user, "id = ?", userId).Error)
	return user.Quota
}

func usdcDeposit(signature string, usdc float64) UsdcSolanaDeposit {
	return UsdcSolanaDeposit{Signature: signature, AmountAtomic: int64(usdc * float64(UsdcSolanaAtomicPerUSD))}
}

func TestCreditUsdcSolanaDepositCreditsEveryDepositOnce(t *testing.T) {
	truncateTables(t)
	seedUsdcSolanaUser(t, 501)
	seedUsdcSolanaUser(t, 502)

	// No minimum: one cent is credited right away (0.01 USD = 5000 quota).
	result, err := CreditUsdcSolanaDeposit(501, usdcDeposit("sig-small", 0.01), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Equal(t, 5000, result.Quota)
	assert.Equal(t, 5000, usdcTestQuota(t, 501))

	// No manual review: a large deposit is credited too.
	result, err = CreditUsdcSolanaDeposit(501, usdcDeposit("sig-large", 60000), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Equal(t, 5000+60000*500000, usdcTestQuota(t, 501))

	// The watcher and a manual check reporting the same transaction credit once.
	result, err = CreditUsdcSolanaDeposit(501, usdcDeposit("sig-small", 0.01), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeDuplicate, result.Outcome)
	assert.Equal(t, 5000+60000*500000, usdcTestQuota(t, 501))

	// One transaction paying two users credits each of them.
	result, err = CreditUsdcSolanaDeposit(502, usdcDeposit("sig-small", 2), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Equal(t, 1000000, usdcTestQuota(t, 502))

	var topUps []TopUp
	require.NoError(t, DB.Order("id").Find(&topUps).Error)
	require.Len(t, topUps, 3)
	assert.Equal(t, "USDCSOL-sig-small-501", topUps[0].TradeNo)
	assert.Equal(t, common.TopUpStatusSuccess, topUps[0].Status)
	assert.InDelta(t, 60000, topUps[1].Money, 0.001)

	var deposits []UsdcSolanaDeposit
	require.NoError(t, DB.Where("status = ?", UsdcSolanaDepositCredited).Find(&deposits).Error)
	assert.Len(t, deposits, 3)
	address, err := GetUsdcSolanaAddressByUserId(501)
	require.NoError(t, err)
	assert.True(t, address.NeedsSweep)
	assert.Zero(t, address.HeldAtomic)
}

func TestCreditUsdcSolanaDepositAppliesVoucherBonus(t *testing.T) {
	truncateTables(t)
	seedUsdcSolanaUser(t, 511)
	voucher := &DepositVoucher{Code: " hemat20 ", BonusPercent: 20, MaxBonusUSD: 5, PerUserLimit: 1}
	require.NoError(t, CreateDepositVoucher(voucher))
	assert.Equal(t, "HEMAT20", voucher.Code)

	_, err := ApplyDepositVoucher(511, "Hemat20")
	require.NoError(t, err)

	// 20% of 100 USDC is 20, capped at 5 USD.
	result, err := CreditUsdcSolanaDeposit(511, usdcDeposit("sig-bonus", 100), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Equal(t, int64(5*UsdcSolanaAtomicPerUSD), result.BonusAtomic)
	assert.Equal(t, 5*500000, result.BonusQuota)
	assert.Equal(t, "HEMAT20", result.VoucherCode)
	assert.Equal(t, 105*500000, usdcTestQuota(t, 511))

	stored, err := GetDepositVoucherById(voucher.Id)
	require.NoError(t, err)
	assert.Equal(t, 1, stored.UsedCount)
	address, err := GetUsdcSolanaAddressByUserId(511)
	require.NoError(t, err)
	assert.Zero(t, address.PendingVoucherId, "a voucher pays one bonus per application")

	// The next deposit has no bonus, and the per-user limit blocks reuse.
	result, err = CreditUsdcSolanaDeposit(511, usdcDeposit("sig-plain", 10), "")
	require.NoError(t, err)
	assert.Zero(t, result.BonusAtomic)
	_, err = ApplyDepositVoucher(511, "HEMAT20")
	assert.ErrorIs(t, err, ErrDepositVoucherUserLimit)

	var deposit UsdcSolanaDeposit
	require.NoError(t, DB.First(&deposit, "signature = ?", "sig-bonus").Error)
	assert.Equal(t, "HEMAT20", deposit.VoucherCode)
}

func TestCreditUsdcSolanaDepositVoucherConditions(t *testing.T) {
	truncateTables(t)
	seedUsdcSolanaUser(t, 521)
	minimum := &DepositVoucher{Code: "MIN50", BonusPercent: 10, MinDepositUSD: 50}
	require.NoError(t, CreateDepositVoucher(minimum))
	_, err := ApplyDepositVoucher(521, "MIN50")
	require.NoError(t, err)

	// Below the voucher minimum: credited without bonus, voucher kept.
	result, err := CreditUsdcSolanaDeposit(521, usdcDeposit("sig-under", 20), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Zero(t, result.BonusAtomic)
	address, err := GetUsdcSolanaAddressByUserId(521)
	require.NoError(t, err)
	assert.Equal(t, minimum.Id, address.PendingVoucherId)

	// Expired by the time the deposit lands: credited without bonus, detached.
	require.NoError(t, DB.Model(&DepositVoucher{}).Where("id = ?", minimum.Id).
		Update("expires_at", common.GetTimestamp()-1).Error)
	result, err = CreditUsdcSolanaDeposit(521, usdcDeposit("sig-expired", 80), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Zero(t, result.BonusAtomic)
	assert.Equal(t, 100*500000, usdcTestQuota(t, 521))
	address, err = GetUsdcSolanaAddressByUserId(521)
	require.NoError(t, err)
	assert.Zero(t, address.PendingVoucherId)

	_, err = ApplyDepositVoucher(521, "MIN50")
	assert.ErrorIs(t, err, ErrDepositVoucherExpired)
	_, err = ApplyDepositVoucher(521, "NOPE")
	assert.ErrorIs(t, err, ErrDepositVoucherNotFound)

	usedUp := &DepositVoucher{Code: "ONCE", BonusPercent: 5, MaxUses: 1}
	require.NoError(t, CreateDepositVoucher(usedUp))
	require.NoError(t, DB.Model(&DepositVoucher{}).Where("id = ?", usedUp.Id).Update("used_count", 1).Error)
	_, err = ApplyDepositVoucher(521, "ONCE")
	assert.ErrorIs(t, err, ErrDepositVoucherUsedUp)

	assert.Error(t, CreateDepositVoucher(&DepositVoucher{Code: "ONCE", BonusPercent: 5}))
	assert.Error(t, CreateDepositVoucher(&DepositVoucher{Code: "BAD CODE", BonusPercent: 5}))
	assert.Error(t, CreateDepositVoucher(&DepositVoucher{Code: "TOOMUCH", BonusPercent: 101}))
}

func TestCreditUsdcSolanaDepositHoldsAboveWalletLimit(t *testing.T) {
	truncateTables(t)
	seedUsdcSolanaUser(t, 531)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 531).Update("quota", common.MaxWalletQuota-1000).Error)

	result, err := CreditUsdcSolanaDeposit(531, usdcDeposit("sig-over", 1), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeHeld, result.Outcome)
	assert.Equal(t, "balance_limit", result.HoldReason)
	address, err := GetUsdcSolanaAddressByUserId(531)
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaAtomicPerUSD, address.HeldAtomic)

	// Once there is room again, the next deposit credits the held amount too.
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 531).Update("quota", 0).Error)
	result, err = CreditUsdcSolanaDeposit(531, usdcDeposit("sig-next", 1), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Equal(t, 2*UsdcSolanaAtomicPerUSD, result.CreditedAtomic)
	assert.Equal(t, 1000000, usdcTestQuota(t, 531))
}

func TestCreditUsdcSolanaDepositHoldsSoftDeletedUserAndProtectsSweepRace(t *testing.T) {
	truncateTables(t)
	seedUsdcSolanaUser(t, 541)
	require.NoError(t, DB.Delete(&User{}, 541).Error)

	// A deposit to a soft-deleted user is recorded as held and marked for sweep
	// without returning an error that would wedge the watcher scan queue.
	result, err := CreditUsdcSolanaDeposit(541, usdcDeposit("sig-deleted", 5), "")
	require.NoError(t, err)
	assert.Equal(t, UsdcSolanaOutcomeHeld, result.Outcome)
	assert.Equal(t, "user_unavailable", result.HoldReason)
	address, err := GetUsdcSolanaAddressByUserId(541)
	require.NoError(t, err)
	assert.True(t, address.NeedsSweep)
	assert.Equal(t, 5*UsdcSolanaAtomicPerUSD, address.HeldAtomic)

	// ClearUsdcSolanaNeedsSweepIfNoNewDeposit preserves needs_sweep when a
	// deposit arrived concurrently after the balance snapshot.
	seedUsdcSolanaUser(t, 542)
	_, err = CreditUsdcSolanaDeposit(542, usdcDeposit("sig-first", 2), "")
	require.NoError(t, err)
	snapshotId, err := GetLatestUsdcSolanaDepositId(542)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&UsdcSolanaAddress{}).Where("user_id = ?", 542).
		Updates(map[string]any{"sweep_signature": "old-sweep", "sweep_sent_at": 12345}).Error)

	_, err = CreditUsdcSolanaDeposit(542, usdcDeposit("sig-concurrent", 3), "")
	require.NoError(t, err)
	addr542, err := GetUsdcSolanaAddressByUserId(542)
	require.NoError(t, err)
	require.NoError(t, ClearUsdcSolanaNeedsSweepIfNoNewDeposit(addr542.Id, 542, snapshotId))
	addr542, err = GetUsdcSolanaAddressByUserId(542)
	require.NoError(t, err)
	assert.True(t, addr542.NeedsSweep, "concurrent deposit must keep needs_sweep set")

	// Once the latest deposit is included in the snapshot, needs_sweep and
	// prior sweep metadata are cleared together.
	latestId, err := GetLatestUsdcSolanaDepositId(542)
	require.NoError(t, err)
	require.NoError(t, ClearUsdcSolanaNeedsSweepIfNoNewDeposit(addr542.Id, 542, latestId))
	addr542, err = GetUsdcSolanaAddressByUserId(542)
	require.NoError(t, err)
	assert.False(t, addr542.NeedsSweep)
	assert.Empty(t, addr542.SweepSignature)
	assert.Zero(t, addr542.SweepSentAt)
}

func TestDepositVoucherReapplyAndUsabilityChecks(t *testing.T) {
	truncateTables(t)
	seedUsdcSolanaUser(t, 551)

	voucher := &DepositVoucher{Code: "REAPPLY10", BonusPercent: 10, PerUserLimit: 1}
	require.NoError(t, CreateDepositVoucher(voucher))

	// Applying the same voucher twice succeeds (MySQL RowsAffected == 0 regression).
	_, err := ApplyDepositVoucher(551, "REAPPLY10")
	require.NoError(t, err)
	_, err = ApplyDepositVoucher(551, "REAPPLY10")
	require.NoError(t, err)

	// Applying without a deposit address returns a user-facing message.
	_, err = ApplyDepositVoucher(9999, "REAPPLY10")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Create your deposit address first")

	// Usable check returns the active voucher, then rejects it once expired or disabled.
	got, err := GetUsableDepositVoucherForUser(voucher.Id, 551)
	require.NoError(t, err)
	assert.Equal(t, voucher.Code, got.Code)

	require.NoError(t, DB.Model(&DepositVoucher{}).Where("id = ?", voucher.Id).
		Update("status", DepositVoucherStatusDisabled).Error)
	_, err = GetUsableDepositVoucherForUser(voucher.Id, 551)
	assert.ErrorIs(t, err, ErrDepositVoucherDisabled)

	// Updating a nonexistent voucher returns ErrDepositVoucherNotFound.
	err = UpdateDepositVoucher(&DepositVoucher{Id: 999999, BonusPercent: 10})
	assert.ErrorIs(t, err, ErrDepositVoucherNotFound)
}
