def normalize_email(email: str) -> str:
    """Central Nimbus e-mail normalization: trim surrounding whitespace, then lowercase."""
    return email.strip().lower()
