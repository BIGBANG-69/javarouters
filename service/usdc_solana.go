package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/solana"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

// USDC deposits on Solana.
//
// Every user gets a personal wallet (an ed25519 keypair generated here) and
// pays into that wallet's USDC token account. Two paths credit a deposit,
// and both end in model.CreditUsdcSolanaDeposit, which counts a transaction
// once per user:
//   - the watcher scans token accounts for new finalized transactions;
//   - the user pastes a signature or explorer link to have it checked now.
//
// Credited funds are later swept to the treasury wallet. The deposit
// wallet's private key is stored encrypted with SOLANA_DEPOSIT_KEY_SECRET;
// losing or changing that secret makes unswept funds unreachable.
//
// Environment:
//
//	SOLANA_DEPOSIT_KEY_SECRET  required, 32+ characters, never change it
//	SOLANA_RPC_URL             default https://solana-rpc.publicnode.com;
//	                           the admin RPC URL setting overrides it
//	SOLANA_USDC_MINT           default mainnet USDC
//	SOLANA_FEE_PAYER_KEY       base58 secret key of a wallet holding SOL that
//	                           pays sweep fees; sweeping is off without it
//	SOLANA_SWEEP_MIN_USDC      smallest balance worth a sweep, default 1

const (
	UsdcSolanaMainnetMint  = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
	usdcSolanaDecimals     = 6
	usdcSolanaKeyVersion   = 1
	usdcSolanaTick         = 15 * time.Second
	usdcSolanaScanBatch    = 20
	usdcSolanaPageSize     = 100
	usdcSolanaMaxPages     = 50
	usdcSolanaSweepPending = 120 // seconds to wait for a sent sweep to finalize
	usdcSolanaCallTimeout  = 30 * time.Second
)

var (
	ErrUsdcSolanaUnavailable   = common.NewMessage("USDC deposits are not available")
	ErrUsdcSolanaNotFinalized  = common.NewMessage("Transaction not found or not finalized yet. Try again in a minute.")
	ErrUsdcSolanaNotDeposit    = common.NewMessage("This transaction did not send USDC to your deposit address")
	ErrUsdcSolanaBadSignature  = common.NewMessage("Paste a Solana transaction signature or a Solscan / Explorer link")
	ErrUsdcSolanaNoAddress     = common.NewMessage("Create your deposit address first")
	errUsdcSolanaAmountTooHigh = errors.New("usdc deposit amount out of range")
)

type usdcSolanaRuntime struct {
	mint           solana.PublicKey
	keyCipher      cipher.AEAD
	feePayer       ed25519.PrivateKey
	sweepMinAtomic uint64
}

var (
	usdcSolanaRuntimeOnce  sync.Once
	usdcSolanaRuntimeValue *usdcSolanaRuntime
	usdcSolanaRuntimeErr   error
	usdcSolanaWatcherOnce  sync.Once
	usdcSolanaTickRunning  atomic.Bool

	usdcSolanaRpcMu     sync.Mutex
	usdcSolanaRpcURL    string
	usdcSolanaRpcClient *solana.Client
)

// UsdcSolanaPublicRpcURL is a free, keyless endpoint. The Solana Foundation's
// api.mainnet-beta.solana.com answers Go clients with 403, so it is not used.
const UsdcSolanaPublicRpcURL = "https://solana-rpc.publicnode.com"

// usdcSolanaRpcEndpoint picks the RPC endpoint: the admin setting first, then
// SOLANA_RPC_URL, then the free public endpoint. source names which one.
func usdcSolanaRpcEndpoint() (endpoint string, source string) {
	if value := strings.TrimSpace(operation_setting.GetUsdcSolanaSettingSnapshot().RpcURLSecret); value != "" && operation_setting.ValidUsdcSolanaRpcURL(value) {
		return value, "admin"
	}
	if value := strings.TrimSpace(common.GetEnvOrDefaultString("SOLANA_RPC_URL", "")); value != "" {
		return value, "env"
	}
	return UsdcSolanaPublicRpcURL, "default"
}

