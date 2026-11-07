import { redirect } from 'next/navigation';

// S0 has no signed-in area yet; S1 replaces this with the sign-in redirect.
export default function Home(): never {
  redirect('/status');
}
