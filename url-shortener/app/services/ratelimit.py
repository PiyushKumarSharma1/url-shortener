import time
import redis
from fastapi import HTTPException
from app.core.config import settings

r = redis.Redis.from_url(settings.redis_url, decode_responses=True)

def rate_limit(ip: str, limit: int = 30, window_seconds: int = 60) -> None:
    """
    Simple fixed-window limiter:
    allow <limit> requests per <window_seconds> per IP.
    """
    key = f"rl:{ip}:{int(time.time() // window_seconds)}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, window_seconds)

    if count > limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")
