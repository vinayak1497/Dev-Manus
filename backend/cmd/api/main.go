package main

import (
	"fmt"
	"net/http"
	"os"
)

// Modular-monolith entry point (Architecture §20).
// Full control-plane modules (auth, projects, monitors, incidents,
// detection, correlation, integrations, notifications, kubernetes,
// security, ai, telemetry, database) land incrementally in Phase 1+.
func main() {
	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8080"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"monitoring-api"}`))
	})
	fmt.Printf("monitoring-api listening on :%s\n", addr)
	_ = http.ListenAndServe(":"+addr, mux)
}
