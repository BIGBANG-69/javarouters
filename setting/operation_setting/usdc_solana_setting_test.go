package operation_setting

import "testing"

func TestValidateUsdcSolanaRpcURL(t *testing.T) {
	for value, ok := range map[string]bool{
		"":                                    true, // empty falls back to the env/default endpoint
		"https://api.mainnet-beta.solana.com": true,
		"https://mainnet.helius-rpc.com/?api-key=abc": true,
		"http://127.0.0.1:8899":                       true,
		"api.mainnet-beta.solana.com":                 false,
		"ftp://example.com":                           false,
		"https://":                                    false,
	} {
		err := ValidateUsdcSolanaOption(UsdcSolanaRpcURLOptionKey, value)
		if (err == nil) != ok {
			t.Errorf("%q: got err=%v, want ok=%v", value, err, ok)
		}
	}
}
