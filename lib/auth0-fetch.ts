function diagnosticText(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 1500);
}

export const auth0Fetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!response.ok && url.pathname === "/me/v1/connected-accounts/connect") {
    const body = await response.clone().json().catch(() => ({}));
    console.warn("Auth0 connected-account initiation rejected", {
      status: response.status,
      title: diagnosticText(body.title),
      detail: diagnosticText(body.detail),
      validationErrors: Array.isArray(body.validation_errors) ? body.validation_errors.map((item: Record<string, unknown>) => ({
        detail: diagnosticText(item.detail),
        field: diagnosticText(item.field),
      })) : undefined,
    });
  }
  return response;
};
