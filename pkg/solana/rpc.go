package solana

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// Client is a minimal Solana JSON-RPC client. Reads use the finalized
// commitment, so nothing it reports can be rolled back.
type Client struct {
	endpoint string
	http     *http.Client
}

func NewClient(endpoint string) *Client {
	return &Client{endpoint: endpoint, http: &http.Client{Timeout: 20 * time.Second}}
}

// ErrRateLimited means the endpoint answered HTTP 429. Free public endpoints
// do this often; callers should back off instead of retrying at once.
var ErrRateLimited = errors.New("rate limited")

// RPCError is an error object returned by the node.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *RPCError) Error() string {
	return fmt.Sprintf("solana rpc error %d: %s", e.Code, e.Message)
}

func (c *Client) call(ctx context.Context, method string, params []any, result any) error {
	body, err := common.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		// The endpoint URL may carry an API key; never echo it.
		return fmt.Errorf("solana rpc %s: request failed", method)
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return err
	}
	if response.StatusCode == http.StatusTooManyRequests {
		return fmt.Errorf("solana rpc %s: %w", method, ErrRateLimited)
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("solana rpc %s: http %d", method, response.StatusCode)
	}
	var envelope struct {
		Result common.RawMessage `json:"result"`
		Error  *RPCError         `json:"error"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return fmt.Errorf("solana rpc %s: %w", method, err)
	}
	if envelope.Error != nil {
		return envelope.Error
	}
	if result == nil {
		return nil
	}
	return common.Unmarshal(envelope.Result, result)
}

// SignatureInfo is one entry of getSignaturesForAddress.
type SignatureInfo struct {
	Signature string `json:"signature"`
	Slot      uint64 `json:"slot"`
	Err       any    `json:"err"`
	BlockTime *int64 `json:"blockTime"`
}

// GetSignaturesForAddress lists finalized signatures touching address,
// newest first. until stops before that signature; before pages backwards.
func (c *Client) GetSignaturesForAddress(ctx context.Context, address string, until string, before string, limit int) ([]SignatureInfo, error) {
	options := map[string]any{"commitment": "finalized", "limit": limit}
	if until != "" {
		options["until"] = until
	}
	if before != "" {
		options["before"] = before
	}
	var result []SignatureInfo
	err := c.call(ctx, "getSignaturesForAddress", []any{address, options}, &result)
	return result, err
}

// TokenBalance is a pre- or post-transaction token balance.
type TokenBalance struct {
	AccountIndex  int    `json:"accountIndex"`
	Mint          string `json:"mint"`
	Owner         string `json:"owner"`
	UITokenAmount struct {
		Amount   string `json:"amount"`
		Decimals int    `json:"decimals"`
	} `json:"uiTokenAmount"`
}

// Transaction is the part of a jsonParsed getTransaction result that deposit
// detection reads. AccountKeys include addresses loaded from lookup tables.
type Transaction struct {
	Slot      uint64 `json:"slot"`
	BlockTime *int64 `json:"blockTime"`
	Meta      *struct {
		Err               any            `json:"err"`
		PreTokenBalances  []TokenBalance `json:"preTokenBalances"`
		PostTokenBalances []TokenBalance `json:"postTokenBalances"`
	} `json:"meta"`
	Transaction struct {
		Signatures []string `json:"signatures"`
		Message    struct {
			AccountKeys []struct {
				Pubkey string `json:"pubkey"`
			} `json:"accountKeys"`
		} `json:"message"`
	} `json:"transaction"`
}

// GetTransaction returns a finalized transaction, or nil when the node does
// not have it (not finalized yet, or unknown).
func (c *Client) GetTransaction(ctx context.Context, signature string) (*Transaction, error) {
	var result *Transaction
	err := c.call(ctx, "getTransaction", []any{signature, map[string]any{
		"commitment": "finalized",
		"encoding":   "jsonParsed",
		// Version 1 transactions are live on mainnet; asking for less makes the
		// node refuse them, and a deposit sent in one would never be seen.
		"maxSupportedTransactionVersion": 1,
	}}, &result)
	return result, err
}

// GetLatestBlockhash returns a blockhash to build a transaction against.
func (c *Client) GetLatestBlockhash(ctx context.Context) (string, error) {
	var result struct {
		Value struct {
			Blockhash string `json:"blockhash"`
		} `json:"value"`
	}
	if err := c.call(ctx, "getLatestBlockhash", []any{map[string]any{"commitment": "finalized"}}, &result); err != nil {
		return "", err
	}
	if result.Value.Blockhash == "" {
		return "", errors.New("empty blockhash")
	}
	return result.Value.Blockhash, nil
}

// SendTransaction submits signed wire bytes and returns the signature.
func (c *Client) SendTransaction(ctx context.Context, raw []byte) (string, error) {
	var signature string
	err := c.call(ctx, "sendTransaction", []any{
		base64.StdEncoding.EncodeToString(raw),
		map[string]any{"encoding": "base64", "preflightCommitment": "confirmed"},
	}, &signature)
	return signature, err
}

// GetSlot returns the latest finalized slot; it doubles as a health check.
func (c *Client) GetSlot(ctx context.Context) (uint64, error) {
	var slot uint64
	err := c.call(ctx, "getSlot", []any{map[string]any{"commitment": "finalized"}}, &slot)
	return slot, err
}

// GetBalance returns an account's SOL balance in lamports.
func (c *Client) GetBalance(ctx context.Context, address string) (uint64, error) {
	var result struct {
		Value uint64 `json:"value"`
	}
	err := c.call(ctx, "getBalance", []any{address, map[string]any{"commitment": "finalized"}}, &result)
	return result.Value, err
}

// GetTokenAccountBalance returns a token account's balance in base units, and
// false when the account does not exist. It reads the raw account with
// getAccountInfo rather than getTokenAccountBalance, which some free RPC
// endpoints block. An SPL token account holds the amount as a little-endian
// u64 at bytes 64..72, after the mint and owner keys.
func (c *Client) GetTokenAccountBalance(ctx context.Context, address string) (uint64, bool, error) {
	var result struct {
		Value *struct {
			Data  []string `json:"data"`
			Owner string   `json:"owner"`
		} `json:"value"`
	}
	err := c.call(ctx, "getAccountInfo", []any{address, map[string]any{"commitment": "finalized", "encoding": "base64"}}, &result)
	if err != nil {
		return 0, false, err
	}
	if result.Value == nil {
		return 0, false, nil
	}
	if result.Value.Owner != TokenProgramID.String() || len(result.Value.Data) == 0 {
		return 0, false, fmt.Errorf("%s is not a token account", address)
	}
	data, err := base64.StdEncoding.DecodeString(result.Value.Data[0])
	if err != nil || len(data) < 72 {
		return 0, false, fmt.Errorf("%s has invalid token account data", address)
	}
	return binary.LittleEndian.Uint64(data[64:72]), true, nil
}
