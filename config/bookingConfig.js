/**
 * Booking System Configuration
 * Simple configuration file for booking hours and settings
 */

module.exports = {
  // Working hours (24-hour format)
  workingHours: {
    start: "09:00",
    end: "18:00",
  },

  // Working days (0 = Sunday, 1 = Monday, ... 6 = Saturday)
  workingDays: [1, 2, 3, 4, 5], // Monday to Friday

  // Slot duration in minutes
  slotDuration: 30,

  // How far in advance can people book (in days)
  advanceBookingDays: 60,

  // Minimum advance notice (in hours)
  minAdvanceHours: 24,

  // Booking confirmation settings
  confirmation: {
    requireApproval: false,
    autoConfirm: true,
  },

  // Email notifications
  notifications: {
    sendToCustomer: true,
    sendToAdmin: true,
    adminEmail: process.env.ADMIN_EMAIL || "admin@stoyanography.com",
  },

  // Break times (optional)
  breaks: [
    // { start: "12:00", end: "13:00" } // Lunch break
  ],

  // Blocked dates (format: "YYYY-MM-DD")
  blockedDates: [
    // "2025-12-25", // Christmas
    // "2025-01-01"  // New Year
  ],
};
