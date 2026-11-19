import { Resend, type WebhookEventPayload } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainTextFromHtml(html: string | null) {
  if (!html) return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractEmail(value: string) {
  const match = value.match(/<([^<>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function extractMessageIds(headers: Record<string, string> | null) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const values = [normalizedHeaders["in-reply-to"], normalizedHeaders.references].filter(Boolean).join(" ");
  return [...values.matchAll(/<[^<>\s]+>/g)].map(([messageId]) => messageId);
}

function eventMessageId(event: WebhookEventPayload) {
  if (event.type === "email.received" || event.type === "email.sent" || event.type === "email.delivered"
    || event.type === "email.opened" || event.type === "email.bounced" || event.type === "email.failed"
    || event.type === "email.suppressed" || event.type === "email.delivery_delayed" || event.type === "email.complained") {
    return event.data.email_id;
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !webhookSecret || !serviceRoleKey || !isSupabaseConfigured()) {
    return Response.json({ error: "Email webhook is not configured." }, { status: 503 });
  }

  const eventId = request.headers.get("svix-id");
  const rawBody = await request.text();
  let event: WebhookEventPayload;
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: eventId ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  if (!eventId) {
    return Response.json({ error: "Missing webhook event ID." }, { status: 400 });
  }

  const client = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: existingEvent, error: eventLookupError } = await client
    .from("admin_email_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (eventLookupError) {
    return Response.json({ error: "Webhook event storage is unavailable." }, { status: 503 });
  }
  if (existingEvent) {
    return Response.json({ received: true, duplicate: true });
  }

  if (event.type === "email.received") {
    const inboundAddress = (process.env.RESEND_INBOUND_ADDRESS || "support@replies.netppay.com").toLowerCase();
    const eventRecipientAddresses = [...event.data.to, ...event.data.received_for].map((address) => address.toLowerCase());
    if (!eventRecipientAddresses.includes(inboundAddress)) {
      return Response.json({ received: true, ignored: true });
    }

    const resend = new Resend(apiKey);
    const { data: inboundEmail, error: inboundError } = await resend.emails.receiving.get(event.data.email_id);
    if (inboundError || !inboundEmail) {
      return Response.json({ error: "Received email content could not be retrieved." }, { status: 502 });
    }
    const senderEmail = extractEmail(event.data.from);
    const headerFrom = Object.entries(inboundEmail.headers ?? {})
      .find(([name]) => name.toLowerCase() === "from")?.[1];
    const senderName = headerFrom?.replace(/\s*<[^<>]+>\s*$/, "").replace(/^["']|["']$/g, "").trim() || null;
    const references = extractMessageIds(inboundEmail.headers);
    let thread: { id: string; user_id: string | null; contact_email: string; contact_name: string | null; subject: string } | null = null;

    if (references.length > 0) {
      const { data: matchingMessage } = await client
        .from("admin_email_messages")
        .select("thread_id")
        .in("rfc_message_id", references)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (matchingMessage) {
        const { data } = await client
          .from("admin_email_threads")
          .select("id,user_id,contact_email,contact_name,subject")
          .eq("id", matchingMessage.thread_id)
          .maybeSingle();
        thread = data;
      }
    }

    if (!thread) {
      const { data: profile } = await client
        .from("profiles")
        .select("id,full_name,email")
        .eq("email", senderEmail)
        .maybeSingle();
      const { data: newThread, error: threadError } = await client
        .from("admin_email_threads")
        .insert({
          user_id: profile?.id ?? null,
          contact_email: senderEmail,
          contact_name: senderName ?? profile?.full_name ?? null,
          subject: event.data.subject || "(no subject)",
        })
        .select("id,user_id,contact_email,contact_name,subject")
        .single();
      if (threadError || !newThread) {
        return Response.json({ error: "The inbound email conversation could not be saved." }, { status: 503 });
      }
      thread = newThread;
    }

    const body = inboundEmail.text?.trim() || plainTextFromHtml(inboundEmail.html);
    const { error: messageError } = await client
      .from("admin_email_messages")
      .upsert({
        thread_id: thread.id,
        direction: "inbound",
        resend_email_id: event.data.email_id,
        rfc_message_id: inboundEmail.message_id,
        in_reply_to: references[0] ?? null,
        from_email: senderEmail,
        to_email: inboundAddress,
        subject: event.data.subject || "(no subject)",
        text_body: body.slice(0, 100_000),
        status: "received",
        created_at: event.data.created_at,
      }, { onConflict: "resend_email_id", ignoreDuplicates: true });
    if (messageError) {
      return Response.json({ error: "The inbound email could not be saved." }, { status: 503 });
    }
    const { error: updateError } = await client
      .from("admin_email_threads")
      .update({ last_message_at: event.data.created_at })
      .eq("id", thread.id);
    if (updateError) {
      return Response.json({ error: "The inbound email was saved, but its conversation timestamp could not be updated." }, { status: 503 });
    }
  } else {
    const messageId = eventMessageId(event);
    const tags = "data" in event && "tags" in event.data && isRecord(event.data.tags)
      ? event.data.tags
      : null;
    const taggedMessageId = typeof tags?.admin_message_id === "string" ? tags.admin_message_id : null;
    if (messageId || taggedMessageId) {
      const lookup = client.from("admin_email_messages")
        .select("id,status")
        .limit(1);
      const { data: trackedMessage, error: lookupError } = taggedMessageId
        ? await lookup.eq("id", taggedMessageId).maybeSingle()
        : await lookup.eq("resend_email_id", messageId as string).maybeSingle();
      if (lookupError) {
        return Response.json({ error: "Email delivery status could not be loaded." }, { status: 503 });
      }
      if (trackedMessage) {
        const eventStatus = event.type === "email.delivered" ? "delivered"
          : event.type === "email.opened" ? "opened"
            : event.type === "email.bounced" || event.type === "email.suppressed" ? "bounced"
              : event.type === "email.failed" ? "failed"
                : null;
        const statusRank: Record<string, number> = {
          sending: 0,
          sent: 1,
          delivered: 2,
          opened: 3,
          bounced: 4,
          failed: 4,
        };
        const update: Record<string, string> = {};
        if (eventStatus && (statusRank[eventStatus] ?? 0) >= (statusRank[trackedMessage.status] ?? 0)) {
          update.status = eventStatus;
        }
        if (event.type === "email.delivered") update.delivered_at = event.created_at;
        if (event.type === "email.opened") update.opened_at = event.created_at;
        if ("message_id" in event.data && event.data.message_id) update.rfc_message_id = event.data.message_id;
        const { error: updateError } = await client
          .from("admin_email_messages")
          .update(update)
          .eq("id", trackedMessage.id);
        if (updateError) {
        return Response.json({ error: "Email delivery status could not be saved." }, { status: 503 });
        }
      }
    }
  }

  const { error: eventInsertError } = await client
    .from("admin_email_webhook_events")
    .insert({ event_id: eventId });
  if (eventInsertError) {
    return Response.json({ error: "Webhook event could not be marked as processed." }, { status: 503 });
  }
  return Response.json({ received: true });
}
