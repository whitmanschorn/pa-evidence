# One entry point for the stack. Targets not built yet say which phase fills them in.
.PHONY: help up down reset load load-supplied synthea model tokens reload-policies reload-models ollama-cpu

# Official Synthea sample, pinned to a commit so the bytes never change (see data/synthea/SOURCE.md).
SYNTHEA_URL := https://raw.githubusercontent.com/synthetichealth/synthea-sample-data/84f59805d481b9f01f3141ef39e68bdbbeb80132/downloads/latest/synthea_sample_data_fhir_latest.zip
SYNTHEA_CACHE := data/synthea/cache
SYNTHEA_ZIP := $(SYNTHEA_CACHE)/synthea_sample_data_fhir_latest.zip
SYNTHEA_FHIR := $(SYNTHEA_CACHE)/fhir

help:
	@echo "make up       start HAPI (Postgres-backed) and the API (UI at /ui), then load the Synthea sample and the supplied bundles"
	@echo "make down     stop the stack (data is kept)"
	@echo "make reset    stop the stack and delete its data volume"
	@echo "make load     (re)load all bundles into a running HAPI; safe to repeat"
	@echo "make load-supplied  reload only the 7 supplied bundles (about a second)"
	@echo "make synthea  download and verify the pinned Synthea sample (done by make up)"
	@echo "make model    check native Ollama, pull the model of each current or staged data/models version, verify digests (done by make up)"
	@echo "make tokens   generate nurse/admin/probe tokens (.env hashes, .tokens.local plaintext)"
	@echo "make reload-policies  pick up a dropped-in policy version folder without a restart (admin token)"
	@echo "make reload-models    pick up a dropped-in model version folder without a restart (run make model first)"
	@echo "make ollama-cpu       a second Ollama on :11435 with no GPU layers, for pnpm eval:models when the GPU faults (D-085)"

up: synthea
	@test -f .env || $(MAKE) tokens
	pnpm model
	docker compose up -d --build --wait
	pnpm load

down:
	docker compose down

reset:
	docker compose down --volumes

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

# Runs in the foreground; leave it in its own terminal, then: OLLAMA_HOST_URL=http://127.0.0.1:11435 pnpm eval:models
# Ollama's runner is llama.cpp's llama-server, which reads LLAMA_ARG_* from the environment: no layers and no device on the
# GPU. Context, flash attention and KV cache match the Homebrew service on :11434. Same models folder; localhost only.
# With the Homebrew service stopped, `make ollama-cpu OLLAMA_CPU_PORT=11434` takes its place, so the API, the tests and
# make up need no change: how this Mac runs since its GPU hung (D-090).
OLLAMA_CPU_PORT ?= 11435
ollama-cpu:
	OLLAMA_HOST=127.0.0.1:$(OLLAMA_CPU_PORT) OLLAMA_CONTEXT_LENGTH=32768 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
	LLAMA_ARG_N_GPU_LAYERS=0 LLAMA_ARG_DEVICE=none ollama serve
