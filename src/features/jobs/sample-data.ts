/**
 * SAMPLE-ONLY fictional job listings used by the Phase 0 home preview and
 * the /design-system showcase. Do NOT read this from any real ingestion or
 * matching code — these values exist purely to validate the visual system.
 */
export interface SampleJob {
  id: string;
  company: string;
  role: string;
  location: string;
  freshness: string;
  skills: readonly string[];
  matchScore: number;
  matchExplanation: string;
}

export const SAMPLE_JOBS: readonly SampleJob[] = [
  {
    id: 'sample-1',
    company: 'Acme Technologies',
    role: 'Senior Frontend Engineer',
    location: 'Remote · India',
    freshness: '18 min ago',
    skills: ['React', 'TypeScript', 'Next.js'],
    matchScore: 94,
    matchExplanation: '8 of 9 key skills match',
  },
  {
    id: 'sample-2',
    company: 'Northwind Labs',
    role: 'Full-Stack Engineer',
    location: 'Hybrid · Bengaluru',
    freshness: '2 hours ago',
    skills: ['Node.js', 'PostgreSQL', 'React'],
    matchScore: 82,
    matchExplanation: '6 of 8 key skills match',
  },
] as const;
