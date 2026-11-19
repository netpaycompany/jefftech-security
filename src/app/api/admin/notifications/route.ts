import { Resend } from "resend";

import { isAdminError, requireAdmin } from "@/lib/admin/server";

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THREAD_ID_PATTERN = USER_ID_PATTERN;
const MAX_SUBJECT_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 10_000;
const LOGIN_URL = "https://jefftechsecurity.vercel.app/login";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function createEmailHtml(name: string, message: string) {
  const safeName = escapeHtml(name);
  const safeMessage = escapeHtml(message).replace(/\r\n|\r|\n/g, "<br>");
  const safeLoginUrl = escapeHtml(LOGIN_URL);
  const safeLogoUrl = "https://jefftechsecurity.vercel.app/logo.png";

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#020817;color:#e2e8f0;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">A message from Jefftech Security</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020817;padding:36px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border:1px solid #1e293b;border-radius:20px;overflow:hidden;background:#0f172a">
          <tr><td style="padding:24px 32px;background:linear-gradient(120deg,#172554,#0f172a);border-bottom:1px solid #1e3a8a">
            <table role="presentation" cellspacing="0" cellpadding="0"><tr>
              <td style="padding-right:14px"><img src="${safeLogoUrl}" alt="Jefftech Security" width="56" height="56" style="display:block;width:56px;height:56px;border:0;border-radius:12px;background:#fff;object-fit:contain"></td>
              <td><p style="margin:0;color:#93c5fd;font-size:11px;letter-spacing:3px;text-transform:uppercase">Jefftech Security</p>
              <p style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700">A message for you</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 18px;color:#cbd5e1;font-size:15px;line-height:1.6">Hello ${safeName},</p>
            <div style="color:#e2e8f0;font-size:15px;line-height:1.8;white-space:normal">${safeMessage}</div>
            <p style="margin:28px 0 0">
              <a href="${safeLoginUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Open Jefftech Security</a>
            </p>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #1e293b;color:#94a3b8;font-size:12px;line-height:1.6">
            This message was sent by the Jefftech Security team. We will never ask you to email us your master password or recovery key.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function GET() {
  const access = await requireAdmin();
  if (isAdminError(access)) return access.response;

  const { data: threads, error: threadError } = await access.adminClient
    .from("admin_email_threads")
    .select("id,user_id,contact_email,contact_name,subject,created_at,last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (threadError) {
    return Response.json({ error: "The email mailbox could not be loaded. Apply the admin email mailbox migration." }, { status: 503 });
  }

  const threadIds = (threads ?? []).map((thread) => thread.id);
  if (threadIds.length === 0) {
    return Response.json({ threads: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data: messages, error: messagesError } = await access.adminClient
    .from("admin_email_messages")
    .select("id,thread_id,direction,resend_email_id,subject,text_body,status,delivered_at,opened_at,created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (messagesError) {
    return Response.json({ error: "Email messages could not be loaded." }, { status: 503 });
  }
  const messagesByThread = new Map<string, typeof messages>();
  for (const message of messages ?? []) {
    const current = messagesByThread.get(message.thread_id) ?? [];
    current.push(message);
    messagesByThread.set(message.thread_id, current);
  }
  return Response.json({
    threads: (threads ?? []).map((thread) => ({
      ...thread,
      messages: messagesByThread.get(thread.id) ?? [],
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (isAdminError(access)) return access.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin email requests are not allowed." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return Response.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { userId, threadId, subject: requestedSubject, message } = body as {
    userId?: unknown;
    threadId?: unknown;
    subject?: unknown;
    message?: unknown;
  };
  if (
    (threadId === undefined && (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)))
    || (threadId !== undefined && (typeof threadId !== "string" || !THREAD_ID_PATTERN.test(threadId)))
    || (threadId === undefined && (
      typeof requestedSubject !== "string"
      || requestedSubject.trim().length < 1
      || requestedSubject.trim().length > MAX_SUBJECT_LENGTH
      || /[\r\n]/.test(requestedSubject)
    ))
    || typeof message !== "string"
    || message.trim().length < 1
    || message.length > MAX_MESSAGE_LENGTH
  ) {
    return Response.json({ error: "Enter a valid recipient, subject, and message." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return Response.json({ error: "Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server." }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  let thread: {
    id: string;
    user_id: string | null;
    contact_email: string;
    contact_name: string | null;
    subject: string;
  };
  let replyToMessageId: string | null = null;
  let recipientName = "there";

  if (threadId) {
    const { data, error } = await access.adminClient
      .from("admin_email_threads")
      .select("id,user_id,contact_email,contact_name,subject")
      .eq("id", threadId)
      .single();
    if (error || !data) {
      return Response.json({ error: "The email conversation could not be found." }, { status: 404 });
    }
    thread = data;
    recipientName = data.contact_name || "there";
    const { data: inboundMessage, error: inboundError } = await access.adminClient
      .from("admin_email_messages")
      .select("rfc_message_id")
      .eq("thread_id", data.id)
      .eq("direction", "inbound")
      .not("rfc_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inboundError) {
      return Response.json({ error: "The conversation reply history could not be loaded." }, { status: 503 });
    }
    replyToMessageId = inboundMessage?.rfc_message_id ?? null;
  } else {
    const { data: userData, error: userError } = await access.adminClient.auth.admin.getUserById(userId as string);
    const recipient = userData.user?.email;
    if (userError || !recipient) {
      return Response.json({ error: "The selected account does not have a deliverable email address." }, { status: 404 });
    }
    recipientName = typeof userData.user.user_metadata?.full_name === "string"
      ? userData.user.user_metadata.full_name.slice(0, 120)
      : "there";
    const { data, error } = await access.adminClient
      .from("admin_email_threads")
      .insert({
        user_id: userId,
        contact_email: recipient,
        contact_name: recipientName,
        subject: (requestedSubject as string).trim(),
      })
      .select("id,user_id,contact_email,contact_name,subject")
      .single();
    if (error || !data) {
      return Response.json({ error: "The email conversation could not be created." }, { status: 503 });
    }
    thread = data;
  }

  const subject = threadId
    ? (/^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`).slice(0, MAX_SUBJECT_LENGTH)
    : thread.subject;
  const messageText = message.trim();
  const { data: messageRow, error: messageInsertError } = await access.adminClient
    .from("admin_email_messages")
    .insert({
      thread_id: thread.id,
      direction: "outbound",
      in_reply_to: replyToMessageId,
      from_email: from,
      to_email: thread.contact_email,
      subject,
      text_body: messageText,
      status: "sending",
    })
    .select("id")
    .single();
  if (messageInsertError || !messageRow) {
    return Response.json({ error: "The email could not be saved to the mailbox." }, { status: 503 });
  }

  const tags = [
    { name: "admin_message_id", value: messageRow.id },
    { name: "admin_thread_id", value: thread.id },
  ];
  const { data: sentEmail, error: sendError } = await resend.emails.send({
    from,
    to: [thread.contact_email],
    subject,
    text: `Hello ${recipientName},\n\n${messageText}\n\nOpen Jefftech Security.\n\nJefftech Security will never ask you to email us your master password or recovery key.`,
    html: createEmailHtml(recipientName, messageText),
    headers: replyToMessageId ? { "In-Reply-To": replyToMessageId } : undefined,
    tags,
  });
  if (sendError || !sentEmail) {
    await access.adminClient
      .from("admin_email_messages")
      .update({ status: "failed" })
      .eq("id", messageRow.id);
    return Response.json({ error: "The email provider could not send this notification. Check the sender configuration and try again." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const [{ error: messageUpdateError }, { error: threadUpdateError }] = await Promise.all([
    access.adminClient
      .from("admin_email_messages")
      .update({ resend_email_id: sentEmail.id, status: "sent" })
      .eq("id", messageRow.id),
    access.adminClient
      .from("admin_email_threads")
      .update({ last_message_at: now })
      .eq("id", thread.id),
  ]);
  if (messageUpdateError || threadUpdateError) {
    return Response.json({ error: "The email was sent, but its mailbox status could not be saved." }, { status: 503 });
  }

  return Response.json({ sent: true, threadId: thread.id }, { headers: { "Cache-Control": "no-store" } });
}
