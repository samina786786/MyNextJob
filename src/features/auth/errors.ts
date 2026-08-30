export function mapAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed') || normalized.includes('email_not_confirmed')) {
    return 'Please confirm your email before signing in.';
  }

  if (
    normalized.includes('invalid login') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('invalid_grant')
  ) {
    return "We couldn't sign you in with those details.";
  }

  if (normalized.includes('already registered') || normalized.includes('user already exists')) {
    return 'An account with this email already exists. Sign in or reset your password.';
  }

  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (normalized.includes('expired') || normalized.includes('otp_expired') || normalized.includes('token')) {
    return 'This sign-in link may have expired or already been used.';
  }

  return "We couldn't complete that request. Please try again.";
}

export function logAuthError(context: string, error: { message?: string; status?: number } | unknown): void {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message, status } = error as { message?: string; status?: number };
    console.error(`[auth:${context}]`, status ?? '', message ?? 'unknown error');
    return;
  }
  console.error(`[auth:${context}]`, 'unknown error');
}
