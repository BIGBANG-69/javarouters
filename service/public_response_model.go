package service

import (
	"bytes"
	"net/http"
	"regexp"

	"github.com/QuantumNous/new-api/common"
)

// JavaRouters: customers must never see which upstream served a request or what it cost.
// They only see the model name they requested, no upstream model, provider or routing name
// (for example "vendor/model-0813"), no upstream price ("usage.cost") and no upstream headers.

// responseModelField matches a JSON "model" or "modelVersion" key with a string value.
// Quotes inside JSON string values are escaped, so text such as a model name quoted in
// message content never matches.
var responseModelField = regexp.MustCompile(`("model(?:Version)?"\s*:\s*)"(?:[^"\\]|\\.)*"`)

const jsonNumber = `-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`

// Upstream price reported in usage, removed together with the comma that separates it from
// the next or previous member so the JSON stays valid.
var (
	upstreamCostBeforeMember = regexp.MustCompile(`"cost"\s*:\s*` + jsonNumber + `\s*,\s*`)
	upstreamCostAfterMember  = regexp.MustCompile(`,\s*"cost"\s*:\s*` + jsonNumber)
	upstreamCostOnly         = regexp.MustCompile(`"cost"\s*:\s*` + jsonNumber)
)

// PublicRelayResponse prepares a relay response body or stream frame for the customer: every
// JSON "model" and "modelVersion" string value becomes model, the name the client requested,
// and an upstream "cost" number is removed. An empty model leaves model values unchanged.
func PublicRelayResponse(data []byte, model string) []byte {
	if bytes.Contains(data, []byte(`"cost"`)) {
		data = upstreamCostBeforeMember.ReplaceAll(data, nil)
		data = upstreamCostAfterMember.ReplaceAll(data, nil)
		data = upstreamCostOnly.ReplaceAll(data, nil)
	}
	if model == "" || !bytes.Contains(data, []byte(`"model`)) {
		return data
	}
	quoted, err := common.Marshal(model)
	if err != nil {
		return data
	}
	return responseModelField.ReplaceAllFunc(data, func(match []byte) []byte {
		prefix := responseModelField.FindSubmatch(match)[1]
		replaced := make([]byte, 0, len(prefix)+len(quoted))
		replaced = append(replaced, prefix...)
		return append(replaced, quoted...)
	})
}

// publicUpstreamHeaders are the only upstream response headers passed to customers: what a
// client needs to read the body, back off, or continue a Codex turn. Everything else, such
// as upstream request IDs, rate limits, routing and provider headers, stays at the gateway.
var publicUpstreamHeaders = map[string]bool{
	"Content-Type":         true,
	"Content-Encoding":     true,
	"Content-Disposition":  true,
	"Retry-After":          true,
	"X-Reasoning-Included": true,
	"X-Codex-Turn-State":   true,
}

func isPublicUpstreamHeader(name string) bool {
	return publicUpstreamHeaders[http.CanonicalHeaderKey(name)]
}
