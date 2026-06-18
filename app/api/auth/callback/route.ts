import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  SCOPES,
  TOKEN_COOKIE,
  TOKEN_URL,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (error) {
    return new NextResponse(
      `OAuth error: ${error}${errorDescription ? ` — ${errorDescription}` : ""}`,
      { status: 400 }
    );
  }
  if (!code) {
    return new NextResponse("Missing authorization code", { status: 400 });
  }

  // Exchange the authorization code for an access token.
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new NextResponse(`Token exchange failed: ${detail}`, { status: 500 });
  }

  const token = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  // Stash the access token in an httpOnly cookie for the demo. No DB, no refresh.
  const redirect = NextResponse.redirect(new URL("/mail", req.url));
  redirect.cookies.set(TOKEN_COOKIE, token.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: token.expires_in,
    path: "/",
  });

  return redirect;
}
