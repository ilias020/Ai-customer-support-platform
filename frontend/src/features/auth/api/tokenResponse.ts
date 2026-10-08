/** Token response returned by `POST /api/auth/login` and `POST /api/auth/refresh`. */
export type TokenResponse = {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
};

export function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;

  return (
    typeof body.access_token === 'string' &&
    body.access_token.length > 0 &&
    body.token_type === 'bearer' &&
    typeof body.expires_in === 'number' &&
    Number.isInteger(body.expires_in) &&
    body.expires_in > 0
  );
}
