const nodemailer = require("nodemailer");
const path = require("path");

// Ensure environment variables are loaded
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "jvnpraveen22@gmail.com";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || `"Visa Slots Updates" <${SMTP_USER || ADMIN_EMAIL}>`;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email alert to the admin when a client requests a slot booking assistance call
 */
async function sendScheduleCallAdminAlert(data) {
  const {
    name = "Prospective Applicant",
    mobile = "Not Provided",
    email = "Not Provided",
    category = "General / All",
    preferredTime = "Anytime",
    targetCity = "Any Center",
    message = "",
    createdAt = new Date(),
  } = data;

  const timeFormatted = new Date(createdAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "medium",
  }) + " IST";

  const subject = `🚨 [Visa Slots Updates] New Booking Call Request: ${name} (${category})`;

  const textBody = [
    "=======================================================",
    "🚨 NEW VISA SLOT BOOKING ASSISTANCE CALL REQUEST",
    "=======================================================",
    `Client Name:     ${name}`,
    `Mobile Number:   ${mobile}`,
    `Email Address:   ${email || "Not Provided"}`,
    `Visa Category:   ${category}`,
    `Preferred Time:  ${preferredTime}`,
    `Target Centers:  ${targetCity}`,
    `Client Notes:    ${message || "Direct callback requested for slot booking assistance."}`,
    `Received At:     ${timeFormatted}`,
    "=======================================================",
    "Please follow up with the applicant promptly.",
    "Visa Slots Updates — Lead Notification System",
  ].join("\n");

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
          .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(12, 35, 64, 0.06); }
          .header { background: #0c2340; color: #ffffff; padding: 24px; text-align: left; }
          .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
          .header p { margin: 0; font-size: 13px; color: #94a3b8; }
          .badge { display: inline-block; background: #b22234; color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; margin-bottom: 10px; }
          .body { padding: 28px 24px; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          .table tr { border-bottom: 1px solid #f1f5f9; }
          .table td { padding: 12px 8px; font-size: 14px; }
          .table td.label { font-weight: 700; color: #475569; width: 35%; text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.03em; }
          .table td.val { font-weight: 600; color: #0f172a; }
          .val-highlight { color: #0c2340; font-size: 16px; font-weight: 800; }
          .notes-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px; font-size: 13.5px; color: #334155; line-height: 1.5; margin-bottom: 24px; }
          .actions { display: flex; gap: 12px; margin-top: 10px; }
          .btn-call { display: inline-block; background: #0c2340; color: #ffffff !important; padding: 11px 20px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 13px; }
          .btn-wa { display: inline-block; background: #25D366; color: #ffffff !important; padding: 11px 20px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 13px; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <span class="badge">Immediate Action Required</span>
            <h1>New Visa Slot Booking Call Request</h1>
            <p>A client has requested a slot booking assistance callback.</p>
          </div>
          <div class="body">
            <table class="table">
              <tr>
                <td class="label">Client Name</td>
                <td class="val val-highlight">${name}</td>
              </tr>
              <tr>
                <td class="label">Mobile Number</td>
                <td class="val val-highlight">${mobile}</td>
              </tr>
              <tr>
                <td class="label">Email Address</td>
                <td class="val">${email || "—"}</td>
              </tr>
              <tr>
                <td class="label">Visa Category</td>
                <td class="val"><strong>${category}</strong></td>
              </tr>
              <tr>
                <td class="label">Preferred Call Time</td>
                <td class="val"><strong style="color: #b22234;">${preferredTime}</strong></td>
              </tr>
              <tr>
                <td class="label">Target Centers</td>
                <td class="val">${targetCity}</td>
              </tr>
              <tr>
                <td class="label">Submitted At</td>
                <td class="val">${timeFormatted}</td>
              </tr>
            </table>

            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; margin-bottom: 6px;">Client Requirements / Notes:</div>
            <div class="notes-box">
              ${message ? message.replace(/\n/g, "<br>") : "<em>No additional notes provided. Direct callback requested.</em>"}
            </div>

            <div style="margin-top: 20px;">
              <a href="tel:${mobile.replace(/[^\d+]/g, '')}" class="btn-call">📞 Call Client</a>
              &nbsp;&nbsp;
              <a href="https://wa.me/${mobile.replace(/\D/g, '')}" class="btn-wa">💬 WhatsApp Client</a>
            </div>
          </div>
          <div class="footer">
            Visa Slots Updates Lead Engine • Delivered to ${ADMIN_EMAIL}
          </div>
        </div>
      </body>
    </html>
  `;

  const mailClient = getTransporter();
  if (!mailClient) {
    console.log(`\n📧 [Mailer Simulation] Admin Email Notification:`);
    console.log(`   To:      ${ADMIN_EMAIL}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Client:  ${name} (${mobile}) | Category: ${category} | Time: ${preferredTime}`);
    console.log(`   Note:    SMTP credentials not configured in .env. To enable real inbox delivery, add SMTP_HOST/SMTP_USER/SMTP_PASS in backend/.env.\n`);
    return { ok: true, queued: true, note: "SMTP not configured" };
  }

  try {
    const info = await mailClient.sendMail({
      from: SMTP_FROM,
      to: ADMIN_EMAIL,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`✔ [Mailer] Email notification sent to ${ADMIN_EMAIL} (MsgId: ${info.messageId})`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ [Mailer] Failed to send email to ${ADMIN_EMAIL}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sendScheduleCallAdminAlert,
};

