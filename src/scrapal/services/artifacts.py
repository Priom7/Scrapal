import hashlib

from scrapal.config import get_settings


def store_artifact(content: bytes, suffix: str = ".bin") -> tuple[str, str]:
    digest = hashlib.sha256(content).hexdigest()
    root = get_settings().artifact_dir
    folder = root / digest[:2]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{digest}{suffix}"
    if not path.exists():
        path.write_bytes(content)
    return digest, str(path)
