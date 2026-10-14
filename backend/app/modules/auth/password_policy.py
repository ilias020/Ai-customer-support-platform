"""Nimbus Password Policy v1.0 for new passwords (registration).

- 12 to 128 characters (Unicode code points), spaces allowed.
- At least one uppercase letter (A-Z), one lowercase letter (a-z) and one digit (0-9).
- At least one special character: any character that is not a letter, digit or whitespace,
  so common punctuation and symbols are accepted without a fixed whitelist.

Passwords are validated exactly as entered: they are never trimmed or Unicode-normalized,
which keeps registration and login verification byte-for-byte compatible.
"""

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128

PASSWORD_REQUIREMENT_MESSAGES = {
    "min_length": f"at least {PASSWORD_MIN_LENGTH} characters",
    "max_length": f"at most {PASSWORD_MAX_LENGTH} characters",
    "uppercase": "an uppercase letter (A-Z)",
    "lowercase": "a lowercase letter (a-z)",
    "digit": "a digit (0-9)",
    "special": "a special character",
}


def _is_special(character: str) -> bool:
    return not character.isalnum() and not character.isspace()


def password_policy_violations(password: str) -> list[str]:
    """Returns the keys of all unmet requirements (empty when the password is valid)."""
    violations: list[str] = []

    if len(password) < PASSWORD_MIN_LENGTH:
        violations.append("min_length")
    if len(password) > PASSWORD_MAX_LENGTH:
        violations.append("max_length")
    if not any("A" <= character <= "Z" for character in password):
        violations.append("uppercase")
    if not any("a" <= character <= "z" for character in password):
        violations.append("lowercase")
    if not any("0" <= character <= "9" for character in password):
        violations.append("digit")
    if not any(_is_special(character) for character in password):
        violations.append("special")

    return violations


def password_policy_message(violations: list[str]) -> str:
    requirements = [PASSWORD_REQUIREMENT_MESSAGES[key] for key in violations]
    if len(requirements) > 1:
        requirements = [", ".join(requirements[:-1]), requirements[-1]]
    return f"Password must contain {' and '.join(requirements)}."
