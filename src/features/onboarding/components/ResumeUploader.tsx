'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { FileText } from 'lucide-react';
import { ClayButton } from '@/components/clay/ClayButton';
import { ClayCard } from '@/components/clay/ClayCard';
import { createClient } from '@/lib/supabase/client';
import { validateResumeFile } from '@/lib/resume/client-file';
import { buildResumeStoragePath } from '@/lib/resume/storage-path';
import { parseDefaultResumeAction, registerResumeUpload } from '@/features/onboarding/actions';
import { ParseProgress } from './ParseProgress';

type Phase = 'idle' | 'uploading' | 'parsing' | 'failed';

interface ResumeUploaderProps {
  userId: string;
  replace?: boolean;
  initialFilename?: string | null;
  initialError?: string | null;
}

export function ResumeUploader({ userId, replace = false, initialFilename, initialError }: ResumeUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>(initialError ? 'failed' : 'idle');
  const [message, setMessage] = useState(initialError ?? '');
  const [filename, setFilename] = useState(initialFilename ?? '');
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const check = validateResumeFile(file);
    if (!check.ok) {
      setPhase('failed');
      setMessage(check.message);
      return;
    }

    const resumeId = crypto.randomUUID();
    const storagePath = buildResumeStoragePath(userId, resumeId, check.mimeType);
    setFilename(file.name);
    setPhase('uploading');
    setMessage('Uploading your resume…');

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from('resumes').upload(storagePath, file, {
      upsert: false,
      contentType: check.mimeType,
    });

    if (uploadError) {
      setPhase('failed');
      setMessage("We couldn't save that file. Please try again.");
      return;
    }

    const registered = await registerResumeUpload({
      resumeId,
      storagePath,
      filename: file.name,
      mimeType: check.mimeType,
      size: file.size,
    });

    if (registered.error) {
      await supabase.storage.from('resumes').remove([storagePath]);
      setPhase('failed');
      setMessage(registered.error);
      return;
    }

    setPhase('parsing');
    setMessage('Reading your experience and skills…');
    const parsed = await parseDefaultResumeAction();
    if (parsed.status === 'busy') {
      setPhase('failed');
      setMessage('We are already reading this resume. Try again in a moment.');
      return;
    }
    if (parsed.error) {
      setPhase('failed');
      setMessage(parsed.error);
      return;
    }

    router.push(replace ? '/onboarding/profile?replace=1' : '/onboarding/profile');
    router.refresh();
  }

  async function retryParse() {
    setPhase('parsing');
    setMessage('Reading your experience and skills…');
    const parsed = await parseDefaultResumeAction({ force: true });
    if (parsed.error) {
      setPhase('failed');
      setMessage(parsed.error);
      return;
    }
    if (parsed.status === 'busy') {
      setPhase('failed');
      setMessage('We are already reading this resume. Try again in a moment.');
      return;
    }
    router.push(replace ? '/onboarding/profile?replace=1' : '/onboarding/profile');
    router.refresh();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleFile(inputRef.current?.files?.[0]);
  }

  if (phase === 'uploading' || phase === 'parsing') {
    return <ParseProgress label={message} />;
  }

  return (
    <ClayCard
      depth={dragging ? 'pressed' : 'raised'}
      radius="xl"
      padding="xl"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className="space-y-5 text-center"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-clay-xl bg-primary text-primary-foreground shadow-clay-raised">
        <FileText size={28} aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-[17px] font-semibold text-foreground">Upload your resume</p>
        <p className="text-sm text-secondary">PDF or DOCX · 10 MB</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          ref={inputRef}
          id="resume-file"
          name="resume"
          type="file"
          aria-label="Resume file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <ClayButton type="button" variant="primary" size="lg" block onClick={() => inputRef.current?.click()}>
          Choose resume
        </ClayButton>
        <p className="hidden text-xs text-muted-foreground sm:block">Or drop a file here on desktop.</p>
      </form>

      <div aria-live="polite" className="space-y-3">
        {filename ? <p className="text-sm text-secondary">{filename}</p> : null}
        {phase === 'failed' ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive-deep">
              {message}
            </p>
            <div className="flex flex-col gap-2">
              {initialFilename || filename ? (
                <ClayButton type="button" variant="secondary" block onClick={() => void retryParse()}>
                  Try reading again
                </ClayButton>
              ) : null}
              <ClayButton type="button" variant="ghost" block onClick={() => inputRef.current?.click()}>
                Choose another resume
              </ClayButton>
            </div>
          </div>
        ) : null}
      </div>
    </ClayCard>
  );
}
