// Pluggable email transport.
//   - If SMTP_URL is set, deliver via nodemailer (dynamically imported so it's
//     an optional dependency).
//   - Otherwise use a capture transport that records messages in memory. This
//     keeps dev/test hermetic and lets tests assert what would have been sent.
// Set EMAIL_ENABLED=off to disable entirely.

export const sentEmails = []; // capture buffer (dev/test)
const MAX_CAPTURE = 100;

let smtpTransport = null;
async function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  const nodemailer = await import('nodemailer'); // optional dependency
  smtpTransport = nodemailer.createTransport(process.env.SMTP_URL);
  return smtpTransport;
}

export async function sendEmail({ to, subject, text }) {
  if (process.env.EMAIL_ENABLED === 'off' || !to) return { skipped: true };
  const from = process.env.EMAIL_FROM ?? 'ITPM360 <no-reply@itpm360.local>';

  if (process.env.SMTP_URL) {
    try {
      const transport = await getSmtpTransport();
      await transport.sendMail({ from, to, subject, text });
      return { sent: true };
    } catch (err) {
      console.error('email send failed:', err.message);
      return { error: err.message };
    }
  }

  // Capture transport
  sentEmails.push({ to, subject, text, at: new Date().toISOString() });
  if (sentEmails.length > MAX_CAPTURE) sentEmails.shift();
  if (process.env.EMAIL_DEBUG) console.log(`[email] → ${to}: ${subject}`);
  return { captured: true };
}
