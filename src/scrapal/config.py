from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SCRAPAL_", extra="ignore")

    app_name: str = "Scrapal"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./scrapal.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "amqp://guest:guest@localhost:5672//"
    celery_enabled: bool = False
    api_key: str = "scrapal-local-dev-key"
    artifact_dir: Path = Path("data/artifacts")
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_chat_model: str = "qwen2.5:7b-instruct"
    ollama_fast_model: str = "llama3.2:3b"
    ollama_embed_model: str = "nomic-embed-text:latest"
    embedding_dimensions: int = 768
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    max_upload_bytes: int = 25 * 1024 * 1024
    max_pages_per_run: int = 500
    request_timeout_seconds: float = 25.0
    user_agent: str = "Scrapal/0.1 (+http://localhost:3000; responsible crawler)"
    otel_enabled: bool = True
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    grafana_base_url: str = "http://localhost:3001"
    observability_stream: str = "scrapal:crawl-events"
    telemetry_retention_days: int = 14
    crawl_event_retention_days: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings()
