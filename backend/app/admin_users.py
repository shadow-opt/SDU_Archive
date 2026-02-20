import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .deps import get_db, rate_limiter, require_admin
from .models import User
from .schemas import (
    UserAdminOut,
    UserListResponse,
    UserPasswordReset,
    UserRoleUpdate,
    UserStatusUpdate,
)
from .utils.security import get_password_hash

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"], dependencies=[Depends(rate_limiter)])


@router.get("", response_model=UserListResponse)
def list_users(
    skip: int = 0,
    limit: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1),
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(User)

    if q:
        query = query.filter(User.email.ilike(f"%{q.strip()}%"))
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    return UserListResponse(items=users, total=total, skip=skip, limit=limit)


@router.get("/{user_id}", response_model=UserAdminOut)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}/role", response_model=UserAdminOut)
def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if payload.role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_admin.id == user.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot downgrade yourself")

    user.role = payload.role
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserAdminOut)
def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_admin.id == user.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")

    user.is_active = payload.is_active
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: uuid.UUID,
    payload: UserPasswordReset,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = get_password_hash(payload.new_password)
    db.add(user)
    db.commit()
    return {"ok": True}
