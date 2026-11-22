package solana

import (
	"errors"
	"math/big"
	"net/url"
	"strings"
)

// IncomingTokenAmount returns how many base units of mint a successful
// transaction added to tokenAccount, an account that owner holds. It reads
// the balances the runtime recorded before and after the transaction, so it
// counts plain transfers, checked transfers and transfers made inside other
// programs alike, and ignores what the instructions claim. A failed
// transaction, an account with another mint or owner, and an outgoing
// transfer all return zero.
func IncomingTokenAmount(tx *Transaction, tokenAccount, owner, mint string) *big.Int {
	zero := new(big.Int)
	if tx == nil || tx.Meta == nil || tx.Meta.Err != nil {
		return zero
	}
	index := -1
	for i, key := range tx.Transaction.Message.AccountKeys {
		if key.Pubkey == tokenAccount {
			index = i
			break
		}
	}
	if index < 0 {
		return zero
	}
	balanceAt := func(balances []TokenBalance) (*big.Int, bool) {
		for _, balance := range balances {
			if balance.AccountIndex != index {
				continue
			}
			if balance.Mint != mint || balance.Owner != owner {
				return nil, false
			}
			amount, ok := new(big.Int).SetString(balance.UITokenAmount.Amount, 10)
			if !ok || amount.Sign() < 0 {
				return nil, false
			}
			return amount, true
		}
		// No entry means the account held nothing of any mint, e.g. it was
		// created inside this transaction.
		return new(big.Int), true
	}
	after, ok := balanceAt(tx.Meta.PostTokenBalances)
	if !ok || after.Sign() == 0 {
		return zero
	}
	before, ok := balanceAt(tx.Meta.PreTokenBalances)
	if !ok {
		return zero
	}
	delta := new(big.Int).Sub(after, before)
	if delta.Sign() <= 0 {
		return zero
	}
	return delta
}

// ParseSignature accepts a base58 transaction signature or an explorer link
// that ends with one (Solscan, Solana Explorer, SolanaFM, XRAY).
func ParseSignature(input string) (string, error) {
	text := strings.TrimSpace(input)
	if strings.Contains(text, "://") {
		link, err := url.Parse(text)
		if err != nil {
			return "", errors.New("invalid link")
		}
		segments := strings.Split(strings.Trim(link.Path, "/"), "/")
		text = segments[len(segments)-1]
	}
	raw, err := Base58Decode(text)
	if err != nil || len(raw) != 64 {
		return "", errors.New("not a Solana transaction signature")
	}
	return text, nil
}
