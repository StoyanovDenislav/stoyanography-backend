const express = require("express");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const BookingUtils = require("../utils/bookingUtils");
const {
  sendBookingConfirmation,
  sendAdminNotification,
  sendVerificationCode,
} = require("../utils/bookingEmailer");

const router = express.Router();

// JWT secret for customer verification tokens
const CUSTOMER_TOKEN_SECRET = process.env.CUSTOMER_TOKEN_SECRET;

// Rate limiting for booking endpoints
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 booking requests per windowMs
  message: "Too many booking requests, please try again later.",
});

// Rate limiting for verification code requests
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 verification requests per 15 minutes
  message: "Too many verification requests, please try again later.",
});

// ================================================
// PUBLIC ENDPOINTS
// ================================================

/**
 * GET /api/booking/services
 * Get all active booking services
 */
router.get("/services", async (req, res) => {
  try {
    const services = await BookingUtils.getActiveServices();

    res.json({
      success: true,
      services,
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch services",
    });
  }
});

/**
 * GET /api/booking/availability
 * Get available time slots for a date range
 * Query params: startDate, endDate, serviceDuration (optional)
 */
router.get("/availability", async (req, res) => {
  try {
    const { startDate, endDate, serviceDuration } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required",
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format",
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: "startDate must be before endDate",
      });
    }

    // Allow reasonable date ranges (up to 365 days for infinite calendar support)
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (daysDiff > 365) {
      return res.status(400).json({
        success: false,
        error:
          "Date range cannot exceed 365 days. Please use smaller ranges for better performance.",
      });
    }

    const duration = serviceDuration ? parseInt(serviceDuration) : null;
    const availableSlots = await BookingUtils.getAvailableSlots(
      startDate,
      endDate,
      duration
    );

    res.json({
      success: true,
      slots: availableSlots,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Error fetching availability:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch availability",
    });
  }
});

/**
 * GET /api/booking/settings
 * Get public booking settings
 */
router.get("/settings", async (req, res) => {
  try {
    const settings = await BookingUtils.getSettings();

    // Only return public settings
    const publicSettings = {
      workingHoursStart: settings.workingHoursStart,
      workingHoursEnd: settings.workingHoursEnd,
      workingDays: settings.workingDays,
      slotDuration: settings.slotDuration,
      advanceBookingDays: settings.advanceBookingDays,
      minAdvanceHours: settings.minAdvanceHours,
    };

    res.json({
      success: true,
      settings: publicSettings,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch settings",
    });
  }
});

/**
 * GET /api/booking/check-availability
 * Get available time slots for a specific date
 * Query params: date (YYYY-MM-DD), serviceDuration (number)
 */
