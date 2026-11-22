package solana

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var usdcMint = MustPublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

func newKey(t *testing.T) (PublicKey, ed25519.PrivateKey) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	var key PublicKey
	copy(key[:], public)
	return key, private
}

func TestBase58RoundTripKeepsLeadingZeros(t *testing.T) {
	for _, data := range [][]byte{{0}, {0, 0, 1, 2}, {255, 254}, make([]byte, 32), bytes.Repeat([]byte{7}, 64)} {
		decoded, err := Base58Decode(Base58Encode(data))
		require.NoError(t, err)
		assert.Equal(t, data, decoded)
	}
	assert.Equal(t, PublicKey{}, SystemProgramID)
	_, err := Base58Decode("0OIl")
	assert.Error(t, err)
	_, err = ParsePublicKey("abc")
	assert.Error(t, err)
}

func TestAssociatedTokenAddress(t *testing.T) {
	// Derivation was checked against token accounts that exist on mainnet.
	address, err := AssociatedTokenAddress(SystemProgramID, usdcMint)
	require.NoError(t, err)
	assert.Equal(t, "HJt8Tjdsc9ms9i4WCZEzhzr4oyf3ANcdzXrNdLPFqm3M", address.String())
	assert.False(t, address.IsOnCurve(), "program-derived addresses are off the curve")

	wallet, _ := newKey(t)
	assert.True(t, wallet.IsOnCurve(), "ed25519 wallets are on the curve")
}

// transactionJSON shapes a jsonParsed getTransaction result around the
// accounts and balances a test needs.
func transactionJSON(failed bool, keys []string, pre, post string) string {
	keyJSON := ""
	for i, key := range keys {
		if i > 0 {
			keyJSON += ","
		}
		keyJSON += fmt.Sprintf(`{"pubkey":%q,"signer":%t,"writable":true}`, key, i == 0)
	}
	errJSON := "null"
	if failed {
		errJSON = `{"InstructionError":[1,{"Custom":1}]}`
	}
	return fmt.Sprintf(`{"slot":466319958,"blockTime":1794013292,
		"meta":{"err":%s,"preTokenBalances":[%s],"postTokenBalances":[%s]},
		"transaction":{"signatures":["sig"],"message":{"accountKeys":[%s]}}}`, errJSON, pre, post, keyJSON)
}

func tokenBalanceJSON(index int, mint, owner, amount string) string {
	return fmt.Sprintf(`{"accountIndex":%d,"mint":%q,"owner":%q,"uiTokenAmount":{"amount":%q,"decimals":6}}`, index, mint, owner, amount)
}

func TestIncomingTokenAmount(t *testing.T) {
	sender, _ := newKey(t)
	owner, _ := newKey(t)
	stranger, _ := newKey(t)
	senderAccount, err := AssociatedTokenAddress(sender, usdcMint)
	require.NoError(t, err)
	depositAccount, err := AssociatedTokenAddress(owner, usdcMint)
	require.NoError(t, err)
	fakeMint, _ := newKey(t)
	mint := usdcMint.String()
	keys := []string{sender.String(), senderAccount.String(), depositAccount.String(), usdcMint.String()}

	senderBefore := tokenBalanceJSON(1, mint, sender.String(), "10958194")
	senderAfter := tokenBalanceJSON(1, mint, sender.String(), "8218647")
	cases := []struct {
		name    string
		tx      string
		account PublicKey
		want    int64
	}{
		{"deposit creates the account", transactionJSON(false, keys, senderBefore,
			senderAfter+","+tokenBalanceJSON(2, mint, owner.String(), "2739547")), depositAccount, 2739547},
		{"deposit adds to a balance", transactionJSON(false, keys,
			tokenBalanceJSON(2, mint, owner.String(), "1000000"),
			tokenBalanceJSON(2, mint, owner.String(), "6000000")), depositAccount, 5000000},
		{"another mint named USDC", transactionJSON(false, keys, "",
			tokenBalanceJSON(2, fakeMint.String(), owner.String(), "9000000")), depositAccount, 0},
		{"account held by another owner", transactionJSON(false, keys, "",
			tokenBalanceJSON(2, mint, stranger.String(), "9000000")), depositAccount, 0},
		{"failed transaction", transactionJSON(true, keys, "",
			tokenBalanceJSON(2, mint, owner.String(), "9000000")), depositAccount, 0},
		{"outgoing transfer", transactionJSON(false, keys, senderBefore, senderAfter), senderAccount, 0},
		{"account not in the transaction", transactionJSON(false, keys[:2], senderBefore, senderAfter), depositAccount, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var tx Transaction
			require.NoError(t, common.UnmarshalJsonStr(tc.tx, &tx))
			accountOwner := owner
			if tc.account == senderAccount {
				accountOwner = sender
			}
			got := IncomingTokenAmount(&tx, tc.account.String(), accountOwner.String(), mint)
			assert.Equal(t, tc.want, got.Int64())
		})
	}
	assert.Zero(t, IncomingTokenAmount(nil, depositAccount.String(), owner.String(), mint).Sign())
}

