import time
import uuid
from typing import Annotated, Dict

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_session
from .models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
settings = get_settings()

rate_cache: Dict[str, tuple[int, float]] = {}
_last_cleanup: float = 0.0


def rate_limiter(request: Request):
    global _last_cleanup
    now = time.time()
    ip = request.client.host if request.client else "unknown"
    key = f"{ip}"
    window = 60.0

    # Periodic cleanup of expired entries to prevent memory leak
    if now - _last_cleanup > window:
        expired_keys = [k for k, (_, start) in rate_cache.items() if now - start >= window]
        for k in expired_keys:
            del rate_cache[k]
        _last_cleanup = now

    count, start = rate_cache.get(key, (0, now))
    if now - start >= window:
        count, start = 0, now
    count += 1
    rate_cache[key] = (count, start)
    if count > settings.rate_limit_per_minute:
        raise HTTPException(status_code=429, detail="Too many requests")
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
    except (JWTError, ValueError):
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
