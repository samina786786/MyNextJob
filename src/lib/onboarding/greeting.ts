export function firstNameFrom(fullName: string | null | undefined): string | null {
  const token = fullName?.trim().split(/\s+/)[0];
  return token && token.length > 0 ? token : null;
}

export function timeOfDayGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
