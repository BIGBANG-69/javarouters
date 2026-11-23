package controller

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type usdcSolanaVoucherView struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	BonusPercent  int     `json:"bonus_percent"`
	MaxBonusUSD   float64 `json:"max_bonus_usd"`
	MinDepositUSD float64 `json:"min_deposit_usd"`
	ExpiresAt     int64   `json:"expires_at"`
}

func newUsdcSolanaVoucherView(voucher *model.DepositVoucher) *usdcSolanaVoucherView {
	if voucher == nil {
		return nil
	}
	return &usdcSolanaVoucherView{
		Code:          voucher.Code,
		Name:          voucher.Name,
		BonusPercent:  voucher.BonusPercent,
		MaxBonusUSD:   voucher.MaxBonusUSD,
		MinDepositUSD: voucher.MinDepositUSD,
		ExpiresAt:     voucher.ExpiresAt,
	}
}

// GetUsdcSolanaDeposit returns the user's deposit address, applied voucher
// and recent deposits. It never creates an address.
func GetUsdcSolanaDeposit(c *gin.Context) {
	userId := c.GetInt("id")
	data := gin.H{
		"available": service.UsdcSolanaAvailable(),
		"mint":      service.UsdcSolanaMint(),
		"network":   "solana",
	}
	address, err := model.GetUsdcSolanaAddressByUserId(userId)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}
	if address != nil {
		_ = model.TouchUsdcSolanaAddress(address.Id)
		data["address"] = address.OwnerAddress
		data["token_account"] = address.TokenAccount
		data["pay_url"] = service.UsdcSolanaPayURL(address.OwnerAddress)
		data["held_atomic"] = address.HeldAtomic
		if address.PendingVoucherId > 0 {
			if voucher, err := model.GetUsableDepositVoucherForUser(address.PendingVoucherId, userId); err == nil {
				data["voucher"] = newUsdcSolanaVoucherView(voucher)
			}
		}
		deposits, err := model.ListUsdcSolanaDepositsByUser(userId, 20)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		data["deposits"] = deposits
	}
	common.ApiSuccess(c, data)
}

// CreateUsdcSolanaAddress creates the user's deposit address.
func CreateUsdcSolanaAddress(c *gin.Context) {
	address, err := service.EnsureUsdcSolanaAddress(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"address":       address.OwnerAddress,
		"token_account": address.TokenAccount,
		"pay_url":       service.UsdcSolanaPayURL(address.OwnerAddress),
	})
}

// CheckUsdcSolanaTransaction credits a deposit the user reports by its
// signature or explorer link, without waiting for the watcher.
func CheckUsdcSolanaTransaction(c *gin.Context) {
	var request struct {
		Signature string `json:"signature"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorT(c, "Paste a Solana transaction signature or a Solscan / Explorer link")
		return
	}
	result, err := service.CheckUsdcSolanaSignature(c.Request.Context(), c.GetInt("id"), request.Signature, c.ClientIP())
	if err != nil {
		var message *common.Message
		if errors.As(err, &message) {
			common.ApiError(c, err)
			return
		}
		common.SysError(common.LogText("usdc solana check for user %d failed: %v", c.GetInt("id"), err))
		common.ApiErrorT(c, "Could not check the transaction right now. Try again in a minute.")
		return
	}
	common.ApiSuccess(c, result)
}

// ApplyUsdcSolanaVoucher attaches a voucher to the user's next deposit.
func ApplyUsdcSolanaVoucher(c *gin.Context) {
	if !service.UsdcSolanaAvailable() {
		common.ApiError(c, service.ErrUsdcSolanaUnavailable)
		return
	}
	var request struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Code == "" {
		common.ApiErrorT(c, "Voucher code not found")
		return
	}
	voucher, err := model.ApplyDepositVoucher(c.GetInt("id"), request.Code)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, newUsdcSolanaVoucherView(voucher))
}

func RemoveUsdcSolanaVoucher(c *gin.Context) {
	if err := model.ClearDepositVoucher(c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func GetUsdcSolanaStats(c *gin.Context) {
	stats, err := model.GetUsdcSolanaStats()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"stats":     stats,
		"available": service.UsdcSolanaAvailable(),
		"status":    service.UsdcSolanaRuntimeStatus(),
	})
}

func GetDepositVouchers(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	vouchers, total, err := model.GetDepositVouchers(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(vouchers)
	common.ApiSuccess(c, pageInfo)
}

func CreateDepositVoucher(c *gin.Context) {
	var voucher model.DepositVoucher
	if err := c.ShouldBindJSON(&voucher); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.CreateDepositVoucher(&voucher); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, voucher)
}

func UpdateDepositVoucher(c *gin.Context) {
	var voucher model.DepositVoucher
	if err := c.ShouldBindJSON(&voucher); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateDepositVoucher(&voucher); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteDepositVoucher(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteDepositVoucher(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
