const db = require("../database_inquiry");

// Simple in-memory cache for time slots
const slotsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for booking queries
const bookingsCache = new Map();
const BOOKINGS_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Helper function to generate cache key
function getCacheKey(prefix, params) {
  return `${prefix}:${JSON.stringify(params)}`;
}

// Helper function to get from cache
function getFromCache(cacheMap, key, maxAge) {
  const cached = cacheMap.get(key);
  if (cached && Date.now() - cached.timestamp < maxAge) {
    return cached.data;
  }
  cacheMap.delete(key);
  return null;
}

// Helper function to set cache
function setCache(cacheMap, key, data) {
  cacheMap.set(key, { data, timestamp: Date.now() });
}

// Helper function to invalidate related cache entries
function invalidateBookingCache() {
  bookingsCache.clear();
}

/**
 * Booking Utilities for OrientDB Operations
 */

class BookingUtils {
  /**
   * Generate a unique booking number
   * Format: BK-YYYYMMDD-XXX
   */
  static async generateBookingNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");

    try {
      await db.open();

      // Get count of bookings for today
      const result = await db.query(
        `SELECT count(*) as count FROM Booking 
         WHERE bookingNumber LIKE 'BK-${dateStr}-%'`
      );

      const count = result[0].count + 1;
      const bookingNumber = `BK-${dateStr}-${String(count).padStart(3, "0")}`;

      return bookingNumber;
    } finally {
      await db.close();
    }
  }

  /**
   * Create a new booking
   */
  static async createBooking(bookingData) {
    try {
      await db.open();

      const bookingNumber = await this.generateBookingNumber();

      // Format dates for OrientDB (just date string, not datetime)
      const now = new Date();
      const createdAtStr = now.toISOString().replace("T", " ").substring(0, 19);

      const booking = await db
        .insert()
        .into("Booking")
        .set({
          bookingNumber,
          customerName: bookingData.customerName,
          customerEmail: bookingData.customerEmail,
          customerPhone: bookingData.customerPhone || "",
          customerMessage: bookingData.customerMessage || "",
          date: bookingData.date,
          startTime: bookingData.startTime,
          endTime: bookingData.endTime,
          status: bookingData.autoConfirm ? "confirmed" : "pending",
          serviceId: bookingData.serviceId || "",
          serviceName: bookingData.serviceName || "",
          notes: "",
          reminderSent: false,
          createdAt: createdAtStr,
          updatedAt: createdAtStr,
        })
        .one();

      // Mark the time slot as booked
      await db.query(
        `UPDATE TimeSlot SET isBooked = true 
         WHERE date = :date AND startTime = :startTime`,
        {
          params: {
            date: bookingData.date,
            startTime: bookingData.startTime,
          },
        }
      );

      // Invalidate booking cache
      invalidateBookingCache();

      // Invalidate slots cache for this date
      const slotCacheKey = `${bookingData.date}`;
      slotsCache.delete(slotCacheKey);

      return booking;
    } finally {
      await db.close();
    }
  }

  /**
   * Get booking by ID
   */
  static async getBookingById(bookingId) {
    try {
      await db.open();

      const booking = await db
        .select()
        .from("Booking")
        .where({ "@rid": bookingId })
        .one();

      return booking;
    } catch (error) {
      return null;
    } finally {
      await db.close();
    }
  }

  /**
   * Get booking by booking number
   */
  static async getBookingByNumber(bookingNumber) {
    try {
      await db.open();

      const result = await db.query(
        "SELECT * FROM Booking WHERE bookingNumber = :num",
        { params: { num: bookingNumber } }
      );

      return result[0] || null;
    } finally {
      await db.close();
    }
  }

  /**
   * Get bookings by date range with caching
   */
  static async getBookingsByDateRange(startDate, endDate, status = null) {
    // Check cache first
    const cacheKey = getCacheKey("bookings", { startDate, endDate, status });
    const cached = getFromCache(
      bookingsCache,
      cacheKey,
      BOOKINGS_CACHE_DURATION
    );

    if (cached) {
      console.log("📦 Returning cached bookings");
      return cached;
    }

    try {
      await db.open();

      let query = `SELECT * FROM Booking WHERE date >= :start AND date <= :end`;
      const params = { start: startDate, end: endDate };

      if (status) {
        query += ` AND status = :status`;
        params.status = status;
      }

      query += ` ORDER BY date, startTime`;

      const bookings = await db.query(query, { params });

      // Cache the results
      setCache(bookingsCache, cacheKey, bookings);

      return bookings;
    } finally {
      await db.close();
    }
  }

  /**
   * Get bookings for a specific date (for availability checking)
   */
  static async getBookingsForDate(date) {
    const cacheKey = getCacheKey("bookingsForDate", { date });
    const cached = getFromCache(
      bookingsCache,
      cacheKey,
      BOOKINGS_CACHE_DURATION
    );

    if (cached) {
      return cached;
    }

    try {
      await db.open();

      const bookings = await db.query(
        `SELECT startTime, endTime, status FROM Booking 
         WHERE date = :date AND status IN ['pending', 'confirmed']`,
        { params: { date } }
      );

      setCache(bookingsCache, cacheKey, bookings);
      return bookings;
    } finally {
      await db.close();
    }
  }

  /**
   * Get bookings by customer email
   */
  static async getBookingsByEmail(email) {
    try {
      await db.open();

      const bookings = await db.query(
        "SELECT * FROM Booking WHERE customerEmail = :email ORDER BY date DESC",
        { params: { email } }
      );

      return bookings;
    } finally {
      await db.close();
    }
  }

  /**
   * Update booking status
   */
  static async updateBookingStatus(bookingNumber, status, notes = "") {
    try {
      await db.open();

      const booking = await this.getBookingByNumber(bookingNumber);
      if (!booking) {
        throw new Error("Booking not found");
      }

      const recordID = booking["@rid"];
      const formattedID = `#${recordID.cluster}:${recordID.position}`;

      const now = new Date();
      const updatedAtStr = now.toISOString().replace("T", " ").substring(0, 19);

      const updateData = {
        status,
        updatedAt: updatedAtStr,
      };

      if (notes) {
        updateData.notes = notes;
      }

      await db.update(formattedID).set(updateData).one();

      // Invalidate booking cache
      invalidateBookingCache();

      return await this.getBookingByNumber(bookingNumber);
    } finally {
      await db.close();
    }
  }

  /**
   * Cancel booking
   */
  static async cancelBooking(bookingNumber, cancellationReason) {
    try {
      await db.open();

      const booking = await this.getBookingByNumber(bookingNumber);
      if (!booking) {
        throw new Error("Booking not found");
      }

      const recordID = booking["@rid"];
      const formattedID = `#${recordID.cluster}:${recordID.position}`;

      const now = new Date();
      const updatedAtStr = now.toISOString().replace("T", " ").substring(0, 19);

      await db
        .update(formattedID)
        .set({
          status: "cancelled",
          cancellationReason,
          updatedAt: updatedAtStr,
        })
        .one();

      // Free up the time slot
      await db.query(
        `UPDATE TimeSlot SET isBooked = false 
         WHERE date = :date AND startTime = :startTime`,
        {
          params: {
            date: booking.date,
            startTime: booking.startTime,
          },
        }
      );

      // Invalidate booking cache
      invalidateBookingCache();

      // Invalidate slots cache for this date
      const slotCacheKey = `${booking.date}`;
      slotsCache.delete(slotCacheKey);

      return await this.getBookingByNumber(bookingNumber);
    } finally {
      await db.close();
    }
  }

  /**
   * Check if time slot is available
   */
  static async isTimeSlotAvailable(date, startTime, endTime) {
    try {
      await db.open();

      const bookings = await db.query(
        `SELECT count(*) as count FROM Booking 
         WHERE date = :date 
         AND status IN ['pending', 'confirmed']
         AND (
           (startTime <= :start AND endTime > :start) OR
           (startTime < :end AND endTime >= :end) OR
           (startTime >= :start AND endTime <= :end)
         )`,
        { params: { date, start: startTime, end: endTime } }
      );

      return bookings[0].count === 0;
    } finally {
      await db.close();
    }
  }

  /**
   * Get all active services
   */
  static async getActiveServices() {
    try {
      await db.open();

      const services = await db.query(
        "SELECT * FROM BookingService WHERE isActive = true ORDER BY displayOrder, name"
      );

      return services;
    } finally {
      await db.close();
    }
  }

  /**
   * Get service by ID
   */
  static async getServiceById(serviceId) {
    try {
      await db.open();

      const result = await db
        .select()
        .from("BookingService")
        .where({ "@rid": serviceId })
        .one();

      return result;
    } catch (error) {
      return null;
    } finally {
      await db.close();
    }
  }

  /**
   * Get booking settings
   */
  static async getSettings() {
    try {
      await db.open();

      const settings = await db.query("SELECT * FROM BookingSettings");

      const settingsObj = {};
      settings.forEach((setting) => {
        let value = setting.settingValue;

        // Parse value based on type
        if (setting.settingType === "number") {
          value = parseInt(value);
        } else if (setting.settingType === "boolean") {
          value = value === "true";
        } else if (setting.settingType === "json") {
          try {
            value = JSON.parse(value);
          } catch (e) {
            console.error("Error parsing JSON setting:", setting.settingKey);
          }
        }

        settingsObj[setting.settingKey] = value;
      });

      return settingsObj;
    } finally {
      await db.close();
    }
  }

  /**
   * Update booking setting
   */
  static async updateSetting(key, value) {
    try {
      await db.open();

      const result = await db.query(
        "SELECT * FROM BookingSettings WHERE settingKey = :key",
        { params: { key } }
      );

      if (result.length === 0) {
        throw new Error("Setting not found");
      }

      const setting = result[0];
      const recordID = setting["@rid"];
      const formattedID = `#${recordID.cluster}:${recordID.position}`;

      let settingValue = value;
      if (typeof value === "object") {
        settingValue = JSON.stringify(value);
      } else {
        settingValue = String(value);
      }

      await db
        .update(formattedID)
        .set({
          settingValue,
          updatedAt: new Date().toISOString(),
        })
        .one();

      return await this.getSettings();
    } finally {
      await db.close();
    }
  }

  /**
   * Generate available time slots for a date range
   */
  static generateTimeSlots(startDate, endDate, settings) {
    const slots = [];
    const workingDays = settings.workingDays || [1, 2, 3, 4, 5];
    const startTime = settings.workingHoursStart || "09:00";
    const endTime = settings.workingHoursEnd || "18:00";
    const duration = settings.slotDuration || 30;

    const currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();

      if (workingDays.includes(dayOfWeek)) {
        const [startHour, startMinute] = startTime.split(":").map(Number);
        const [endHour, endMinute] = endTime.split(":").map(Number);

        let currentMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;

        while (currentMinutes + duration <= endMinutes) {
          const slotStartHour = Math.floor(currentMinutes / 60);
          const slotStartMinute = currentMinutes % 60;
          const slotEndMinutes = currentMinutes + duration;
          const slotEndHour = Math.floor(slotEndMinutes / 60);
          const slotEndMinute = slotEndMinutes % 60;

          const slotStart = `${String(slotStartHour).padStart(2, "0")}:${String(
            slotStartMinute
          ).padStart(2, "0")}`;
          const slotEnd = `${String(slotEndHour).padStart(2, "0")}:${String(
            slotEndMinute
          ).padStart(2, "0")}`;

          slots.push({
            date: currentDate.toISOString().split("T")[0],
            startTime: slotStart,
            endTime: slotEnd,
          });

          currentMinutes += duration;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  /**
   * Get available time slots for booking (with caching)
   */
  static async getAvailableSlots(startDate, endDate, serviceDuration = null) {
    const cacheKey = `slots_${startDate}_${endDate}`;

    // Check cache first
    const cached = slotsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("✓ Returning cached slots");
      return cached.data;
    }

    try {
      await db.open();

      // Query time slots from database
      const dbSlots = await db.query(
        `SELECT date, startTime, endTime, isBooked 
         FROM TimeSlot 
         WHERE date >= :startDate AND date <= :endDate 
         AND isBooked = false 
         ORDER BY date, startTime`,
        {
          params: { startDate, endDate },
        }
      );

      // Get all bookings in the date range
      const bookings = await this.getBookingsByDateRange(
        startDate,
        endDate,
        null
      );

      // Convert db slots to plain objects
      const slots = dbSlots.map((slot) => ({
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));

      // Filter out booked slots and past slots
      const availableSlots = [];
      const settings = await this.getSettings();
      const now = new Date();
      const minAdvanceHours = settings.minAdvanceHours || 24;
      const minBookingTime = new Date(
        now.getTime() + minAdvanceHours * 60 * 60 * 1000
      );

      for (const slot of slots) {
        let isAvailable = true;

        // Check if slot conflicts with any booking
        for (const booking of bookings) {
          if (
            booking.status !== "cancelled" &&
            booking.date.split("T")[0] === slot.date
          ) {
            const bookingStart = booking.startTime;
            const bookingEnd = booking.endTime;
            const slotStart = slot.startTime;
            const slotEnd = slot.endTime;

            // Check for overlap
            if (
              (slotStart >= bookingStart && slotStart < bookingEnd) ||
              (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
              (slotStart <= bookingStart && slotEnd >= bookingEnd)
            ) {
              isAvailable = false;
              break;
            }
          }
        }

        // Check if slot is in the past or too soon
        const slotDateTime = new Date(`${slot.date}T${slot.startTime}`);
        if (slotDateTime < minBookingTime) {
          isAvailable = false;
        }

        if (isAvailable) {
          availableSlots.push(slot);
        }
      }

      // Cache the result
      slotsCache.set(cacheKey, {
        data: availableSlots,
        timestamp: Date.now(),
      });
      console.log("✓ Cached slots for:", cacheKey);

      return availableSlots;
    } finally {
      await db.close();
    }
  }

  /**
   * Get booking statistics
   */
  /**
   * Get booking statistics with caching
   */
  static async getBookingStats(startDate = null, endDate = null) {
    // Check cache first
    const cacheKey = getCacheKey("stats", { startDate, endDate });
    const cached = getFromCache(
      bookingsCache,
      cacheKey,
      BOOKINGS_CACHE_DURATION
    );

    if (cached) {
      console.log("📦 Returning cached stats");
      return cached;
    }

    try {
      await db.open();

      let dateFilter = "";
      const params = {};

      if (startDate && endDate) {
        dateFilter = "WHERE date >= :start AND date <= :end";
        params.start = startDate;
        params.end = endDate;
      }

      const totalBookings = await db.query(
        `SELECT count(*) as count FROM Booking ${dateFilter}`,
        { params }
      );

      const byStatus = await db.query(
        `SELECT status, count(*) as count FROM Booking ${dateFilter} GROUP BY status`,
        { params }
      );

      const byService = await db.query(
        `SELECT serviceName, count(*) as count FROM Booking ${dateFilter} GROUP BY serviceName`,
        { params }
      );

      const stats = {
        total: totalBookings[0].count,
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        byService: byService.reduce((acc, item) => {
          acc[item.serviceName || "Unknown"] = item.count;
          return acc;
        }, {}),
      };

      // Cache the results
      setCache(bookingsCache, cacheKey, stats);

      return stats;
    } finally {
      await db.close();
    }
  }
}

module.exports = BookingUtils;
