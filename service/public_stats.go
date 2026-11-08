package service

import (
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// Platform usage statistics for the public landing page. Every figure is aggregated across all
// users; no user, key, channel or infrastructure detail is ever included.
const (
	publicStatsWindowDays = 7
	publicStatsTopModels  = 5
	publicStatsCacheTTL   = 5 * time.Minute
)

type PublicStatsModel struct {
	ModelName string `json:"model_name"`
	Requests  int64  `json:"requests"`
	Tokens    int64  `json:"tokens"`
}

type PublicStatsDay struct {
	// Start is the Unix time at which this rolling 24-hour bucket begins.
	Start    int64 `json:"start"`
	Requests int64 `json:"requests"`
	Tokens   int64 `json:"tokens"`
}

type PublicStats struct {
	Visible             bool  `json:"visible"`
	WindowDays          int   `json:"window_days"`
	Requests            int64 `json:"requests"`
	Tokens              int64 `json:"tokens"`
	CacheReadTokens     int64 `json:"cache_read_tokens"`
	CacheCreationTokens int64 `json:"cache_creation_tokens"`
	// SuccessRate is completed / (completed + failed), from 0 to 1; nil when nothing was recorded.
	SuccessRate            *float64           `json:"success_rate"`
	AverageResponseSeconds float64            `json:"average_response_seconds"`
	TopModels              []PublicStatsModel `json:"top_models"`
	Daily                  []PublicStatsDay   `json:"daily"`
	GeneratedAt            int64              `json:"generated_at"`
}

// PublicStatsInput is everything BuildPublicStats needs, read from the database by GetPublicStats.
type PublicStatsInput struct {
	Now            time.Time
	QuotaData      []*model.QuotaData
	Completed      int64
	Failed         int64
	AverageSeconds float64
	Setting        operation_setting.PublicStatsSetting
}

// BuildPublicStats aggregates hourly usage rows into the published figures. When the statistics
// are disabled or the window holds fewer completed requests than the threshold, it returns a
// hidden result that carries no figures at all.
func BuildPublicStats(in PublicStatsInput) PublicStats {
	if !in.Setting.Enabled || in.Completed < int64(in.Setting.MinRequests) {
		return PublicStats{Visible: false}
	}

	since := in.Now.Add(-publicStatsWindowDays * 24 * time.Hour).Unix()
	stats := PublicStats{
		Visible:                true,
		WindowDays:             publicStatsWindowDays,
		Requests:               in.Completed,
		AverageResponseSeconds: in.AverageSeconds,
		GeneratedAt:            in.Now.Unix(),
		Daily:                  make([]PublicStatsDay, publicStatsWindowDays),
	}
	for i := range stats.Daily {
		stats.Daily[i].Start = since + int64(i)*86400
	}
	if total := in.Completed + in.Failed; total > 0 {
		rate := float64(in.Completed) / float64(total)
		stats.SuccessRate = &rate
	}

	byModel := make(map[string]*PublicStatsModel)
	for _, row := range in.QuotaData {
		if row == nil || row.CreatedAt < since {
			continue
		}
		stats.Tokens += int64(row.TokenUsed)
		stats.CacheReadTokens += row.CacheReadTokens
		stats.CacheCreationTokens += row.CacheCreationTokens

		day := min(int((row.CreatedAt-since)/86400), publicStatsWindowDays-1)
		stats.Daily[day].Requests += int64(row.Count)
		stats.Daily[day].Tokens += int64(row.TokenUsed)

		entry, ok := byModel[row.ModelName]
		if !ok {
			entry = &PublicStatsModel{ModelName: row.ModelName}
			byModel[row.ModelName] = entry
		}
		entry.Requests += int64(row.Count)
		entry.Tokens += int64(row.TokenUsed)
	}

	stats.TopModels = make([]PublicStatsModel, 0, len(byModel))
	for _, entry := range byModel {
		stats.TopModels = append(stats.TopModels, *entry)
	}
	sort.Slice(stats.TopModels, func(i, j int) bool {
		a, b := stats.TopModels[i], stats.TopModels[j]
		if a.Requests != b.Requests {
			return a.Requests > b.Requests
		}
		return a.ModelName < b.ModelName
	})
	if len(stats.TopModels) > publicStatsTopModels {
		stats.TopModels = stats.TopModels[:publicStatsTopModels]
	}
	return stats
}

var publicStatsCache struct {
	sync.Mutex
	stats     PublicStats
	expiresAt time.Time
}

// GetPublicStats returns the landing page statistics, recomputed at most every five minutes so
// public traffic never drives database load.
func GetPublicStats(now time.Time) (PublicStats, error) {
	publicStatsCache.Lock()
	defer publicStatsCache.Unlock()
	if now.Before(publicStatsCache.expiresAt) {
		return publicStatsCache.stats, nil
	}

	setting := *operation_setting.GetPublicStatsSetting()
	since := now.Add(-publicStatsWindowDays * 24 * time.Hour).Unix()
	in := PublicStatsInput{Now: now, Setting: setting}
	if setting.Enabled {
		var err error
		if in.Completed, in.Failed, err = model.LogOutcomeCounts(since); err != nil {
			return PublicStats{}, err
		}
		if in.Completed >= int64(setting.MinRequests) {
			if in.QuotaData, err = model.GetAllQuotaDates(since, now.Unix(), ""); err != nil {
				return PublicStats{}, err
			}
			if in.AverageSeconds, err = model.AverageUseTimeSeconds(since); err != nil {
				return PublicStats{}, err
			}
		}
	}

	publicStatsCache.stats = BuildPublicStats(in)
	publicStatsCache.expiresAt = now.Add(publicStatsCacheTTL)
	return publicStatsCache.stats, nil
}
