import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const extractBasicAuthToken = (req: Request): string => {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return "";
  const encoded = header.slice(6).trim();
  try {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(":");
    if (idx < 0) return decoded.trim();
    const pass = decoded.slice(idx + 1).trim();
    const user = decoded.slice(0, idx).trim();
    return pass || user;
  } catch {
    return "";
  }
};

type Resource =
  | "purchase_requisitions"
  | "canvass_requests"
  | "cash_advance_requests"
  | "petty_cash_requests"
  | "reimbursement_requests"
  | "msbc_postings";

const VALID_RESOURCES: Resource[] = [
  "purchase_requisitions",
  "canvass_requests",
  "cash_advance_requests",
  "petty_cash_requests",
  "reimbursement_requests",
  "msbc_postings",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return json(405, { error: "Method not allowed. Use GET." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Server not configured" });
    }
    const admin = createClient(supabaseUrl, serviceKey);

    const token = extractBasicAuthToken(req);
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Basic Auth credentials" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Basic realm="P2P-MSBC API"',
          },
        },
      );
    }

    const { data: tokenRow, error: tokenErr } = await admin
      .from("msbc_api_tokens")
      .select("id, is_active")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) return json(500, { error: tokenErr.message });
    if (!tokenRow || !tokenRow.is_active) {
      return json(401, { error: "Invalid or inactive API key" });
    }

    const url = new URL(req.url);
    const params = url.searchParams;

    const resourceParam = params.get("resource") || "all";
    const status = params.get("status");
    const company_id = params.get("company_id");
    const document_no = params.get("document_no");
    const since = params.get("since");
    const until = params.get("until");
    const msbc_posting_status = params.get("msbc_posting_status");
    const limit = Math.min(parseInt(params.get("limit") || "50", 10) || 50, 500);
    const offset = parseInt(params.get("offset") || "0", 10) || 0;

    const runQuery = async (res: Resource) => {
      let q = admin
        .from(res)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) q = q.eq("status", status);
      if (company_id) q = q.eq("company_id", company_id);
      if (document_no) q = q.eq("document_no", document_no);
      if (msbc_posting_status && res !== "msbc_postings") {
        q = q.eq("msbc_posting_status", msbc_posting_status);
      }
      if (since) q = q.gte("created_at", since);
      if (until) q = q.lte("created_at", until);

      const { data, error, count } = await q;
      return { res, data: data ?? [], count: count ?? data?.length ?? 0, error };
    };

    if (resourceParam === "all") {
      const results = await Promise.all(VALID_RESOURCES.map(runQuery));
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        return json(400, { error: `${failed.res}: ${failed.error.message}` });
      }
      const resources: Record<string, { count: number; data: unknown[] }> = {};
      let total = 0;
      for (const r of results) {
        resources[r.res] = { count: r.count, data: r.data };
        total += r.count;
      }
      return json(200, { resource: "all", total_count: total, limit, offset, resources });
    }

    if (!VALID_RESOURCES.includes(resourceParam as Resource)) {
      return json(400, {
        error: `Invalid resource. Use "all" or one of: ${VALID_RESOURCES.join(", ")}`,
      });
    }

    const result = await runQuery(resourceParam as Resource);
    if (result.error) return json(400, { error: result.error.message });

    return json(200, {
      resource: result.res,
      count: result.count,
      limit,
      offset,
      data: result.data,
    });
  } catch (err) {
    return json(500, { error: (err as Error).message || "Unexpected error" });
  }
});
