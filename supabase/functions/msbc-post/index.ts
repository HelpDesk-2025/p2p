import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("msbc_postings")
        .select("*")
        .order("date_posted", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: error.message });
      return json(200, { data });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const msbc_document_no = (body?.msbc_document_no ?? "").toString().trim();
    const external_document_no = (body?.external_document_no ?? "").toString();
    const payment_type = (body?.payment_type ?? "").toString();
    const date_posted_input = body?.date_posted
      ? new Date(body.date_posted)
      : new Date();
    const notes = (body?.notes ?? "").toString();

    if (!msbc_document_no) {
      return json(400, { error: "msbc_document_no is required" });
    }
    if (!payment_type) {
      return json(400, { error: "payment_type is required" });
    }
    if (isNaN(date_posted_input.getTime())) {
      return json(400, { error: "date_posted is invalid" });
    }

    const { data, error } = await admin
      .from("msbc_postings")
      .insert({
        msbc_document_no,
        external_document_no,
        payment_type,
        date_posted: date_posted_input.toISOString(),
        notes,
      })
      .select()
      .maybeSingle();

    if (error) return json(400, { error: error.message });
    return json(201, { data });
  } catch (err) {
    return json(500, { error: (err as Error).message || "Unexpected error" });
  }
});