// rpc returns a client for the current endpoint, so an admin change applies
// on the next call without a restart.
func (r *usdcSolanaRuntime) rpc() *solana.Client {
	endpoint, _ := usdcSolanaRpcEndpoint()
	usdcSolanaRpcMu.Lock()
	defer usdcSolanaRpcMu.Unlock()
	if usdcSolanaRpcClient == nil || usdcSolanaRpcURL != endpoint {
		usdcSolanaRpcURL, usdcSolanaRpcClient = endpoint, solana.NewClient(endpoint)
	}
	return usdcSolanaRpcClient
}

func loadUsdcSolanaRuntime() (*usdcSolanaRuntime, error) {
	usdcSolanaRuntimeOnce.Do(func() {
		secret := common.GetEnvOrDefaultString("SOLANA_DEPOSIT_KEY_SECRET", "")
		if len(secret) < 32 {
			usdcSolanaRuntimeErr = errors.New("SOLANA_DEPOSIT_KEY_SECRET must be set to at least 32 characters")
			return
		}
		sum := sha256.Sum256([]byte("javarouters-usdc-solana-deposit-key:" + secret))
		block, err := aes.NewCipher(sum[:])
		if err != nil {
			usdcSolanaRuntimeErr = err
			return
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			usdcSolanaRuntimeErr = err
			return
		}
		mint, err := solana.ParsePublicKey(common.GetEnvOrDefaultString("SOLANA_USDC_MINT", UsdcSolanaMainnetMint))
		if err != nil {
			usdcSolanaRuntimeErr = fmt.Errorf("SOLANA_USDC_MINT: %w", err)
			return
		}
		runtime := &usdcSolanaRuntime{
			mint:      mint,
			keyCipher: aead,
		}
		if feePayer := strings.TrimSpace(common.GetEnvOrDefaultString("SOLANA_FEE_PAYER_KEY", "")); feePayer != "" {
			raw, err := solana.Base58Decode(feePayer)
			if err != nil || len(raw) != ed25519.PrivateKeySize {
				usdcSolanaRuntimeErr = errors.New("SOLANA_FEE_PAYER_KEY must be a base58 64-byte secret key")
				return
			}
			runtime.feePayer = ed25519.PrivateKey(raw)
		}
		sweepMin := 1.0
		if text := strings.TrimSpace(common.GetEnvOrDefaultString("SOLANA_SWEEP_MIN_USDC", "")); text != "" {
			parsed, err := strconv.ParseFloat(text, 64)
			maxSweepMin := float64(math.MaxUint64) / float64(model.UsdcSolanaAtomicPerUSD)
			if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || parsed < 0 || parsed >= maxSweepMin {
				usdcSolanaRuntimeErr = errors.New("SOLANA_SWEEP_MIN_USDC must be a non-negative finite number")
				return
			}
			sweepMin = parsed
		}
		runtime.sweepMinAtomic = uint64(sweepMin * float64(model.UsdcSolanaAtomicPerUSD))
		usdcSolanaRuntimeValue = runtime
	})
	return usdcSolanaRuntimeValue, usdcSolanaRuntimeErr
}

// UsdcSolanaAvailable reports whether users can create deposit addresses:
// the option is on, payments are confirmed and the key secret is set.
func UsdcSolanaAvailable() bool {
	if !operation_setting.GetUsdcSolanaSettingSnapshot().Enabled || !operation_setting.IsPaymentComplianceConfirmed() {
		return false
	}
	_, err := loadUsdcSolanaRuntime()
	return err == nil
}

// UsdcSolanaMint returns the configured USDC mint address.
func UsdcSolanaMint() string {
	if runtime, err := loadUsdcSolanaRuntime(); err == nil {
		return runtime.mint.String()
	}
	return common.GetEnvOrDefaultString("SOLANA_USDC_MINT", UsdcSolanaMainnetMint)
}

// UsdcSolanaPayURL is a Solana Pay transfer request wallets open directly.
func UsdcSolanaPayURL(owner string) string {
	query := url.Values{}
	query.Set("spl-token", UsdcSolanaMint())
	query.Set("label", common.SystemName)
	query.Set("message", "USDC deposit")
	return "solana:" + owner + "?" + strings.ReplaceAll(query.Encode(), "+", "%20")
}

