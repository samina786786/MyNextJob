import { signOutAction } from '@/features/auth/actions';
import { ClayButton } from '@/components/clay/ClayButton';

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <ClayButton type="submit" variant="secondary" size="lg" block>
        Sign out
      </ClayButton>
    </form>
  );
}
