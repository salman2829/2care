import json
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "sqlite:///./healthcare_ops.db"
    SQLITE_FALLBACK_URL: str = "sqlite:///./healthcare_ops.db"
    
    # Security & API
    SECRET_KEY: str = "dev_secret_key_change_in_production_2care_ops"
    API_PREFIX: str = "/api"
    ALLOWED_ORIGINS: Union[str, List[str]] = [
        "http://localhost:8443",
        "http://127.0.0.1:8443",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]
    
    # Retell AI
    RETELL_API_KEY: str = ""
    RETELL_AGENT_ID: str = ""
    RETELL_WEBHOOK_SECRET: str = ""
    RETELL_CUSTOM_TOOL_SECRET: str = ""
    
    # Operational
    DEMO_MODE: bool = True
    DEFAULT_TIMEZONE: str = "UTC"

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            try:
                return json.loads(v)
            except Exception:
                return [v]
        return v


settings = Settings()
