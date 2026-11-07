// Runs once when the Node.js server starts. Validating the configuration here makes a bad deployment fail
// at startup with the variable name, instead of on the first request (docs/02-system-design.md sec. 10).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getConfig } = await import('./server/config');
    getConfig();
  }
}
