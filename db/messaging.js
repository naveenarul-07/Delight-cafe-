function formatRupee(amount) {
  return `Rs.${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function formatServiceType(type) {
  return type === 'delivery' ? 'Delivery' : 'Dine-in';
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function isWhatsAppPhone(phone, { allowUnknown = false } = {}) {
  const p = normalizePhone(phone);
  // When allowUnknown is true (bill share), any 10-digit number is accepted.
  if (allowUnknown) return /^\d{10}$/.test(p);
  return /^[6-9]\d{9}$/.test(p);
}

/** Collect WhatsApp mobiles from order / bill details (or any raw list) */
function extractOrderPhones(details = {}, { allowUnknown = false } = {}) {
  const raw = [];
  const push = (value) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    String(value)
      .split(/[\s,;/|]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => raw.push(part));
  };

  push(details.phones);
  push(details.phone);
  push(details.whatsappPhone);
  push(details.whatsappNumbers);
  push(details.alternatePhone);
  push(details.extraPhones);
  push(details.unknownPhones);
  push(details.manualPhones);

  const phones = [];
  const seen = new Set();
  raw.forEach((value) => {
    const phone = normalizePhone(value);
    if (isWhatsAppPhone(phone, { allowUnknown }) && !seen.has(phone)) {
      seen.add(phone);
      phones.push(phone);
    }
  });
  return phones;
}

/** Customer bill / order confirmation for WhatsApp */
function buildOrderConfirmationMessage(order) {
  const details = order.orderDetails || {};
  const items = (order.items || [])
    .map((item) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
      return `• ${item.name} x${item.quantity}${lineTotal ? ` = ${formatRupee(lineTotal)}` : ''}`;
    })
    .join('\n');

  const service = formatServiceType(order.serviceType || details.serviceType);
  const payment = String(order.paymentMethod || 'N/A').toUpperCase();
  const status = String(order.status || 'confirmed').replace(/_/g, ' ');
  const amount = formatRupee(order.total);

  let placeInfo = '';
  if ((order.serviceType || details.serviceType) === 'delivery') {
    placeInfo =
      `\nAddress: ${details.addressLine || ''}, ${details.city || ''} ${details.pincode || ''}` +
      (details.landmark ? `\nLandmark: ${details.landmark}` : '');
    if (details.deliveryInstructions) {
      placeInfo += `\nNotes: ${details.deliveryInstructions}`;
    }
  } else if (details.specialInstructions) {
    placeInfo = `\nNotes: ${details.specialInstructions}`;
  }

  return (
    `*Delight Cafe — Bill*\n` +
    `Hi ${details.fullName || order.username || 'Customer'},\n\n` +
    `Order #${order.id} confirmed (${service})\n` +
    `${items || '• Items N/A'}\n\n` +
    `*Total: ${amount}*\n` +
    `Payment: ${payment}\n` +
    `Status: ${status}` +
    `${placeInfo}\n\n` +
    `Thank you for ordering with Delight Cafe!`
  );
}

function buildWhatsAppUrl(phoneInput, message) {
  const phone = normalizePhone(phoneInput);
  const text = String(message || '').trim();
  if (!phone) return { phone, whatsappUrl: '', whatsappAppUrl: '', message: text };

  const fullPhone = `91${phone}`;
  const encoded = encodeURIComponent(text || ' ');
  // System WhatsApp Desktop / Mobile app protocol
  const whatsappAppUrl = `whatsapp://send?phone=${fullPhone}${text ? `&text=${encoded}` : ''}`;
  // Web / universal fallback (opens chat for that number, including unknown)
  const whatsappUrl = `https://wa.me/${fullPhone}${text ? `?text=${encoded}` : ''}`;

  return {
    phone,
    whatsappUrl,
    whatsappAppUrl,
    message: text
  };
}

function appendOutbox(phone, message, meta = {}) {
  // History is stored in MongoDB (customer_messages / orders) — do not write local system files.
  return null;
}

/**
 * Send interactive WhatsApp message with a real button labeled "Download Invoice"
 * (custom hyperlink text). Requires WhatsApp Cloud API env:
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 * Optional: WHATSAPP_API_VERSION (default v19.0)
 */
