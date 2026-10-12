const pageWidth = 420;
const pageHeight = 595;

function pdfText(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, "\\$&");
}

function wrap(value, maxLength = 58) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function money(amount) {
  return `GHS ${Number(amount).toFixed(2)}`;
}

export function downloadReceiptPdf(order) {
  const pages = [[]];
  let y = pageHeight - 44;
  const addLine = (text, { size = 10, gap = 17, bold = false } = {}) => {
    if (y < 42) {
      pages.push([]);
      y = pageHeight - 44;
    }
    pages.at(-1).push(`BT /F${bold ? "2" : "1"} ${size} Tf 38 ${y} Td (${pdfText(text)}) Tj ET`);
    y -= gap;
  };
  const addWrapped = (text, options) => {
    for (const line of wrap(text)) addLine(line, options);
  };

  addLine("OrderPulse - Ahodwo, Kumasi", { size: 16, gap: 26, bold: true });
  addLine("ORDER RECEIPT", { size: 11, gap: 24, bold: true });
  addLine(`Order: ${order.orderNumber}`, { bold: true });
  addWrapped(`Customer: ${order.customerName}`);
  addLine(`Type: ${order.orderType === "dine-in" ? "Dine in" : "Pickup"}`);
  addLine(`Date: ${new Date(order.createdAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}`);
  addLine(`Payment: ${order.paymentStatus === "paid" ? "Paid - Paystack" : "Pending"}`);
  addLine("------------------------------------------------------------", { size: 9, gap: 19 });
  addLine("ITEMS", { bold: true });
  for (const item of order.items) {
    addWrapped(`${item.quantity} x ${item.name} - ${money(item.unitPrice * item.quantity)}`, { gap: 15 });
  }
  addLine("------------------------------------------------------------", { size: 9, gap: 19 });
  addLine(`TOTAL: ${money(order.total)}`, { size: 12, gap: 23, bold: true });
  addLine("Thank you for choosing OrderPulse.", { gap: 18 });
  addLine("Ahodwo, Kumasi, Ghana");

  const objects = new Map();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pages.forEach((lines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const content = `${lines.join("\n")}\n`;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
  });

  const encoder = new TextEncoder();
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= objects.size; id += 1) {
    offsets[id] = encoder.encode(output).length;
    output += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(output).length;
  output += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.size; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([output], { type: "application/pdf" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `OrderPulse-${order.orderNumber}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
