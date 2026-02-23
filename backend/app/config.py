from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SDU Archive"
    secret_key: str  # Required: set via SECRET_KEY env var
    access_token_expire_minutes: int = 60
    database_url: str = "postgresql+psycopg2://sdu:sdu@db:5432/sdu_archive"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket: str = "documents"
    embedding_provider: str = "openai"
    openai_api_key: str | None = None
    openai_api_base: str = "https://api.openai.com/v1"  # Compatible with any OpenAI-API provider
    openai_model: str = "gpt-4o-mini"  # Default to latest efficient model
    embedding_api_key: str | None = None
    embedding_api_base: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536
    rate_limit_per_minute: int = 60
    admin_email: str | None = None
    admin_password: str | None = None
    cors_origins: str = "http://localhost:18080,http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def normalize_and_fill_embedding_settings(self) -> "Settings":
        if self.openai_api_base:
            self.openai_api_base = self.openai_api_base.strip().rstrip("/")

        if self.embedding_api_key:
            self.embedding_api_key = self.embedding_api_key.strip()
        if self.embedding_api_base:
            self.embedding_api_base = self.embedding_api_base.strip().rstrip("/")
        if self.embedding_model:
            self.embedding_model = self.embedding_model.strip()
        if self.embedding_dimension <= 0:
            raise ValueError("EMBEDDING_DIMENSION 必须大于 0")

        # Backward compatibility: if embedding-specific settings are not provided,
        # fall back to the existing OpenAI-compatible settings.
        if not self.embedding_api_key:
            self.embedding_api_key = self.openai_api_key
        if not self.embedding_api_base:
            self.embedding_api_base = self.openai_api_base

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
