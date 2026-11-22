package solana

import (
	"bytes"
	"crypto/ed25519"
	"encoding/binary"
	"errors"
	"fmt"
)

// AccountMeta is one account an instruction reads or writes.
type AccountMeta struct {
	PublicKey  PublicKey
	IsSigner   bool
	IsWritable bool
}

// Instruction is one program call inside a transaction.
type Instruction struct {
	ProgramID PublicKey
	Accounts  []AccountMeta
	Data      []byte
}

// CreateAssociatedTokenAccountIdempotent creates owner's token account for
// mint, or does nothing when it already exists. payer funds the rent.
func CreateAssociatedTokenAccountIdempotent(payer, owner, mint PublicKey) (Instruction, error) {
	tokenAccount, err := AssociatedTokenAddress(owner, mint)
	if err != nil {
		return Instruction{}, err
	}
	return Instruction{
		ProgramID: AssociatedTokenProgramID,
		Accounts: []AccountMeta{
			{PublicKey: payer, IsSigner: true, IsWritable: true},
			{PublicKey: tokenAccount, IsWritable: true},
			{PublicKey: owner},
			{PublicKey: mint},
			{PublicKey: SystemProgramID},
			{PublicKey: TokenProgramID},
		},
		Data: []byte{1},
	}, nil
}

// TransferChecked moves amount base units of mint from source to destination.
func TransferChecked(source, mint, destination, owner PublicKey, amount uint64, decimals uint8) Instruction {
	data := make([]byte, 10)
	data[0] = 12
	binary.LittleEndian.PutUint64(data[1:9], amount)
	data[9] = decimals
	return Instruction{
		ProgramID: TokenProgramID,
		Accounts: []AccountMeta{
			{PublicKey: source, IsWritable: true},
			{PublicKey: mint},
			{PublicKey: destination, IsWritable: true},
			{PublicKey: owner, IsSigner: true},
		},
		Data: data,
	}
}

// BuildTransaction compiles a legacy transaction and signs it. feePayer pays
// the network fee and must be among signers; every signer an instruction
// requires must be supplied. It returns the wire bytes and the transaction
// signature (the fee payer's signature, base58).
func BuildTransaction(feePayer PublicKey, recentBlockhash string, instructions []Instruction, signers []ed25519.PrivateKey) ([]byte, string, error) {
	blockhash, err := ParsePublicKey(recentBlockhash)
	if err != nil {
		return nil, "", fmt.Errorf("invalid blockhash: %w", err)
	}

	type keyFlags struct{ signer, writable bool }
	flags := map[PublicKey]*keyFlags{feePayer: {signer: true, writable: true}}
	order := []PublicKey{feePayer}
	mark := func(key PublicKey, signer, writable bool) {
		entry, ok := flags[key]
		if !ok {
			entry = &keyFlags{}
			flags[key] = entry
			order = append(order, key)
		}
		entry.signer = entry.signer || signer
		entry.writable = entry.writable || writable
	}
	for _, instruction := range instructions {
		for _, account := range instruction.Accounts {
			mark(account.PublicKey, account.IsSigner, account.IsWritable)
		}
		mark(instruction.ProgramID, false, false)
	}

	// Signers first, writable before read-only within each group; the fee
	// payer stays at index 0.
	var keys []PublicKey
	for _, group := range []keyFlags{{true, true}, {true, false}, {false, true}, {false, false}} {
		for _, key := range order {
			if *flags[key] == group {
				keys = append(keys, key)
			}
		}
	}
	index := make(map[PublicKey]int, len(keys))
	numSigners, readonlySigned, readonlyUnsigned := 0, 0, 0
	for i, key := range keys {
		index[key] = i
		entry := flags[key]
		if entry.signer {
			numSigners++
			if !entry.writable {
				readonlySigned++
			}
		} else if !entry.writable {
			readonlyUnsigned++
		}
	}
	if len(keys) > 255 {
		return nil, "", errors.New("too many accounts")
	}

	var message bytes.Buffer
	message.Write([]byte{byte(numSigners), byte(readonlySigned), byte(readonlyUnsigned)})
	writeCompactLength(&message, len(keys))
	for _, key := range keys {
		message.Write(key[:])
	}
	message.Write(blockhash[:])
	writeCompactLength(&message, len(instructions))
	for _, instruction := range instructions {
		message.WriteByte(byte(index[instruction.ProgramID]))
		writeCompactLength(&message, len(instruction.Accounts))
		for _, account := range instruction.Accounts {
			message.WriteByte(byte(index[account.PublicKey]))
		}
		writeCompactLength(&message, len(instruction.Data))
		message.Write(instruction.Data)
	}
	messageBytes := message.Bytes()

	signerKeys := make(map[PublicKey]ed25519.PrivateKey, len(signers))
	for _, signer := range signers {
		var key PublicKey
		copy(key[:], signer.Public().(ed25519.PublicKey))
		signerKeys[key] = signer
	}
	var wire bytes.Buffer
	writeCompactLength(&wire, numSigners)
	for _, key := range keys[:numSigners] {
		signer, ok := signerKeys[key]
		if !ok {
			return nil, "", fmt.Errorf("missing signer %s", key)
		}
		wire.Write(ed25519.Sign(signer, messageBytes))
	}
	wire.Write(messageBytes)
	raw := wire.Bytes()
	// Signature count fits one byte here, so the first signature starts at 1.
	return raw, Base58Encode(raw[1 : 1+ed25519.SignatureSize]), nil
}

// writeCompactLength writes Solana's compact-u16 length prefix.
func writeCompactLength(buffer *bytes.Buffer, length int) {
	value := uint16(length)
	for {
		part := byte(value & 0x7f)
		value >>= 7
		if value == 0 {
			buffer.WriteByte(part)
			return
		}
		buffer.WriteByte(part | 0x80)
	}
}
