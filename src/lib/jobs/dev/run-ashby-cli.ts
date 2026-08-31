import { main } from '@/lib/jobs/dev/cli-ashby';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
