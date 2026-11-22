// Package solana is the small part of the Solana protocol that JavaRouters
// needs to take USDC deposits: base58 keys, associated token accounts, legacy
// transactions with token transfers, and a JSON-RPC client.
package solana

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"

	"filippo.io/edwards25519"
)

const PublicKeyLength = 32

// PublicKey is a 32-byte Solana account address.
type PublicKey [PublicKeyLength]byte

var (
	SystemProgramID          = MustPublicKey("11111111111111111111111111111111")
	TokenProgramID           = MustPublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
	AssociatedTokenProgramID = MustPublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
)

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

var base58Index = func() [256]int {
	var index [256]int
	for i := range index {
		index[i] = -1
	}
	for i := range len(base58Alphabet) {
		index[base58Alphabet[i]] = i
	}
	return index
}()

// Base58Encode encodes bytes with the Bitcoin alphabet that Solana uses.
func Base58Encode(data []byte) string {
	zeros := 0
	for zeros < len(data) && data[zeros] == 0 {
		zeros++
	}
	value := new(big.Int).SetBytes(data)
	radix := big.NewInt(58)
	mod := new(big.Int)
	encoded := make([]byte, 0, len(data)*138/100+1)
	for value.Sign() > 0 {
		value.DivMod(value, radix, mod)
		encoded = append(encoded, base58Alphabet[mod.Int64()])
	}
	for range zeros {
		encoded = append(encoded, base58Alphabet[0])
	}
	for i, j := 0, len(encoded)-1; i < j; i, j = i+1, j-1 {
		encoded[i], encoded[j] = encoded[j], encoded[i]
	}
	return string(encoded)
}

// Base58Decode decodes a base58 string, keeping leading zero bytes.
func Base58Decode(text string) ([]byte, error) {
	if text == "" {
		return nil, errors.New("empty base58 string")
	}
	value := new(big.Int)
	radix := big.NewInt(58)
	for i := range len(text) {
		digit := base58Index[text[i]]
		if digit < 0 {
			return nil, fmt.Errorf("invalid base58 character %q", text[i])
		}
		value.Mul(value, radix)
		value.Add(value, big.NewInt(int64(digit)))
	}
	zeros := 0
	for zeros < len(text) && text[zeros] == base58Alphabet[0] {
		zeros++
	}
	decoded := value.Bytes()
	out := make([]byte, zeros+len(decoded))
	copy(out[zeros:], decoded)
	return out, nil
}

// ParsePublicKey decodes a base58 account address.
func ParsePublicKey(text string) (PublicKey, error) {
	var key PublicKey
	raw, err := Base58Decode(text)
	if err != nil {
		return key, err
	}
	if len(raw) != PublicKeyLength {
		return key, fmt.Errorf("public key must be %d bytes, got %d", PublicKeyLength, len(raw))
	}
	copy(key[:], raw)
	return key, nil
}

func MustPublicKey(text string) PublicKey {
	key, err := ParsePublicKey(text)
	if err != nil {
		panic(err)
	}
	return key
}

func (key PublicKey) String() string {
	return Base58Encode(key[:])
}

// IsOnCurve reports whether the key is a valid ed25519 point, i.e. an address
// that a private key can sign for. Program-derived addresses are off the curve.
func (key PublicKey) IsOnCurve() bool {
	_, err := new(edwards25519.Point).SetBytes(key[:])
	return err == nil
}

// FindProgramAddress derives the program address for seeds, trying bump seeds
// from 255 down until the hash falls off the ed25519 curve.
func FindProgramAddress(seeds [][]byte, programID PublicKey) (PublicKey, uint8, error) {
	for bump := 255; bump >= 0; bump-- {
		hasher := sha256.New()
		for _, seed := range seeds {
			hasher.Write(seed)
		}
		hasher.Write([]byte{byte(bump)})
		hasher.Write(programID[:])
		hasher.Write([]byte("ProgramDerivedAddress"))
		var candidate PublicKey
		copy(candidate[:], hasher.Sum(nil))
		if !candidate.IsOnCurve() {
			return candidate, uint8(bump), nil
		}
	}
	return PublicKey{}, 0, errors.New("no viable program address bump seed")
}

// AssociatedTokenAddress is the canonical token account that wallets and
// exchanges send a mint to when given the owner's address.
func AssociatedTokenAddress(owner PublicKey, mint PublicKey) (PublicKey, error) {
	address, _, err := FindProgramAddress(
		[][]byte{owner[:], TokenProgramID[:], mint[:]},
		AssociatedTokenProgramID,
	)
	return address, err
}
