package service

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/solana"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSolanaNode answers the JSON-RPC methods the deposit code uses.
type fakeSolanaNode struct {
	mu           sync.Mutex
	transactions map[string]string // signature -> getTransaction result JSON
	signatures   string            // getSignaturesForAddress result JSON
	tokenBalance string            // token account amount served by getAccountInfo
	sent         []string          // methods called, for sendTransaction checks
}

func (n *fakeSolanaNode) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var request struct {
		Method string `json:"method"`
		Params []any  `json:"params"`
	}
	_ = common.Unmarshal(body, &request)
	n.mu.Lock()
	defer n.mu.Unlock()
	n.sent = append(n.sent, request.Method)
	result := "null"
	switch request.Method {
	case "getTransaction":
		if tx, ok := n.transactions[request.Params[0].(string)]; ok {
			result = tx
		}
	case "getSignaturesForAddress":
		result = n.signatures
	case "getAccountInfo":
		amount, _ := strconv.ParseUint(n.tokenBalance, 10, 64)
		data := make([]byte, 165)
		binary.LittleEndian.PutUint64(data[64:72], amount)
		result = fmt.Sprintf(`{"value":{"data":[%q,"base64"],"owner":%q}}`, base64.StdEncoding.EncodeToString(data), solana.TokenProgramID.String())
	case "getLatestBlockhash":
		result = fmt.Sprintf(`{"value":{"blockhash":%q}}`, solana.Base58Encode(make([]byte, 32)))
	case "sendTransaction":
		result = `"sent"`
	case "getBalance":
		result = `{"value":5000000}`
	}
	_, _ = fmt.Fprintf(w, `{"jsonrpc":"2.0","id":1,"result":%s}`, result)
}

func randomSignature(t *testing.T) string {
	t.Helper()
	raw := make([]byte, 64)
	_, err := rand.Read(raw)
	require.NoError(t, err)
	return solana.Base58Encode(raw)
}

func depositTransactionJSON(tokenAccount, owner, mint, amount string) string {
	return fmt.Sprintf(`{"slot":10,"blockTime":1794013292,
		"meta":{"err":null,"preTokenBalances":[],"postTokenBalances":[{"accountIndex":1,"mint":%q,"owner":%q,"uiTokenAmount":{"amount":%q,"decimals":6}}]},
		"transaction":{"signatures":["x"],"message":{"accountKeys":[{"pubkey":"payer"},{"pubkey":%q}]}}}`,
		mint, owner, amount, tokenAccount)
}

func setupUsdcSolanaTest(t *testing.T, node *fakeSolanaNode, feePayer string) {
	t.Helper()
	server := httptest.NewServer(node)
	t.Cleanup(server.Close)
	t.Setenv("SOLANA_DEPOSIT_KEY_SECRET", strings.Repeat("k", 40))
	t.Setenv("SOLANA_RPC_URL", server.URL)
	t.Setenv("SOLANA_FEE_PAYER_KEY", feePayer)
	usdcSolanaRuntimeOnce = sync.Once{}
	t.Cleanup(func() { usdcSolanaRuntimeOnce = sync.Once{} })

	setting := operation_setting.GetUsdcSolanaSetting()
	payment := operation_setting.GetPaymentSetting()
	savedSetting, savedPayment := *setting, *payment
	t.Cleanup(func() { *setting, *payment = savedSetting, savedPayment })
	setting.Enabled = true
	payment.ComplianceConfirmed = true
	payment.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM usdc_solana_addresses")
		model.DB.Exec("DELETE FROM usdc_solana_deposits")
		model.DB.Exec("DELETE FROM top_ups")
		model.DB.Exec("DELETE FROM users")
		model.DB.Exec("DELETE FROM logs")
	})
	require.NoError(t, model.DB.Create(&model.User{Id: 701, Username: "usdc_service_user", AffCode: "usdcsvc", Status: common.UserStatusEnabled}).Error)
}

