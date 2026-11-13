// Display-only deployment identity plus a fail-closed Cloudflare origin check.
// Authorization is still enforced exclusively by Supabase Auth and database RLS.
export type DliEnvironmentKind = 'qa' | 'production' | 'unknown';

const QA_PROJECT = 'pbepbcdkrdqnepvcwtyw';
const PROD_PROJECT = 'thoinmwqxmqxrnywjuxq';

export function determineDliEnvironment(
  supabaseUrl: string | undefined,
  hostname: string,
): {
  kind: DliEnvironmentKind;
  expectedKind: DliEnvironmentKind;
  mismatch: boolean;
  label: string;
} {
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(
    (supabaseUrl ?? '').trim(),
  );
  const ref = match?.[1];
  const kind: DliEnvironmentKind = ref === QA_PROJECT
    ? 'qa'
    : ref === PROD_PROJECT
      ? 'production'
      : 'unknown';
  const host = hostname.trim().toLowerCase();
  const qaHost = host === 'dli-platform-qa.pages.dev' ||
    host.endsWith('.dli-platform-qa.pages.dev');
  const productionHost = host === 'dli-platform-prod.pages.dev' ||
    host.endsWith('.dli-platform-prod.pages.dev');
  const expectedKind: DliEnvironmentKind = qaHost
    ? 'qa'
    : productionHost
      ? 'production'
      : 'unknown';
  const mismatch = expectedKind !== 'unknown' && expectedKind !== kind;
  const label = kind === 'qa'
    ? 'QA · Test access'
    : kind === 'production'
      ? 'Production · Restricted'
      : 'Environment unverified';
  return { kind, expectedKind, mismatch, label };
}
