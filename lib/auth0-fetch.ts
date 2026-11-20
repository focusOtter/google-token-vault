function diagnosticText(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 1500);
}

export const auth0Fetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!response.ok && url.pathname === "/me/v1/connected-accounts/connect") {
    const parsed: unknown = await response.clone().json().catch(() => ({}));
    const body = parsed !== null && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    console.warn("Auth0 connected-account initiation rejected", {
      status: response.status,
      title: diagnosticText(body.title),
      detail: diagnosticText(body.detail),
      validationErrors: Array.isArray(body.validation_errors) ? body.validation_errors.filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
      ).map((item) => ({
        detail: diagnosticText(item.detail),
        field: diagnosticText(item.field),
      })) : undefined,
    });
  }
  return response;
};
