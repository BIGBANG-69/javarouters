package controller

import (
	"net/http"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// JavaRouters: GET /api/public/opencode.json serves a ready-made OpenCode config listing every
// chat model on the price page under one "javarouters" provider, so customers switch models
// with /models instead of typing each name. OpenCode cannot discover models from a generic
// OpenAI-compatible provider, and the model list changes as upstream models are synced.
// The default is the provider/npm/options format OpenCode 1.x reads; ?format=v2 serves the
// providers/package/settings format of the current OpenCode documentation.

const (
	openCodeProviderID = "javarouters"
	openCodeAPIKeyEnv  = "JAVAROUTERS_API_KEY"
	openCodeSchemaURL  = "https://opencode.ai/config.json"
)

type openCodeModel struct {
	Name string `json:"name"`
}

type openCodeConfigV1 struct {
	Schema   string                        `json:"$schema"`
	Provider map[string]openCodeProviderV1 `json:"provider"`
}

type openCodeProviderV1 struct {
	NPM     string                   `json:"npm"`
	Name    string                   `json:"name"`
	Options openCodeOptionsV1        `json:"options"`
	Models  map[string]openCodeModel `json:"models"`
}

type openCodeOptionsV1 struct {
	BaseURL string `json:"baseURL"`
	APIKey  string `json:"apiKey"`
}

type openCodeConfigV2 struct {
	Schema    string                        `json:"$schema"`
	Providers map[string]openCodeProviderV2 `json:"providers"`
}

type openCodeProviderV2 struct {
	Name     string                   `json:"name"`
	Env      []string                 `json:"env"`
	Package  string                   `json:"package"`
	Settings openCodeSettingsV2       `json:"settings"`
	Models   map[string]openCodeModel `json:"models"`
}

type openCodeSettingsV2 struct {
	BaseURL string `json:"baseURL"`
}

// buildOpenCodeConfig returns the OpenCode config for the given chat models. Models are keyed
// by their exact gateway name, which is also the name OpenCode sends upstream.
func buildOpenCodeConfig(modelNames []string, baseURL, displayName, format string) any {
	models := make(map[string]openCodeModel, len(modelNames))
	for _, name := range modelNames {
		models[name] = openCodeModel{Name: name}
	}
	if format == "v2" {
		return openCodeConfigV2{
			Schema: openCodeSchemaURL,
			Providers: map[string]openCodeProviderV2{openCodeProviderID: {
				Name:     displayName,
				Env:      []string{openCodeAPIKeyEnv},
				Package:  "@opencode/ai/providers/openai-compatible",
				Settings: openCodeSettingsV2{BaseURL: baseURL},
				Models:   models,
			}},
		}
	}
	return openCodeConfigV1{
		Schema: openCodeSchemaURL,
		Provider: map[string]openCodeProviderV1{openCodeProviderID: {
			NPM:     "@ai-sdk/openai-compatible",
			Name:    displayName,
			Options: openCodeOptionsV1{BaseURL: baseURL, APIKey: "{env:" + openCodeAPIKeyEnv + "}"},
			Models:  models,
		}},
	}
}

func GetOpenCodeConfig(c *gin.Context) {
	pricing := filterPricingByUsableGroups(model.GetPricing(), service.GetUserUsableGroups(""))
	modelNames := make([]string, 0, len(pricing))
	for _, item := range pricing {
		if slices.Contains(item.SupportedEndpointTypes, constant.EndpointTypeOpenAI) {
			modelNames = append(modelNames, item.ModelName)
		}
	}
	baseURL := strings.TrimRight(system_setting.ServerAddress, "/") + "/v1"
	data, err := common.Marshal(buildOpenCodeConfig(modelNames, baseURL, common.SystemName, c.Query("format")))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if indented, err := common.IndentJson(data); err == nil {
		data = indented
	}
	c.Header("Cache-Control", "public, max-age=300")
	c.Data(http.StatusOK, "application/json; charset=utf-8", data)
}
