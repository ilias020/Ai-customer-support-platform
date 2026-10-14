import { getApiBaseUrl } from '../../../lib/api/config';
import { isTokenResponse } from './tokenResponse';

export const REGISTER_ENDPOINT = '/api/auth/register';

/** Request body of `POST /api/auth/register` (Issue #12). The password confirmation is never sent. */
export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  workspace_name: string;
};

export type RegisterErrorKind =
  'email_exists' | 'validation' | 'rate_limited' | 'server' | 'network';

export type RegisterResult =
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; error: RegisterErrorKind; invalidFields?: (keyof RegisterPayload)[] };

const PAYLOAD_FIELDS: (keyof RegisterPayload)[] = [
  'first_name',
  'last_name',
  'email',
  'password',
  'workspace_name',
];

async function invalidFieldsFrom(response: Response): Promise<(keyof RegisterPayload)[]> {
  try {
    const body: unknown = await response.json();
    const details = (body as { error?: { details?: unknown } })?.error?.details;
    if (!Array.isArray(details)) return [];

    const fields = details
      .map((detail) => (detail as { field?: unknown })?.field)
      .filter((field): field is keyof RegisterPayload =>
        PAYLOAD_FIELDS.includes(field as keyof RegisterPayload),
      );
    return [...new Set(fields)];
  } catch {
    return [];
  }
}

/**
 * Sends the registration request. On `201 Created` the backend returns the access token and
 * sets the HttpOnly refresh-token cookie, which requires `credentials: 'include'`.
 */
export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  let url: string;

  try {
    url = `${getApiBaseUrl()}${REGISTER_ENDPOINT}`;
  } catch {
    return { ok: false, error: 'server' };
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        password: payload.password,
        workspace_name: payload.workspace_name,
      }),
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  switch (response.status) {
    case 201:
      break;
    case 409:
      return { ok: false, error: 'email_exists' };
    case 422:
      return { ok: false, error: 'validation', invalidFields: await invalidFieldsFrom(response) };
    case 429:
      return { ok: false, error: 'rate_limited' };
    default:
      return { ok: false, error: 'server' };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'server' };
  }

  if (!isTokenResponse(body)) {
    return { ok: false, error: 'server' };
  }

  return { ok: true, accessToken: body.access_token, expiresIn: body.expires_in };
}
