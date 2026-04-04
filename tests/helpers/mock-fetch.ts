/**
 * Shared test helper for mocking fetch() responses.
 *
 * Provides a `mockResponse()` function that creates Response-like objects
 * compatible with the ADT HTTP client's expectations (status, headers, text(), getSetCookie()).
 */

/**
 * Create a mock Response object for use with vi.stubGlobal('fetch', mockFetch).
 *
 * @param status - HTTP status code
 * @param body - Response body as string
 * @param headers - Optional response headers (key-value pairs)
 * @param cookies - Optional Set-Cookie header values (each string is a full Set-Cookie value)
 */
export function mockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
  cookies: string[] = [],
): Response {
  const h = new Headers(headers);
  for (const c of cookies) {
    h.append('set-cookie', c);
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: h,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}
