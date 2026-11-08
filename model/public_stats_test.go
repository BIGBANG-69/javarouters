package model

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TestPublicStatsLogQueriesDatabaseMatrix checks the landing page usage queries on each database.
// MySQL and PostgreSQL run when TEST_MYSQL_DSN / TEST_POSTGRES_DSN point at disposable databases.
func TestPublicStatsLogQueriesDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN is not configured")
				}
				driver = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN is not configured")
				}
				driver = postgres.Open(dsn)
			}
			db, err := gorm.Open(driver, &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			previousType := common.LogDatabaseType()
			common.SetLogDatabaseType(common.DatabaseType(dialect))
			t.Cleanup(func() {
				common.SetLogDatabaseType(previousType)
				assert.NoError(t, sqlDB.Close())
			})

			if dialect == "postgres" {
				db = db.Begin()
				require.NoError(t, db.Error)
				t.Cleanup(func() { assert.NoError(t, db.Rollback().Error) })
				schemaName := fmt.Sprintf("public_stats_test_%d", time.Now().UnixNano())
				require.NoError(t, db.Exec("CREATE SCHEMA ?", clause.Table{Name: schemaName}).Error)
				require.NoError(t, db.Exec("SET LOCAL search_path TO ?", clause.Table{Name: schemaName}).Error)
			} else {
				t.Cleanup(func() { assert.NoError(t, db.Migrator().DropTable(&Log{})) })
			}
			previousLogDB := LOG_DB
			LOG_DB = db
			t.Cleanup(func() { LOG_DB = previousLogDB })
			require.NoError(t, db.AutoMigrate(&Log{}))

			const since = int64(1_000)
			require.NoError(t, db.Create(&[]Log{
				{CreatedAt: since - 1, Type: LogTypeConsume, UseTime: 100}, // before the window
				{CreatedAt: since, Type: LogTypeConsume, UseTime: 2},
				{CreatedAt: since + 10, Type: LogTypeConsume, UseTime: 3},
				{CreatedAt: since + 20, Type: LogTypeConsume, UseTime: 4},
				{CreatedAt: since + 30, Type: LogTypeError, UseTime: 50},
				{CreatedAt: since + 40, Type: LogTypeTopup},
			}).Error)

			completed, failed, err := LogOutcomeCounts(since)
			require.NoError(t, err)
			assert.Equal(t, int64(3), completed)
			assert.Equal(t, int64(1), failed)

			average, err := AverageUseTimeSeconds(since)
			require.NoError(t, err)
			assert.InDelta(t, 3.0, average, 1e-9)

			average, err = AverageUseTimeSeconds(since + 1_000)
			require.NoError(t, err)
			assert.Zero(t, average, "an empty window averages to zero")
		})
	}
}
