from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .deps import get_db, rate_limiter, login_rate_limiter, get_current_user
from .models import User
from .schemas import Token, UserOut
from .utils.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=403, dependencies=[Depends(rate_limiter)])
def register():
    """Public registration is disabled. Accounts are created by administrators."""
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="公开注册已关闭，请联系管理员创建账号")


@router.post("/login", response_model=Token, dependencies=[Depends(rate_limiter), Depends(login_rate_limiter)])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    access_token = create_access_token(user_id=user.id, role=user.role)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserOut, dependencies=[Depends(rate_limiter)])
def me(current_user: User = Depends(get_current_user)):
    return current_user
