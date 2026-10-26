# One entry point for the stack. Targets not built yet say which phase fills them in.
.PHONY: help up down reset load load-supplied synthea tokens reload-policies

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
	@echo "make tokens   generate nurse/admin/probe tokens (.env hashes, .tokens.local plaintext)"
	@echo "make reload-policies  pick up a dropped-in policy version folder without a restart (admin token)"

up: synthea
	@test -f .env || $(MAKE) tokens
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

reload-policies:
	@curl -s -X POST -H "Authorization: Bearer $$(grep '^admin=' .tokens.local | cut -d= -f2)" http://localhost:8080/admin/policies/reload; echo