func (r *usdcSolanaRuntime) sealKey(seed []byte, owner string) (string, error) {
	nonce := make([]byte, r.keyCipher.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := r.keyCipher.Seal(nonce, nonce, seed, []byte(owner))
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func (r *usdcSolanaRuntime) openKey(address *model.UsdcSolanaAddress) (ed25519.PrivateKey, error) {
	if address.KeyVersion != usdcSolanaKeyVersion {
		return nil, fmt.Errorf("unknown deposit key version %d", address.KeyVersion)
	}
	sealed, err := base64.StdEncoding.DecodeString(address.EncryptedKey)
	nonceSize := r.keyCipher.NonceSize()
	if err != nil || len(sealed) < nonceSize {
		return nil, errors.New("deposit key is corrupt")
	}
	seed, err := r.keyCipher.Open(nil, sealed[:nonceSize], sealed[nonceSize:], []byte(address.OwnerAddress))
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, errors.New("deposit key does not decrypt; SOLANA_DEPOSIT_KEY_SECRET changed?")
	}
	key := ed25519.NewKeyFromSeed(seed)
	if solana.Base58Encode(key.Public().(ed25519.PublicKey)) != address.OwnerAddress {
		return nil, errors.New("deposit key does not match its address")
	}
	return key, nil
}

// EnsureUsdcSolanaAddress returns userId's deposit address, creating it on
// first use.
func EnsureUsdcSolanaAddress(userId int) (*model.UsdcSolanaAddress, error) {
	if existing, err := model.GetUsdcSolanaAddressByUserId(userId); err == nil {
		return existing, nil
	}
	if !UsdcSolanaAvailable() {
		return nil, ErrUsdcSolanaUnavailable
	}
	runtime, err := loadUsdcSolanaRuntime()
	if err != nil {
		return nil, ErrUsdcSolanaUnavailable
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	owner := solana.PublicKey(public)
	tokenAccount, err := solana.AssociatedTokenAddress(owner, runtime.mint)
	if err != nil {
		return nil, err
	}
	sealed, err := runtime.sealKey(private.Seed(), owner.String())
	if err != nil {
		return nil, err
	}
	return model.CreateUsdcSolanaAddress(&model.UsdcSolanaAddress{
		UserId:       userId,
		OwnerAddress: owner.String(),
		TokenAccount: tokenAccount.String(),
		EncryptedKey: sealed,
		KeyVersion:   usdcSolanaKeyVersion,
	})
}

// CheckUsdcSolanaSignature credits the transaction the user pasted, if it
// sent USDC to their deposit address and is finalized.
func CheckUsdcSolanaSignature(ctx context.Context, userId int, input string, callerIp string) (model.UsdcSolanaCreditResult, error) {
	signature, err := solana.ParseSignature(input)
	if err != nil {
		return model.UsdcSolanaCreditResult{}, ErrUsdcSolanaBadSignature
	}
	runtime, err := loadUsdcSolanaRuntime()
	if err != nil {
		return model.UsdcSolanaCreditResult{}, ErrUsdcSolanaUnavailable
	}
	address, err := model.GetUsdcSolanaAddressByUserId(userId)
	if err != nil {
		return model.UsdcSolanaCreditResult{}, ErrUsdcSolanaNoAddress
	}
	_ = model.TouchUsdcSolanaAddress(address.Id)
	ctx, cancel := context.WithTimeout(ctx, usdcSolanaCallTimeout)
	defer cancel()
	return runtime.creditSignature(ctx, address, signature, callerIp)
}

func (r *usdcSolanaRuntime) creditSignature(ctx context.Context, address *model.UsdcSolanaAddress, signature string, callerIp string) (model.UsdcSolanaCreditResult, error) {
	tx, err := r.rpc().GetTransaction(ctx, signature)
	if err != nil {
		return model.UsdcSolanaCreditResult{}, err
	}
	if tx == nil {
		return model.UsdcSolanaCreditResult{}, ErrUsdcSolanaNotFinalized
	}
	amount := solana.IncomingTokenAmount(tx, address.TokenAccount, address.OwnerAddress, r.mint.String())
	if amount.Sign() <= 0 {
		return model.UsdcSolanaCreditResult{}, ErrUsdcSolanaNotDeposit
	}
	if !amount.IsInt64() {
		return model.UsdcSolanaCreditResult{}, errUsdcSolanaAmountTooHigh
	}
	deposit := model.UsdcSolanaDeposit{
		Signature:    signature,
		AmountAtomic: amount.Int64(),
		Slot:         int64(tx.Slot),
	}
	if tx.BlockTime != nil {
		deposit.BlockTime = *tx.BlockTime
	}
	return model.CreditUsdcSolanaDeposit(address.UserId, deposit, callerIp)
}

// StartUsdcSolanaWatcher scans deposit addresses and sweeps credited funds.
// It runs on the master node only and does nothing until the key secret is
// configured.
func StartUsdcSolanaWatcher() {
	usdcSolanaWatcherOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		if _, err := loadUsdcSolanaRuntime(); err != nil {
			if common.GetEnvOrDefaultString("SOLANA_DEPOSIT_KEY_SECRET", "") != "" {
				common.SysError(common.LogText("usdc solana watcher disabled: %v", err))
			}
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), common.LogText("usdc solana watcher started: tick=%s", usdcSolanaTick))
			ticker := time.NewTicker(usdcSolanaTick)
			defer ticker.Stop()
			for range ticker.C {
				runUsdcSolanaTick()
			}
		})
	})
}

