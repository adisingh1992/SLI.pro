import nodemailer from 'nodemailer';

// Create a test account for development (using Ethereal Email)
let transporter: nodemailer.Transporter;

// Initialize the transporter once
async function initializeTransporter() {
  if (!transporter) {
    // Create a test account at Ethereal for development
    const testAccount = await nodemailer.createTestAccount();
    
    // Create a transporter with Ethereal email
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    
    console.log('Email service initialized with test account:', testAccount.user);
  }
  
  return transporter;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using the configured transporter
 */
export async function sendEmail(options: EmailOptions): Promise<{success: boolean, previewUrl?: string, error?: any}> {
  try {
    const emailTransporter = await initializeTransporter();
    
    const mailOptions = {
      from: '"Career Growth Platform" <noreply@careergrowth.app>',
      to: options.to,
      subject: options.subject,
      text: options.text || '',
      html: options.html
    };
    
    const info = await emailTransporter.sendMail(mailOptions);
    
    // For development, return the Ethereal URL so we can preview the email
    const testUrl = nodemailer.getTestMessageUrl(info);
    return {
      success: true,
      previewUrl: typeof testUrl === 'string' ? testUrl : undefined
    };
  } catch (error) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      error
    };
  }
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(email: string, token: string, appUrl: string): Promise<{success: boolean, previewUrl?: string, error?: any}> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333333;">Reset Your Password</h2>
      <p>You requested a password reset for your Career Growth Platform account.</p>
      <p>Please click the button below to create a new password. This link will expire in 1 hour.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #bed6d1; color: #333333; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
      </div>
      <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
      <p>Thank you,<br>The Career Growth Platform Team</p>
    </div>
  `;
  
  const emailText = `
    Reset Your Password
    
    You requested a password reset for your Career Growth Platform account.
    
    Please visit the following link to create a new password:
    ${resetUrl}
    
    This link will expire in 1 hour.
    
    If you didn't request this password reset, please ignore this email or contact support if you have concerns.
    
    Thank you,
    The Career Growth Platform Team
  `;
  
  return sendEmail({
    to: email,
    subject: 'Reset Your Password - Career Growth Platform',
    html: emailHtml,
    text: emailText
  });
}