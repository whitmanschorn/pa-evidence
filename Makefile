# One entry point for the stack. Each target is filled in by the phase named in its message.
.PHONY: help up down reset load tokens

help:
	@echo "make up      start HAPI + API (and check native Ollama)"
	@echo "make down    stop the stack"
	@echo "make reset   stop the stack and delete its volumes"
	@echo "make load    load the supplied bundles and the Synthea sample into HAPI"
	@echo "make tokens  generate nurse/admin/probe tokens (.env hashes, .tokens.local plaintext)"

up:
	@echo "make up: not built yet (Phase 1)"; exit 1

down:
	@echo "make down: not built yet (Phase 1)"; exit 1

reset:
	@echo "make reset: not built yet (Phase 1)"; exit 1

load:
	@echo "make load: not built yet (Phase 1)"; exit 1

tokens:
	@echo "make tokens: not built yet (Phase 4)"; exit 1