router.get("/check-availability", async (req, res) => {
  try {
    const { date, serviceDuration } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: "date is required",
      });
    }

    if (!serviceDuration) {
      return res.status(400).json({
        success: false,
        error: "serviceDuration is required",
      });
    }

    // Validate date
    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    // Get settings
    const settings = await BookingUtils.getSettings();

    // Check if date is blocked
    if (settings.blockedDates && settings.blockedDates.includes(date)) {
      return res.json({
        success: true,
        availableTimes: [],
        message: "This date is not available",
      });
    }

    // Check if date is a working day
    const dayOfWeek = requestedDate.getDay();
    if (!settings.workingDays.includes(dayOfWeek)) {
      return res.json({
        success: true,
        availableTimes: [],
        message: "Not a working day",
      });
    }

    // REMOVED: No limit on advance booking - infinite calendar like Windows
    // Users can book as far into the future as they want

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (requestedDate < today) {
      return res.json({
        success: true,
        availableTimes: [],
        message: "Date is in the past",
      });
    }

    // Generate time slots based on working hours
    const duration = parseInt(serviceDuration);
    const startHour = parseInt(settings.workingHoursStart.split(":")[0]);
    const startMinute = parseInt(settings.workingHoursStart.split(":")[1] || 0);
    const endHour = parseInt(settings.workingHoursEnd.split(":")[0]);
    const endMinute = parseInt(settings.workingHoursEnd.split(":")[1] || 0);

    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Get existing bookings for this date
    const existingBookings = await BookingUtils.getBookingsForDate(date);

    // Generate all possible time slots
    const availableTimes = [];
    let currentTime = startTimeInMinutes;

    while (currentTime + duration <= endTimeInMinutes) {
      const hours = Math.floor(currentTime / 60);
      const minutes = currentTime % 60;
      const timeString = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;

      // Check if this slot overlaps with any existing booking
      const slotEndTime = currentTime + duration;
      let isAvailable = true;

      // Check if slot overlaps with break times
      if (settings.breaks && settings.breaks.length > 0) {
        for (const breakTime of settings.breaks) {
          const breakStart =
            parseInt(breakTime.start.split(":")[0]) * 60 +
            parseInt(breakTime.start.split(":")[1]);
          const breakEnd =
            parseInt(breakTime.end.split(":")[0]) * 60 +
            parseInt(breakTime.end.split(":")[1]);

          if (
            (currentTime >= breakStart && currentTime < breakEnd) ||
            (slotEndTime > breakStart && slotEndTime <= breakEnd) ||
            (currentTime <= breakStart && slotEndTime >= breakEnd)
          ) {
            isAvailable = false;
            break;
          }
        }
      }

      if (!isAvailable) {
        currentTime += settings.slotDuration;
        continue;
      }

      // Check existing bookings
      for (const booking of existingBookings) {
        const bookingStartTime =
          parseInt(booking.startTime.split(":")[0]) * 60 +
          parseInt(booking.startTime.split(":")[1]);
        const bookingEndTime =
          parseInt(booking.endTime.split(":")[0]) * 60 +
          parseInt(booking.endTime.split(":")[1]);

        // Check for overlap
        if (
          (currentTime >= bookingStartTime && currentTime < bookingEndTime) ||
          (slotEndTime > bookingStartTime && slotEndTime <= bookingEndTime) ||
          (currentTime <= bookingStartTime && slotEndTime >= bookingEndTime)
        ) {
          isAvailable = false;
          break;
        }
      }

      // If it's today, check if the time is in the future
      if (requestedDate.toDateString() === today.toDateString()) {
        const slotDateTime = new Date(requestedDate);
        slotDateTime.setHours(hours, minutes, 0, 0);

        if (slotDateTime < minDate) {
          isAvailable = false;
        }
      }

      if (isAvailable) {
        availableTimes.push(timeString);
      }

      currentTime += settings.slotDuration;
    }

    res.json({
      success: true,
      availableTimes,
      date,
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check availability",
    });
  }
});

/**
 * POST /api/booking/create
 * Create a new booking
 */
