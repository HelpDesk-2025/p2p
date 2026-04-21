import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OverdueRow {
  approver_id: string;
  approver_email: string;
  approver_name: string;
  request_type: string;
  request_id: string;
  request_number: string;
  requester_name: string;
  company_id: string;
  company_name: string;
  amount: number | null;
  purpose: string | null;
  received_at: string;
  days_waiting: number;
  days_allowed: number;
  days_overdue: number;
}

interface DigestGroup {
  approver_id: string;
  approver_email: string;
  approver_name: string;
  company_id: string;
  rows: OverdueRow[];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatAmount(amt: number | null) {
  if (amt === null || amt === undefined) return "—";
  return `PHP ${Number(amt).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function generateDigestHtml(group: DigestGroup): string {
  const rowsHtml = group.rows
    .map((r) => {
      const overdueBadge = `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#991b1b;font-weight:600;font-size:12px;">${r.days_overdue} day(s) overdue</span>`;
      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div style="font-weight:600;color:#111827;font-family:monospace;">${r.request_number}</div>
            <div style="color:#6b7280;font-size:12px;margin-top:2px;">${r.request_type}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;">
            ${r.requester_name}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;">
            ${formatAmount(r.amount)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;">
            ${formatDate(r.received_at)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;">
            ${r.days_waiting} / ${r.days_allowed}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            ${overdueBadge}
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0;background:#f3f4f6;color:#111827;">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,0.08);">
    <div style="background:linear-gradient(135deg,#1f3b73 0%,#0f2150 100%);padding:28px 28px;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Overdue Approval Reminder</h1>
      <p style="color:#cbd5e1;margin:6px 0 0 0;font-size:13px;">
        The following ${group.rows.length} request(s) have exceeded the configured approval time for your step.
      </p>
    </div>

    <div style="padding:28px;">
      <p style="margin:0 0 16px 0;font-size:15px;">Hello ${group.approver_name},</p>
      <p style="margin:0 0 20px 0;color:#4b5563;font-size:14px;line-height:1.6;">
        You have pending approvals in the <strong>Procure-to-Pay</strong> system that have been waiting longer than the
        "Days to Approve" configured in your approval step. Please review and act on them as soon as possible.
      </p>

      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Request</th>
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Requester</th>
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Amount</th>
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Received By You</th>
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Waiting / Allowed</th>
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div style="text-align:center;margin:28px 0 0 0;">
        <a href="https://p2p.stjoseph-group.com/"
           style="display:inline-block;background:#1f3b73;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;">
          Open Procure-to-Pay
        </a>
      </div>

      <p style="margin:24px 0 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
        Waiting time excludes weekends and holidays configured in the system.
        Business days are counted from the moment the request reached your approval step.
      </p>
    </div>

    <div style="background:#f8fafc;padding:18px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">Automated daily reminder. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendSmtpEmail(
  smtpConfig: any,
  to: string,
  subject: string,
  html: string,
) {
  const normalizedHtml = html.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const encodedFromName = `=?UTF-8?B?${btoa(
    unescape(encodeURIComponent(smtpConfig.from_name || "Procure-to-Pay")),
  )}?=`;
  const message = [
    `From: ${encodedFromName} <${smtpConfig.from_address}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    normalizedHtml,
  ].join("\r\n");

  const encoder = new TextEncoder();

  const conn = await Deno.connect({
    hostname: smtpConfig.host,
    port: smtpConfig.port,
  });

  const readBase = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const { value } = await reader.read();
    return value ? new TextDecoder().decode(value) : "";
  };

  const writeBase = async (
    writer: WritableStreamDefaultWriter<Uint8Array>,
    data: string,
  ) => {
    await writer.write(encoder.encode(data + "\r\n"));
  };

  const reader = conn.readable.getReader();
  const writer = conn.writable.getWriter();

  await readBase(reader);
  await writeBase(writer, `EHLO ${smtpConfig.host}`);
  await readBase(reader);

  if (smtpConfig.encryption === "tls") {
    await writeBase(writer, "STARTTLS");
    await readBase(reader);

    const tls = await Deno.startTls(conn, { hostname: smtpConfig.host });
    const tReader = tls.readable.getReader();
    const tWriter = tls.writable.getWriter();

    await writeBase(tWriter, `EHLO ${smtpConfig.host}`);
    await readBase(tReader);
    await writeBase(tWriter, "AUTH LOGIN");
    await readBase(tReader);
    await writeBase(tWriter, btoa(smtpConfig.username));
    await readBase(tReader);
    await writeBase(tWriter, btoa(smtpConfig.password));
    await readBase(tReader);
    await writeBase(tWriter, `MAIL FROM:<${smtpConfig.from_address}>`);
    await readBase(tReader);
    await writeBase(tWriter, `RCPT TO:<${to}>`);
    await readBase(tReader);
    await writeBase(tWriter, "DATA");
    await readBase(tReader);
    await writeBase(tWriter, message + "\r\n.");
    await readBase(tReader);
    await writeBase(tWriter, "QUIT");
    await readBase(tReader);
    tls.close();
  } else {
    await writeBase(writer, "AUTH LOGIN");
    await readBase(reader);
    await writeBase(writer, btoa(smtpConfig.username));
    await readBase(reader);
    await writeBase(writer, btoa(smtpConfig.password));
    await readBase(reader);
    await writeBase(writer, `MAIL FROM:<${smtpConfig.from_address}>`);
    await readBase(reader);
    await writeBase(writer, `RCPT TO:<${to}>`);
    await readBase(reader);
    await writeBase(writer, "DATA");
    await readBase(reader);
    await writeBase(writer, message + "\r\n.");
    await readBase(reader);
    await writeBase(writer, "QUIT");
    await readBase(reader);
    conn.close();
  }
}

function isHolidayOrWeekend(now: Date, holidays: Array<{ holiday_date: string; is_recurring: boolean }>) {
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return true;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  for (const h of holidays) {
    const hd = new Date(h.holiday_date);
    if (h.is_recurring) {
      if (hd.getMonth() + 1 === month && hd.getDate() === day) return true;
    } else {
      if (
        hd.getFullYear() === now.getFullYear() &&
        hd.getMonth() + 1 === month &&
        hd.getDate() === day
      ) {
        return true;
      }
    }
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const force = url.searchParams.get("force") === "true";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const { data: holidays } = await supabase
      .from("holidays")
      .select("holiday_date,is_recurring");

    if (!force && isHolidayOrWeekend(now, holidays || [])) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "Non-working day (weekend or holiday).",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: overdue, error: overdueErr } = await supabase.rpc(
      "get_overdue_pending_approvals",
    );

    if (overdueErr) throw overdueErr;

    const rows: OverdueRow[] = (overdue || []).filter(
      (r: OverdueRow) => r.approver_email && r.approver_email.includes("@"),
    );

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total_overdue: 0, emails_sent: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const today = new Date();
    const todayLocal = new Date(
      today.toLocaleString("en-US", { timeZone: "Asia/Manila" }),
    );
    const todayStr = `${todayLocal.getFullYear()}-${String(
      todayLocal.getMonth() + 1,
    ).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;

    const { data: alreadySent } = await supabase
      .from("notification_log")
      .select("approver_id,request_id")
      .eq("notification_type", "overdue_approval")
      .eq("status", "sent")
      .eq("sent_date", todayStr);

    const sentSet = new Set(
      (alreadySent || []).map(
        (r: any) => `${r.approver_id}::${r.request_id}`,
      ),
    );

    const filteredRows = rows.filter(
      (r) => !sentSet.has(`${r.approver_id}::${r.request_id}`),
    );

    const groups = new Map<string, DigestGroup>();
    for (const r of filteredRows) {
      const key = r.approver_id;
      if (!groups.has(key)) {
        groups.set(key, {
          approver_id: r.approver_id,
          approver_email: r.approver_email,
          approver_name: r.approver_name,
          company_id: r.company_id,
          rows: [],
        });
      }
      groups.get(key)!.rows.push(r);
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          total_overdue: rows.length,
          digests: Array.from(groups.values()).map((g) => ({
            approver_email: g.approver_email,
            approver_name: g.approver_name,
            rows: g.rows.length,
          })),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const configCache = new Map<string, any>();
    const getSmtp = async (companyId: string) => {
      if (configCache.has(companyId)) return configCache.get(companyId);
      let { data: cfg } = await supabase
        .from("smtp_configurations")
        .select("*")
        .eq("is_active", true)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!cfg) {
        const fallback = await supabase
          .from("smtp_configurations")
          .select("*")
          .eq("is_active", true)
          .is("company_id", null)
          .maybeSingle();
        cfg = fallback.data;
      }
      if (!cfg) {
        const anyActive = await supabase
          .from("smtp_configurations")
          .select("*")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        cfg = anyActive.data;
      }
      configCache.set(companyId, cfg);
      return cfg;
    };

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const group of groups.values()) {
      const smtp = await getSmtp(group.company_id);
      if (!smtp) {
        emailsFailed += group.rows.length;
        for (const r of group.rows) {
          await supabase.from("notification_log").insert({
            approver_id: group.approver_id,
            approver_email: group.approver_email,
            request_type: r.request_type,
            request_id: r.request_id,
            notification_type: "overdue_approval",
            status: "failed",
            error_message: "No active SMTP configuration available",
          });
        }
        continue;
      }

      const subject = `P2P - Overdue Approvals Reminder (${group.rows.length} pending)`;
      const html = generateDigestHtml(group);

      try {
        await sendSmtpEmail(smtp, group.approver_email, subject, html);
        emailsSent += 1;
        const logRows = group.rows.map((r) => ({
          approver_id: group.approver_id,
          approver_email: group.approver_email,
          request_type: r.request_type,
          request_id: r.request_id,
          notification_type: "overdue_approval",
          status: "sent",
        }));
        if (logRows.length > 0) {
          await supabase.from("notification_log").insert(logRows);
        }
      } catch (sendErr: any) {
        emailsFailed += 1;
        const errMsg = String(sendErr?.message || sendErr).slice(0, 1000);
        for (const r of group.rows) {
          await supabase.from("notification_log").insert({
            approver_id: group.approver_id,
            approver_email: group.approver_email,
            request_type: r.request_type,
            request_id: r.request_id,
            notification_type: "overdue_approval",
            status: "failed",
            error_message: errMsg,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_overdue: rows.length,
        approvers_notified: emailsSent,
        approvers_failed: emailsFailed,
        skipped_already_sent: rows.length - filteredRows.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("notify-overdue-approvals error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
