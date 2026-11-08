package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// GetPublicStats serves the aggregated platform usage shown on the public landing page.
func GetPublicStats(c *gin.Context) {
	stats, err := service.GetPublicStats(time.Now())
	if err != nil {
		common.SysError(common.LogText("failed to build public stats: %s", err.Error()))
		common.ApiError(c, common.NewMessage("Failed to query statistics"))
		return
	}
	c.Header("Cache-Control", "public, max-age=300")
	if !stats.Visible {
		common.ApiSuccess(c, gin.H{"visible": false})
		return
	}
	common.ApiSuccess(c, stats)
}