func TestParseSignature(t *testing.T) {
	signature := Base58Encode(bytes.Repeat([]byte{9}, 64))
	for _, input := range []string{
		signature,
		"  " + signature + "\n",
		"https://solscan.io/tx/" + signature,
		"https://explorer.solana.com/tx/" + signature + "?cluster=devnet",
		"https://solscan.io/tx/" + signature + "/",
	} {
		got, err := ParseSignature(input)
		require.NoError(t, err, input)
		assert.Equal(t, signature, got)
	}
	for _, input := range []string{"", "not-a-signature", Base58Encode(bytes.Repeat([]byte{9}, 32)), "https://solscan.io/account/abc"} {
		_, err := ParseSignature(input)
		assert.Error(t, err, input)
	}
}

func TestBuildSweepTransaction(t *testing.T) {
	feePayer, feePayerKey := newKey(t)
	depositOwner, depositKey := newKey(t)
	treasury, _ := newKey(t)
	source, err := AssociatedTokenAddress(depositOwner, usdcMint)
	require.NoError(t, err)
	destination, err := AssociatedTokenAddress(treasury, usdcMint)
	require.NoError(t, err)
	create, err := CreateAssociatedTokenAccountIdempotent(feePayer, treasury, usdcMint)
	require.NoError(t, err)
	instructions := []Instruction{create, TransferChecked(source, usdcMint, destination, depositOwner, 2739547, 6)}
	blockhash := Base58Encode(bytes.Repeat([]byte{3}, 32))

	raw, signature, err := BuildTransaction(feePayer, blockhash, instructions, []ed25519.PrivateKey{depositKey, feePayerKey})
	require.NoError(t, err)

	require.Equal(t, byte(2), raw[0], "two signatures")
	message := raw[1+2*ed25519.SignatureSize:]
	assert.Equal(t, []byte{2, 1, 5}, message[:3], "2 signers, 1 read-only signer, 5 read-only accounts")
	require.Equal(t, byte(9), message[3])
	keyAt := func(i int) PublicKey {
		var key PublicKey
		copy(key[:], message[4+i*32:])
		return key
	}
	assert.Equal(t, feePayer, keyAt(0), "fee payer first")
	assert.Equal(t, depositOwner, keyAt(1), "read-only signer second")
	assert.Equal(t, blockhash, Base58Encode(message[4+9*32:4+10*32]))
	assert.True(t, ed25519.Verify(ed25519.PublicKey(feePayer[:]), message, raw[1:65]))
	assert.True(t, ed25519.Verify(ed25519.PublicKey(depositOwner[:]), message, raw[65:129]))
	assert.Equal(t, Base58Encode(raw[1:65]), signature)

	_, _, err = BuildTransaction(feePayer, blockhash, instructions, []ed25519.PrivateKey{feePayerKey})
	assert.ErrorContains(t, err, "missing signer")
}

func TestRPCReportsRateLimitAsErrRateLimited(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	_, err := NewClient(server.URL).GetTransaction(context.Background(), "sig")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrRateLimited))
}

func TestGetTokenAccountBalanceReadsRawAccount(t *testing.T) {
	data := make([]byte, 165)
	data[64], data[65] = 0x40, 0x42 // 0x4240 = 16960
	var reply string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(reply))
	}))
	defer server.Close()
	client := NewClient(server.URL)
	ctx := context.Background()

	reply = `{"jsonrpc":"2.0","id":1,"result":{"value":{"data":["` + base64.StdEncoding.EncodeToString(data) + `","base64"],"owner":"` + TokenProgramID.String() + `"}}}`
	amount, exists, err := client.GetTokenAccountBalance(ctx, "x")
	if err != nil || !exists || amount != 16960 {
		t.Fatalf("got %d %v %v, want 16960 true nil", amount, exists, err)
	}

	reply = `{"jsonrpc":"2.0","id":1,"result":{"value":null}}`
	if _, exists, err := client.GetTokenAccountBalance(ctx, "x"); err != nil || exists {
		t.Fatalf("missing account: got exists=%v err=%v", exists, err)
	}

	reply = `{"jsonrpc":"2.0","id":1,"result":{"value":{"data":["","base64"],"owner":"11111111111111111111111111111111"}}}`
	if _, _, err := client.GetTokenAccountBalance(ctx, "x"); err == nil {
		t.Fatal("an account owned by another program must be rejected")
	}
}
