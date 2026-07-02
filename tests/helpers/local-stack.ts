// tests/helpers/local-stack.ts
// Shared fixtures for suites that talk to the LOCAL Supabase stack
// (tests/rls, tests/webhooks). Prereq: `supabase start` (and `npm run
// db:reset` for a pristine seed). URLs and keys are read from
// `supabase status` at runtime — no keys live in the repo, and CI needs
// zero extra config beyond starting the stack.

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import ws from "ws";

export type StackEnv = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  DB_URL: string;
  FUNCTIONS_URL: string;
};

let cached: StackEnv | null = null;

export function stackEnv(): StackEnv {
  if (cached) return cached;

  const fromEnv: Partial<StackEnv> = {
    API_URL: process.env.SUPABASE_URL,
    ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DB_URL: process.env.SUPABASE_DB_URL,
    FUNCTIONS_URL: process.env.SUPABASE_FUNCTIONS_URL,
  };
  if (
    fromEnv.API_URL &&
    fromEnv.ANON_KEY &&
    fromEnv.SERVICE_ROLE_KEY &&
    fromEnv.DB_URL &&
    fromEnv.FUNCTIONS_URL
  ) {
    cached = fromEnv as StackEnv;
    return cached;
  }

  let raw: string;
  try {
    raw = execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    try {
      raw = execSync("npx --yes supabase status -o json", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      throw new Error(
        "Local Supabase stack is not reachable. Run `supabase start` " +
          "(then `npm run db:reset` for a pristine seed) before this suite.\n" +
          String(err),
      );
    }
  }

  // `status` prints a human preamble (e.g. "Stopped services: [...]") before
  // the JSON object — parse from the first brace.
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string>;
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL", "FUNCTIONS_URL"]) {
    if (!parsed[key]) throw new Error(`\`supabase status\` output is missing ${key}`);
  }
  cached = {
    API_URL: parsed.API_URL,
    ANON_KEY: parsed.ANON_KEY,
    SERVICE_ROLE_KEY: parsed.SERVICE_ROLE_KEY,
    DB_URL: parsed.DB_URL,
    FUNCTIONS_URL: parsed.FUNCTIONS_URL,
  };
  return cached;
}

// Realtime is unused by the tests, but the client constructs it eagerly and
// Node < 22 has no native WebSocket — hand it `ws` so the suite runs anywhere.
const clientOpts = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as unknown as typeof WebSocket },
};

// PostgREST reloads its schema cache asynchronously after `db reset` restarts
// the containers, so the first queries can fail with "Could not find the
// table ... in the schema cache". Suites call this before touching data.
export async function awaitApiReady(timeoutMs = 60_000): Promise<void> {
  const env = stackEnv();
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${env.API_URL}/rest/v1/members?select=id&limit=1`, {
        headers: {
          apikey: env.SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
        },
      });
      if (res.ok) return;
      last = `${res.status} ${await res.text()}`;
    } catch (err) {
      last = String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Supabase REST API not ready within ${timeoutMs}ms. Last: ${last}`);
}

// Fixture C: service role — bypasses RLS, the control.
export function serviceClient(): SupabaseClient {
  const env = stackEnv();
  return createClient(env.API_URL, env.SERVICE_ROLE_KEY, clientOpts);
}

// Signed-out browser: anon key, no JWT.
export function anonClient(): SupabaseClient {
  const env = stackEnv();
  return createClient(env.API_URL, env.ANON_KEY, clientOpts);
}

// Direct Postgres connection for assertions that need single-transaction
// control (set_actor + write in one tx, race setups, SQL-level checks).
export function dbPool(): Pool {
  return new Pool({ connectionString: stackEnv().DB_URL, max: 4 });
}

// Member fixture: create-or-reuse an auth user, link it to a seed member row
// (members.user_id), and return a client whose JWT is that user. Idempotent
// across runs with or without an intervening `db reset`.
export async function memberClient(
  email: string,
  memberId: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const env = stackEnv();
  const admin = serviceClient();
  const password = "cabana-rls-fixture-pw"; // local test stack only

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr && createErr.code !== "email_exists") {
    throw new Error(`auth.admin.createUser(${email}) failed: ${createErr.message}`);
  }

  const probe = createClient(env.API_URL, env.ANON_KEY, clientOpts);
  const { data: signIn, error: signInErr } = await probe.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session) {
    throw new Error(`sign-in as ${email} failed: ${signInErr?.message}`);
  }
  const userId = signIn.user.id;

  const { error: linkErr } = await admin
    .from("members")
    .update({ user_id: userId })
    .eq("id", memberId);
  if (linkErr) {
    throw new Error(`linking members.user_id for ${memberId} failed: ${linkErr.message}`);
  }

  const client = createClient(env.API_URL, env.ANON_KEY, {
    ...clientOpts,
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });
  return { client, userId };
}
