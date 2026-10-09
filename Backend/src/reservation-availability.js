import { db } from "./database.js";

export const reservationDurationMinutes = 90;

function minutesFor(date, time) {
  return Date.parse(`${date}T${time}:00Z`) / 60_000;
}

function previousDate(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export async function getAvailableTables(date, time, partySize, excludeBookingId = null, database = db) {
  const start = minutesFor(date, time);
  const end = start + reservationDurationMinutes;
  const booking = excludeBookingId === null
    ? null
    : await database.get("SELECT table_id FROM bookings WHERE id = ?", [excludeBookingId]);
  const exclusion = excludeBookingId === null ? "" : "AND id != ?";
  const bookingParameters = excludeBookingId === null
    ? [previousDate(date), date]
    : [previousDate(date), date, excludeBookingId];
  const existingBookings = await database.all(`
    SELECT id, table_id, booking_date, booking_time
    FROM bookings
    WHERE table_id IS NOT NULL
      AND booking_date BETWEEN ? AND ?
      AND status IN ('confirmed', 'seated')
      ${exclusion}
  `, bookingParameters);
  const occupiedTableIds = new Set();

  for (const existing of existingBookings) {
    const existingStart = minutesFor(existing.booking_date, existing.booking_time);
    const existingEnd = existingStart + reservationDurationMinutes;
    if (start < existingEnd && existingStart < end) occupiedTableIds.add(existing.table_id);
  }

  const now = Date.now() / 60_000;
  const currentDate = new Date().toISOString().slice(0, 10);
  const tables = await database.all(`
    SELECT id, name, seats, status
    FROM restaurant_tables
    WHERE seats >= ?
    ORDER BY id
  `, [partySize]);

  return tables
    .filter((table) => {
      if (occupiedTableIds.has(table.id)) return false;
      const isExcludedBookingTable = table.id === booking?.table_id;
      const overlapsCurrentServiceWindow =
        date === currentDate &&
        start < now + reservationDurationMinutes &&
        now < end;
      if (
        !isExcludedBookingTable &&
        overlapsCurrentServiceWindow &&
        table.status !== "available"
      ) {
        return false;
      }
      return true;
    })
    .map(({ id, name, seats }) => ({ id, name, seats }));
}
