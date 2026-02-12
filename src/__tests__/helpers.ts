/**
 * Test helpers for Magnolia MCP integration tests.
 *
 * Uses the dev environment and real API key to test every flow.
 */

const DEV_API_URL = "https://api.dev.magfi.dev";
const DEV_EMAIL = "harsha@magnolia.financial";
const DEV_PASSWORD = "6kkkvUtFce!tNKohaEdJ9qq";

// API key for dev environment (regenerated iteration 12)
const DEV_API_KEY =
  process.env.MAGNOLIA_API_KEY ||
  "magfi_dev_VKcyOPsHT5bx/gYc4Gkxd+85hSEnTZb5eucPS9yFZX0=";

export { DEV_API_URL, DEV_EMAIL, DEV_PASSWORD, DEV_API_KEY };

/**
 * Make a raw HTTP request to the Magnolia API (for testing auth flows
 * that don't go through MagnoliaClient).
 */
export async function rawRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const headers: Record<string, string> = {
    "User-Agent": "ClawBot-MCP-Tests/1.0",
    ...options.headers,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${DEV_API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data, headers: res.headers };
}

/**
 * Login and get a JWT token.
 */
export async function getJwtToken(): Promise<string> {
  const { status, data } = await rawRequest("/auth/login", {
    method: "POST",
    body: { email: DEV_EMAIL, password: DEV_PASSWORD },
  });

  if (status !== 200) {
    throw new Error(
      `Login failed (${status}): ${JSON.stringify(data)}`
    );
  }

  return (data as { token: string }).token;
}
