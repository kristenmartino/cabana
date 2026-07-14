// middleware.ts
// Two jobs (R1): refresh the Supabase auth session on every request, and gate
// the members-only portal — everything except /sign-in and /auth/* requires a
// signed-in member; otherwise redirect to sign-in.
// Pattern per @supabase/ssr middleware docs.
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes: "/" (landing + demo), /sign-in, auth callback, and ops health.
  // The landing (/) shows a public landing page for unauthenticated visitors and
  // the member portal for signed-in members. /api/health is uncookied for n8n
  // health-checks (no member cookie → no auth expired / health lied race).
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path === "/sign-in" ||
    path.startsWith("/auth/") ||
    path === "/api/health";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // Signed-in members have no reason to see the sign-in page.
  if (user && path === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg)$).*)"],
};