async function sendWhatsAppDownloadInvoiceButton(phoneInput, { bodyText, invoiceUrl }) {
  const phone = normalizePhone(phoneInput);
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_CLOUD_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v19.0';
  const url = String(invoiceUrl || '').trim();

  if (!token || !phoneNumberId || !url) {
    return { sent: false, skipped: true, reason: 'WhatsApp Cloud API not configured' };
  }
  if (!/^https?:\/\//i.test(url) || /localhost|127\.0\.0\.1/i.test(url)) {
    return {
      sent: false,
      skipped: true,
      reason: 'Invoice URL must be a public https link (not localhost) for WhatsApp buttons'
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: `91${phone}`,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: {
              text: String(bodyText || 'Your Delight Cafe invoice is ready.').slice(0, 1024)
            },
            action: {
              name: 'cta_url',
              parameters: {
                // Button label shown to customer (max 20 chars)
                display_text: 'Download Invoice',
                url
              }
            }
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg =
        data?.error?.message || data?.error?.error_user_msg || `WhatsApp API HTTP ${response.status}`;
      console.warn('[Delight Cafe WhatsApp CTA]', errMsg);
      return { sent: false, skipped: false, error: errMsg, data };
    }

    console.log(`[Delight Cafe WhatsApp] CTA "Download Invoice" sent to +91${phone}`);
    return {
      sent: true,
      skipped: false,
      messageId: data?.messages?.[0]?.id || null,
      data
    };
  } catch (err) {
    console.warn('[Delight Cafe WhatsApp CTA] failed', err.message);
    return { sent: false, skipped: false, error: err.message };
  }
}

/**
 * Upload PNG and send it as a WhatsApp image message (Cloud API).
 * Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 */
async function sendWhatsAppImage(phoneInput, { pngBuffer, caption = '' }) {
  const phone = normalizePhone(phoneInput);
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_CLOUD_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v19.0';

  if (!token || !phoneNumberId) {
    return { sent: false, skipped: true, reason: 'WhatsApp Cloud API not configured' };
  }
  if (!pngBuffer || !Buffer.isBuffer(pngBuffer) || !pngBuffer.length) {
    return { sent: false, skipped: false, error: 'Missing PNG bill image' };
  }
  if (!/^\d{10}$/.test(phone)) {
    return { sent: false, skipped: false, error: 'Invalid WhatsApp mobile number' };
  }

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'image/png');
    form.append(
      'file',
      new Blob([pngBuffer], { type: 'image/png' }),
      `Delight-Cafe-Bill-${phone}.png`
    );

    const uploadRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      }
    );
    const uploadData = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || !uploadData.id) {
      const errMsg =
        uploadData?.error?.message ||
        uploadData?.error?.error_user_msg ||
        `WhatsApp media upload HTTP ${uploadRes.status}`;
      console.warn('[Delight Cafe WhatsApp Image] upload failed', errMsg);
      return { sent: false, skipped: false, error: errMsg, data: uploadData };
    }

    const sendRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: `91${phone}`,
          type: 'image',
          image: {
            id: uploadData.id,
            caption: String(caption || 'Delight Cafe Bill').slice(0, 1024)
          }
        })
      }
    );
    const sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      const errMsg =
        sendData?.error?.message ||
        sendData?.error?.error_user_msg ||
        `WhatsApp image send HTTP ${sendRes.status}`;
      console.warn('[Delight Cafe WhatsApp Image] send failed', errMsg);
      return { sent: false, skipped: false, error: errMsg, data: sendData };
    }

    console.log(`[Delight Cafe WhatsApp] Bill PNG sent to +91${phone}`);
    return {
      sent: true,
      skipped: false,
      messageId: sendData?.messages?.[0]?.id || null,
      mediaId: uploadData.id,
      data: sendData
    };
  } catch (err) {
    console.warn('[Delight Cafe WhatsApp Image] failed', err.message);
    return { sent: false, skipped: false, error: err.message };
  }
}

