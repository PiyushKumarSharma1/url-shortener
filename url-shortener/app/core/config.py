from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    base_url: str = "http://127.0.0.1:8000"

    class Config:
        env_file = ".env"

settings = Settings()
