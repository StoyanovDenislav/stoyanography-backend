const nodemailer = require("nodemailer");
require("dotenv").config();

// Create transporter with Zoho configuration
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.eu",
  port: 465,
  secure: true,
  auth: {
    user: "support@stoyanography.com",
    pass: process.env.ZOHOPASS,
  },
});

/**
 * Send booking confirmation email to customer
 */
async function sendBookingConfirmation(booking) {
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const mailOptions = {
    from: '"Stoyanography" <support@stoyanography.com>',
    to: booking.customerEmail,
    subject: `Booking Confirmation - ${booking.bookingNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .booking-details { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #e87722; border-radius: 5px; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }
            .detail-row:last-child { border-bottom: none; }
            .label { font-weight: bold; color: #1e3a5f; }
            .booking-number { font-size: 24px; font-weight: bold; color: #e87722; padding: 15px; background: #fff8f3; border-radius: 5px; margin: 20px 0; text-align: center; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 12px 30px; background: #e87722; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Booking Confirmed!</h1>
            </div>
            <div class="content">
              <p>Dear ${booking.customerName},</p>
              <p>Your booking has been confirmed! We're excited to work with you.</p>
              
              <div class="booking-number">
                Booking Number: ${booking.bookingNumber}
              </div>
              
              <div class="booking-details">
                <h3 style="margin-top: 0; color: #1e3a5f;">Booking Details</h3>
                <div class="detail-row">
                  <span class="label">Service:</span> ${booking.serviceName}
                </div>
                <div class="detail-row">
                  <span class="label">Date:</span> ${formatDate(booking.date)}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${booking.startTime} - ${
      booking.endTime
    }
                </div>
                <div class="detail-row">
                  <span class="label">Status:</span> ${booking.status}
                </div>
              </div>
              
              <p><strong>What's Next?</strong></p>
              <ul>
                <li>You'll receive a reminder email 24 hours before your session</li>
                <li>Please arrive 10 minutes early</li>
                <li>If you need to reschedule, contact us at least 48 hours in advance</li>
              </ul>
              
              ${
                booking.customerMessage
                  ? `
                <div style="background: #fff; padding: 15px; margin: 20px 0; border-radius: 5px;">
                  <p class="label">Your Message:</p>
                  <p style="margin: 5px 0 0 0;">${booking.customerMessage}</p>
                </div>
              `
                  : ""
              }
              
              <p>If you have any questions, feel free to reply to this email or contact us.</p>
              
              <p>Looking forward to seeing you!</p>
              <p><strong>${
                process.env.BUSINESS_NAME ||
                "Stoyanography - Photography. Redefined."
              }</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated confirmation email.</p>
              <p>Please save this email for your records.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Booking Confirmation

Dear ${booking.customerName},

Your booking has been confirmed!

Booking Number: ${booking.bookingNumber}

Booking Details:
- Service: ${booking.serviceName}
- Date: ${formatDate(booking.date)}
- Time: ${booking.startTime} - ${booking.endTime}
- Status: ${booking.status}

What's Next?
- You'll receive a reminder email 24 hours before your session
- Please arrive 10 minutes early
- If you need to reschedule, contact us at least 48 hours in advance

${
  booking.customerMessage ? `\nYour Message:\n${booking.customerMessage}\n` : ""
}

If you have any questions, feel free to reply to this email.

Looking forward to seeing you!
${process.env.BUSINESS_NAME || "Photography Studio"}
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Customer confirmation email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending customer confirmation email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send booking notification to admin
 */
async function sendAdminNotification(booking) {
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const mailOptions = {
    from: '"Booking System" <support@stoyanography.com>',
    to: "denislav.stoyanov@stoyanography.com",
    subject: `New Booking - ${booking.bookingNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e87722; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 20px; }
            .booking-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .detail-row { padding: 8px 0; }
            .label { font-weight: bold; display: inline-block; width: 150px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🔔 New Booking Received</h2>
            </div>
            <div class="content">
              <h3>Booking #${booking.bookingNumber}</h3>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="label">Customer:</span> ${booking.customerName}
                </div>
                <div class="detail-row">
                  <span class="label">Email:</span> ${booking.customerEmail}
                </div>
                ${
                  booking.customerPhone
                    ? `
                <div class="detail-row">
                  <span class="label">Phone:</span> ${booking.customerPhone}
                </div>
                `
                    : ""
                }
                <div class="detail-row">
                  <span class="label">Service:</span> ${booking.serviceName}
                </div>
                <div class="detail-row">
                  <span class="label">Date:</span> ${formatDate(booking.date)}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${booking.startTime} - ${
      booking.endTime
    }
                </div>
                <div class="detail-row">
                  <span class="label">Status:</span> ${booking.status}
                </div>
                <div class="detail-row">
                  <span class="label">Created:</span> ${new Date(
                    booking.createdAt
                  ).toLocaleString()}
                </div>
              </div>
              
              ${
                booking.customerMessage
                  ? `
                <div style="background: white; padding: 15px; margin: 15px 0; border-radius: 5px;">
                  <p class="label">Customer Message:</p>
                  <p style="margin: 10px 0 0 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #e87722;">${booking.customerMessage}</p>
                </div>
              `
                  : ""
              }
              
              <p style="margin-top: 20px;">
                <a href="${
                  process.env.ADMIN_DASHBOARD_URL || "http://localhost:6001"
                }/admin/bookings" 
                   style="display: inline-block; padding: 10px 20px; background: #e87722; color: white; text-decoration: none; border-radius: 5px;">
                  View in Dashboard
                </a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Admin notification email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending admin notification email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send booking cancellation email
 */
async function sendCancellationEmail(booking) {
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const mailOptions = {
    from: '"Stoyanography" <support@stoyanography.com>',
    to: booking.customerEmail,
    subject: `Booking Cancelled - ${booking.bookingNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Cancelled</h1>
            </div>
            <div class="content">
              <p>Dear ${booking.customerName},</p>
              <p>Your booking (${booking.bookingNumber}) for ${formatDate(
      booking.date
    )} at ${booking.startTime} has been cancelled.</p>
              <p>If you would like to reschedule, please visit our booking page.</p>
              <p>If you have any questions, please don't hesitate to contact us.</p>
              <p><strong>${
                process.env.BUSINESS_NAME || "Photography Studio"
              }</strong></p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Cancellation email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending cancellation email:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendBookingConfirmation,
  sendAdminNotification,
  sendCancellationEmail,
};
