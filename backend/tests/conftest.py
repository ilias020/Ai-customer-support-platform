import os
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]

env_values = dotenv_values(BACKEND_DIRECTORY / ".env")
test_database_url = os.getenv("TEST_DATABASE_URL") or env_values.get("TEST_DATABASE_URL")

if not test_database_url:
    raise RuntimeError(
        "TEST_DATABASE_URL is required to run the test suite. "
        "Configure an isolated PostgreSQL test database."
    )

if make_url(test_database_url).database != "ai_customer_support_test":
    raise RuntimeError("TEST_DATABASE_URL must point to the isolated Nimbus test database.")

os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_URL"] = test_database_url
