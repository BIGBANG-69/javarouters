package operation_setting

import (
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/solana"
	"github.com/QuantumNous/new-api/setting/config"
)

// UsdcSolanaSetting controls USDC deposits on Solana. Each user gets a
// personal deposit address; every finalized deposit is credited right away,
// with no minimum and no manual review, and later swept to TreasuryAddress.
// Keys come from the environment (SOLANA_* variables), never from these
// options. The RPC endpoint can be set here or with SOLANA_RPC_URL.
type UsdcSolanaSetting struct {
	Enabled bool `json:"enabled"`
	// TreasuryAddress is the public address of the wallet that receives swept
	// deposits. It can be a hardware or cold wallet.
	TreasuryAddress string `json:"treasury_address"`
	// RpcURLSecret overrides SOLANA_RPC_URL when set. It may carry a provider
	// API key, so its option key ends in "secret" and the options API never
	// returns it.
	RpcURLSecret string `json:"rpc_url_secret"`
}

var usdcSolanaSetting = UsdcSolanaSetting{}

func init() {
	config.GlobalConfig.Register("usdc_solana_setting", &usdcSolanaSetting)
}

func GetUsdcSolanaSetting() *UsdcSolanaSetting {
	return &usdcSolanaSetting
}

const (
	UsdcSolanaTreasuryOptionKey = "usdc_solana_setting.treasury_address"
	UsdcSolanaRpcURLOptionKey   = "usdc_solana_setting.rpc_url_secret"
	usdcSolanaRpcURLMaxLength   = 2048
)

// ValidUsdcSolanaRpcURL reports whether value is an http(s) endpoint URL.
func ValidUsdcSolanaRpcURL(value string) bool {
	if len(value) > usdcSolanaRpcURLMaxLength {
		return false
	}
	parsed, err := url.Parse(strings.TrimSpace(value))
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

// ValidUsdcSolanaTreasury reports whether address is a wallet that can own a
// token account: a base58 key on the ed25519 curve.
func ValidUsdcSolanaTreasury(address string) bool {
	key, err := solana.ParsePublicKey(strings.TrimSpace(address))
	return err == nil && key.IsOnCurve()
}

// ValidateUsdcSolanaOption rejects a treasury that is not a wallet address
// and an RPC endpoint that is not an http(s) URL. Empty values clear them.
func ValidateUsdcSolanaOption(key, value string) error {
	if key == UsdcSolanaTreasuryOptionKey && strings.TrimSpace(value) != "" && !ValidUsdcSolanaTreasury(value) {
		return common.NewMessage("Treasury must be a Solana wallet address")
	}
	if key == UsdcSolanaRpcURLOptionKey && strings.TrimSpace(value) != "" && !ValidUsdcSolanaRpcURL(value) {
		return common.NewMessage("RPC URL must start with https:// or http://")
	}
	return nil
}
