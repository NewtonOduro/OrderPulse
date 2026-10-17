export async function readLoyaltyBalance(database, userId) {
  const orders = await database.all(`
    SELECT total_pesewas, delivery_fee_pesewas, status, payment_status, rewards_points_used
    FROM orders WHERE customer_user_id = ?
  `, [userId]);
  return orders.reduce((balance, order) => {
    if (order.status === "completed" && order.payment_status === "paid") {
      balance.earned += Math.floor(
        Math.max(0, Number(order.total_pesewas) - Number(order.delivery_fee_pesewas)) / 100,
      );
    }
    if (order.status !== "cancelled") balance.reserved += Number(order.rewards_points_used);
    return balance;
  }, { earned: 0, reserved: 0 });
}
