import { ClayInput, type ClayInputProps } from '@/components/clay/ClayInput';

interface AuthFieldProps extends Omit<ClayInputProps, 'id'> {
  id: string;
  label: string;
  error?: string;
}

export function AuthField({ id, label, error, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <ClayInput
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive-deep">
          {error}
        </p>
      ) : null}
    </div>
  );
}
