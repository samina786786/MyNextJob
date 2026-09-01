import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    onLoad,
    onError,
    priority,
    className,
  }: {
    src: string;
    alt: string;
    onLoad?: () => void;
    onError?: () => void;
    priority?: boolean;
    className?: string;
  }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        data-priority={priority ? 'true' : undefined}
        onLoad={onLoad}
        onError={onError}
      />
    );
  },
}));

import { CompanyLogoTile } from '@/features/jobs/components/CompanyLogoTile';
import { JobCard } from '@/features/jobs/components/JobCard';
import { JobDetailView } from '@/features/jobs/components/JobDetailView';
import type { FeedCardJob } from '@/lib/jobs/feed/card';
import type { JobDetailDto } from '@/lib/jobs/feed/supabase-detail';

afterEach(() => {
  cleanup();
});

const LOGO = '/fixtures/company-logo.webp';

function card(overrides: Partial<FeedCardJob> = {}): FeedCardJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyName: 'Drivetrain',
    companyLogoUrl: null,
    title: 'Engineer',
    locationText: 'Remote',
    city: null,
    country: null,
    remoteType: 'remote',
    employmentType: 'full_time',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    publishedAt: '2026-08-31T00:00:00.000Z',
    discoveredAt: '2026-08-31T00:00:00.000Z',
    freshnessAt: '2026-08-31T00:00:00.000Z',
    sourceLabel: 'Lever',
    ...overrides,
  };
}

function detail(overrides: Partial<JobDetailDto> = {}): JobDetailDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyName: 'Drivetrain',
    companyLogoUrl: null,
    title: 'Engineer',
    locationText: 'Remote',
    city: null,
    country: null,
    remoteType: 'remote',
    employmentType: 'full_time',
    experienceMin: null,
    experienceMax: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    publishedAt: '2026-08-31T00:00:00.000Z',
    discoveredAt: '2026-08-31T00:00:00.000Z',
    freshnessAt: '2026-08-31T00:00:00.000Z',
    sourceLabel: 'Lever',
    descriptionHtml: '<p>Build product.</p>',
    descriptionText: 'Build product.',
    applyUrl: 'https://jobs.example.test/apply',
    ...overrides,
  };
}

describe('company logo tile', () => {
  it('keeps initials when no logo is ready', () => {
    render(<CompanyLogoTile name="Toptal" logoUrl={null} />);
    const identity = document.querySelector('[data-company-identity]');
    expect(identity).toHaveAttribute('data-company-identity', 'initials');
    expect(identity).toHaveClass('h-12', 'w-12');
    expect(identity?.textContent).toBe('T');
    expect(document.querySelector('img')).toBeNull();
  });

  it('reveals a ready logo only after load and keeps the same slot', () => {
    render(<CompanyLogoTile name="Drivetrain" logoUrl={LOGO} priority />);
    const identity = document.querySelector('[data-company-identity]');
    expect(identity).toHaveAttribute('data-company-identity', 'initials');
    expect(identity).toHaveClass('h-12', 'w-12');
    const image = document.querySelector('img');
    expect(image).toHaveAttribute('src', LOGO);
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveClass('opacity-0');
    fireEvent.load(image!);
    expect(document.querySelector('[data-company-identity]')).toHaveAttribute('data-company-identity', 'logo');
    expect(image).toHaveClass('opacity-100');
  });

  it('keeps initials when the image fails', () => {
    render(<CompanyLogoTile name="Drivetrain" logoUrl={LOGO} />);
    fireEvent.error(document.querySelector('img')!);
    expect(document.querySelector('[data-company-identity]')).toHaveAttribute('data-company-identity', 'initials');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[data-company-identity]')?.textContent).toBe('D');
  });
});

describe('feed and detail identity slots', () => {
  it('uses the same 48px slot on cards and detail', () => {
    const { rerender } = render(<JobCard job={card({ companyLogoUrl: LOGO })} asOf="2026-09-01T12:00:00.000Z" />);
    expect(document.querySelector('[data-company-identity]')).toHaveClass('h-12', 'w-12');
    rerender(<JobDetailView job={detail({ companyLogoUrl: LOGO })} asOf="2026-09-01T12:00:00.000Z" />);
    expect(document.querySelector('[data-company-identity]')).toHaveClass('h-12', 'w-12');
    expect(screen.getByText('Drivetrain')).toBeInTheDocument();
  });
});
