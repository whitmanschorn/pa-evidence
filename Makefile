# One entry point for the stack. Targets not built yet say which phase fills them in.
.PHONY: help up down reset load load-supplied synthea model tokens reload-policies reload-models demo tail-log tail-log-and-audit ollama-start ollama-stop ollama-cpu

# Official Synthea sample, pinned to a commit so the bytes never change (see data/synthea/SOURCE.md).
SYNTHEA_URL := https://raw.githubusercontent.com/synthetichealth/synthea-sample-data/84f59805d481b9f01f3141ef39e68bdbbeb80132/downloads/latest/synthea_sample_data_fhir_latest.zip
SYNTHEA_CACHE := data/synthea/cache
SYNTHEA_ZIP := $(SYNTHEA_CACHE)/synthea_sample_data_fhir_latest.zip
SYNTHEA_FHIR := $(SYNTHEA_CACHE)/fhir

help:
	@echo "make up       start Ollama if none is running (CPU-only), HAPI (Postgres-backed) and the API (UI at /ui), then load the Synthea sample and the supplied bundles"
	@echo "make down     stop the stack and the Ollama make up started (data is kept)"
	@echo "make reset    stop the stack and the Ollama make up started, and delete the data volume"
	@echo "make load     (re)load all bundles into a running HAPI; safe to repeat"
	@echo "make load-supplied  reload only the 7 supplied bundles (about a second)"
	@echo "make synthea  download and verify the pinned Synthea sample (done by make up)"
	@echo "make model    check native Ollama, pull the model of each current or staged data/models version, verify digests (done by make up)"
	@echo "make tokens   generate nurse/admin/probe tokens (.env hashes, .tokens.local plaintext)"
	@echo "make reload-policies  pick up a dropped-in policy version folder without a restart (admin token)"
	@echo "make reload-models    pick up a dropped-in model version folder without a restart (run make model first)"
	@echo "make demo             the panel demo against the running stack (REQUEST=PA-002 for another request)"
	@echo "make tail-log          the API's log lines as they are written, one JSON line per request (a second terminal)"
	@echo "make tail-log-and-audit  the same log lines, each followed by the audit event its request wrote"
	@echo "make ollama-start      Ollama on :11434, CPU-only in the background, unless one is running (done by make up)"
	@echo "make ollama-stop       stop the Ollama that ollama-start started, and no other (done by make down)"
	@echo "make ollama-cpu       a second Ollama on :11435 with no GPU layers, for pnpm eval:models when the GPU faults (D-085)"

up: synthea ollama-start
	@test -f .env || $(MAKE) tokens
	pnpm model
	docker compose up -d --build --wait
	pnpm load

down:
	docker compose down
	@$(MAKE) --no-print-directory ollama-stop

reset:
	docker compose down --volumes
	@$(MAKE) --no-print-directory ollama-stop

load:
	pnpm load

load-supplied:
	pnpm load --supplied-only

# Download once, verify the checksum, unzip into an empty directory. The marker file makes it a no-op afterwards.
synthea: $(SYNTHEA_FHIR)/.unpacked

$(SYNTHEA_FHIR)/.unpacked:
	mkdir -p $(SYNTHEA_CACHE)
	curl -fsSL -o $(SYNTHEA_ZIP) $(SYNTHEA_URL)
	cd data/synthea && shasum -a 256 -c SHA256SUMS
	rm -rf $(SYNTHEA_FHIR)
	mkdir -p $(SYNTHEA_FHIR)
	unzip -q $(SYNTHEA_ZIP) -d $(SYNTHEA_FHIR)
	touch $@

tokens:
	pnpm tokens

model:
	pnpm model

reload-policies:
	@curl -s -X POST -H "Authorization: Bearer $$(grep '^admin=' .tokens.local | cut -d= -f2)" http://localhost:8080/admin/policies/reload; echo

reload-models:
	@curl -s -X POST -H "Authorization: Bearer $$(grep '^admin=' .tokens.local | cut -d= -f2)" http://localhost:8080/admin/models/reload; echo

