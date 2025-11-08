const express = require("express");
const cacheManager = require("../utils/CacheManager");
const BookingUtils = require("../utils/bookingUtils");
const { body, validationResult } = require("express-validator");
const { sendCancellationEmail } = require("../utils/bookingEmailer");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

// Apply JWT authentication to all admin routes
router.use(authenticateToken);

// Get cache statistics
router.get("/cache/stats", (req, res) => {
  try {
    const stats = cacheManager.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Clear all cache
router.delete("/cache/clear", async (req, res) => {
  try {
    await cacheManager.clearCache();
    res.json({
      success: true,
      message: "Cache cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Warm cache for specific config
router.post("/cache/warm", async (req, res) => {
  try {
    const { configPath } = req.body;

    if (!configPath) {
      return res.status(400).json({
        success: false,
        error: "configPath is required",
      });
    }

    // Start warming in background
    cacheManager
      .warmCacheForConfig(configPath)
      .then(() => {
        console.log(`✅ Cache warming completed for: ${configPath}`);
      })
      .catch((error) => {
        console.error(`❌ Cache warming failed for ${configPath}:`, error);
      });

    res.json({
      success: true,
      message: `Cache warming started for: ${configPath}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Invalidate specific config cache
router.delete("/cache/invalidate", async (req, res) => {
  try {
    const { configPath } = req.body;

    if (!configPath) {
      return res.status(400).json({
        success: false,
        error: "configPath is required",
      });
    }

    await cacheManager.invalidateConfig(configPath);

    res.json({
      success: true,
      message: `Cache invalidated for: ${configPath}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint that includes cache status
router.get("/health", (req, res) => {
  try {
    const stats = cacheManager.getStats();
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      cache: {
        enabled: true,
        ...stats,
      },
      server: {
        nodeEnv: process.env.NODE_ENV,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

// ================================================
// BOOKING ADMIN ENDPOINTS
// ================================================

/**
 * GET /admin/bookings
 * Get all bookings with optional filters
 * Query params: startDate, endDate, status
 */
router.get("/bookings", async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    let bookings;

    if (startDate && endDate) {
      bookings = await BookingUtils.getBookingsByDateRange(
        startDate,
        endDate,
        status || null
      );
    } else {
      // Default to next 30 days
      const start = new Date().toISOString().split("T")[0];
      const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      bookings = await BookingUtils.getBookingsByDateRange(
        start,
        end,
        status || null
      );
    }

    res.json({
      success: true,
      bookings,
      count: bookings.length,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /admin/bookings/:bookingNumber
 * Get specific booking details
 */
router.get("/bookings/:bookingNumber", async (req, res) => {
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
      booking,
    });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /admin/bookings/:bookingNumber/status
 * Update booking status
 */
router.put(
  "/bookings/:bookingNumber/status",
  [
    body("status")
      .notEmpty()
      .isIn(["pending", "confirmed", "cancelled", "completed"])
      .withMessage("Invalid status"),
    body("notes").optional().trim(),
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

      const { bookingNumber } = req.params;
      const { status, notes } = req.body;

      const updatedBooking = await BookingUtils.updateBookingStatus(
        bookingNumber,
        status,
        notes
      );

      // TODO: Send email notification to customer

      res.json({
        success: true,
        message: "Booking status updated successfully",
        booking: updatedBooking,
      });
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * POST /admin/bookings/:bookingNumber/cancel
 * Cancel a booking (admin)
 */
router.post(
  "/bookings/:bookingNumber/cancel",
  [
    body("cancellationReason")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Cancellation reason is too long"),
  ],
  async (req, res) => {
    try {
      const { bookingNumber } = req.params;
      const { cancellationReason } = req.body;

      const updatedBooking = await BookingUtils.cancelBooking(
        bookingNumber,
        cancellationReason || "Cancelled by admin"
      );

      // Send cancellation email to customer
      try {
        await sendCancellationEmail(updatedBooking);
      } catch (emailError) {
        console.error("Error sending cancellation email:", emailError);
        // Don't fail the cancellation if email fails
      }

      res.json({
        success: true,
        message: "Booking cancelled successfully",
        booking: updatedBooking,
      });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * GET /admin/bookings/stats
 * Get booking statistics
 */
router.get("/bookings-stats", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await BookingUtils.getBookingStats(startDate, endDate);

    res.json({
      success: true,
      stats,
      dateRange: {
        start: startDate || "all time",
        end: endDate || "all time",
      },
    });
  } catch (error) {
    console.error("Error fetching booking stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /admin/services
 * Get all booking services (including inactive)
 */
router.get("/services", async (req, res) => {
  try {
    const db = require("../database_inquiry");
    await db.open();

    const services = await db.query(
      "SELECT * FROM BookingService ORDER BY displayOrder, name"
    );

    await db.close();

    res.json({
      success: true,
      services,
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /admin/services
 * Create a new service
 */
router.post(
  "/services",
  [
    body("name").trim().notEmpty().withMessage("Service name is required"),
    body("duration")
      .isInt({ min: 15, max: 480 })
      .withMessage("Duration must be between 15 and 480 minutes"),
    body("price").optional().isFloat({ min: 0 }),
    body("currency").optional().trim(),
    body("description").optional().trim(),
    body("color").optional().trim(),
    body("displayOrder").optional().isInt(),
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

      const db = require("../database_inquiry");
      await db.open();

      const now = new Date().toISOString();
      const service = await db
        .insert()
        .into("BookingService")
        .set({
          name: req.body.name,
          description: req.body.description || "",
          duration: req.body.duration,
          price: req.body.price || 0,
          currency: req.body.currency || "USD",
          isActive: true,
          color: req.body.color || "#000000",
          displayOrder: req.body.displayOrder || 0,
          createdAt: now,
          updatedAt: now,
        })
        .one();

      await db.close();

      res.status(201).json({
        success: true,
        message: "Service created successfully",
        service,
      });
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PUT /admin/services/:serviceId
 * Update a service
 */
router.put("/services/:serviceId", async (req, res) => {
  try {
    const { serviceId } = req.params;
    const updateData = { ...req.body };
    updateData.updatedAt = new Date().toISOString();

    const db = require("../database_inquiry");
    await db.open();

    await db.update(serviceId).set(updateData).one();

    const updatedService = await db
      .select()
      .from("BookingService")
      .where({ "@rid": serviceId })
      .one();

    await db.close();

    res.json({
      success: true,
      message: "Service updated successfully",
      service: updatedService,
    });
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /admin/services/:serviceId
 * Delete (deactivate) a service
 */
router.delete("/services/:serviceId", async (req, res) => {
  try {
    const { serviceId } = req.params;

    const db = require("../database_inquiry");
    await db.open();

    await db
      .update(serviceId)
      .set({
        isActive: false,
        updatedAt: new Date().toISOString(),
      })
      .one();

    await db.close();

    res.json({
      success: true,
      message: "Service deactivated successfully",
    });
  } catch (error) {
    console.error("Error deactivating service:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /admin/settings
 * Get all booking settings
 */
router.get("/settings", async (req, res) => {
  try {
    const settings = await BookingUtils.getSettings();

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /admin/settings/:key
 * Update a booking setting
 */
router.put("/settings/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: "Value is required",
      });
    }

    const settings = await BookingUtils.updateSetting(key, value);

    res.json({
      success: true,
      message: "Setting updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
