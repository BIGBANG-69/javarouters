package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchIDRReferenceRate(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		want    *IDRExchangeRate
		wantErr bool
	}{
		{
			name:   "valid ECB response returns the rate and its reference date",
			status: http.StatusOK,
			body:   `{"amount":1.0,"base":"USD","date":"2026-11-06","rates":{"IDR":18100}}`,
			want:   &IDRExchangeRate{Rate: 18100, Source: IDRRateSourceECB, Date: "2026-11-06"},
		},
		{name: "non-200 status is an error", status: http.StatusBadGateway, body: `{}`, wantErr: true},
		{name: "missing IDR rate is an error", status: http.StatusOK, body: `{"date":"2026-11-06","rates":{}}`, wantErr: true},
		{name: "zero IDR rate is an error", status: http.StatusOK, body: `{"date":"2026-11-06","rates":{"IDR":0}}`, wantErr: true},
		{name: "invalid JSON is an error", status: http.StatusOK, body: `not json`, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer server.Close()

			got, err := fetchIDRReferenceRate(server.Client(), server.URL)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestGetIDRExchangeRate(t *testing.T) {
	setting := operation_setting.GetIDRRateSetting()
	original := *setting
	t.Cleanup(func() {
		*setting = original
		ecbIDRRate.Store(nil)
	})

	ecb := &IDRExchangeRate{Rate: 18100, Source: IDRRateSourceECB, Date: "2026-11-06"}
	tests := []struct {
		name       string
		mode       string
		manualRate float64
		ecb        *IDRExchangeRate
		want       IDRExchangeRate
	}{
		{name: "auto mode uses the ECB rate", mode: operation_setting.IDRRateModeAuto, manualRate: 16500, ecb: ecb, want: *ecb},
		{name: "manual mode uses the manual rate", mode: operation_setting.IDRRateModeManual, manualRate: 16500, ecb: ecb,
			want: IDRExchangeRate{Rate: 16500, Source: IDRRateSourceManual}},
		{name: "manual mode without a usable rate falls back to ECB", mode: operation_setting.IDRRateModeManual, manualRate: 0, ecb: ecb, want: *ecb},
		{name: "no ECB rate and auto mode returns no rate", mode: operation_setting.IDRRateModeAuto, ecb: nil, want: IDRExchangeRate{}},
		{name: "unknown mode is treated as auto", mode: "bogus", manualRate: 16500, ecb: ecb, want: *ecb},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setting.Mode = tt.mode
			setting.ManualRate = tt.manualRate
			ecbIDRRate.Store(tt.ecb)

			assert.Equal(t, tt.want, GetIDRExchangeRate())
		})
	}
}
