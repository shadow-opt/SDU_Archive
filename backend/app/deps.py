import re as _re
import time
import uuid
from typing import Annotated, Dict, Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_session
from .models import User


def escape_like(s: str) -> str:
    """Escape SQL LIKE wildcards (%, _, \\) in user input."""
    return _re.sub(r'([%_\\])', r'\\\1', s)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
settings = get_settings()

rate_cache: Dict[str, Tuple[int, float]] = {}
_last_cleanup: float = 0.0

# Separate stricter cache for login attempts (10 / min / IP)
_login_cache: Dict[str, Tuple[int, float]] = {}
_login_last_cleanup: float = 0.0
LOGIN_RATE_LIMIT = 10


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting reverse-proxy headers set by nginx.

    Only trusts X-Real-IP (explicitly set by our nginx config from
    $remote_addr).  X-Forwarded-For is NOT used because it can be
    trivially spoofed by the original client.
    """
    ip = request.headers.get("x-real-ip")
    if ip:
        return ip.strip()
    return request.client.host if request.client else "unknown"


def _rate_check(
    cache: Dict[str, Tuple[int, float]],
    key: str,
    limit: int,
    window: float = 60.0,
) -> None:
    """Generic sliding-window counter. Raises 429 when limit exceeded."""
    now = time.time()
    count, start = cache.get(key, (0, now))
    if now - start >= window:
        count, start = 0, now
    count += 1
    cache[key] = (count, start)
    if count > limit:
        raise HTTPException(status_code=429, detail="Too many requests")


def rate_limiter(request: Request):
    global _last_cleanup
    now = time.time()
    # Periodic cleanup
    if now - _last_cleanup > 60.0:
        expired = [k for k, (_, s) in rate_cache.items() if now - s >= 60.0]
        for k in expired:
            del rate_cache[k]
        _last_cleanup = now

    ip = _get_client_ip(request)
    _rate_check(rate_cache, ip, settings.rate_limit_per_minute)
    return True


def login_rate_limiter(request: Request):
    """Stricter rate limiter applied only to the login endpoint."""
    global _login_last_cleanup
    now = time.time()
    if now - _login_last_cleanup > 60.0:
        expired = [k for k, (_, s) in _login_cache.items() if now - s >= 60.0]
        for k in expired:
            del _login_cache[k]
        _login_last_cleanup = now

    ip = _get_client_ip(request)
    _rate_check(_login_cache, ip, LOGIN_RATE_LIMIT)
    return True


def get_db():
    with get_session() as session:
        yield session


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(get_db)]) -> User:
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        role = payload.get("role")
        if user_id is None or role is None:
            raise credentials_exception
        user_uuid = uuid.UUID(user_id)
    except (InvalidTokenError, ValueError):
        raise credentials_exception
    user = db.get(User, user_uuid)
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return user


def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user
