import os
from pathlib import Path
from typing import BinaryIO

from minio import Minio

from ..config import get_settings

settings = get_settings()

client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


def ensure_bucket() -> None:
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def upload_file(object_name: str, file_obj: BinaryIO, length: int, content_type: str) -> str:
    ensure_bucket()
    client.put_object(
        settings.minio_bucket,
        object_name,
        data=file_obj,
        length=length,
        content_type=content_type,
    )
    return f"{settings.minio_bucket}/{object_name}"


def save_bytes(object_name: str, data: bytes, content_type: str) -> str:
    ensure_bucket()
    client.put_object(
        settings.minio_bucket,
        object_name,
        data=data,
        length=len(data),
        content_type=content_type,
    )
    return f"{settings.minio_bucket}/{object_name}"


def local_path_to_object_name(path: str) -> str:
    return Path(path).name
