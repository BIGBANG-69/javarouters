package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Customers must see the model they requested, never the upstream's own model or provider name.
func TestPublicResponseModelRewritesUpstreamModelNames(t *testing.T) {
	for _, tc := range []struct {
		name  string
		model string
		in    string
		want  string
	}{
		{
			name:  "chat completion",
			model: "deepseek-v4-pro",
			in:    `{"id":"x","model":"vendor/deepseek-v4-pro-0813","choices":[]}`,
			want:  `{"id":"x","model":"deepseek-v4-pro","choices":[]}`,
		},
		{
			name:  "stream frame with spacing",
			model: "gpt-6-sol",
			in:    "data: {\"model\" : \"upstream/gpt-6-sol-2026\",\"choices\":[]}\n\n",
			want:  "data: {\"model\" : \"gpt-6-sol\",\"choices\":[]}\n\n",
		},
		{
			name:  "claude message_start nests the model",
			model: "claude-sonnet-5.5",
			in:    `{"type":"message_start","message":{"id":"m","model":"claude-sonnet-5-5"}}`,
			want:  `{"type":"message_start","message":{"id":"m","model":"claude-sonnet-5.5"}}`,
		},
		{
			name:  "responses event nests the model",
			model: "gpt-5.3-codex",
			in:    `{"type":"response.completed","response":{"id":"r","model":"vendor/gpt-5.3-codex"}}`,
			want:  `{"type":"response.completed","response":{"id":"r","model":"gpt-5.3-codex"}}`,
		},
		{
			name:  "gemini model version",
			model: "gemini-3.1-pro",
			in:    `{"candidates":[],"modelVersion":"gemini-3.1-pro-preview-0901"}`,
			want:  `{"candidates":[],"modelVersion":"gemini-3.1-pro"}`,
		},
		{
			name:  "model named inside message content stays",
			model: "deepseek-v4-pro",
			in:    `{"model":"vendor/x","choices":[{"message":{"content":"set \"model\":\"gpt-4\" here"}}]}`,
			want:  `{"model":"deepseek-v4-pro","choices":[{"message":{"content":"set \"model\":\"gpt-4\" here"}}]}`,
		},
		{
			name:  "escaped quote in upstream value",
			model: "m",
			in:    `{"model":"a\"b"}`,
			want:  `{"model":"m"}`,
		},
		{
			name:  "null model stays",
			model: "m",
			in:    `{"model":null}`,
			want:  `{"model":null}`,
		},
		{
			name: "no requested model leaves the body alone",
			in:   `{"model":"vendor/x"}`,
			want: `{"model":"vendor/x"}`,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, string(service.PublicResponseModel([]byte(tc.in), tc.model)))
		})
	}
}

func TestPublicResponseModelMiddlewareRewritesWrittenResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstreamBody := `{"id":"x","model":"vendor/deepseek-v4-pro-0813","choices":[]}`

	router := gin.New()
	router.Use(PublicResponseModel())
	router.POST("/v1/chat/completions", func(c *gin.Context) {
		c.Set(string(constant.ContextKeyOriginalModel), "deepseek-v4-pro")
		upstream := &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
		}
		// The non-stream relay path sets Content-Length from the upstream body.
		service.IOCopyBytesGracefully(c, upstream, []byte(upstreamBody))
	})
	router.POST("/v1/stream", func(c *gin.Context) {
		c.Set(string(constant.ContextKeyOriginalModel), "gpt-6-sol")
		_, err := c.Writer.WriteString("data: {\"model\":\"upstream/gpt-6-sol-2026\"}\n\n")
		require.NoError(t, err)
	})

	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	resp, err := http.Post(server.URL+"/v1/chat/completions", "application/json", strings.NewReader("{}"))
	require.NoError(t, err)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, `{"id":"x","model":"deepseek-v4-pro","choices":[]}`, string(body))
	assert.NotContains(t, string(body), "vendor")

	resp, err = http.Post(server.URL+"/v1/stream", "application/json", strings.NewReader("{}"))
	require.NoError(t, err)
	body, err = io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	assert.Equal(t, "data: {\"model\":\"gpt-6-sol\"}\n\n", string(body))
}
