package service

import (
	"bytes"
	"regexp"

	"github.com/QuantumNous/new-api/common"
)

// JavaRouters: customers must only ever see the model name they requested, never the
// model, provider or routing name an upstream reports (for example "vendor/model-0813").

// responseModelField matches a JSON "model" or "modelVersion" key with a string value.
// Quotes inside JSON string values are escaped, so text such as a model name quoted in
// message content never matches.
var responseModelField = regexp.MustCompile(`("model(?:Version)?"\s*:\s*)"(?:[^"\\]|\\.)*"`)

// PublicResponseModel rewrites every JSON "model" and "modelVersion" string value in a relay
// response body or stream frame to model, the name the client requested. It returns data
// unchanged when model is empty or no such key is present.
func PublicResponseModel(data []byte, model string) []byte {
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