/**
 * Deliver invoice: prefer WhatsApp button "Download Invoice" (no raw URL shown).
 * Falls back to WhatsApp app open with labeled link text.
 */
async function deliverWhatsAppInvoice(phoneInput, { message, invoiceUrl, buttonBody }) {
  const phone = normalizePhone(phoneInput);
  if (!/^\d{10}$/.test(phone)) {
    return {
      delivered: false,
      channel: 'whatsapp',
      error: 'Invalid WhatsApp mobile number',
      phone
    };
  }

  const text = String(message || '').trim();
  const url = String(invoiceUrl || '').trim();
  if (!text && !url) {
    return { delivered: false, channel: 'whatsapp', error: 'Empty invoice message', phone };
  }

  const cta = await sendWhatsAppDownloadInvoiceButton(phone, {
    bodyText: buttonBody || text,
    invoiceUrl: url
  });

  if (cta.sent) {
    const outboxPath = appendOutbox(phone, `${buttonBody || text}\n[Button: Download Invoice] ${url}`, {
      channel: 'whatsapp',
      status: 'sent_api'
    });
    return {
      delivered: true,
      easy: false,
      apiSent: true,
      channel: 'whatsapp',
      phone,
      message: buttonBody || text,
      invoiceUrl: url,
      buttonLabel: 'Download Invoice',
      whatsappUrl: '',
      whatsappAppUrl: '',
      outboxPath,
      error: null
    };
  }

  // Fallback — WhatsApp app compose (URL must appear for the customer to tap)
  const { whatsappUrl, whatsappAppUrl } = buildWhatsAppUrl(phone, text);
  const outboxPath = appendOutbox(phone, text, {
    channel: 'whatsapp',
    status: 'pending',
    error: cta.error || cta.reason || null
  });

  console.log(`[Delight Cafe WhatsApp] Invoice link ready for +91${phone} (app fallback)`);

  return {
    delivered: true,
    easy: true,
    apiSent: false,
    channel: 'whatsapp',
    phone,
    message: text,
    invoiceUrl: url,
    buttonLabel: 'Download Invoice',
    whatsappUrl,
    whatsappAppUrl,
    outboxPath,
    apiSkipReason: cta.reason || cta.error || null,
    error: null
  };
}

/**
 * Prepare bill for WhatsApp delivery to the customer's mobile number.
 * Opens as wa.me chat with bill text ready — free, no SMS gateway.
 */
async function deliverWhatsAppBill(phoneInput, message) {
  const phone = normalizePhone(phoneInput);
  if (!/^\d{10}$/.test(phone)) {
    return {
      delivered: false,
      channel: 'whatsapp',
      error: 'Invalid WhatsApp mobile number',
      phone
    };
  }

  const text = String(message || '').trim();
  if (!text) {
    return { delivered: false, channel: 'whatsapp', error: 'Empty bill message', phone };
  }

  const { whatsappUrl, whatsappAppUrl } = buildWhatsAppUrl(phone, text);
  const outboxPath = appendOutbox(phone, text, {
    channel: 'whatsapp',
    status: 'pending'
  });

  console.log(`[Delight Cafe WhatsApp] Bill ready for +91${phone} (system app + web)`);

  return {
    delivered: true,
    easy: true,
    apiSent: false,
    channel: 'whatsapp',
    phone,
    message: text,
    whatsappUrl,
    whatsappAppUrl,
    outboxPath,
    error: null
  };
}

// Keep old name used by server for compatibility (now WhatsApp-only)
async function sendNormalTextMessage(phoneInput, message) {
  return deliverWhatsAppBill(phoneInput, message);
}

async function deliverCustomerSms(phoneInput, message) {
  return deliverWhatsAppBill(phoneInput, message);
}

module.exports = {
  formatRupee,
  formatServiceType,
  normalizePhone,
  isWhatsAppPhone,
  extractOrderPhones,
  buildOrderConfirmationMessage,
  buildWhatsAppUrl,
  deliverWhatsAppBill,
  deliverWhatsAppInvoice,
  sendWhatsAppDownloadInvoiceButton,
  sendWhatsAppImage,
  sendNormalTextMessage,
  deliverCustomerSms
};