func runUsdcSolanaTick() {
	if !usdcSolanaTickRunning.CompareAndSwap(false, true) {
		return
	}
	defer usdcSolanaTickRunning.Store(false)
	runtime, err := loadUsdcSolanaRuntime()
	if err != nil {
		return
	}
	now := common.GetTimestamp()
	addresses, err := model.ListUsdcSolanaAddressesToScan(now, usdcSolanaScanBatch)
	if err != nil {
		common.SysError(common.LogText("usdc solana scan list failed: %v", err))
		return
	}
	for i := range addresses {
		address := &addresses[i]
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		err := runtime.scanAddress(ctx, address, now)
		if err != nil {
			common.SysError(common.LogText("usdc solana scan of address %d failed: %v", address.Id, err))
			// Move a non-rate-limited failing address to the back of the queue
			// without advancing its cursor, so it retries later without starving
			// other addresses.
			if !errors.Is(err, solana.ErrRateLimited) {
				_ = model.RecordUsdcSolanaScan(address.Id, "", now)
			}
		}
		if address.NeedsSweep && !errors.Is(err, solana.ErrRateLimited) {
			if sweepErr := runtime.sweepAddress(ctx, address); sweepErr != nil {
				common.SysError(common.LogText("usdc solana sweep of address %d failed: %v", address.Id, sweepErr))
				err = sweepErr
			}
		}
		cancel()
		// A rate-limited endpoint rejects the rest of the batch too; the
		// remaining addresses keep their place and run on the next tick.
		if errors.Is(err, solana.ErrRateLimited) {
			return
		}
	}
}

// scanAddress credits every finalized transaction on the token account since
// the last scan, oldest first. The cursor only advances once all of them are
// recorded, so a failure is retried on the next tick.
func (r *usdcSolanaRuntime) scanAddress(ctx context.Context, address *model.UsdcSolanaAddress, now int64) error {
	var signatures []solana.SignatureInfo
	before := ""
	reachedEnd := false
	for range usdcSolanaMaxPages {
		batch, err := r.rpc().GetSignaturesForAddress(ctx, address.TokenAccount, address.ScanCursor, before, usdcSolanaPageSize)
		if err != nil {
			return err
		}
		signatures = append(signatures, batch...)
		if len(batch) < usdcSolanaPageSize {
			reachedEnd = true
			break
		}
		before = batch[len(batch)-1].Signature
	}
	newest := ""
	if len(signatures) > 0 {
		newest = signatures[0].Signature
	}
	for i := len(signatures) - 1; i >= 0; i-- {
		info := signatures[i]
		if info.Err != nil {
			continue
		}
		result, err := r.creditSignature(ctx, address, info.Signature, "")
		switch {
		case err == nil:
			if result.Outcome == model.UsdcSolanaOutcomeCredited || result.Outcome == model.UsdcSolanaOutcomeHeld {
				address.NeedsSweep = true
			}
		case errors.Is(err, ErrUsdcSolanaNotDeposit):
			// Outgoing sweeps and account creation touch the account too.
		default:
			return err
		}
	}
	if !reachedEnd {
		return fmt.Errorf("signature backlog exceeded %d pages; cursor not advanced", usdcSolanaMaxPages)
	}
	return model.RecordUsdcSolanaScan(address.Id, newest, now)
}

