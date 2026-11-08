package model

// LogOutcomeCounts counts completed (consume) and failed (error) requests recorded since a time.
func LogOutcomeCounts(since int64) (completed int64, failed int64, err error) {
	if err = LOG_DB.Model(&Log{}).
		Where("created_at >= ? AND type = ?", since, LogTypeConsume).
		Count(&completed).Error; err != nil {
		return 0, 0, err
	}
	if err = LOG_DB.Model(&Log{}).
		Where("created_at >= ? AND type = ?", since, LogTypeError).
		Count(&failed).Error; err != nil {
		return 0, 0, err
	}
	return completed, failed, nil
}

// AverageUseTimeSeconds is the mean recorded request duration of completed requests since a time.
func AverageUseTimeSeconds(since int64) (float64, error) {
	var average float64
	err := LOG_DB.Table("logs").
		Select("COALESCE(AVG(use_time), 0)").
		Where("created_at >= ? AND type = ?", since, LogTypeConsume).
		Scan(&average).Error
	return average, err
}
