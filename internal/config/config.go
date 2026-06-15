package config

import (
	"errors"
	"os"
	"strconv"
)

type Config struct {
	StellarRPCURL  string
	ContractID     string
	DBPath         string
	APIPort        string
	PollIntervalMS int
	StartLedger    uint32
	Network        string
}

func Load() *Config {
	return &Config{
		StellarRPCURL:  getEnv("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"),
		ContractID:     getEnv("CONTRACT_ID", ""),
		DBPath:         getEnv("DB_PATH", "./mnemox.db"),
		APIPort:        getEnv("API_PORT", "8080"),
		PollIntervalMS: getEnvInt("POLL_INTERVAL_MS", 5000),
		StartLedger:    uint32(getEnvInt("START_LEDGER", 0)),
		Network:        getEnv("NETWORK", "testnet"),
	}
}

func (c *Config) Validate() error {
	if c.ContractID == "" {
		return errors.New("CONTRACT_ID is required")
	}
	return nil
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
