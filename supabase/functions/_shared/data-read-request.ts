/** Validate the gateway request before any privileged request is constructed. */
export function prepareDataReadTarget(req: Request, supabaseUrl: string): URL {
  for (const header of ['Accept-Profile', 'Content-Profile']) {
    const profile = req.headers.get(header);
    if (profile && profile !== 'public') throw new Error('Only the public schema is available');
  }

  const paths = new URL(req.url).searchParams.getAll('path');
  const rawPath = paths[0];
  if (paths.length !== 1 || !rawPath || rawPath.length > 8000 || !rawPath.startsWith('/rest/v1/')) {
    throw new Error('Invalid data path');
  }
  const target = new URL(rawPath, supabaseUrl);
  if (target.origin !== new URL(supabaseUrl).origin || target.hash || !/^\/rest\/v1\/[a-z_]+$/.test(target.pathname)) {
    throw new Error('Invalid data resource');
  }
  // PostgREST and URLSearchParams must never disagree about which projection
  // was authorized. Repeated boolean filters are valid; repeated selectors are not.
  for (const key of ['select', 'limit', 'offset', 'order']) {
    if (target.searchParams.getAll(key).length > 1) throw new Error(`Duplicate ${key} parameter`);
  }
  for (const key of ['limit', 'offset']) {
    const value = target.searchParams.get(key);
    if (value !== null && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      throw new Error(`Invalid ${key} parameter`);
    }
  }
  return target;
}

export function dataReadHeaders(req: Request, serviceKey: string): Headers {
  const headers = new Headers({
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    Accept: req.headers.get('Accept') ?? 'application/json',
    'Accept-Profile': 'public',
  });
  for (const name of ['Prefer', 'Range', 'Range-Unit']) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
