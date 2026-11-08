package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// PublicStatsSetting controls the platform usage statistics shown on the public landing page.
// The figures are aggregated across all users and only published once the last 7 days hold at
// least MinRequests requests, so a quiet week is never put on display.
type PublicStatsSetting struct {
	Enabled     bool `json:"enabled"`
	MinRequests int  `json:"min_requests"`
}

var publicStatsSetting = PublicStatsSetting{
	Enabled:     true,
	MinRequests: 1000,
}

func init() {
	config.GlobalConfig.Register("public_stats_setting", &publicStatsSetting)
}

func GetPublicStatsSetting() *PublicStatsSetting {
	return &publicStatsSetting
}
