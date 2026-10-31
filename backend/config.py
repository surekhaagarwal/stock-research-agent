"""Backend paths stay stable regardless of the process working directory."""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")


def get_database_path() -> Path:
    """Resolve an optional database path relative to the backend directory."""
    path = Path(
        os.environ.get("STOCK_AGENT_DB_PATH", "stock_research_memory.db")
    ).expanduser()
    return path if path.is_absolute() else BACKEND_DIR / path
