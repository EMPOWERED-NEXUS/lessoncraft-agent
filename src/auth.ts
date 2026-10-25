/**
 * Learner sign-in status. Zetaris credentials are not a learner account.
 * No provider is integrated, so this module never creates a session
 * and never returns a password.
 */

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  provider: string | null;
  message: string;
}

export interface LoginResult extends AuthStatus {
  ok: boolean;
  errors: { email?: string; password?: string };
}

const UNCONFIGURED =
  "No learner authentication provider is configured. Try the demo without an account.";
const UNINTEGRATED =
  "A provider name is set, but this app does not connect it. Sign-in is unavailable.";

export function authStatus(): AuthStatus {
  const raw = (process.env.AUTH_PROVIDER ?? "").trim();
  const provider = /^[a-z0-9-]{2,40}$/.test(raw) ? raw : null;
  return {
    configured: false,
    authenticated: false,
    provider,
    message: provider ? UNINTEGRATED : UNCONFIGURED,
  };
}

export function attemptLogin(email: string, password: string): LoginResult {
  const errors: LoginResult["errors"] = {};
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    errors.email = "Enter a valid email address.";
  }
  if (password.length < 8) {
    errors.password = "Enter a password of at least 8 characters.";
  }
  const status = authStatus();
  if (errors.email || errors.password) {
    return { ok: false, ...status, errors };
  }
  return { ok: false, ...status, errors };
}
