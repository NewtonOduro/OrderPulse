const pageWidth = 595.28;
const pageHeight = 841.89;
const colors = {
  forest: [24, 50, 75],
  leaf: [23, 107, 122],
  cream: [248, 243, 226],
  ink: [31, 42, 48],
  muted: [100, 111, 116],
  line: [222, 226, 220],
  white: [255, 255, 255],
};

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, "\\$&");
}

function wrap(value, maxLength = 42) {
  const words = String(value ?? "").split(/\s+/);
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

function color(values) {
  return values.map((value) => (value / 255).toFixed(3)).join(" ");
}

export function downloadReceiptPdf(order) {
  const pages = [[]];
  let y = 0;
  const drawText = (text, x, top, size = 10, bold = false, shade = colors.ink, align = "left") => {
    const estimatedWidth = String(text).length * size * 0.52;
    const textX = align === "right" ? x - estimatedWidth : x;
    pages.at(-1).push(
      `BT /F${bold ? "2" : "1"} ${size} Tf ${color(shade)} rg 1 0 0 1 ${textX.toFixed(2)} ${(pageHeight - top - size).toFixed(2)} Tm (${pdfText(text)}) Tj ET`,
    );
  };
  const drawRect = (x, top, width, height, fill, stroke) => {
    const bottom = pageHeight - top - height;
    if (fill) pages.at(-1).push(`${color(fill)} rg ${x} ${bottom.toFixed(2)} ${width} ${height} re f`);
    if (stroke) pages.at(-1).push(`${color(stroke)} RG 0.7 w ${x} ${bottom.toFixed(2)} ${width} ${height} re S`);
  };
  const drawLine = (x1, top, x2, shade = colors.line) => {
    const py = (pageHeight - top).toFixed(2);
    pages.at(-1).push(`${color(shade)} RG 0.7 w ${x1} ${py} m ${x2} ${py} l S`);
  };
  const drawHeader = (continued = false) => {
    drawRect(0, 0, pageWidth, continued ? 78 : 110, colors.forest);
    drawText("O", 38, 27, 28, true, colors.white);
    drawText("OrderPulse", 68, 26, 21, true, colors.white);
    drawText("Restaurant ordering in Kumasi", 69, 53, 9, false, colors.white);
    drawText(continued ? "RECEIPT - CONTINUED" : "RECEIPT", pageWidth - 38, 29, 10, true, colors.white, "right");
    drawText(`Order ${order.orderNumber}`, pageWidth - 38, 48, 8, false, colors.white, "right");
    y = continued ? 105 : 128;
  };
  const drawItemsHeading = () => {
    drawText("ITEM", 42, y, 8, true, colors.muted);
    drawText("QTY", 374, y, 8, true, colors.muted, "right");
    drawText("UNIT PRICE", 465, y, 8, true, colors.muted, "right");
    drawText("AMOUNT", pageWidth - 42, y, 8, true, colors.muted, "right");
    y += 17;
    drawLine(42, y, pageWidth - 42);
    y += 9;
  };
  const drawFooter = (pageIndex) => {
    const page = pages[pageIndex];
    const drawFooterText = (text, x, top, size, bold, shade, align = "left") => {
      const estimatedWidth = String(text).length * size * 0.52;
      const textX = align === "right" ? x - estimatedWidth : align === "center" ? x - estimatedWidth / 2 : x;
      page.push(
        `BT /F${bold ? "2" : "1"} ${size} Tf ${color(shade)} rg 1 0 0 1 ${textX.toFixed(2)} ${(pageHeight - top - size).toFixed(2)} Tm (${pdfText(text)}) Tj ET`,
      );
    };
    page.push(`${color(colors.line)} RG 0.7 w 42 ${(pageHeight - 790).toFixed(2)} m ${pageWidth - 42} ${(pageHeight - 790).toFixed(2)} l S`);
    drawFooterText("Thank you for ordering with OrderPulse!", pageWidth / 2, 801, 8, true, colors.ink, "center");
    drawFooterText("OrderPulse - Ahodwo, Kumasi, Ghana", pageWidth / 2, 814, 7, false, colors.muted, "center");
    if (pages.length > 1) drawFooterText(`Page ${pageIndex + 1}`, pageWidth - 42, 814, 7, false, colors.muted, "right");
  };

  drawHeader();
  drawText("Order number", 42, y, 8, false, colors.muted);
  drawText(order.orderNumber, 134, y, 9, true);
  const paid = order.paymentStatus === "paid";
  drawRect(pageWidth - 103, y - 4, 61, 22, colors.white, colors.leaf);
  drawText(paid ? "PAID" : "PENDING", pageWidth - 72.5, y + 2, 8, true, colors.forest, "center");
  y += 22;
  drawText("Ordered", 42, y, 8, false, colors.muted);
  drawText(new Date(order.createdAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" }), 134, y, 9, true);
  y += 25;

  const cardTop = y;
  const cardWidth = (pageWidth - 96) / 2;
  drawRect(42, cardTop, cardWidth, 94, colors.white, colors.line);
  drawRect(54 + cardWidth, cardTop, cardWidth, 94, colors.white, colors.line);
  drawText("BILLED TO", 54, cardTop + 12, 8, true, colors.muted);
  drawText(order.customerName, 54, cardTop + 29, 10, true);
  drawText(order.phone, 54, cardTop + 46, 9);
  drawText(order.orderType === "dine-in" ? "Dine in" : "Pickup", 54, cardTop + 63, 8, false, colors.muted);
  const fromX = 66 + cardWidth;
  drawText("FROM", fromX, cardTop + 12, 8, true, colors.muted);
  drawText("OrderPulse", fromX, cardTop + 29, 10, true);
  drawText("Ahodwo, Kumasi, Ghana", fromX, cardTop + 46, 8);
  drawText("Ghana", fromX, cardTop + 63, 8);
  y = cardTop + 117;

  drawItemsHeading();
  for (const item of order.items) {
    const itemLines = wrap(item.name);
    const rowHeight = Math.max(28, itemLines.length * 12 + 12);
    if (y + rowHeight > 765) {
      pages.push([]);
      drawHeader(true);
      drawItemsHeading();
    }
    itemLines.forEach((line, index) => drawText(line, 42, y + index * 12, 8, index === 0));
    drawText(item.quantity, 374, y, 8, false, colors.ink, "right");
    drawText(money(item.unitPrice), 465, y, 8, false, colors.ink, "right");
    drawText(money(item.unitPrice * item.quantity), pageWidth - 42, y, 8, false, colors.ink, "right");
    y += rowHeight;
    drawLine(42, y - 3, pageWidth - 42);
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (y + 106 > 765) {
    pages.push([]);
    drawHeader(true);
  }
  y += 8;
  drawText("Subtotal", pageWidth - 220, y, 9, false, colors.muted);
  drawText(money(subtotal), pageWidth - 42, y, 9, false, colors.ink, "right");
  y += 24;
  drawRect(pageWidth - 220, y - 5, 178, 31, colors.forest);
  drawText(paid ? "Total paid" : "Order total", pageWidth - 210, y + 3, 9, true, colors.white);
  drawText(money(order.total), pageWidth - 52, y + 3, 9, true, colors.white, "right");
  y += 43;
  drawRect(42, y, pageWidth - 84, 48, colors.cream);
  drawText(paid ? "Paid with Paystack" : "Payment via Paystack", 55, y + 9, 8, true);
  drawText(`Reference: ${order.reference || order.paymentReference || order.orderNumber}`, 55, y + 26, 8, false, colors.muted);

  pages.forEach((_, index) => drawFooter(index));

  const objects = new Map();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pages.forEach((operators, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const content = `${operators.join("\n")}\n`;
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