# The panel demo, as in the README: a packet, two refused calls, the packet's audit event, the refusals in the audit
# trail, the packet's log line, and a recomputation of the audit hash chain.
REQUEST ?= PA-004
demo:
	@NURSE=$$(grep '^nurse=' .tokens.local | cut -d= -f2); ADMIN=$$(grep '^admin=' .tokens.local | cut -d= -f2); \
	echo "== The packet for $(REQUEST), as a nurse"; \
	curl -s -H "Authorization: Bearer $$NURSE" localhost:8080/requests/$(REQUEST)/evidence | jq; \
	echo "== No token: refused"; \
	curl -s -w ' HTTP %{http_code}\n' localhost:8080/requests/$(REQUEST)/evidence; \
	echo "== A nurse asking for the audit trail: refused"; \
	curl -s -w ' HTTP %{http_code}\n' -H "Authorization: Bearer $$NURSE" localhost:8080/audit; \
	echo "== The packet's audit event, as an admin"; \
	curl -s -H "Authorization: Bearer $$ADMIN" 'localhost:8080/audit?request_id=$(REQUEST)' | jq 'map(select(.action == "packet.read")) | .[0]'; \
	echo "== The two refusals, audited"; \
	curl -s -H "Authorization: Bearer $$ADMIN" 'localhost:8080/audit?limit=10' | jq 'map(select(.action == "refusal") | {action, outcome, http_status, refusal_reason, required_permission}) | .[0:2]'; \
	echo "== The packet's log line"; \
	docker compose logs api --no-log-prefix | grep '"request_id":"$(REQUEST)"' | grep '/requests/:id/evidence' | tail -1; \
	echo "== The audit hash chain, recomputed"; \
	curl -s -H "Authorization: Bearer $$ADMIN" localhost:8080/audit/verify | jq

# The API's log lines as they are written, from now on: leave it running in a second terminal and use the UI or curl in
# the first. Each request's line is shown as logged. Left out: the health probe (every 10 s) and the UI's static files
# (2xx/3xx with no route pattern); refusals before routing (401, route_pattern "unmatched") stay in. Everything:
# docker compose logs -f api --no-log-prefix
tail-log:
	@docker compose logs -f --tail 0 --no-log-prefix api 2>&1 | \
	jq --unbuffered -cR 'fromjson? // . | select(type != "object" or (.route_pattern != "/health" and (.route_pattern != "unmatched" or .res.statusCode >= 400)))'

# The same log lines, each followed by the audit event its request wrote (scripts/tail-log-and-audit.ts). The events are
# read through the API as admin, so each read is audited too; its own requests' log lines are left out.
tail-log-and-audit:
	@pnpm --silent tail-log-and-audit

# Runs in the foreground; leave it in its own terminal, then: OLLAMA_HOST_URL=http://127.0.0.1:11435 pnpm eval:models
# Ollama's runner is llama.cpp's llama-server, which reads LLAMA_ARG_* from the environment: no layers and no device on the
# GPU. Context, flash attention and KV cache match the Homebrew service on :11434. Same models folder; localhost only.
# make up starts the same thing on :11434 when nothing answers there (ollama-start below): how this Mac runs since its GPU
# hung (D-090, D-099).
OLLAMA_CPU_ENV := OLLAMA_CONTEXT_LENGTH=32768 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 LLAMA_ARG_N_GPU_LAYERS=0 LLAMA_ARG_DEVICE=none
OLLAMA_CPU_PORT ?= 11435
ollama-cpu:
	OLLAMA_HOST=127.0.0.1:$(OLLAMA_CPU_PORT) $(OLLAMA_CPU_ENV) ollama serve

# make up's first step: Ollama on 127.0.0.1:11434. One already answering there (the Homebrew service, make ollama-cpu, or
# any other) is used as it is. Otherwise this starts a CPU-only one in the background with the settings above, and keeps
# its process id so that make down stops it, and only it (D-099).
OLLAMA_LOG := var/ollama.log
OLLAMA_PID := var/ollama.pid
ollama-start:
	@if curl -sf http://127.0.0.1:11434/api/version > /dev/null; then \
	  echo "Ollama is already running on 127.0.0.1:11434"; \
	else \
	  mkdir -p var; \
	  echo "Starting a CPU-only Ollama on 127.0.0.1:11434 (log: $(OLLAMA_LOG); make down stops it)"; \
	  OLLAMA_HOST=127.0.0.1:11434 $(OLLAMA_CPU_ENV) nohup ollama serve > $(OLLAMA_LOG) 2>&1 & \
	  echo $$! > $(OLLAMA_PID); \
	  for attempt in $$(seq 30); do curl -sf http://127.0.0.1:11434/api/version > /dev/null && break; sleep 1; done; \
	  curl -sf http://127.0.0.1:11434/api/version > /dev/null || { echo "Ollama did not start: see $(OLLAMA_LOG)"; exit 1; }; \
	fi

# Stops the Ollama that ollama-start started, if that process is still `ollama serve`; any other Ollama is left alone.
ollama-stop:
	@if [ -f $(OLLAMA_PID) ]; then \
	  pid=$$(cat $(OLLAMA_PID)); \
	  if ps -p $$pid -o command= | grep -q 'ollama serve'; then kill $$pid && echo "Stopped the Ollama that make up started"; fi; \
	  rm -f $(OLLAMA_PID); \
	fi
