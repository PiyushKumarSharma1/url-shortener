from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, AnyUrl
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db, SessionLocal
from app.db.models import URL
from app.services.shortener import generate_code
from app.core.config import settings
from app.services.cache import get_long_url, set_long_url
from app.services.ratelimit import rate_limit

router = APIRouter()

class ShortenRequest(BaseModel):
    long_url: AnyUrl

class ShortenResponse(BaseModel):
    code: str
    short_url: str
    long_url: str

class StatsResponse(BaseModel):
    code: str
    long_url: str
    clicks: int
    created_at: str

def increment_click(code: str) -> None:
    db = SessionLocal()
    try:
        url_obj = db.scalar(select(URL).where(URL.code == code))
        if url_obj:
            url_obj.clicks += 1
            db.commit()
    finally:
        db.close()

@router.get("/")
def root():
    return {"message": "URL Shortener API"}

@router.post("/shorten", response_model=ShortenResponse)
def shorten(payload: ShortenRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    rate_limit(client_ip, limit=30, window_seconds=60)

    for _ in range(10):
        code = generate_code()
        exists = db.scalar(select(URL).where(URL.code == code))
        if not exists:
            url = URL(code=code, long_url=str(payload.long_url))
            db.add(url)
            db.commit()
            db.refresh(url)

            # warm cache
            set_long_url(url.code, url.long_url)

            return {
                "code": url.code,
                "short_url": f"{settings.base_url}/u/{url.code}",
                "long_url": url.long_url,
            }
    raise HTTPException(status_code=500, detail="Could not generate unique code")

@router.get("/u/{code}")
def redirect(code: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # increment clicks even if cache hits
    background_tasks.add_task(increment_click, code)

    cached = get_long_url(code)
    if cached:
        return RedirectResponse(url=cached, status_code=302)

    url_obj = db.scalar(select(URL).where(URL.code == code))
    if not url_obj:
        raise HTTPException(status_code=404, detail="Code not found")

    set_long_url(code, url_obj.long_url)
    return RedirectResponse(url=url_obj.long_url, status_code=302)

@router.get("/stats/{code}", response_model=StatsResponse)
def stats(code: str, db: Session = Depends(get_db)):
    url_obj = db.scalar(select(URL).where(URL.code == code))
    if not url_obj:
        raise HTTPException(status_code=404, detail="Code not found")

    return {
        "code": url_obj.code,
        "long_url": url_obj.long_url,
        "clicks": url_obj.clicks,
        "created_at": str(url_obj.created_at),
    }