func TestUsdcSolanaSignatureCheckAndScan(t *testing.T) {
	node := &fakeSolanaNode{transactions: map[string]string{}}
	setupUsdcSolanaTest(t, node, "")

	address, err := EnsureUsdcSolanaAddress(701)
	require.NoError(t, err)
	again, err := EnsureUsdcSolanaAddress(701)
	require.NoError(t, err)
	assert.Equal(t, address.OwnerAddress, again.OwnerAddress, "one address per user")
	assert.Contains(t, UsdcSolanaPayURL(address.OwnerAddress), "solana:"+address.OwnerAddress+"?")

	runtime, err := loadUsdcSolanaRuntime()
	require.NoError(t, err)
	stored, err := model.GetUsdcSolanaAddressByUserId(701)
	require.NoError(t, err)
	key, err := runtime.openKey(stored)
	require.NoError(t, err)
	assert.Equal(t, address.OwnerAddress, solana.Base58Encode(key.Public().(ed25519.PublicKey)))
	owner := solana.MustPublicKey(address.OwnerAddress)
	tokenAccount, err := solana.AssociatedTokenAddress(owner, solana.MustPublicKey(UsdcSolanaMainnetMint))
	require.NoError(t, err)
	assert.Equal(t, tokenAccount.String(), address.TokenAccount)

	// A pasted Solscan link to a finalized deposit is credited once.
	signature := randomSignature(t)
	node.transactions[signature] = depositTransactionJSON(address.TokenAccount, address.OwnerAddress, UsdcSolanaMainnetMint, "2500000")
	result, err := CheckUsdcSolanaSignature(context.Background(), 701, "https://solscan.io/tx/"+signature, "")
	require.NoError(t, err)
	assert.Equal(t, model.UsdcSolanaOutcomeCredited, result.Outcome)
	assert.Equal(t, 1250000, result.Quota)
	result, err = CheckUsdcSolanaSignature(context.Background(), 701, signature, "")
	require.NoError(t, err)
	assert.Equal(t, model.UsdcSolanaOutcomeDuplicate, result.Outcome)

	_, err = CheckUsdcSolanaSignature(context.Background(), 701, randomSignature(t), "")
	assert.ErrorIs(t, err, ErrUsdcSolanaNotFinalized)
	_, err = CheckUsdcSolanaSignature(context.Background(), 701, "not-a-signature", "")
	assert.ErrorIs(t, err, ErrUsdcSolanaBadSignature)
	stranger := randomSignature(t)
	node.transactions[stranger] = depositTransactionJSON("someone-else", address.OwnerAddress, UsdcSolanaMainnetMint, "9000000")
	_, err = CheckUsdcSolanaSignature(context.Background(), 701, stranger, "")
	assert.ErrorIs(t, err, ErrUsdcSolanaNotDeposit)

	// The watcher finds a deposit nobody reported, and skips the one already credited.
	watched := randomSignature(t)
	node.transactions[watched] = depositTransactionJSON(address.TokenAccount, address.OwnerAddress, UsdcSolanaMainnetMint, "1000000")
	node.signatures = fmt.Sprintf(`[{"signature":%q,"slot":11,"err":null},{"signature":%q,"slot":10,"err":null}]`, watched, signature)
	require.NoError(t, runtime.scanAddress(context.Background(), stored, common.GetTimestamp()))
	var user model.User
	require.NoError(t, model.DB.Select("quota").First(&user, "id = ?", 701).Error)
	assert.Equal(t, 1250000+500000, user.Quota)
	stored, err = model.GetUsdcSolanaAddressByUserId(701)
	require.NoError(t, err)
	assert.Equal(t, watched, stored.ScanCursor)
}

