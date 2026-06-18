// Minimal Microsoft OAuth config. No service layer — just shared constants/helpers.

export const TENANT = process.env.MS_TENANT_ID || "common";
export const CLIENT_ID = process.env.MS_CLIENT_ID!;
export const CLIENT_SECRET = process.env.MS_CLIENT_SECRET!;
export const REDIRECT_URI =
  process.env.MS_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

export const SCOPES = [
  "Mail.Read",
  "offline_access",
  "openid",
  "profile",
  "email",
].join(" ");

const AUTHORITY = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;

export const AUTHORIZE_URL = `${AUTHORITY}/authorize`;
export const TOKEN_URL = `${AUTHORITY}/token`;

// Name of the cookie that holds the Graph access token for the demo.
export const TOKEN_COOKIE = "ms_access_token";
