import redis
from app.core.config import settings

r = redis.Redis.from_url(settings.redis_url, decode_responses=True)

def get_long_url(code: str) -> str | None:
    return r.get(f"url:{code}")

def set_long_url(code: str, long_url: str, ttl_seconds: int = 3600) -> None:
    r.setex(f"url:{code}", ttl_seconds, long_url)
