'use client';

import { useState } from 'react';
import { ClayButton } from '@/components/clay/ClayButton';
import { createResumeSignedUrlAction } from '@/features/onboarding/actions';

export function DownloadResumeButton() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    setError('');
    const result = await createResumeSignedUrlAction();
    setPending(false);
    if (result.error || !result.url) {
      setError(result.error ?? 'Could not open your resume.');
      return;
    }
    window.location.assign(result.url);
  }

  return (
    <div className="space-y-2">
      <ClayButton type="button" variant="secondary" block onClick={() => void download()} disabled={pending}>
        {pending ? 'Preparing…' : 'Download resume'}
      </ClayButton>
      {error ? (
        <p role="alert" className="text-sm text-destructive-deep">
          {error}
        </p>
      ) : null}
    </div>
  );
}
