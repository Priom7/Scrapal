# Scrapal

Scrapal turns public websites and documents into structured, versioned, cited knowledge. It
combines deterministic extraction, local Ollama models, hybrid search, and approval-gated agent
actions behind an API and an accessible operator console.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

- Console: http://localhost:3000
- API and OpenAPI: http://localhost:8000/docs
- API key for local development: `scrapal-local-dev-key`
- RabbitMQ management: http://localhost:15672

Ollama is not containerized. Keep it running on the host with these installed models:
`qwen2.5:7b-instruct`, `llama3.2:3b`, and `nomic-embed-text`.

## Local development

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn scrapal.main:app --reload
```

The API creates its initial schema and local organization at startup. Use Alembic migrations for
subsequent production schema changes.

## Crawler observability

Start the optional local observability profile alongside the application:

```bash
docker compose --profile observability up --build
```

- Scrapal super-admin console: http://localhost:3000 (open **Observability**)
- Grafana: http://localhost:3001 (`admin` / `scrapal-local` for local development)
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093
- Flower: http://localhost:5555

The local development API key is bootstrapped as the platform `super_admin`. Application
telemetry is exported asynchronously; crawling and durable PostgreSQL crawl events continue when
the optional Collector, Loki, Tempo, Prometheus, or Grafana services are unavailable.
