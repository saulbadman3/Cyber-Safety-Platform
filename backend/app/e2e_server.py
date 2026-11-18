"""Start a clean, migrated and seeded API for the Playwright smoke test."""

from pathlib import Path

import uvicorn
from alembic.config import Config

from alembic import command
from app.config import get_settings
from app.database import make_engine, make_session_factory
from app.seed import seed_all


def main() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_config = Config(str(backend_dir / "alembic.ini"))
    command.upgrade(alembic_config, "head")

    engine = make_engine(get_settings().database_url)
    with make_session_factory(engine)() as session:
        seed_all(session)
    engine.dispose()

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
