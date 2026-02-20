from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SDU Archive"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60 * 24
    database_url: str = "postgresql+psycopg2://sdu:sdu@db:5432/sdu_archive"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket: str = "documents"
    embedding_provider: str = "openai"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"  # Default to latest efficient model
    rate_limit_per_minute: int = 60
    admin_email: str | None = None
    admin_password: str | None = None
    cors_origins: str = "http://localhost:18080,http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
