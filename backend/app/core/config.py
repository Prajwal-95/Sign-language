"""Application configuration (mirror of the user's Batch 1 file)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    MODEL_PATH: Path = PROJECT_ROOT / "models" / "word_model.pt"
    FEATURES_PATH: Path = PROJECT_ROOT / "models" / "features.json"
    CONFIDENCE_THRESHOLD: float = 0.60
    DATASET_RAW_PATH: Path = PROJECT_ROOT / "dataset" / "raw"
    DATASET_PROCESSED_PATH: Path = PROJECT_ROOT / "dataset" / "processed"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def model_available(self) -> bool:
        return self.MODEL_PATH.is_file()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
