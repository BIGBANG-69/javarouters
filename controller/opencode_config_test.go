package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The served OpenCode config must parse as the format each OpenCode version reads, list every
// model under its exact gateway name, and never contain a key: OpenCode reads it from the
// JAVAROUTERS_API_KEY environment variable.
func TestBuildOpenCodeConfig(t *testing.T) {
	models := []string{"claude-sonnet-5.5", "deepseek-v4-pro"}
	base := "https://gateway.example/v1"
	wantModels := map[string]any{
		"claude-sonnet-5.5": map[string]any{"name": "claude-sonnet-5.5"},
		"deepseek-v4-pro":   map[string]any{"name": "deepseek-v4-pro"},
	}

	for _, tc := range []struct {
		name   string
		format string
		want   map[string]any
	}{
		{
			name:   "default is the OpenCode 1.x format",
			format: "",
			want: map[string]any{
				"$schema": "https://opencode.ai/config.json",
				"provider": map[string]any{"javarouters": map[string]any{
					"npm":     "@ai-sdk/openai-compatible",
					"name":    "JavaRouters",
					"options": map[string]any{"baseURL": base, "apiKey": "{env:JAVAROUTERS_API_KEY}"},
					"models":  wantModels,
				}},
			},
		},
		{
			name:   "unknown format falls back to the 1.x format",
			format: "v9",
			want: map[string]any{
				"$schema": "https://opencode.ai/config.json",
				"provider": map[string]any{"javarouters": map[string]any{
					"npm":     "@ai-sdk/openai-compatible",
					"name":    "JavaRouters",
					"options": map[string]any{"baseURL": base, "apiKey": "{env:JAVAROUTERS_API_KEY}"},
					"models":  wantModels,
				}},
			},
		},
		{
			name:   "v2 is the current documented format",
			format: "v2",
			want: map[string]any{
				"$schema": "https://opencode.ai/config.json",
				"providers": map[string]any{"javarouters": map[string]any{
					"name":     "JavaRouters",
					"env":      []any{"JAVAROUTERS_API_KEY"},
					"package":  "@opencode/ai/providers/openai-compatible",
					"settings": map[string]any{"baseURL": base},
					"models":   wantModels,
				}},
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data, err := common.Marshal(buildOpenCodeConfig(models, base, "JavaRouters", tc.format))
			require.NoError(t, err)
			var got map[string]any
			require.NoError(t, common.Unmarshal(data, &got))
			assert.Equal(t, tc.want, got)
		})
	}
}
