import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './server/auth/token';

// Page gate (SEC-1). It runs on the edge without a database, so it only checks the token's signature and
// expiry and sends anyone without a valid one to sign-in. The (app) layout then re-reads the user and role
// from the database, and API routes check both in the http.ts wrapper.

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  // A missing secret fails startup on the Node side (config.ts); here it can only mean "not signed in".
  if (token && secret && (await verifySessionToken(token, secret))) return NextResponse.next();

  const target = req.nextUrl.clone();
  target.pathname = '/sign-in';
  target.search = '';
  const requested = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (requested !== '/') target.searchParams.set('next', requested);
  return NextResponse.redirect(target);
}

// Public paths are never gated: sign-in, the status page, every API route (the wrapper answers 401 in
// JSON instead of a redirect), Next.js assets and files with an extension (favicon, fonts).
export const config = {
  matcher: ['/((?!api/|_next/|sign-in(?:/|$)|status(?:/|$)|.*\\.[A-Za-z0-9]+$).*)'],
};
