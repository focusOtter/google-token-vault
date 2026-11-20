import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { auth0Fetch } from "./auth0-fetch";

export const auth0 = new Auth0Client({
  enableConnectAccountEndpoint: true,
  customFetch: auth0Fetch,
  authorizationParameters: {
    connection: process.env.AUTH0_GOOGLE_CONNECTION || "google-oauth2",
    scope: "openid profile email offline_access",
  },
});
