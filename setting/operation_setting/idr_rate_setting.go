package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

const (
	// IDRRateModeAuto uses the ECB reference rate fetched by the IDR rate refresher.
	IDRRateModeAuto = "auto"
	// IDRRateModeManual uses ManualRate set by the administrator.
	IDRRateModeManual = "manual"
)

// IDRRateSetting chooses the USD to IDR rate used to show Rupiah estimates on the public
// price page. It is display-only: balances, prices and billing stay in USD.
type IDRRateSetting struct {
	Mode       string  `json:"mode"`
	ManualRate float64 `json:"manual_rate"`
}

var idrRateSetting = IDRRateSetting{
	Mode:       IDRRateModeAuto,
	ManualRate: 0,
}

func init() {
	config.GlobalConfig.Register("idr_rate_setting", &idrRateSetting)
}

func GetIDRRateSetting() *IDRRateSetting {
	return &idrRateSetting
}
