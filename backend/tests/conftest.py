import os

os.environ.setdefault("ENVIRONMENT", "testing")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://nimbus:test-password@localhost:5432/ai_customer_support_test",
)
