import type { Metadata } from 'next';
import { Bookmark, Heart, Search, Settings, X } from 'lucide-react';
import { ClaySurface } from '@/components/clay/ClaySurface';
import { ClayCard } from '@/components/clay/ClayCard';
import { ClayButton } from '@/components/clay/ClayButton';
import { ClayIconButton } from '@/components/clay/ClayIconButton';
import { ClayInput } from '@/components/clay/ClayInput';
import { ClayBadge, toneForMatchScore } from '@/components/clay/ClayBadge';
import { ClaySkeleton } from '@/components/clay/ClaySkeleton';
import { ClayChip } from '@/components/clay/ClayChip';

export const metadata: Metadata = {
  title: 'Design system',
  description: 'MyNextJob emerald claymorphism reference — internal visual QA.',
  robots: { index: false, follow: false },
};

interface Swatch {
  label: string;
  className: string;
  fg?: string;
}

const paletteSurfaces: Swatch[] = [
  { label: 'background',      className: 'bg-background' },
  { label: 'surface',         className: 'bg-surface' },
  { label: 'surface-raised',  className: 'bg-surface-raised' },
  { label: 'surface-pressed', className: 'bg-surface-pressed' },
  { label: 'surface-strong',  className: 'bg-surface-strong' },
];

const paletteEmerald: Swatch[] = [
  { label: 'primary-faint',  className: 'bg-primary-faint' },
  { label: 'primary-soft',   className: 'bg-primary-soft' },
  { label: 'primary',        className: 'bg-primary text-primary-foreground', fg: 'light' },
  { label: 'primary-bright', className: 'bg-primary-bright text-primary-foreground', fg: 'light' },
  { label: 'primary-deep',   className: 'bg-primary-deep text-primary-foreground', fg: 'light' },
  { label: 'primary-dark',   className: 'bg-primary-dark text-primary-foreground', fg: 'light' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-primary-deep">{title}</h2>
      {children}
    </section>
  );
}

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((s) => (
        <div key={s.label} className="space-y-2">
          <div
            className={`h-16 rounded-clay-lg shadow-clay-soft ${s.className}`}
            aria-label={s.label}
          />
          <p className="text-xs font-medium text-secondary">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="space-y-10 px-4 pt-2 safe-top">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-deep">
          Internal · Visual QA
        </p>
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">
          MyNextJob design system
        </h1>
        <p className="text-[15px] text-secondary">
          Emerald claymorphism on warm ivory. Every clay component appears once
          here so we can inspect them side-by-side.
        </p>
      </header>

      <Section title="Palette — surfaces">
        <SwatchGrid items={paletteSurfaces} />
      </Section>

      <Section title="Palette — emerald">
        <SwatchGrid items={paletteEmerald} />
      </Section>

      <Section title="Typography">
        <ClayCard depth="raised" padding="lg" className="space-y-3">
          <p className="text-[32px] font-semibold leading-tight text-foreground">Display · 32/38</p>
          <p className="text-[22px] font-semibold leading-tight text-foreground">Page title · 22/28</p>
          <p className="text-[17px] font-semibold text-foreground">Job title · 17/24</p>
          <p className="text-[15px] text-foreground">
            Body copy. Warm charcoal on warm ivory. Sized generously for mobile reading.
          </p>
          <p className="text-sm text-secondary">Metadata · 14 secondary</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Label · 12 muted</p>
        </ClayCard>
      </Section>

      <Section title="Radius scale">
        <div className="grid grid-cols-5 gap-3">
          {(
            [
              { label: 'sm', className: 'rounded-clay-sm' },
              { label: 'md', className: 'rounded-clay-md' },
              { label: 'lg', className: 'rounded-clay-lg' },
              { label: 'xl', className: 'rounded-clay-xl' },
              { label: '2xl', className: 'rounded-clay-2xl' },
            ] as const
          ).map((r) => (
            <div key={r.label} className="space-y-2 text-center">
              <div className={`h-16 bg-primary-soft shadow-clay-soft ${r.className}`} />
              <p className="text-[11px] font-medium text-secondary">{r.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Depth — raised, floating, pressed, flat">
        <div className="grid gap-3 sm:grid-cols-2">
          <ClaySurface depth="flat" padding="lg"><span className="text-sm">flat</span></ClaySurface>
          <ClaySurface depth="raised" padding="lg"><span className="text-sm">raised</span></ClaySurface>
          <ClaySurface depth="floating" padding="lg"><span className="text-sm">floating</span></ClaySurface>
          <ClaySurface depth="pressed" padding="lg"><span className="text-sm">pressed</span></ClaySurface>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <ClayButton variant="primary">Primary</ClayButton>
          <ClayButton variant="secondary">Secondary</ClayButton>
          <ClayButton variant="ghost">Ghost</ClayButton>
          <ClayButton variant="destructive">Destructive</ClayButton>
          <ClayButton disabled>Disabled</ClayButton>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ClayButton size="sm">Small</ClayButton>
          <ClayButton size="md">Medium</ClayButton>
          <ClayButton size="lg">Large</ClayButton>
        </div>
      </Section>

      <Section title="Icon buttons">
        <div className="flex flex-wrap gap-3">
          <ClayIconButton aria-label="Search" variant="secondary">
            <Search size={18} />
          </ClayIconButton>
          <ClayIconButton aria-label="Save" variant="primary">
            <Bookmark size={18} />
          </ClayIconButton>
          <ClayIconButton aria-label="Favorite" variant="ghost">
            <Heart size={18} />
          </ClayIconButton>
          <ClayIconButton aria-label="Dismiss" variant="secondary">
            <X size={18} />
          </ClayIconButton>
          <ClayIconButton aria-label="Settings" variant="secondary">
            <Settings size={18} />
          </ClayIconButton>
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <ClayChip tone="neutral">Neutral</ClayChip>
          <ClayChip tone="emerald">Emerald</ClayChip>
          <ClayChip active>Selected</ClayChip>
        </div>
      </Section>

      <Section title="Input">
        <ClayInput
          leading={<Search size={18} aria-hidden="true" />}
          placeholder="Search roles, companies, skills…"
          aria-label="Search"
        />
      </Section>

      <Section title="Badges & match scores">
        <div className="flex flex-wrap gap-2">
          <ClayBadge tone="neutral">Neutral</ClayBadge>
          <ClayBadge tone="soft">Soft</ClayBadge>
          <ClayBadge tone="emerald">Emerald</ClayBadge>
          <ClayBadge tone="warning">Warning</ClayBadge>
          <ClayBadge tone="destructive">Rejected</ClayBadge>
        </div>
        <div className="flex flex-wrap gap-2">
          {[94, 82, 68].map((score) => (
            <ClayBadge key={score} tone={toneForMatchScore(score)} size="lg">
              {score}% match
            </ClayBadge>
          ))}
        </div>
      </Section>

      <Section title="Skeleton">
        <ClayCard padding="lg" className="space-y-3">
          <ClaySkeleton className="h-4 w-2/5" />
          <ClaySkeleton className="h-5 w-3/4" />
          <div className="flex gap-2">
            <ClaySkeleton className="h-6 w-14" />
            <ClaySkeleton className="h-6 w-16" />
            <ClaySkeleton className="h-6 w-12" />
          </div>
        </ClayCard>
      </Section>

      <p className="pb-8 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
        Phase 0 · Foundation only
      </p>
    </div>
  );
}
