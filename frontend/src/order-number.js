export function displayOrderNumber(orderNumber) {
  const match = typeof orderNumber === "string"
    ? orderNumber.match(/^(GH-)([A-Fa-f0-9]{8,})$/)
    : null;

  return match ? `${match[1]}${match[2].slice(0, 8)}` : orderNumber;
}
