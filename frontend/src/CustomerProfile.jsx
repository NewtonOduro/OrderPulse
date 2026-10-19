import { useState } from "react";
import { displayOrderNumber } from "./order-number.js";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" });
}

function HistorySection({ title, count, children, emptyMessage }) {
  return (
    <details className="rounded-2xl bg-white p-5 shadow-sm">
      <summary className="cursor-pointer font-semibold text-forest">
        {title} <span className="text-sm font-normal text-forest/50">({count})</span>
      </summary>
      {count ? <div className="mt-4 divide-y divide-forest/10">{children}</div> : <p className="mt-3 text-sm text-forest/55">{emptyMessage}</p>}
    </details>
  );
}

export default function CustomerProfile({
  customerUser,
  customerOrders,
  customerReservations,
  customerEngagement,
  customerFavorites,
  customerFeedback,
  onBack,
  onDeleted,
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount(event) {
    event.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const response = await fetch("/api/customer/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We couldn't delete your account. Please try again.");
      setPassword("");
      onDeleted();
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section id="customer-profile" className="mx-auto max-w-7xl scroll-mt-8 px-5 pb-10 md:px-10" aria-labelledby="customer-profile-heading">
      <a href="/" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-leaf underline underline-offset-4">
        Back to home
      </a>
      <div className="rounded-3xl bg-[#e9eee4] p-5 sm:p-7">
        <span className="text-xs font-bold uppercase tracking-[.2em] text-leaf">Your account</span>
        <h2 id="customer-profile-heading" className="mt-2 font-display text-3xl font-semibold">My profile<span>.</span></h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-forest/50">Name</dt><dd className="mt-1 font-semibold">{customerUser.name}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-forest/50">Email</dt><dd className="mt-1 break-all font-semibold">{customerUser.email}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-forest/50">Phone</dt><dd className="mt-1 font-semibold">{customerUser.phone || "Not provided"}</dd></div>
        </dl>
      </div>

      <div className="mt-5 grid gap-3">
        <HistorySection title="Orders" count={customerOrders.length} emptyMessage="Your orders will appear here.">
          {customerOrders.map((order) => (
            <article key={order.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{displayOrderNumber(order.orderNumber)}</strong>
                <span className="text-xs capitalize text-forest/60">{order.status.replaceAll("_", " ")} · {order.paymentStatus.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-1 text-xs text-forest/60">{formatDate(order.createdAt)} · {order.orderType}</p>
              <p className="mt-1 text-sm">{order.items.map((item) => `${item.quantity}× ${item.name}${item.contents ? ` (${item.contents})` : ""}`).join(", ")} · GH₵{order.total.toFixed(2)}</p>
            </article>
          ))}
        </HistorySection>

        <HistorySection title="Reservations" count={customerReservations.length} emptyMessage="Your reservations will appear here.">
          {customerReservations.map((reservation) => (
            <article key={reservation.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <strong className="text-sm">{reservation.date} · {reservation.time}</strong>
                <p className="mt-1 text-xs text-forest/60">{reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}{reservation.tableName ? ` · ${reservation.tableName}` : ""}</p>
                {reservation.notes && <p className="mt-1 text-xs text-forest/60">{reservation.notes}</p>}
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold capitalize text-amber-800">{reservation.status}</span>
            </article>
          ))}
        </HistorySection>

        <HistorySection title="Saved favorite dishes" count={customerFavorites.length} emptyMessage="You have no saved dishes.">
          {customerFavorites.map((item) => (
            <article key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-sm font-medium">{item.name}</span>
              <span className="text-xs text-forest/60">{formatDate(item.favoritedAt)}</span>
            </article>
          ))}
        </HistorySection>

        <HistorySection title="Feedback" count={customerFeedback.length} emptyMessage="You have not submitted any feedback yet.">
          {customerFeedback.map((entry) => (
            <article key={`${entry.orderNumber}-${entry.createdAt}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{displayOrderNumber(entry.orderNumber)} · {entry.rating}/5 stars</strong>
                <span className="text-xs text-forest/60">{formatDate(entry.createdAt)}</span>
              </div>
              {entry.comment && <p className="mt-1 text-sm text-forest/70">{entry.comment}</p>}
            </article>
          ))}
        </HistorySection>

        <HistorySection title="Loyalty points and rewards" count={customerEngagement?.loyaltyHistory?.length ?? 0} emptyMessage="No loyalty points or rewards activity yet. Earn points with completed orders.">
          <p className="pb-3 text-sm font-semibold">
            {customerEngagement?.points ?? 0} points available · {customerEngagement?.pointsToNextReward ?? 100} points until your next GH₵5 reward.
          </p>
          {customerEngagement?.loyaltyHistory?.map((entry, index) => (
            <article key={`${entry.orderNumber}-${entry.type}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <strong className="text-sm capitalize">{entry.type} · {displayOrderNumber(entry.orderNumber)}</strong>
                <p className="mt-1 text-xs text-forest/60">{formatDate(entry.createdAt)}</p>
              </div>
              <span className="text-sm font-semibold">{entry.type === "earned" ? "+" : entry.type === "redeemed" ? "−" : ""}{entry.points} points</span>
            </article>
          ))}
        </HistorySection>
      </div>

      <details className="mt-8 rounded-2xl border border-red-200 bg-white p-5">
        <summary
          className="cursor-pointer font-semibold text-red-800"
          onClick={() => {
            if (!deleteOpen) {
              setDeleteError("");
              setDeleteOpen(true);
            }
          }}
        >
          Delete my account
        </summary>
        {deleteOpen && <form className="mt-4 max-w-xl" onSubmit={deleteAccount}>
          <p className="text-sm leading-6 text-forest/70">This permanently deletes your profile, saved dishes, and feedback and signs you out. Order and reservation records are kept for restaurant records, but your name, email, phone number, delivery address, and reservation notes are removed.</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="delete-account-password">Confirm with your current password</label>
          <input
            id="delete-account-password"
            className="mt-2 min-h-11 w-full rounded-xl border border-forest/15 px-3 text-sm"
            type="password"
            autoComplete="current-password"
            maxLength="128"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {deleteError && <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p>}
          <button type="submit" disabled={deleting} className="mt-4 rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60">
            {deleting ? "Deleting account…" : "Permanently delete account"}
          </button>
        </form>}
      </details>
    </section>
  );
}
