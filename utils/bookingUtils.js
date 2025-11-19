const db = require("../database_inquiry");
const bookingConfig = require("../config/bookingConfig");

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
   * NO LONGER UPDATES TimeSlot TABLE - slots are generated dynamically
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

      // Invalidate booking cache
      invalidateBookingCache();

      // Invalidate slots cache (clear all to be safe)
      slotsCache.clear();

      console.log(
        `✅ Created booking ${bookingNumber} for ${bookingData.date} ${bookingData.startTime}`
      );

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
   * Get booking settings (now from config file)
   */
  static async getSettings() {
    return {
      workingHoursStart: bookingConfig.workingHours.start,
      workingHoursEnd: bookingConfig.workingHours.end,
      workingDays: bookingConfig.workingDays,
      slotDuration: bookingConfig.slotDuration,
      advanceBookingDays: bookingConfig.advanceBookingDays,
      minAdvanceHours: bookingConfig.minAdvanceHours,
      requireApproval: bookingConfig.confirmation.requireApproval,
      autoConfirm: bookingConfig.confirmation.autoConfirm,
      breaks: bookingConfig.breaks || [],
      blockedDates: bookingConfig.blockedDates || [],
    };
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
   * Get available time slots for booking (DYNAMIC - NO DATABASE SEEDING REQUIRED)
   * Generates slots on-the-fly based on settings and date availability
   */
  static async getAvailableSlots(startDate, endDate, serviceDuration = null) {
    const cacheKey = `slots_${startDate}_${endDate}_${
      serviceDuration || "default"
    }`;

    // Check cache first
    const cached = slotsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("📦 Returning cached slots");
      return cached.data;
    }

    try {
      await db.open();

      console.log(
        `🔍 Generating dynamic slots from ${startDate} to ${endDate}`
      );
      const startTime = Date.now();

      // Get settings
      const settings = await this.getSettings();
      const workingDays = settings.workingDays || [1, 2, 3, 4, 5]; // Mon-Fri default
      const defaultStartTime = settings.workingHoursStart || "09:00";
      const defaultEndTime = settings.workingHoursEnd || "18:00";
      const slotDuration = settings.slotDuration || 30;
      const minAdvanceHours = settings.minAdvanceHours || 24;

      // Get all custom date availabilities in this range
      const customDates = await db.query(
        `SELECT date, isAvailable, customStartTime, customEndTime, notes 
         FROM DateAvailability 
         WHERE date >= :startDate AND date <= :endDate`,
        { params: { startDate, endDate } }
      );

      const dateAvailabilityMap = new Map(customDates.map((d) => [d.date, d]));

      // Get all bookings in the date range
      const bookings = await this.getBookingsByDateRange(
        startDate,
        endDate,
        null
      );

      // Group bookings by date for faster lookup
      const bookingsByDate = new Map();
      bookings.forEach((booking) => {
        const dateKey = booking.date.split("T")[0];
        if (!bookingsByDate.has(dateKey)) {
          bookingsByDate.set(dateKey, []);
        }
        bookingsByDate.get(dateKey).push(booking);
      });

      // Calculate minimum booking time
      const now = new Date();
      const minBookingTime = new Date(
        now.getTime() + minAdvanceHours * 60 * 60 * 1000
      );

      // Generate slots dynamically
      const availableSlots = [];
      const currentDate = new Date(startDate);
      const end = new Date(endDate);

      while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();
        const dateStr = currentDate.toISOString().split("T")[0];

        // Check if this date has custom availability
        const customAvailability = dateAvailabilityMap.get(dateStr);

        // Skip if date is marked as unavailable
        if (customAvailability && !customAvailability.isAvailable) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Skip Sundays by default (unless custom availability overrides)
        if (dayOfWeek === 0 && !customAvailability) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Skip if not a working day (unless custom availability overrides)
        if (!workingDays.includes(dayOfWeek) && !customAvailability) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Determine working hours for this date
        let startHour, startMinute, endHour, endMinute;

        if (
          customAvailability?.customStartTime &&
          customAvailability?.customEndTime
        ) {
          // Use custom hours
          [startHour, startMinute] = customAvailability.customStartTime
            .split(":")
            .map(Number);
          [endHour, endMinute] = customAvailability.customEndTime
            .split(":")
            .map(Number);
        } else {
          // Use default hours
          [startHour, startMinute] = defaultStartTime.split(":").map(Number);
          [endHour, endMinute] = defaultEndTime.split(":").map(Number);
        }

        let currentMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;

        // Generate slots for this day
        while (currentMinutes + slotDuration <= endMinutes) {
          const slotStartHour = Math.floor(currentMinutes / 60);
          const slotStartMinute = currentMinutes % 60;
          const slotEndMinutes = currentMinutes + slotDuration;
          const slotEndHour = Math.floor(slotEndMinutes / 60);
          const slotEndMinute = slotEndMinutes % 60;

          const slotStart = `${String(slotStartHour).padStart(2, "0")}:${String(
            slotStartMinute
          ).padStart(2, "0")}`;
          const slotEnd = `${String(slotEndHour).padStart(2, "0")}:${String(
            slotEndMinute
          ).padStart(2, "0")}`;

          // Create slot datetime for comparison
          const slotDateTime = new Date(`${dateStr}T${slotStart}:00`);

          // Skip if slot is in the past or within minimum advance time
          if (slotDateTime >= minBookingTime) {
            // Check if slot conflicts with any booking
            let isAvailable = true;
            const dayBookings = bookingsByDate.get(dateStr) || [];

            for (const booking of dayBookings) {
              if (booking.status === "cancelled") continue;

              const bookingStart = booking.startTime;
              const bookingEnd = booking.endTime;

              // Check for ANY overlap between slot and booking
              // Slot overlaps if:
              // 1. Slot starts during the booking (slotStart >= bookingStart && slotStart < bookingEnd)
              // 2. Slot ends during the booking (slotEnd > bookingStart && slotEnd <= bookingEnd)
              // 3. Slot completely contains the booking (slotStart <= bookingStart && slotEnd >= bookingEnd)
              // 4. Booking completely contains the slot (bookingStart <= slotStart && bookingEnd >= slotEnd)

              const hasOverlap =
                (slotStart >= bookingStart && slotStart < bookingEnd) || // Slot starts during booking
                (slotEnd > bookingStart && slotEnd <= bookingEnd) || // Slot ends during booking
                (slotStart <= bookingStart && slotEnd >= bookingEnd) || // Slot contains booking
                (bookingStart <= slotStart && bookingEnd >= slotEnd); // Booking contains slot

              if (hasOverlap) {
                isAvailable = false;
                break;
              }
            }

            if (isAvailable) {
              availableSlots.push({
                date: dateStr,
                startTime: slotStart,
                endTime: slotEnd,
              });
            }
          }

          currentMinutes += slotDuration;
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log(
        `✅ Generated ${availableSlots.length} available slots in ${
          Date.now() - startTime
        }ms`
      );

      // Cache the results
      slotsCache.set(cacheKey, {
        data: availableSlots,
        timestamp: Date.now(),
      });

      return availableSlots;
    } finally {
      await db.close();
    }
  }

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

  // ================================================
  // DATE AVAILABILITY METHODS
  // ================================================

  /**
   * Get custom date availability configurations
   * @param {string} startDate - Optional start date filter (YYYY-MM-DD)
   * @param {string} endDate - Optional end date filter (YYYY-MM-DD)
   */
  static async getDateAvailability(startDate = null, endDate = null) {
    try {
      await db.open();

      let query = "SELECT * FROM DateAvailability";
      const params = {};

      if (startDate && endDate) {
        query += " WHERE date >= :start AND date <= :end";
        params.start = startDate;
        params.end = endDate;
      } else if (startDate) {
        query += " WHERE date >= :start";
        params.start = startDate;
      }

      query += " ORDER BY date ASC";

      const availability = await db.query(query, { params });
      return availability;
    } finally {
      await db.close();
    }
  }

  /**
   * Get custom availability for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   */
  static async getDateAvailabilityForDate(date) {
    try {
      await db.open();

      const result = await db.query(
        "SELECT * FROM DateAvailability WHERE date = :date",
        { params: { date } }
      );

      return result[0] || null;
    } finally {
      await db.close();
    }
  }

  /**
   * Set custom availability for a date
   * @param {Object} availabilityData - { date, isAvailable, customStartTime, customEndTime, notes }
   */
  static async setDateAvailability(availabilityData) {
    try {
      await db.open();

      const { date, isAvailable, customStartTime, customEndTime, notes } =
        availabilityData;

      // Check if record exists
      const existing = await db.query(
        "SELECT * FROM DateAvailability WHERE date = :date",
        { params: { date } }
      );

      const now = new Date().toISOString();

      if (existing.length > 0) {
        // Update existing record
        const updated = await db
          .update(existing[0]["@rid"])
          .set({
            isAvailable,
            customStartTime: customStartTime || null,
            customEndTime: customEndTime || null,
            notes: notes || "",
            updatedAt: now,
          })
          .one();

        console.log(`✓ Updated custom availability for ${date}`);

        // Clear slots cache to regenerate with new availability
        slotsCache.clear();

        return updated;
      } else {
        // Create new record
        const created = await db
          .insert()
          .into("DateAvailability")
          .set({
            date,
            isAvailable,
            customStartTime: customStartTime || null,
            customEndTime: customEndTime || null,
            notes: notes || "",
            createdAt: now,
            updatedAt: now,
          })
          .one();

        console.log(`✓ Created custom availability for ${date}`);

        // Clear slots cache to regenerate with new availability
        slotsCache.clear();

        return created;
      }
    } finally {
      await db.close();
    }
  }

  /**
   * Delete custom availability for a date (revert to default)
   * @param {string} date - Date in YYYY-MM-DD format
   */
  static async deleteDateAvailability(date) {
    try {
      await db.open();

      await db.query("DELETE FROM DateAvailability WHERE date = :date", {
        params: { date },
      });

      console.log(
        `✓ Removed custom availability for ${date} (reverted to default)`
      );

      // Clear slots cache to regenerate with default settings
      slotsCache.clear();

      return true;
    } finally {
      await db.close();
    }
  }

  /**
   * Generate a 6-digit verification code
   */
  static generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Create a verification code for email verification
   */
  static async createVerificationCode(email) {
    try {
      await db.open();

      // Delete any existing unused codes for this email (cleanup)
      await db.query(
        "DELETE VERTEX VerificationCode WHERE email = :email AND used = false",
        {
          params: { email: email.toLowerCase() },
        }
      );

      const code = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const createdAt = new Date();

      const result = await db.query(
        `INSERT INTO VerificationCode SET 
         email = :email, 
         code = :code, 
         expiresAt = :expiresAt, 
         used = false,
         createdAt = :createdAt`,
        {
          params: {
            email: email.toLowerCase(),
            code,
            expiresAt,
            createdAt,
          },
        }
      );

      console.log(`✓ Created verification code for ${email}`);

      return code;
    } finally {
      await db.close();
    }
  }

  /**
   * Verify a code for an email
   */
  static async verifyCode(email, code) {
    try {
      await db.open();

      const result = await db.query(
        `SELECT FROM VerificationCode 
         WHERE email = :email 
         AND code = :code 
         AND used = false 
         AND expiresAt > sysdate()`,
        {
          params: {
            email: email.toLowerCase(),
            code,
          },
        }
      );

      if (result.length === 0) {
        return {
          valid: false,
          message: "Invalid or expired verification code",
        };
      }

      // Mark code as used
      await db.query(
        `UPDATE VerificationCode SET used = true WHERE email = :email AND code = :code`,
        {
          params: {
            email: email.toLowerCase(),
            code,
          },
        }
      );

      console.log(`✓ Verified code for ${email}`);

      return { valid: true };
    } finally {
      await db.close();
    }
  }

  /**
   * Get all bookings for a specific email
   */
  static async getBookingsByEmail(email) {
    if (!email) {
      throw new Error("Email is required to fetch bookings");
    }

    try {
      await db.open();

      console.log(`📧 Fetching bookings for email: ${email}`);

      const result = await db.query(
        `SELECT FROM Booking 
         WHERE customerEmail = :email 
         ORDER BY date DESC, startTime DESC`,
        {
          params: {
            email: email.toLowerCase(),
          },
        }
      );

      console.log(`✓ Retrieved ${result.length} bookings for ${email}`);

      return result;
    } finally {
      await db.close();
    }
  }

  /**
   * Cleanup expired verification codes (call this periodically)
   */
  static async cleanupExpiredCodes() {
    try {
      await db.open();

      const result = await db.query(
        "DELETE VERTEX VerificationCode WHERE expiresAt < sysdate() OR (used = true AND createdAt < :cleanupDate)",
        {
          params: {
            cleanupDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          },
        }
      );

      console.log(`✓ Cleaned up ${result} expired/used verification codes`);

      return result;
    } finally {
      await db.close();
    }
  }
}

module.exports = BookingUtils;