// sweepAddress moves the token account's balance to the treasury. A balance
// below SOLANA_SWEEP_MIN_USDC is left until more arrives, so tiny deposits
// cannot drain the fee payer. Sweeping is skipped without a fee payer or a
// treasury; deposits are credited either way.
func (r *usdcSolanaRuntime) sweepAddress(ctx context.Context, address *model.UsdcSolanaAddress) error {
	treasuryText := strings.TrimSpace(operation_setting.GetUsdcSolanaSettingSnapshot().TreasuryAddress)
	if r.feePayer == nil || !operation_setting.ValidUsdcSolanaTreasury(treasuryText) {
		return nil
	}
	now := common.GetTimestamp()
	if address.SweepSignature != "" && now-address.SweepSentAt < usdcSolanaSweepPending {
		return nil
	}
	latestDepositId, err := model.GetLatestUsdcSolanaDepositId(address.UserId)
	if err != nil {
		return err
	}
	balance, exists, err := r.rpc().GetTokenAccountBalance(ctx, address.TokenAccount)
	if err != nil {
		return err
	}
	if !exists || balance == 0 || balance < r.sweepMinAtomic {
		return model.ClearUsdcSolanaNeedsSweepIfNoNewDeposit(address.Id, address.UserId, latestDepositId)
	}
	ownerKey, err := r.openKey(address)
	if err != nil {
		return err
	}
	treasury, _ := solana.ParsePublicKey(treasuryText)
	owner := solana.PublicKey(ownerKey.Public().(ed25519.PublicKey))
	feePayer := solana.PublicKey(r.feePayer.Public().(ed25519.PublicKey))
	source, err := solana.ParsePublicKey(address.TokenAccount)
	if err != nil {
		return err
	}
	destination, err := solana.AssociatedTokenAddress(treasury, r.mint)
	if err != nil {
		return err
	}
	createDestination, err := solana.CreateAssociatedTokenAccountIdempotent(feePayer, treasury, r.mint)
	if err != nil {
		return err
	}
	blockhash, err := r.rpc().GetLatestBlockhash(ctx)
	if err != nil {
		return err
	}
	raw, signature, err := solana.BuildTransaction(feePayer, blockhash, []solana.Instruction{
		createDestination,
		solana.TransferChecked(source, r.mint, destination, owner, balance, usdcSolanaDecimals),
	}, []ed25519.PrivateKey{r.feePayer, ownerKey})
	if err != nil {
		return err
	}
	if _, err := r.rpc().SendTransaction(ctx, raw); err != nil {
		return err
	}
	logger.LogInfo(ctx, common.LogText("usdc solana sweep sent for address %d: %d units, tx %s", address.Id, balance, signature))
	return model.RecordUsdcSolanaSweep(address.Id, signature, now)
}

// UsdcSolanaRuntimeStatus describes the deployment configuration for the
// admin page. It never includes secrets or the RPC endpoint.
func UsdcSolanaRuntimeStatus() map[string]any {
	status := map[string]any{"configured": false, "sweeping": false}
	runtime, err := loadUsdcSolanaRuntime()
	if err != nil {
		status["error"] = err.Error()
		return status
	}
	status["configured"] = true
	status["mint"] = runtime.mint.String()
	endpoint, source := usdcSolanaRpcEndpoint()
	status["rpc_source"] = source
	// Only the host is shown: the path or query may hold a provider API key.
	if parsed, err := url.Parse(endpoint); err == nil {
		status["rpc_host"] = parsed.Host
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := runtime.rpc().GetSlot(ctx); err != nil {
		status["rpc_ok"] = false
		status["rpc_error"] = err.Error()
	} else {
		status["rpc_ok"] = true
	}
	if runtime.feePayer != nil {
		feePayer := solana.Base58Encode(runtime.feePayer.Public().(ed25519.PublicKey))
		status["fee_payer"] = feePayer
		status["sweeping"] = operation_setting.ValidUsdcSolanaTreasury(operation_setting.GetUsdcSolanaSettingSnapshot().TreasuryAddress)
		if lamports, err := runtime.rpc().GetBalance(ctx, feePayer); err == nil {
			status["fee_payer_lamports"] = lamports
		}
	}
	status["sweep_min_atomic"] = runtime.sweepMinAtomic
	return status
}
