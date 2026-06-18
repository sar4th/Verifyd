import { NextResponse } from "next/server";
import { AUTHORIZE_URL, CLIENT_ID, REDIRECT_URI, SCOPES } from "@/lib/auth";

export function GET() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPES,
  });

  return NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
}
