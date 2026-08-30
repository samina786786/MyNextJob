export type FieldErrors = Record<string, string[] | undefined>;

export interface AuthActionState {
  error?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  status?: 'ok' | 'check-email' | 'password-updated';
  email?: string;
}

export const EMPTY_AUTH_STATE: AuthActionState = {};
