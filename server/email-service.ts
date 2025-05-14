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
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Sends an email using the SendGrid API
 * @param params Email parameters
 * @returns true if the email was sent successfully, false otherwise
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const msg = {
      to: params.to,
      from: params.from, // This needs to be a verified sender in SendGrid
      subject: params.subject,
      text: params.text || '',
      html: params.html || ''
    };
    
    await mail.send(msg);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
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
  const from = 'noreply@yourdomain.com'; // Update with your verified sender
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