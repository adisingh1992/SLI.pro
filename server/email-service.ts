import { MailService } from '@sendgrid/mail';
import mail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will not work.");
}

// Initialize SendGrid with the API key
mail.setApiKey(process.env.SENDGRID_API_KEY || '');

interface EmailParams {
  to: string;
  from: string;
  /**
   * Where a reply should go, when the message is asking for one.
   *
   * Separate from `from` on purpose: `from` has to stay a sender SendGrid has
   * verified, and the reply address lives on a different domain — the one with the
   * Inbound Parse MX record. Setting `from` to it would send every message from an
   * address that only receives.
   */
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}

export type SendOutcome = {
  sent: boolean;
  /** SendGrid's x-message-id — the handle for querying deliverability later. */
  messageId: string | null;
  /** One line, safe to store. Null when the send was accepted. */
  reason: string | null;
};

/**
 * Sends an email and reports what actually happened.
 *
 * `sendEmail` below keeps the boolean signature for existing callers. New code
 * should prefer this: "accepted or not" is rarely enough on its own, and the
 * message id is the only way to answer "did it actually arrive" afterwards.
 */
export async function sendEmailDetailed(params: EmailParams): Promise<SendOutcome> {
  try {
    const msg = {
      to: params.to,
      from: params.from, // This needs to be a verified sender in SendGrid
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      subject: params.subject,
      text: params.text || '',
      html: params.html || ''
    };

    console.log(`Attempting to send email to: ${params.to} from: ${params.from}`);
    const [response] = await mail.send(msg);
    // SendGrid returns 202 with the id in a header; there is no body to read.
    const messageId =
      (response?.headers as Record<string, string> | undefined)?.["x-message-id"] ?? null;
    console.log(`Email sent successfully to ${params.to}${messageId ? ` (${messageId})` : ""}`);
    return { sent: true, messageId, reason: null };
  } catch (error: any) {
    /*
     * SendGrid puts the actual reason in error.response.body.errors, which is
     * nested three levels deep. console.error truncates at depth 2, so the
     * previous version printed `errors: [Array]` and `[Object]` — the stack
     * trace and headers were visible and the one useful sentence was not.
     *
     * The errors array is the only part worth reading, so it is pulled out and
     * printed flat rather than dumped.
     */
    const status = error?.code ?? error?.response?.statusCode;
    const errors: Array<{ message?: string; field?: string; help?: string }> =
      error?.response?.body?.errors ?? [];

    console.error(`[email] SendGrid refused the send — HTTP ${status ?? "?"}`);
    console.error(`[email]   to:   ${params.to}`);
    console.error(`[email]   from: ${params.from}`);

    if (errors.length) {
      for (const e of errors) {
        console.error(`[email]   → ${e.message ?? "(no message)"}`);
        if (e.field) console.error(`[email]     field: ${e.field}`);
        if (e.help) console.error(`[email]     help:  ${e.help}`);
      }
    } else {
      console.error(`[email]   ${error?.message ?? String(error)}`);
    }

    // The two failures that account for almost every 401/403 here, called out
    // because the API's own wording ("The from address does not match a
    // verified Sender Identity") is easy to read as a malformed-address
    // problem rather than a one-time setup step.
    if (status === 403) {
      console.error(
        `[email]   Most likely: "${params.from}" is not a verified sender in SendGrid.\n` +
          `[email]   Verify it under Settings → Sender Authentication, or set\n` +
          `[email]   WING_FROM_EMAIL to an address that already is.`,
      );
    }
    if (status === 401) {
      console.error(`[email]   Most likely: SENDGRID_API_KEY is missing, wrong, or lacks Mail Send.`);
    }

    const reason =
      `HTTP ${status ?? "?"}: ` +
      (errors.map((e) => e.message).filter(Boolean).join("; ") ||
        error?.message ||
        "unknown");

    return { sent: false, messageId: null, reason: reason.slice(0, 500) };
  }
}

/**
 * Sends an email using the SendGrid API
 * @param params Email parameters
 * @returns true if the email was sent successfully, false otherwise
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  return (await sendEmailDetailed(params)).sent;
}

/**
 * Sends a password reset email to the user
 * @param to The recipient's email address
 * @param resetToken The password reset token
 * @param baseUrl The base URL of the application (for building the reset link)
 * @returns true if the email was sent successfully, false otherwise
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  baseUrl: string
): Promise<boolean> {
  // For SendGrid, the sender must be a verified domain or email
  // In production, replace this with your actual verified sender email
  const from = 'notifications@slipro.com'; // Replace with your verified sender email';
  const subject = 'Password Reset Request';
  
  // Get base URL from request or environment
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  
  const text = `
    You have requested to reset your password.
    
    Please click on the following link to reset your password:
    ${resetUrl}
    
    If you did not request this, please ignore this email and your password will remain unchanged.
    
    This link will expire in 1 hour.
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4A5568; text-align: center;">Password Reset Request</h2>
      <p>You have requested to reset your password.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #bed6d1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
          Reset Your Password
        </a>
      </div>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <p style="color: #718096; font-size: 14px;">This link will expire in 1 hour.</p>
    </div>
  `;
  
  return await sendEmail({
    to,
    from,
    subject,
    text,
    html
  });
}