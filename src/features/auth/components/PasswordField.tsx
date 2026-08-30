'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ClayIconButton } from '@/components/clay/ClayIconButton';
import { AuthField } from './AuthField';

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
}

export function PasswordField({ id, name, label, autoComplete, error }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthField
      id={id}
      name={name}
      label={label}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      error={error}
      trailing={
        <ClayIconButton
          type="button"
          variant="ghost"
          size="sm"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="-mr-1"
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </ClayIconButton>
      }
    />
  );
}
