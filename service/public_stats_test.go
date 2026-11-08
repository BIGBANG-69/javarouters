package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildPublicStats(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	since := now.Add(-7 * 24 * time.Hour).Unix()
	enabled := operation_setting.PublicStatsSetting{Enabled: true, MinRequests: 10}
	rows := []*model.QuotaData{
		{ModelName: "claude-sonnet-4.6", CreatedAt: since + 3600, Count: 6, TokenUsed: 6000, CacheReadTokens: 900, CacheCreationTokens: 100},
		{ModelName: "deepseek-v4-pro", CreatedAt: since + 86400*3, Count: 4, TokenUsed: 1000},
		{ModelName: "claude-sonnet-4.6", CreatedAt: now.Unix() - 60, Count: 2, TokenUsed: 500},
		// Outside the window: must not count.
		{ModelName: "gpt-5.4", CreatedAt: since - 3600, Count: 50, TokenUsed: 99999},
	}

	t.Run("below the request threshold publishes nothing", func(t *testing.T) {
		got := BuildPublicStats(PublicStatsInput{Now: now, QuotaData: rows, Completed: 9, Setting: enabled})
		assert.Equal(t, PublicStats{Visible: false}, got)
	})

	t.Run("disabled publishes nothing even with enough requests", func(t *testing.T) {
		got := BuildPublicStats(PublicStatsInput{Now: now, QuotaData: rows, Completed: 500,
			Setting: operation_setting.PublicStatsSetting{Enabled: false, MinRequests: 10}})
		assert.Equal(t, PublicStats{Visible: false}, got)
	})

	t.Run("at the threshold aggregates the window", func(t *testing.T) {
		got := BuildPublicStats(PublicStatsInput{
			Now: now, QuotaData: rows, Completed: 12, Failed: 3, AverageSeconds: 2.5, Setting: enabled,
		})

		require.True(t, got.Visible)
		assert.Equal(t, 7, got.WindowDays)
		assert.Equal(t, int64(12), got.Requests)
		assert.Equal(t, int64(7500), got.Tokens)
		assert.Equal(t, int64(900), got.CacheReadTokens)
		assert.Equal(t, int64(100), got.CacheCreationTokens)
		require.NotNil(t, got.SuccessRate)
		assert.InDelta(t, 0.8, *got.SuccessRate, 1e-9)
		assert.Equal(t, 2.5, got.AverageResponseSeconds)
		assert.Equal(t, now.Unix(), got.GeneratedAt)

		assert.Equal(t, []PublicStatsModel{
			{ModelName: "claude-sonnet-4.6", Requests: 8, Tokens: 6500},
			{ModelName: "deepseek-v4-pro", Requests: 4, Tokens: 1000},
		}, got.TopModels)

		require.Len(t, got.Daily, 7)
		assert.Equal(t, since, got.Daily[0].Start)
		assert.Equal(t, PublicStatsDay{Start: since, Requests: 6, Tokens: 6000}, got.Daily[0])
		assert.Equal(t, PublicStatsDay{Start: since + 3*86400, Requests: 4, Tokens: 1000}, got.Daily[3])
		assert.Equal(t, PublicStatsDay{Start: since + 6*86400, Requests: 2, Tokens: 500}, got.Daily[6])
	})

	t.Run("keeps only the five most used models, ties by name", func(t *testing.T) {
		var many []*model.QuotaData
		for _, name := range []string{"f", "e", "d", "c", "b", "a"} {
			many = append(many, &model.QuotaData{ModelName: name, CreatedAt: since + 10, Count: 1, TokenUsed: 1})
		}
		got := BuildPublicStats(PublicStatsInput{Now: now, QuotaData: many, Completed: 10, Setting: enabled})

		names := make([]string, 0, len(got.TopModels))
		for _, entry := range got.TopModels {
			names = append(names, entry.ModelName)
		}
		assert.Equal(t, []string{"a", "b", "c", "d", "e"}, names)
	})

	t.Run("no recorded outcomes leaves the success rate empty", func(t *testing.T) {
		got := BuildPublicStats(PublicStatsInput{Now: now, Completed: 0,
			Setting: operation_setting.PublicStatsSetting{Enabled: true, MinRequests: 0}})
		require.True(t, got.Visible)
		assert.Nil(t, got.SuccessRate)
		assert.Empty(t, got.TopModels)
	})
}
