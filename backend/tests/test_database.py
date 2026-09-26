import pytest
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.database.session import engine, get_db


def test_postgresql_connection():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))

        assert result.scalar_one() == 1


def test_database_session_is_opened_and_closed():
    database_dependency = get_db()
    session = next(database_dependency)

    try:
        assert session.is_active

        result = session.execute(text("SELECT 1"))

        assert result.scalar_one() == 1
    finally:
        database_dependency.close()

    assert not session.in_transaction()


def test_invalid_database_credentials_fail_without_exposing_password():
    invalid_password = "nimbus-invalid-test-password"

    invalid_database_url = make_url(settings.database_url).set(
        password=invalid_password,
    )

    invalid_engine = create_engine(
        invalid_database_url,
        connect_args={"connect_timeout": 2},
    )

    try:
        with pytest.raises(OperationalError) as exc_info:
            with invalid_engine.connect():
                pass

        error_message = str(exc_info.value)

        assert invalid_password not in error_message
    finally:
        invalid_engine.dispose()


def test_database_is_on_alembic_head():
    alembic_config = Config("alembic.ini")
    script_directory = ScriptDirectory.from_config(alembic_config)

    with engine.connect() as connection:
        migration_context = MigrationContext.configure(connection)

        current_revision = migration_context.get_current_revision()
        head_revision = script_directory.get_current_head()

    assert current_revision is not None
    assert current_revision == head_revision
