package service

import (
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// The ECB publishes euro reference rates on TARGET working days; Frankfurter serves them as
// JSON and derives USD-based rates from them. The result is a display-only Rupiah estimate.
const (
	idrReferenceRateURL    = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR"
	idrRateRefreshInterval = 6 * time.Hour
	idrRateRetryInterval   = 15 * time.Minute
	idrRateMaxResponseSize = 64 << 10
)

const (
	IDRRateSourceECB    = "ecb"
	IDRRateSourceManual = "manual"
)

// IDRExchangeRate is a USD to IDR rate for display. A zero Rate means no rate is known.
type IDRExchangeRate struct {
	Rate   float64
	Source string
	// Date is the reference date (YYYY-MM-DD) of an ECB rate; empty for a manual rate.
	Date string
}

var ecbIDRRate atomic.Pointer[IDRExchangeRate]

// StartIDRExchangeRateRefresher keeps the ECB USD to IDR reference rate in memory.
// It runs forever and is meant to be started once as a goroutine.
func StartIDRExchangeRateRefresher() {
	client := &http.Client{Timeout: 15 * time.Second}
	for {
		rate, err := fetchIDRReferenceRate(client, idrReferenceRateURL)
		if err != nil {
			common.SysError(common.LogText("failed to refresh the IDR reference rate: %s", err.Error()))
			time.Sleep(idrRateRetryInterval)
			continue
		}
		ecbIDRRate.Store(rate)
		time.Sleep(idrRateRefreshInterval)
	}
}

func fetchIDRReferenceRate(client *http.Client, url string) (*IDRExchangeRate, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var body struct {
		Date  string             `json:"date"`
		Rates map[string]float64 `json:"rates"`
	}
	if err := common.DecodeJson(io.LimitReader(resp.Body, idrRateMaxResponseSize), &body); err != nil {
		return nil, err
	}
	rate := body.Rates["IDR"]
	if !isUsableRate(rate) {
		return nil, errors.New("response has no positive IDR rate")
	}
	return &IDRExchangeRate{Rate: rate, Source: IDRRateSourceECB, Date: body.Date}, nil
}

// GetIDRExchangeRate returns the rate the public price page should use: the administrator's
// manual rate when manual mode has a usable value, otherwise the latest ECB rate, otherwise none.
func GetIDRExchangeRate() IDRExchangeRate {
	setting := operation_setting.GetIDRRateSetting()
	if setting.Mode == operation_setting.IDRRateModeManual && isUsableRate(setting.ManualRate) {
		return IDRExchangeRate{Rate: setting.ManualRate, Source: IDRRateSourceManual}
	}
	if rate := ecbIDRRate.Load(); rate != nil {
		return *rate
	}
	return IDRExchangeRate{}
}

func isUsableRate(rate float64) bool {
	return rate > 0 && !math.IsInf(rate, 0) && !math.IsNaN(rate)
}
