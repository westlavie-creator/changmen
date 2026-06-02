import os
import shutil
from pathlib import Path

BACKEND_ROOT = Path(os.environ.get("GAMEBET_BACKEND_ROOT") or Path(__file__).parent.parent)
CHANGMEN_ROOT = Path(os.environ.get("GAMEBET_CHANGMEN_ROOT") or BACKEND_ROOT.parent)

STORAGE_DIR = Path(os.environ.get("GAMEBET_STORAGE_DIR") or BACKEND_ROOT / "storage")
DB_DIR = Path(os.environ.get("GAMEBET_DB_DIR") or CHANGMEN_ROOT / "gamebetdb")

LEGACY_DIR = STORAGE_DIR / "legacy"
LEGACY_ESPORT_DIR = LEGACY_DIR / "esport"

OLD_DATA_DIR = BACKEND_ROOT / "data"
OLD_DB_PATH = OLD_DATA_DIR / "gamebet.db"
STORAGE_DB_PATH = STORAGE_DIR / "db" / "gamebet.db"
OLD_ESPORT_DATA_DIR = OLD_DATA_DIR / "esport"

DB_PATH = Path(os.environ.get("GAMEBET_DB_PATH") or DB_DIR / "gamebet.db")
ESPORT_DATA_DIR = Path(os.environ.get("ESPORT_DATA_DIR") or LEGACY_ESPORT_DIR)


def _copy_file_if_missing(src: Path, dst: Path):
    if not src.exists() or dst.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def _copy_dir_contents_if_missing(src: Path, dst: Path):
    if not src.exists():
        return
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        if target.exists():
            continue
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)


def _copy_db_if_missing(from_db: Path):
    if not from_db.exists() or DB_PATH.exists():
        return
    _copy_file_if_missing(from_db, DB_PATH)
    _copy_file_if_missing(Path(str(from_db) + "-wal"), Path(str(DB_PATH) + "-wal"))
    _copy_file_if_missing(Path(str(from_db) + "-shm"), Path(str(DB_PATH) + "-shm"))


def ensure_storage_paths():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    ESPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not os.environ.get("ESPORT_DATA_DIR"):
        _copy_dir_contents_if_missing(OLD_ESPORT_DATA_DIR, ESPORT_DATA_DIR)

    if not os.environ.get("GAMEBET_DB_PATH"):
        _copy_db_if_missing(STORAGE_DB_PATH)
        _copy_db_if_missing(OLD_DB_PATH)


ensure_storage_paths()
