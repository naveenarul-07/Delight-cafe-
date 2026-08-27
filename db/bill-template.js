function formatRupee(amount) {
  return `Rs.${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatServiceType(type) {
  return type === 'delivery' ? 'Delivery' : 'Dine-in';
}

function formatDateTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString('en-IN');
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncateText(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function collectPhones(details) {
  const phoneList = [];
  const seen = new Set();
  const pushPhone = (value) => {
    String(value || '')
      .split(/[\s,;/|]+/)
      .map((p) => p.replace(/\D/g, ''))
      .forEach((digits) => {
        let phone = digits;
        if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
        else if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
        else if (phone.length > 10) phone = phone.slice(-10);
        if (/^[6-9]\d{9}$/.test(phone) && !seen.has(phone)) {
          seen.add(phone);
          phoneList.push(phone);
        }
      });
  };

  if (Array.isArray(details.phones)) details.phones.forEach(pushPhone);
  pushPhone(details.phone);
  pushPhone(details.whatsappPhone);
  pushPhone(details.alternatePhone);
  return phoneList;
}

function buildServiceLines(order, details) {
  const serviceType = order.serviceType || details.serviceType;
  const lines = [];

  if (serviceType === 'delivery') {
    const address = [details.addressLine, details.landmark, details.city, details.pincode]
      .filter(Boolean)
      .join(', ');
    if (address) lines.push(`Address: ${truncateText(address, 54)}`);
    if (details.preferredTime) lines.push(`Preferred time: ${details.preferredTime}`);
    if (details.deliveryInstructions) {
      lines.push(`Instructions: ${truncateText(details.deliveryInstructions, 54)}`);
    }
  } else if (details.specialInstructions) {
    lines.push(`Notes: ${truncateText(details.specialInstructions, 54)}`);
  }

  return lines.length ? lines : ['—'];
}

/**
 * Delight Cafe branded aesthetic bill as SVG (in memory).
 */
function buildBillSvg(order) {
  const details = order.orderDetails || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const service = formatServiceType(order.serviceType || details.serviceType);
  const payment = String(order.paymentMethod || 'N/A').toUpperCase();
  const status = String(order.status || 'confirmed').replace(/_/g, ' ');
  const customer = details.fullName || order.username || 'Guest';
  const email = details.email || '';
  const phones = collectPhones(details);
  const phoneText = phones.length ? phones.map((p) => `+91 ${p}`).join(', ') : '—';
  const placedAt = formatDateTime(order.placedAt);
  const receipt =
    order.invoiceToken ||
    order.receiptCode ||
    `DC-${String(order.id || 0).padStart(4, '0')}`;
  const serviceLines = buildServiceLines(order, details);

  const width = 520;
  const metaStartY = 168;
  const metaLineH = 20;
  const detailStartOffset = email ? 130 : 112;
  const metaBlockH = detailStartOffset + serviceLines.length * metaLineH + 16;
  const itemsHeadY = metaStartY + metaBlockH + 18;
  const itemsStartY = itemsHeadY + 28;
  const rowH = 30;
  const itemsBlockH = Math.max(items.length, 1) * rowH + 10;
  const totalsY = itemsStartY + itemsBlockH + 28;
  const footerY = totalsY + 118;
  const height = footerY + 72;

  const itemRows = items.length
    ? items
        .map((item, index) => {
          const y = itemsStartY + 10 + index * rowH;
          const qty = Number(item.quantity || 1);
          const price = Number(item.price || 0);
          const line = price * qty;
          const zebra =
            index % 2 === 0
              ? `<rect x="36" y="${y - 18}" width="448" height="28" rx="8" fill="#f0fffb"/>`
              : '';
          return `
      ${zebra}
      <text x="48" y="${y}" fill="#0a4d5c" font-size="14" font-family="Georgia, 'Times New Roman', serif">${escapeXml(truncateText(item.name, 28))}</text>
      <text x="300" y="${y}" fill="#3d5a63" font-size="12" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${escapeXml(formatRupee(price))}</text>
      <text x="360" y="${y}" fill="#3d5a63" font-size="13" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">x${qty}</text>
      <text x="468" y="${y}" fill="#0a4d5c" font-size="14" font-weight="700" text-anchor="end" font-family="Segoe UI, Arial, sans-serif">${escapeXml(formatRupee(line))}</text>`;
        })
        .join('')
    : `<text x="48" y="${itemsStartY + 14}" fill="#5a7178" font-size="14" font-family="Segoe UI, Arial, sans-serif">No items on this bill</text>`;

  const serviceSvg = serviceLines
    .map((line, i) => {
      const y = metaStartY + detailStartOffset + i * metaLineH;
      return `<text x="48" y="${y}" fill="#3d5a63" font-size="13" font-family="Segoe UI, Arial, sans-serif">${escapeXml(line)}</text>`;
    })
    .join('');

  const subtotal = formatRupee(order.subtotal ?? order.total);
  const total = formatRupee(order.total);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgWash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5fffc"/>
      <stop offset="100%" stop-color="#e4fbf4"/>
    </linearGradient>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a4d5c"/>
      <stop offset="55%" stop-color="#0e6b7d"/>
      <stop offset="100%" stop-color="#00a88b"/>
    </linearGradient>
    <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7aefe0"/>
      <stop offset="50%" stop-color="#00c9a7"/>
      <stop offset="100%" stop-color="#ffbe6a"/>
    </linearGradient>
    <linearGradient id="totalGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0a4d5c"/>
      <stop offset="100%" stop-color="#15899e"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0a4d5c" flood-opacity="0.16"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgWash)"/>
  <rect x="18" y="18" width="484" height="${height - 36}" rx="22" fill="#ffffff" stroke="#00c9a7" stroke-width="1.5" filter="url(#softShadow)"/>

  <path d="M18 40 C18 27.8 27.8 18 40 18 H480 C492.2 18 502 27.8 502 40 V130 H18 Z" fill="url(#headerGrad)"/>
  <circle cx="78" cy="74" r="28" fill="rgba(255,255,255,0.12)"/>
  <circle cx="78" cy="74" r="18" fill="rgba(0,201,167,0.35)" stroke="#7aefe0" stroke-width="2"/>
  <text x="78" y="80" text-anchor="middle" fill="#e9fffa" font-size="18" font-weight="700" font-family="Georgia, 'Times New Roman', serif">DC</text>

  <text x="120" y="68" fill="#e9fffa" font-size="30" font-weight="700" font-family="Georgia, 'Times New Roman', serif">Delight Cafe</text>
  <text x="120" y="92" fill="#b8fff3" font-size="12" letter-spacing="2.5" font-family="Segoe UI, Arial, sans-serif">FRESH · WARM · EVERY VISIT</text>
  <text x="468" y="62" text-anchor="end" fill="#e9fffa" font-size="11" letter-spacing="1.5" font-family="Segoe UI, Arial, sans-serif">TAX INVOICE</text>
  <text x="468" y="84" text-anchor="end" fill="#7aefe0" font-size="13" font-weight="700" font-family="Segoe UI, Arial, sans-serif">#${escapeXml(order.id)}</text>
  <rect x="120" y="104" width="220" height="3" rx="2" fill="url(#accentLine)"/>

  <rect x="36" y="${metaStartY - 22}" width="448" height="${metaBlockH}" rx="16" fill="#f3fcfa" stroke="rgba(0,168,139,0.25)"/>
  <text x="48" y="${metaStartY}" fill="#00a88b" font-size="11" font-weight="700" letter-spacing="1.2" font-family="Segoe UI, Arial, sans-serif">BILL DETAILS</text>
  <text x="468" y="${metaStartY}" text-anchor="end" fill="#5a7178" font-size="12" font-family="Segoe UI, Arial, sans-serif">${escapeXml(placedAt)}</text>

  <text x="48" y="${metaStartY + 26}" fill="#0a4d5c" font-size="18" font-weight="700" font-family="Georgia, 'Times New Roman', serif">${escapeXml(truncateText(customer, 28))}</text>
  <text x="48" y="${metaStartY + 48}" fill="#3d5a63" font-size="13" font-family="Segoe UI, Arial, sans-serif">Mobile: ${escapeXml(phoneText)}</text>
  <text x="48" y="${metaStartY + 68}" fill="#3d5a63" font-size="13" font-family="Segoe UI, Arial, sans-serif">${email ? `Email: ${escapeXml(truncateText(email, 42))}` : `Receipt: ${escapeXml(truncateText(receipt, 34))}`}</text>
  <text x="48" y="${metaStartY + 88}" fill="#3d5a63" font-size="13" font-family="Segoe UI, Arial, sans-serif">Service: ${escapeXml(service)} · Payment: ${escapeXml(payment)} · Status: ${escapeXml(status)}</text>
  ${email ? `<text x="48" y="${metaStartY + 108}" fill="#3d5a63" font-size="12" font-family="Segoe UI, Arial, sans-serif">Receipt: ${escapeXml(truncateText(receipt, 34))}</text>` : ''}
  ${serviceSvg}

  <text x="48" y="${itemsHeadY}" fill="#00a88b" font-size="11" font-weight="700" letter-spacing="1.2" font-family="Segoe UI, Arial, sans-serif">ORDER ITEMS</text>
  <text x="468" y="${itemsHeadY}" text-anchor="end" fill="#5a7178" font-size="12" font-family="Segoe UI, Arial, sans-serif">${itemCount} item${itemCount === 1 ? '' : 's'}</text>

  <text x="48" y="${itemsHeadY + 20}" fill="#0e6b7d" font-size="11" font-weight="700" letter-spacing="1" font-family="Segoe UI, Arial, sans-serif">ITEM</text>
  <text x="300" y="${itemsHeadY + 20}" text-anchor="middle" fill="#0e6b7d" font-size="11" font-weight="700" letter-spacing="1" font-family="Segoe UI, Arial, sans-serif">RATE</text>
  <text x="360" y="${itemsHeadY + 20}" text-anchor="middle" fill="#0e6b7d" font-size="11" font-weight="700" letter-spacing="1" font-family="Segoe UI, Arial, sans-serif">QTY</text>
  <text x="468" y="${itemsHeadY + 20}" text-anchor="end" fill="#0e6b7d" font-size="11" font-weight="700" letter-spacing="1" font-family="Segoe UI, Arial, sans-serif">AMOUNT</text>
  <line x1="40" y1="${itemsHeadY + 26}" x2="480" y2="${itemsHeadY + 26}" stroke="rgba(0,201,167,0.35)" stroke-width="1.5"/>
  ${itemRows}
  <line x1="40" y1="${itemsStartY + itemsBlockH}" x2="480" y2="${itemsStartY + itemsBlockH}" stroke="rgba(0,201,167,0.35)" stroke-width="1.5"/>

  <text x="300" y="${totalsY}" fill="#3d5a63" font-size="13" font-family="Segoe UI, Arial, sans-serif">Items total</text>
  <text x="468" y="${totalsY}" text-anchor="end" fill="#0a4d5c" font-size="13" font-family="Segoe UI, Arial, sans-serif">${escapeXml(subtotal)}</text>
  <text x="300" y="${totalsY + 22}" fill="#00a88b" font-size="13" font-weight="600" font-family="Segoe UI, Arial, sans-serif">Platform fee</text>
  <text x="468" y="${totalsY + 22}" text-anchor="end" fill="#00a88b" font-size="13" font-weight="700" font-family="Segoe UI, Arial, sans-serif">Rs.0.00</text>

  <rect x="250" y="${totalsY + 36}" width="230" height="48" rx="14" fill="url(#totalGrad)"/>
  <text x="268" y="${totalsY + 66}" fill="#e9fffa" font-size="15" font-weight="700" letter-spacing="1" font-family="Segoe UI, Arial, sans-serif">TOTAL PAID</text>
  <text x="462" y="${totalsY + 66}" text-anchor="end" fill="#7aefe0" font-size="18" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(total)}</text>

  <text x="48" y="${totalsY + 58}" fill="#5a7178" font-size="11" font-family="Segoe UI, Arial, sans-serif">Delight Cafe</text>
  <text x="48" y="${totalsY + 76}" fill="#0a4d5c" font-size="12" font-weight="600" font-family="Segoe UI, Arial, sans-serif">No platform fee on this bill</text>

  <rect x="36" y="${footerY - 18}" width="448" height="56" rx="14" fill="#0a4d5c"/>
  <text x="260" y="${footerY + 8}" text-anchor="middle" fill="#e9fffa" font-size="14" font-weight="700" font-family="Georgia, 'Times New Roman', serif">Thank you for choosing Delight Cafe</text>
  <text x="260" y="${footerY + 28}" text-anchor="middle" fill="#7aefe0" font-size="11" font-family="Segoe UI, Arial, sans-serif">Pay only for what you order · Fresh food · Warm hospitality</text>
</svg>`;
}

/** Build bill SVG in memory only — never written to disk. */
function buildBill(order) {
  const svg = buildBillSvg(order);
  return { svg };
}

/** @deprecated Use buildBill — kept for older call sites. */
function saveBillSvg(order) {
  return buildBill(order);
}

function buildWhatsAppBillCaption(order) {
  const details = order.orderDetails || {};
  const name = details.fullName || order.username || 'Guest';
  const service = formatServiceType(order.serviceType || details.serviceType);
  const payment = String(order.paymentMethod || 'N/A').toUpperCase();
  return (
    `*Delight Cafe — Bill #${order.id}*\n` +
    `Hi ${name},\n` +
    `Your order bill is ready.\n` +
    `Service: ${service}\n` +
    `Payment: ${payment}\n` +
    `Total: ${formatRupee(order.total)}\n` +
    `Thank you for dining with Delight Cafe!`
  );
}

module.exports = {
  formatRupee,
  buildBillSvg,
  buildBill,
  saveBillSvg,
  buildWhatsAppBillCaption
};