router.post(
  "/create",
  bookingLimiter,
  [
    body("customerName")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters"),
    body("customerEmail")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email address")
      .normalizeEmail(),
    body("customerPhone")
      .optional()
      .trim()
      .matches(
        /^[+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/
      )
      .withMessage("Invalid phone number"),
    body("date").notEmpty().withMessage("Date is required").isISO8601(),
    body("time")
      .notEmpty()
      .withMessage("Time is required")
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Invalid time format (HH:MM)"),
    body("serviceDuration")
      .notEmpty()
      .withMessage("Service duration is required")
      .isInt({ min: 1 })
      .withMessage("Invalid service duration"),
    body("serviceId").optional().trim(),
    body("serviceName").optional().trim(),
    body("customerMessage").optional().trim().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const bookingData = req.body;

      // Calculate endTime from time + serviceDuration
      const [hours, minutes] = bookingData.time.split(":").map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + parseInt(bookingData.serviceDuration);
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, "0")}:${String(
        endMins
      ).padStart(2, "0")}`;

      // Check if time slot is available
      const isAvailable = await BookingUtils.isTimeSlotAvailable(
        bookingData.date,
        bookingData.time,
        endTime
      );

      if (!isAvailable) {
        return res.status(409).json({
          success: false,
          error: "This time slot is no longer available",
        });
      }

      // Check if booking is within allowed advance booking period
      const settings = await BookingUtils.getSettings();
      const bookingDate = new Date(`${bookingData.date}T${bookingData.time}`);
      const now = new Date();
      const maxAdvanceDate = new Date(
        now.getTime() + settings.advanceBookingDays * 24 * 60 * 60 * 1000
      );

      if (bookingDate > maxAdvanceDate) {
        return res.status(400).json({
          success: false,
          error: `Bookings can only be made up to ${settings.advanceBookingDays} days in advance`,
        });
      }

      // Get service details if serviceId is provided
      if (bookingData.serviceId) {
        const service = await BookingUtils.getServiceById(
          bookingData.serviceId
        );
        if (service) {
          bookingData.serviceName = service.name;
        }
      }

      // Check auto-confirm setting
      bookingData.autoConfirm = settings.autoConfirm || false;

      // Add calculated endTime to bookingData
      bookingData.startTime = bookingData.time;
      bookingData.endTime = endTime;

      // Create the booking
      const booking = await BookingUtils.createBooking(bookingData);

      // Send email notifications
      try {
        await Promise.all([
          sendBookingConfirmation(booking),
          sendAdminNotification(booking),
        ]);
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
        // Don't fail the booking if email fails
      }

      res.status(201).json({
        success: true,
        booking: {
          bookingNumber: booking.bookingNumber,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          serviceName: booking.serviceName,
          createdAt: booking.createdAt,
        },
        message: bookingData.autoConfirm
          ? "Your booking has been confirmed!"
          : "Your booking request has been submitted and is pending confirmation.",
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create booking",
      });
    }
  }
);

/**
 * GET /api/booking/check/:bookingNumber
 * Check booking status
 */
router.get("/check/:bookingNumber", async (req, res) => {
  try {
    const { bookingNumber } = req.params;

    const booking = await BookingUtils.getBookingByNumber(bookingNumber);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Booking not found",
      });
    }

    res.json({
      success: true,
      booking: {
        bookingNumber: booking.bookingNumber,
        customerName: booking.customerName,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        serviceName: booking.serviceName,
        createdAt: booking.createdAt,
        confirmedAt: booking.confirmedAt,
      },
    });
  } catch (error) {
    console.error("Error checking booking:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check booking",
    });
  }
});

/**
 * POST /api/booking/cancel
 * Cancel a booking (customer can cancel with email verification)
 */
router.post(
  "/cancel",
  bookingLimiter,
  [
    body("bookingNumber")
      .trim()
      .notEmpty()
      .withMessage("Booking number is required"),
    body("customerEmail")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email address")
      .normalizeEmail(),
    body("cancellationReason")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Cancellation reason is too long"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { bookingNumber, customerEmail, cancellationReason } = req.body;

      const booking = await BookingUtils.getBookingByNumber(bookingNumber);

      if (!booking) {
        return res.status(404).json({
          success: false,
          error: "Booking not found",
        });
      }

      // Verify email matches
      if (booking.customerEmail.toLowerCase() !== customerEmail.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: "Email does not match booking records",
        });
      }

      // Check if already cancelled
      if (booking.status === "cancelled") {
        return res.status(400).json({
          success: false,
          error: "This booking has already been cancelled",
        });
      }

      // Check if already completed
      if (booking.status === "completed") {
        return res.status(400).json({
          success: false,
          error: "Cannot cancel a completed booking",
        });
      }

      // Cancel the booking
      const updatedBooking = await BookingUtils.cancelBooking(
        bookingNumber,
        cancellationReason || "Cancelled by customer"
      );

      // TODO: Send cancellation email

      res.json({
        success: true,
        message: "Booking cancelled successfully",
        booking: {
          bookingNumber: updatedBooking.bookingNumber,
          status: updatedBooking.status,
          cancelledAt: updatedBooking.cancelledAt,
        },
      });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel booking",
      });
    }
  }
);

// ================================================
// CUSTOMER SELF-SERVICE ENDPOINTS (EMAIL VERIFICATION)
// ================================================

/**
 * POST /api/booking/request-verification
 * Request a verification code to access bookings
 */
router.post(
  "/request-verification",
  verificationLimiter,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { email } = req.body;

      // Check if this email has any bookings
      const bookings = await BookingUtils.getBookingsByEmail(email);

      if (bookings.length === 0) {
        // Don't reveal if email exists or not for privacy
        return res.json({
          success: true,
          message:
            "If this email has bookings, a verification code has been sent.",
        });
      }

      // Generate and store verification code
      const code = await BookingUtils.createVerificationCode(email);

      // Send email with code
      const emailResult = await sendVerificationCode(email, code);

      if (!emailResult.success) {
        return res.status(500).json({
          success: false,
          error: "Failed to send verification email",
        });
      }

      res.json({
        success: true,
        message: "Verification code sent to your email",
      });
    } catch (error) {
      console.error("Error requesting verification:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process verification request",
      });
    }
  }
);

/**
 * POST /api/booking/verify-code
 * Verify the code and issue a JWT token for booking access
 */
router.post(
  "/verify-code",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("code")
      .isString()
      .isLength({ min: 6, max: 6 })
      .withMessage("Verification code must be 6 digits"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { email, code } = req.body;

      // Verify the code
      const verification = await BookingUtils.verifyCode(email, code);

      if (!verification.valid) {
        return res.status(401).json({
          success: false,
          error: verification.message || "Invalid verification code",
        });
      }

      // Generate JWT token valid for 5 minutes
      const token = jwt.sign(
        {
          email: email.toLowerCase(),
          type: "customer-booking-access",
        },
        CUSTOMER_TOKEN_SECRET,
        { expiresIn: "5m" }
      );

      res.json({
        success: true,
        token,
        expiresIn: 300, // 5 minutes in seconds
        message: "Verification successful",
      });
    } catch (error) {
      console.error("Error verifying code:", error);
      res.status(500).json({
        success: false,
        error: "Failed to verify code",
      });
    }
  }
);

/**
 * GET /api/booking/my-bookings
 * Get bookings for the authenticated customer (JWT protected)
 */
router.get("/my-bookings", async (req, res) => {
  try {
    console.log("📨 my-bookings endpoint hit");
    console.log("📋 Headers:", req.headers);

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    console.log("🔑 Token extracted:", token ? "YES" : "NO");

    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        success: false,
        error: "Access token required",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, CUSTOMER_TOKEN_SECRET);
      console.log("✅ Token verified successfully");
      console.log("📋 Decoded token:", JSON.stringify(decoded, null, 2));
    } catch (error) {
      console.log("❌ Token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: "Token expired. Please verify your email again.",
          expired: true,
        });
      }
      return res.status(401).json({
        success: false,
        error: "Invalid token",
      });
    }

    // Verify token type
    if (decoded.type !== "customer-booking-access") {
      console.log("❌ Invalid token type:", decoded.type);
      return res.status(401).json({
        success: false,
        error: "Invalid token type",
      });
    }

    console.log("📋 Decoded token:", decoded);
    console.log("📧 Email from token:", decoded.email);
    console.log("📧 Email type:", typeof decoded.email);
    console.log(
      "📧 Email length:",
      decoded.email ? decoded.email.length : "N/A"
    );
    console.log("📧 Email is truthy:", !!decoded.email);

    if (!decoded.email) {
      console.log("❌ No email in decoded token!");
      return res.status(400).json({
        success: false,
        error: "Email not found in token",
      });
    }

    console.log("✅ About to fetch bookings for:", decoded.email);

    // Get bookings for this email
    const bookings = await BookingUtils.getBookingsByEmail(decoded.email);

    console.log("✅ Bookings fetched successfully, count:", bookings.length);

    // Format bookings for response
    const formattedBookings = bookings.map((booking) => ({
      bookingNumber: booking.bookingNumber,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      serviceName: booking.serviceName,
      status: booking.status,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      notes: booking.notes,
      createdAt: booking.createdAt,
    }));

    res.json({
      success: true,
      bookings: formattedBookings,
      email: decoded.email,
    });
  } catch (error) {
    console.error("Error fetching my bookings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch bookings",
    });
  }
});

/**
 * POST /api/booking/cancel-my-booking
 * Cancel a booking (JWT protected, customer can only cancel their own bookings)
 */
router.post("/cancel-my-booking", async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access token required",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, CUSTOMER_TOKEN_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: "Token expired. Please verify your email again.",
          expired: true,
        });
      }
      return res.status(401).json({
        success: false,
        error: "Invalid token",
      });
    }

    // Verify token type
    if (decoded.type !== "customer-booking-access") {
      return res.status(401).json({
        success: false,
        error: "Invalid token type",
      });
    }

    const { bookingNumber } = req.body;

    if (!bookingNumber) {
      return res.status(400).json({
        success: false,
        error: "Booking number is required",
      });
    }

    // Get the booking to verify ownership
    const booking = await BookingUtils.getBookingByNumber(bookingNumber);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Booking not found",
      });
    }

    // Verify the booking belongs to this customer
    if (booking.customerEmail.toLowerCase() !== decoded.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: "You can only cancel your own bookings",
      });
    }

    // Check if booking is already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        error: "Booking is already cancelled",
      });
    }

    // Cancel the booking
    await BookingUtils.cancelBooking(bookingNumber);

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      bookingNumber,
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cancel booking",
    });
  }
});

module.exports = router;