func TestUsdcSolanaSweep(t *testing.T) {
	_, feePayer, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	treasury, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	node := &fakeSolanaNode{transactions: map[string]string{}, tokenBalance: "500000"}
	setupUsdcSolanaTest(t, node, solana.Base58Encode(feePayer))
	operation_setting.GetUsdcSolanaSetting().TreasuryAddress = solana.Base58Encode(treasury)

	address, err := EnsureUsdcSolanaAddress(701)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.UsdcSolanaAddress{}).Where("id = ?", address.Id).Update("needs_sweep", true).Error)
	runtime, err := loadUsdcSolanaRuntime()
	require.NoError(t, err)

	// Below the sweep minimum (1 USDC): nothing is sent and the flag clears.
	stored, _ := model.GetUsdcSolanaAddressByUserId(701)
	require.NoError(t, runtime.sweepAddress(context.Background(), stored))
	assert.NotContains(t, node.sent, "sendTransaction")
	stored, _ = model.GetUsdcSolanaAddressByUserId(701)
	assert.False(t, stored.NeedsSweep)

	node.tokenBalance = "3500000"
	require.NoError(t, runtime.sweepAddress(context.Background(), stored))
	assert.Contains(t, node.sent, "sendTransaction")
	stored, _ = model.GetUsdcSolanaAddressByUserId(701)
	assert.NotEmpty(t, stored.SweepSignature)

	status := UsdcSolanaRuntimeStatus()
	assert.Equal(t, true, status["sweeping"])
	assert.NotContains(t, fmt.Sprint(status), solana.Base58Encode(feePayer), "the secret key is never shown")
}

func TestUsdcSolanaRpcEndpointPrecedence(t *testing.T) {
	setting := operation_setting.GetUsdcSolanaSetting()
	saved := *setting
	t.Cleanup(func() { *setting = saved })

	setting.RpcURLSecret = ""
	t.Setenv("SOLANA_RPC_URL", "")
	endpoint, source := usdcSolanaRpcEndpoint()
	require.Equal(t, UsdcSolanaPublicRpcURL, endpoint)
	require.Equal(t, "default", source)

	t.Setenv("SOLANA_RPC_URL", "https://env.example/rpc")
	endpoint, source = usdcSolanaRpcEndpoint()
	require.Equal(t, "https://env.example/rpc", endpoint)
	require.Equal(t, "env", source)

	setting.RpcURLSecret = "https://admin.example/?api-key=x"
	endpoint, source = usdcSolanaRpcEndpoint()
	require.Equal(t, "https://admin.example/?api-key=x", endpoint)
	require.Equal(t, "admin", source)

	// An invalid stored value falls back instead of breaking the watcher.
	setting.RpcURLSecret = "not a url"
	_, source = usdcSolanaRpcEndpoint()
	require.Equal(t, "env", source)

	// The cached client follows a change of endpoint.
	runtime := &usdcSolanaRuntime{}
	setting.RpcURLSecret = "https://one.example"
	first := runtime.rpc()
	require.Same(t, first, runtime.rpc())
	setting.RpcURLSecret = "https://two.example"
	require.NotSame(t, first, runtime.rpc())
}

func TestUsdcSolanaSweepMinValidation(t *testing.T) {
	t.Setenv("SOLANA_DEPOSIT_KEY_SECRET", strings.Repeat("k", 40))
	for _, invalid := range []string{"Inf", "+Inf", "-1", "10abc", "NaN"} {
		t.Run(invalid, func(t *testing.T) {
			t.Setenv("SOLANA_SWEEP_MIN_USDC", invalid)
			usdcSolanaRuntimeOnce = sync.Once{}
			usdcSolanaRuntimeValue = nil
			usdcSolanaRuntimeErr = nil
			t.Cleanup(func() {
				usdcSolanaRuntimeOnce = sync.Once{}
				usdcSolanaRuntimeValue = nil
				usdcSolanaRuntimeErr = nil
			})
			_, err := loadUsdcSolanaRuntime()
			require.Error(t, err)
		})
	}
}
