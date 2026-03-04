import { createClient } from './server';

export async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Extract human-readable username from email (strips @allocationchecker.local) */
export function extractUsername(email: string | undefined): string {
  if (!email) return '';
  return email.replace('@allocationchecker.local', '');
}
