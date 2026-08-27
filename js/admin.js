const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'paid',
  'cancelled'
];

function formatOrderStatus(status) {
  return String(status || 'pending').replace(/_/g, ' ');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function summarizeItems(items) {
  if (!Array.isArray(items) || !items.length) return '-';
  return items.map((item) => `${item.name} × ${item.quantity}`).join(', ');
}

function formatItemsListHtml(items) {
  if (!Array.isArray(items) || !items.length) return '-';
  return items
    .map(
      (item) =>
        `<div class="admin-item-line">${escapeHtml(`${item.name} × ${item.quantity}`)}</div>`
    )
    .join('');
}

function getOrderPhones(details = {}) {
  if (Array.isArray(details.phones) && details.phones.length) {
    return details.phones.map((p) => String(p).replace(/\D/g, '').slice(-10)).filter(Boolean);
  }
  const one = String(details.phone || '').replace(/\D/g, '');
  const ten = one.length > 10 ? one.slice(-10) : one;
  return ten ? [ten] : [];
}

function formatPhoneList(details = {}) {
  const phones = getOrderPhones(details);
  return phones.length ? phones.map((p) => `+91 ${p}`).join(', ') : '';
}

function customerDisplayName(order) {
  return String(order.orderDetails?.fullName || order.username || '—').trim() || '—';
}

function formatServiceType(type) {
  return type === 'delivery' ? 'Delivery' : 'Dine-in';
}

function buildDetailsRows(order) {
  const details = order.orderDetails || {};
  const rows = [
    ['Order #', `#${order.id}`],
    ['User ID', order.userId != null ? String(order.userId) : '-'],
    ['Account', order.username || '-'],
    ['Service', formatServiceType(order.serviceType || details.serviceType)],
    ['Full Name', details.fullName || order.username || '-'],
    ['Mobile', formatPhoneList(details) || details.phone || '-'],
    ['Email', details.email || '-']
  ];

  if ((order.serviceType || details.serviceType) === 'delivery') {
    rows.push(
      ['Address', details.addressLine || '-'],
      ['City', details.city || '-'],
      ['Pincode', details.pincode || '-']
    );
    if (details.landmark) rows.push(['Landmark', details.landmark]);
    if (details.preferredTime) rows.push(['Preferred Time', details.preferredTime]);
    rows.push(['Notes', details.deliveryInstructions || '-']);
  } else {
    rows.push(['Notes', details.specialInstructions || '-']);
  }

  rows.push(
    ['Items', summarizeItems(order.items)],
    ['Total', formatRupee(order.total)],
    ['Payment', (order.paymentMethod || '-').toUpperCase()],
    ['Status', formatOrderStatus(order.status)],
    ['Placed At', formatDateTime(order.placedAt)]
  );

  return rows;
}

function renderCustomerDetailsPanel(detailsList) {
  const panel = document.getElementById('adminDetailsPanel');
  if (!panel) return;

  panel.innerHTML = '';

  if (!detailsList?.length) {
    panel.innerHTML =
      '<p class="empty-msg">No customer details in the last 24 hours. Older details are kept in Order Archive (by date).</p>';
    return;
  }

  detailsList.forEach((entry) => {
    const order = {
      id: entry.orderId,
      username: entry.username,
      serviceType: entry.serviceType,
      orderDetails: entry.orderDetails,
      items: entry.items,
      total: entry.total,
      paymentMethod: entry.paymentMethod,
      status: entry.status,
      placedAt: entry.placedAt
    };

    const card = document.createElement('article');
    card.className = 'admin-details-card';

    const rowsHtml = buildDetailsRows(order)
      .map(
        ([label, value]) => `
          <div class="admin-details-row">
            <span class="admin-details-label">${escapeHtml(label)}</span>
            <span class="admin-details-value">${escapeHtml(value)}</span>
          </div>
        `
      )
      .join('');

    card.innerHTML = `
      <div class="admin-details-card-head">
        <h3>Order #${order.id} — ${formatServiceType(order.serviceType)}</h3>
        <span class="status-pill status-${order.status}">${formatOrderStatus(order.status)}</span>
      </div>
      <div class="admin-details-grid">${rowsHtml}</div>
      <div class="admin-details-actions">
        <button type="button" class="btn-small" data-send-whatsapp="${order.id}">Send Bill Image on WhatsApp</button>
        <button type="button" class="btn-small btn-outline" data-preview-bill="${order.id}">Preview Bill Image</button>
      </div>
    `;

    panel.appendChild(card);
  });

  panel.querySelectorAll('[data-send-whatsapp]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Preparing bill image...';
      await sendBillImageOnWhatsApp(btn.dataset.sendWhatsapp);
      btn.disabled = false;
      btn.textContent = 'Send Bill Image on WhatsApp';
    });
  });

  panel.querySelectorAll('[data-preview-bill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await showBillImagePreview(btn.dataset.previewBill);
    });
  });
}

async function svgToPngBlob(svgText, scale = 2) {
  const widthMatch = String(svgText).match(/\bwidth="(\d+(?:\.\d+)?)"/);
  const heightMatch = String(svgText).match(/\bheight="(\d+(?:\.\d+)?)"/);
  const baseW = Math.max(1, Math.round(Number(widthMatch?.[1]) || 480));
  const baseH = Math.max(1, Math.round(Number(heightMatch?.[1]) || 700));

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load bill SVG'));
      img.src = src;
    });

  // Prefer data URI — more reliable than blob URLs for SVG→canvas in some browsers
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  let img;
  try {
    img = await loadImage(dataUri);
  } catch (_) {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(baseW * scale);
  canvas.height = Math.round(baseH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef3f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create PNG'))), 'image/png');
  });
  return blob;
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseAdminPhoneList(rawValue) {
  const parts = String(rawValue || '')
    .split(/[\s,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const phones = [];
  const seen = new Set();
  parts.forEach((part) => {
    let digits = part.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    else if (digits.length > 10) digits = digits.slice(-10);
    // Any 10-digit number is allowed for bill share (saved or unknown)
    if (/^\d{10}$/.test(digits) && !seen.has(digits)) {
      seen.add(digits);
      phones.push(digits);
    }
  });
  return phones;
}

function normalizeBillPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length > 10) digits = digits.slice(-10);
  return /^\d{10}$/.test(digits) ? digits : '';
}

function buildImageWhatsAppLinks(phone, caption) {
  const digits = normalizeBillPhone(phone);
  if (!digits) {
    return { whatsappUrl: '', whatsappAppUrl: '', phone: '' };
  }
  const text =
    `${String(caption || 'Delight Cafe Bill').trim()}\n\n` +
    `📷 Paste the bill image here (Ctrl+V), then Send.`;
  const fullPhone = `91${digits}`;
  const encoded = encodeURIComponent(text);
  return {
    phone: digits,
    whatsappAppUrl: `whatsapp://send?phone=${fullPhone}&text=${encoded}`,
    whatsappUrl: `https://wa.me/${fullPhone}?text=${encoded}`
  };
}

function buildImageWhatsAppUrl(phone, caption) {
  const links = buildImageWhatsAppLinks(phone, caption);
  return links.whatsappAppUrl || links.whatsappUrl;
}

/**
 * Open system WhatsApp directly to the customer's number.
 */
function openSystemWhatsApp(phoneOrLinks, caption) {
  let appUrl = '';
  let webUrl = '';

  if (phoneOrLinks && typeof phoneOrLinks === 'object') {
    appUrl = phoneOrLinks.whatsappAppUrl || '';
    webUrl = phoneOrLinks.whatsappUrl || '';
  } else {
    const links = buildImageWhatsAppLinks(phoneOrLinks, caption);
    appUrl = links.whatsappAppUrl;
    webUrl = links.whatsappUrl;
  }

  const target = appUrl || webUrl;
  if (!target) return '';

  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = appUrl || webUrl;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 2500);
  } catch (_) {
    /* ignore */
  }

  try {
    const a = document.createElement('a');
    a.href = appUrl || webUrl;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (_) {
    /* ignore */
  }

  if (appUrl && webUrl) {
    setTimeout(() => {
      if (document.hasFocus && document.hasFocus()) {
        try {
          window.open(webUrl, 'castleCafeWhatsApp');
        } catch (_) {
          /* ignore */
        }
      }
    }, 1200);
  }

  return target;
}

/**
 * Copy bill PNG into clipboard (no download), then open that number's WhatsApp chat.
 * Works for saved and unknown numbers alike.
 */
async function shareBillImageDirectly(pngBlob, caption, phone, whatsappLinks) {
  if (!pngBlob) {
    return { method: 'none', ok: false, error: 'Bill PNG was not created' };
  }

  const digits = normalizeBillPhone(phone) || normalizeBillPhone(whatsappLinks?.phone);
  const links =
    whatsappLinks && typeof whatsappLinks === 'object' && (whatsappLinks.whatsappAppUrl || whatsappLinks.whatsappUrl)
      ? { ...whatsappLinks, phone: digits || whatsappLinks.phone }
      : buildImageWhatsAppLinks(digits, caption);

  if (!links.whatsappAppUrl && !links.whatsappUrl) {
    return { method: 'none', ok: false, error: 'Enter a valid 10-digit WhatsApp number' };
  }

  let copied = false;
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      copied = true;
    }
  } catch (_) {
    /* fall through — still open chat */
  }

  openSystemWhatsApp(links);

  return {
    method: copied ? 'clipboard' : 'open',
    ok: true,
    phone: links.phone,
    needsPaste: true,
    warning: copied
      ? null
      : 'Could not copy image automatically — use Preview and copy, then paste in WhatsApp.'
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Choose WhatsApp recipients: saved bill numbers + any unknown number(s).
 * Unknown numbers are always allowed — add as many as needed.
 */
function promptWhatsAppRecipients({ orderId, customerName = '', savedPhones = [] } = {}) {
  return new Promise((resolve) => {
    const uniqueSaved = [
      ...new Set((savedPhones || []).map((p) => normalizeBillPhone(p)).filter(Boolean))
    ];

    let overlay = document.getElementById('waPhonePicker');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'waPhonePicker';
      overlay.className = 'wa-phone-picker';
      document.body.appendChild(overlay);
    }

    const extraPhones = [];

    const savedHtml = uniqueSaved.length
      ? `<div class="wa-phone-saved-list">
          <label class="wa-phone-check wa-phone-select-all">
            <input type="checkbox" id="waSelectAllSaved" checked>
            <span>Select all saved numbers</span>
          </label>
          ${uniqueSaved
            .map(
              (p) => `
            <label class="wa-phone-check">
              <input type="checkbox" data-saved-phone="${p}" checked>
              <span>+91 ${p}</span>
              <em>from bill details</em>
            </label>`
            )
            .join('')}
        </div>`
      : `<p class="wa-phone-empty">No number saved on this bill — add any WhatsApp number below.</p>`;

    overlay.innerHTML = `
      <div class="wa-phone-picker-card" role="dialog" aria-modal="true" aria-labelledby="waPhonePickerTitle">
        <h3 id="waPhonePickerTitle">Send bill on WhatsApp</h3>
        <p class="wa-phone-picker-sub">Order #${orderId || ''}${customerName ? ` · ${escapeHtml(customerName)}` : ''}</p>
        <p class="wa-phone-section-label">Saved numbers on this bill</p>
        ${savedHtml}
        <label class="wa-phone-unknown-field">
          <span>Add unknown / extra WhatsApp number(s)</span>
          <div class="wa-phone-add-row">
            <input type="tel" id="waUnknownPhones" placeholder="10-digit number — any number works" inputmode="numeric" autocomplete="tel">
            <button type="button" class="btn-small" id="waAddUnknownBtn">Add</button>
          </div>
          <small>Type a number and tap Add. You can add several. Comma-separated list also works.</small>
        </label>
        <div id="waExtraPhoneChips" class="wa-phone-chips" hidden></div>
        <p id="waRecipientSummary" class="wa-phone-summary"></p>
        <div class="wa-phone-picker-actions">
          <button type="button" class="btn-small btn-outline" id="waPhoneCancelBtn">Cancel</button>
          <button type="button" class="btn-small" id="waPhoneSendBtn">Send bill to selected numbers</button>
        </div>
      </div>
    `;

    overlay.classList.add('show');

    const unknownInput = overlay.querySelector('#waUnknownPhones');
    const chipsEl = overlay.querySelector('#waExtraPhoneChips');
    const summaryEl = overlay.querySelector('#waRecipientSummary');
    const sendBtn = overlay.querySelector('#waPhoneSendBtn');

    const collectSelected = () => {
      const selected = [...overlay.querySelectorAll('[data-saved-phone]:checked')]
        .map((el) => normalizeBillPhone(el.dataset.savedPhone))
        .filter(Boolean);
      const typed = parseAdminPhoneList(unknownInput?.value || '');
      return [...new Set([...selected, ...extraPhones, ...typed])];
    };

    const renderChips = () => {
      if (!chipsEl) return;
      if (!extraPhones.length) {
        chipsEl.hidden = true;
        chipsEl.innerHTML = '';
        return;
      }
      chipsEl.hidden = false;
      chipsEl.innerHTML = extraPhones
        .map(
          (p) => `
          <span class="wa-phone-chip">
            +91 ${p}
            <button type="button" data-remove-phone="${p}" aria-label="Remove ${p}">×</button>
          </span>`
        )
        .join('');
      chipsEl.querySelectorAll('[data-remove-phone]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = extraPhones.indexOf(btn.dataset.removePhone);
          if (idx >= 0) extraPhones.splice(idx, 1);
          renderChips();
          updateSummary();
        });
      });
    };

    const updateSummary = () => {
      const phones = collectSelected();
      if (summaryEl) {
        summaryEl.textContent = phones.length
          ? `Will open WhatsApp for ${phones.length} number(s): ${phones.map((p) => `+91 ${p}`).join(', ')}`
          : 'Select saved numbers and/or add unknown numbers to send.';
      }
      if (sendBtn) {
        sendBtn.textContent = phones.length
          ? `Send bill to ${phones.length} number${phones.length > 1 ? 's' : ''}`
          : 'Send bill to selected numbers';
      }
    };

    const addTypedNumbers = () => {
      const added = parseAdminPhoneList(unknownInput?.value || '');
      if (!added.length) {
        alert('Enter a valid 10-digit WhatsApp number (any number is allowed).');
        return;
      }
      added.forEach((p) => {
        if (!extraPhones.includes(p) && !uniqueSaved.includes(p)) extraPhones.push(p);
        else if (!extraPhones.includes(p)) extraPhones.push(p);
      });
      if (unknownInput) unknownInput.value = '';
      renderChips();
      updateSummary();
    };

    overlay.querySelector('#waSelectAllSaved')?.addEventListener('change', (e) => {
      const checked = Boolean(e.target.checked);
      overlay.querySelectorAll('[data-saved-phone]').forEach((el) => {
        el.checked = checked;
      });
      updateSummary();
    });

    overlay.querySelectorAll('[data-saved-phone]').forEach((el) => {
      el.addEventListener('change', updateSummary);
    });

    overlay.querySelector('#waAddUnknownBtn')?.addEventListener('click', addTypedNumbers);
    unknownInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTypedNumbers();
      }
    });
    unknownInput?.addEventListener('input', updateSummary);

    if (unknownInput && !uniqueSaved.length) {
      setTimeout(() => unknownInput.focus(), 50);
    }

    updateSummary();

    const finish = (phones) => {
      overlay.classList.remove('show');
      resolve(phones);
    };

    overlay.querySelector('#waPhoneCancelBtn')?.addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null);
    });

    sendBtn?.addEventListener('click', () => {
      const phones = collectSelected();
      if (!phones.length) {
        alert('Select a saved number or add at least one WhatsApp number.');
        return;
      }
      finish(phones);
    });
  });
}

/**
 * Open WhatsApp for every chosen number (saved + unknown), one after another.
 * Copies the bill image before each chat so you can paste in all of them.
 */
async function openWhatsAppForBillPhones(phones, caption, pngBlob) {
  const list = [...new Set((phones || []).map((p) => normalizeBillPhone(p)).filter(Boolean))];
  if (!list.length) {
    return { method: 'none', ok: false, error: 'No WhatsApp numbers selected', phones: [] };
  }

  let lastResult = { method: 'none', ok: false };
  for (let i = 0; i < list.length; i += 1) {
    const phone = list[i];
    const links = buildImageWhatsAppLinks(phone, caption);
    lastResult = await shareBillImageDirectly(pngBlob, caption, phone, links);

    if (lastResult.aborted) {
      return { ...lastResult, phones: list, openedCount: i };
    }
    if (!lastResult.ok) {
      return { ...lastResult, phones: list, openedCount: i };
    }

    if (i < list.length - 1) {
      const next = list[i + 1];
      const goNext = window.confirm(
        `WhatsApp opened for +91 ${phone}.\n\n` +
          `Paste the bill image (Ctrl+V / long-press → Paste) and tap Send.\n\n` +
          `Click OK to open the next number: +91 ${next}\n` +
          `(${i + 2} of ${list.length})`
      );
      if (!goNext) {
        return { ...lastResult, phones: list, openedCount: i + 1, stoppedEarly: true };
      }
      await sleep(400);
    }
  }

  return { ...lastResult, phones: list, openedCount: list.length };
}

/**
 * Fetch bill details, let admin pick saved and/or unknown numbers,
 * generate PNG, open WhatsApp for each chosen number.
 */
async function sendBillImageOnWhatsApp(orderId) {
  const billRes = await apiFetch(`/admin/orders/${orderId}/bill.json`);
  if (!billRes.success || !billRes.svg) {
    alert(billRes.message || 'Could not generate bill image');
    return;
  }

  const savedPhones = (
    Array.isArray(billRes.phones) && billRes.phones.length
      ? billRes.phones
      : [billRes.phone]
  )
    .map((p) => normalizeBillPhone(p))
    .filter(Boolean);

  const chosenPhones = await promptWhatsAppRecipients({
    orderId,
    customerName: billRes.customerName || billRes.orderDetails?.fullName || '',
    savedPhones
  });

  if (!chosenPhones) return;
  if (!chosenPhones.length) {
    alert('Select or add at least one WhatsApp number (saved or unknown).');
    return;
  }

  let pngBlob;
  try {
    pngBlob = await svgToPngBlob(billRes.svg);
  } catch (err) {
    console.warn('PNG convert failed', err);
    alert('Could not create bill PNG image. Please try Preview Bill Image, then send again.');
    return;
  }

  const pngBase64 = await blobToBase64(pngBlob);
  const sendRes = await apiFetch(`/admin/orders/${orderId}/send-bill-image`, {
    method: 'POST',
    body: JSON.stringify({ pngBase64, phones: chosenPhones })
  });

  if (!sendRes.success) {
    alert(sendRes.message || 'Could not prepare bill image for WhatsApp');
    return;
  }

  const n = sendRes.notification || {};
  const caption = billRes.caption || n.caption || `Delight Cafe Bill #${orderId}`;
  const targetPhones = [
    ...new Set(
      (Array.isArray(n.phones) && n.phones.length ? n.phones : chosenPhones)
        .map((p) => normalizeBillPhone(p))
        .filter(Boolean)
    )
  ];
  const messageRecords = n.messageRecords || (n.messageRecord ? [n.messageRecord] : []);
  const phoneLabel = targetPhones.map((p) => `+91 ${p}`).join(', ');

  if (n.apiSent) {
    showBillSentPopup(targetPhones[0], {
      phones: targetPhones,
      whatsappUrl: null,
      whatsappAppUrl: null,
      orderId,
      messageId: messageRecords[0]?.id,
      svg: billRes.svg,
      pngBlob,
      caption,
      returnToAdmin: true,
      methodNote: `Bill PNG image sent on WhatsApp to ${phoneLabel}.`
    });
    returnToAdminPanel();
    return;
  }

  const shareResult = await openWhatsAppForBillPhones(targetPhones, caption, pngBlob);

  if (shareResult.aborted) {
    returnToAdminPanel();
    return;
  }

  if (!shareResult.ok) {
    alert(shareResult.error || 'Could not open WhatsApp for bill numbers');
    return;
  }

  for (const record of messageRecords) {
    if (!record?.id) continue;
    await apiFetch(`/admin/messages/${record.id}/mark-sent`, {
      method: 'POST',
      body: JSON.stringify({
        channel: 'whatsapp',
        sendMethod: shareResult.method === 'clipboard' ? 'clipboard' : 'png'
      })
    });
  }

  const opened = shareResult.openedCount || targetPhones.length;
  const methodNote =
    shareResult.stoppedEarly
      ? `Opened WhatsApp for ${opened} of ${targetPhones.length} number(s). Paste (Ctrl+V) and Send in each chat. Use the buttons below for any remaining numbers.`
      : shareResult.method === 'clipboard'
        ? `Bill PNG copied. Opened WhatsApp for ${phoneLabel} — paste (Ctrl+V) in each chat, then Send.`
        : `Opened WhatsApp for ${phoneLabel}. Paste the image if needed (Ctrl+V).`;

  showBillSentPopup(targetPhones[0], {
    phones: targetPhones,
    caption,
    whatsappUrl: buildImageWhatsAppLinks(targetPhones[0], caption).whatsappUrl,
    whatsappAppUrl: buildImageWhatsAppLinks(targetPhones[0], caption).whatsappAppUrl,
    orderId,
    messageId: messageRecords[0]?.id,
    svg: billRes.svg,
    pngBlob,
    returnToAdmin: false,
    methodNote
  });

  returnToAdminPanel();
}

function returnToAdminPanel() {
  try {
    window.focus();
  } catch (_) {
    /* ignore */
  }

  // Stay on admin.html if somehow navigated away
  const onAdmin = /admin\.html$/i.test(window.location.pathname) || window.location.href.includes('admin.html');
  if (!onAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  loadAdminDashboard();
}

async function showBillImagePreview(orderId) {
  const billRes = await apiFetch(`/admin/orders/${orderId}/bill.json`);
  if (!billRes.success) {
    alert(billRes.message || 'Could not load bill');
    return;
  }

  let pngBlob = null;
  try {
    pngBlob = await svgToPngBlob(billRes.svg);
  } catch (err) {
    console.warn('Preview PNG convert failed', err);
  }

  showBillSentPopup(billRes.phone, {
    whatsappUrl: null,
    orderId,
    svg: billRes.svg,
    pngBlob,
    previewOnly: true
  });
}

function showBillSentPopup(phoneOrMsg = '', options = {}) {
  let popup = document.getElementById('smsSentPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'smsSentPopup';
    popup.className = 'sms-sent-popup';
    popup.innerHTML = `
      <div class="sms-sent-popup-card bill-popup-card">
        <div class="sent-check">✓</div>
        <h3 id="smsSentPopupTitle">Bill Image Ready</h3>
        <p id="smsSentPopupText"></p>
        <div id="billPreviewWrap" class="bill-preview-wrap"></div>
        <div id="smsSentPopupActions" class="sms-sent-actions"></div>
      </div>
    `;
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.classList.remove('show');
        returnToAdminPanel();
      }
    });
    document.body.appendChild(popup);
  }

  const title = document.getElementById('smsSentPopupTitle');
  const text = document.getElementById('smsSentPopupText');
  const actions = document.getElementById('smsSentPopupActions');
  const preview = document.getElementById('billPreviewWrap');
  const phone = String(phoneOrMsg || '').replace(/\D/g, '').slice(-10);

  if (title) {
    title.textContent = options.previewOnly
      ? 'Delight Cafe Bill Image'
      : options.returnToAdmin
        ? 'Bill Image Sent to WhatsApp'
        : 'Bill Image Ready';
  }
  if (text) {
    text.textContent = options.previewOnly
      ? `Order #${options.orderId || ''} — bill PNG preview`
      : options.methodNote
        ? options.methodNote
        : options.returnToAdmin
          ? phone.length === 10
            ? `Bill PNG ready for +91 ${phone}. You are back on Admin.`
            : 'Bill PNG ready on WhatsApp. You are back on the Admin panel.'
          : phone.length === 10
            ? `Bill PNG ready for +91 ${phone}.`
            : 'Bill PNG ready.';
  }

  if (preview) {
    if (options.pngBlob) {
      const url = URL.createObjectURL(options.pngBlob);
      preview.innerHTML = `<img class="bill-preview-img" alt="Delight Cafe Bill" src="${url}" />`;
    } else if (options.svg) {
      preview.innerHTML = `<img class="bill-preview-img" alt="Delight Cafe Bill" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(options.svg)}" />`;
    } else {
      preview.innerHTML = '';
    }
  }

  if (actions) {
    actions.hidden = false;
    const phoneList = [
      ...new Set(
        (Array.isArray(options.phones) ? options.phones : [phone])
          .map((p) => normalizeBillPhone(p))
          .filter(Boolean)
      )
    ];
    const caption = options.caption || 'Delight Cafe Bill';
    const waButtons = phoneList
      .map((p) => {
        const links = buildImageWhatsAppLinks(p, caption);
        return links.whatsappAppUrl || links.whatsappUrl
          ? `<button type="button" class="btn-small btn-outline" data-open-wa="${p}">Open WhatsApp +91 ${p}</button>`
          : '';
      })
      .join('');

    actions.innerHTML = `
      <button type="button" class="btn-small" id="billBackAdminBtn">Back to Admin Panel</button>
      ${waButtons}
      ${options.orderId && options.previewOnly ? `<button type="button" class="btn-small" id="billSendWhatsAppBtn">Send Bill Image on WhatsApp</button>` : ''}
    `;

    actions.querySelector('#billBackAdminBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.classList.remove('show');
      returnToAdminPanel();
    });

    actions.querySelectorAll('[data-open-wa]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = btn.dataset.openWa;
        const links = buildImageWhatsAppLinks(p, caption);
        if (options.pngBlob) {
          try {
            if (window.ClipboardItem && navigator.clipboard?.write) {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': options.pngBlob })]);
            }
          } catch (_) {
            /* ignore */
          }
        }
        openSystemWhatsApp(links);
      });
    });

    actions.querySelector('#billSendWhatsAppBtn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      popup.classList.remove('show');
      await sendBillImageOnWhatsApp(options.orderId);
    });
  }

  popup.classList.add('show');

  // Auto-dismiss only for Cloud API auto-sends (no manual multi-number reopen needed)
  if (options.returnToAdmin && !(Array.isArray(options.phones) && options.phones.length > 1)) {
    clearTimeout(showBillSentPopup._returnTimer);
    showBillSentPopup._returnTimer = setTimeout(() => {
      popup.classList.remove('show');
      returnToAdminPanel();
    }, 2500);
  }
}

function pickSmsUrl(options = {}) {
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  return (isIOS && options.smsUrlIos) || options.smsUrl || options.smsUrlIos || '';
}

function openNativeSms(options = {}) {
  const text = options.customerMessage || options.messageText || options.message || '';
  if (text) {
    try {
      navigator.clipboard?.writeText(text);
    } catch (_) {
      /* ignore */
    }
  }

  const smsUrl = pickSmsUrl(options);
  if (!smsUrl) return false;

  // sms: links often fail with window.open — navigate / use hidden iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = smsUrl;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 1500);
  } catch (_) {
    /* ignore */
  }

  try {
    window.location.href = smsUrl;
  } catch (_) {
    window.open(smsUrl, '_self');
  }
  return true;
}

function showSentPopup(phoneOrMsg = '', options = {}) {
  let popup = document.getElementById('smsSentPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'smsSentPopup';
    popup.className = 'sms-sent-popup';
    popup.innerHTML = `
      <div class="sms-sent-popup-card">
        <div class="sent-check">✓</div>
        <h3 id="smsSentPopupTitle">Sent</h3>
        <p id="smsSentPopupText"></p>
        <div id="smsSentPopupActions" class="sms-sent-actions" hidden></div>
      </div>
    `;
    popup.addEventListener('click', (e) => {
      if (e.target === popup) popup.classList.remove('show');
    });
    document.body.appendChild(popup);
  }

  const title = document.getElementById('smsSentPopupTitle');
  const text = document.getElementById('smsSentPopupText');
  const actions = document.getElementById('smsSentPopupActions');
  const phone = String(phoneOrMsg || '').replace(/\D/g, '').slice(-10);

  if (options.easy) {
    if (title) title.textContent = 'WhatsApp Bill Ready';
    if (text) {
      text.textContent = phone.length === 10
        ? `WhatsApp opened for +91 ${phone}. Tap Send to deliver the bill.`
        : 'WhatsApp bill is ready — tap Send in WhatsApp.';
    }
    if (actions) {
      actions.hidden = false;
      actions.innerHTML = `
        ${options.whatsappUrl ? `<a class="btn-small" href="${options.whatsappUrl}" target="_blank" rel="noopener">Open WhatsApp again</a>` : ''}
        <button type="button" class="btn-small" id="smsMarkSentBtn">Mark as Sent</button>
      `;
      actions.querySelector('#smsMarkSentBtn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (options.messageId) {
          await apiFetch(`/admin/messages/${options.messageId}/mark-sent`, {
            method: 'POST',
            body: JSON.stringify({ channel: 'whatsapp' })
          });
        }
        popup.classList.remove('show');
        showSentConfirm(phone);
        loadAdminDashboard();
      });
    }
  } else {
    if (title) title.textContent = 'Sent';
    if (text) {
      text.textContent = phone.length === 10
        ? `Bill sent on WhatsApp to +91 ${phone}`
        : 'Bill sent on WhatsApp';
    }
    if (actions) {
      actions.hidden = true;
      actions.innerHTML = '';
    }
  }

  popup.classList.add('show');
  clearTimeout(showSentPopup._timer);
  showSentPopup._timer = setTimeout(() => {
    if (!options.easy) popup.classList.remove('show');
  }, options.easy ? 20000 : 2500);
}

function showSentConfirm(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  let popup = document.getElementById('smsSentPopup');
  if (!popup) return;
  const title = document.getElementById('smsSentPopupTitle');
  const text = document.getElementById('smsSentPopupText');
  const actions = document.getElementById('smsSentPopupActions');
  if (title) title.textContent = 'Sent';
  if (text) {
    text.textContent = digits.length === 10
      ? `Marked sent to +91 ${digits}`
      : 'Marked as sent';
  }
  if (actions) {
    actions.hidden = true;
    actions.innerHTML = '';
  }
  popup.classList.add('show');
  clearTimeout(showSentPopup._timer);
  showSentPopup._timer = setTimeout(() => popup.classList.remove('show'), 2000);
}

function showPendingSmsPrompt(pending = [], force = false) {
  // Never auto-open WhatsApp/SMS from dashboard load — admin must click Send bill.
  if (!pending?.length) return;
  const latest = pending[0];
  const phone = String(latest.phone || '').replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) return;

  if (!force && showPendingSmsPrompt._lastId === latest.id) return;
  showPendingSmsPrompt._lastId = latest.id;

  showSentPopup(phone, {
    easy: true,
    phone,
    messageText: latest.message || '',
    messageId: latest.id,
    whatsappUrl: null
  });
}

function categorizeWhatsAppMessages(messagesRes) {
  if (messagesRes?.sent && messagesRes?.pending && messagesRes?.failed) {
    return {
      sent: messagesRes.sent || [],
      pending: messagesRes.pending || [],
      failed: messagesRes.failed || [],
      counts: messagesRes.counts || {
        sent: (messagesRes.sent || []).length,
        pending: (messagesRes.pending || []).length,
        failed: (messagesRes.failed || []).length
      }
    };
  }

  const sent = [];
  const pending = [];
  const failed = [];
  (messagesRes?.messages || []).forEach((entry) => {
    const s = String(entry.status || '').toLowerCase();
    if (s === 'sent') sent.push({ ...entry, category: 'sent' });
    else if (s === 'failed') failed.push({ ...entry, category: 'failed' });
    else pending.push({ ...entry, category: 'pending' });
  });
  return {
    sent,
    pending,
    failed,
    counts: { sent: sent.length, pending: pending.length, failed: failed.length }
  };
}

function setWhatsAppBillTab(tab) {
  const next = ['sent', 'pending', 'failed'].includes(tab) ? tab : 'sent';
  setWhatsAppBillTab._active = next;
  document.querySelectorAll('.wa-bill-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.waTab === next);
  });
  return next;
}

function initWhatsAppBillTabs() {
  document.querySelectorAll('.wa-bill-tab').forEach((btn) => {
    btn.onclick = () => {
      const tab = setWhatsAppBillTab(btn.dataset.waTab);
      renderCustomerMessagesPanel(window.__waBillGroups || {}, tab);
    };
  });
  if (!setWhatsAppBillTab._active) setWhatsAppBillTab('sent');
}

function methodLabel(method) {
  const m = String(method || '').toLowerCase();
  if (m === 'whatsapp_image') return 'WhatsApp PNG image';
  if (m === 'whatsapp_cta_button') return 'Download Invoice button';
  if (m === 'invoice_link' || m === 'link' || m === 'whatsapp_app_invoice_link') return 'WhatsApp app link';
  if (m === 'share') return 'Shared PNG';
  if (m === 'clipboard') return 'Clipboard PNG';
  if (m === 'open' || m === 'link_only') return 'WhatsApp link';
  if (m === 'png') return 'PNG bill';
  if (m === 'aborted') return 'Cancelled';
  if (m === 'failed') return 'Failed';
  if (m === 'manual') return 'Marked manually';
  return method ? String(method) : 'WhatsApp';
}

function initialsFromName(name, phone) {
  const n = String(name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'C';
  }
  const p = String(phone || '').replace(/\D/g, '');
  return p.slice(-2) || 'WA';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCustomerMessagesPanel(groupsOrMessages, activeTab) {
  const panel = document.getElementById('adminMessagesPanel');
  if (!panel) return;

  const groups =
    Array.isArray(groupsOrMessages)
      ? categorizeWhatsAppMessages({ messages: groupsOrMessages })
      : groupsOrMessages?.sent || groupsOrMessages?.pending || groupsOrMessages?.failed
        ? groupsOrMessages
        : categorizeWhatsAppMessages(groupsOrMessages || {});

  window.__waBillGroups = groups;
  initWhatsAppBillTabs();
  initWhatsAppBillSearch();

  const tab = setWhatsAppBillTab(activeTab || setWhatsAppBillTab._active || 'sent');
  const counts = groups.counts || {
    sent: (groups.sent || []).length,
    pending: (groups.pending || []).length,
    failed: (groups.failed || []).length
  };

  const countSent = document.getElementById('waCountSent');
  const countPending = document.getElementById('waCountPending');
  const countFailed = document.getElementById('waCountFailed');
  if (countSent) countSent.textContent = String(counts.sent || 0);
  if (countPending) countPending.textContent = String(counts.pending || 0);
  if (countFailed) countFailed.textContent = String(counts.failed || 0);

  const list = groups[tab] || [];
  panel.innerHTML = '';

  if (!list.length) {
    const emptyLabel =
      tab === 'sent'
        ? 'No sent bill deliveries yet.'
        : tab === 'pending'
          ? 'No pending bill deliveries.'
          : 'No failed bill deliveries.';
    panel.innerHTML = `<p class="empty-msg">${emptyLabel}</p>`;
    return;
  }

  list.forEach((entry) => {
    const category = entry.category || tab;
    const pillClass =
      category === 'sent' ? 'status-sent' : category === 'failed' ? 'status-failed' : 'status-pending-wa';
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    const name = entry.customerName || 'Customer';
    const phone = entry.phone || '-';
    const total =
      entry.billTotal != null && !Number.isNaN(Number(entry.billTotal))
        ? formatRupee(entry.billTotal)
        : '—';
    const mediaRaw = String(entry.mediaType || 'png').toLowerCase();
    const media =
      mediaRaw === 'png' || mediaRaw === 'image'
        ? 'PNG bill'
        : mediaRaw === 'link'
          ? 'Invoice link'
          : mediaRaw.toUpperCase();
    const receipt = entry.receiptCode || `MSG-${entry.id}`;
    const created = formatDateTime(entry.createdAt);
    const sent = entry.sentAt ? formatDateTime(entry.sentAt) : null;
    const method = methodLabel(entry.sendMethod);
    const attempts = Number(entry.attemptCount || 0);

    const card = document.createElement('article');
    card.className = 'wa-inbox-card';
    card.innerHTML = `
      <div class="wa-inbox-avatar" aria-hidden="true">${escapeHtml(initialsFromName(name, phone))}</div>
      <div class="wa-inbox-body">
        <div class="wa-inbox-top">
          <div>
            <h3 class="wa-inbox-name">${escapeHtml(name)}</h3>
            <p class="wa-inbox-phone">+91 ${escapeHtml(phone)}</p>
          </div>
          <span class="status-pill ${pillClass}">${label}</span>
        </div>
        <div class="wa-inbox-meta-row">
          <span class="wa-chip">Order #${escapeHtml(entry.orderId || '—')}</span>
          <span class="wa-chip wa-chip-gold">${escapeHtml(total)}</span>
          <span class="wa-chip">${escapeHtml(media)}</span>
          <span class="wa-chip">${escapeHtml(method)}</span>
        </div>
        <p class="wa-inbox-caption">${escapeHtml(entry.message || '')}</p>
        <div class="wa-inbox-footer">
          <span>Receipt <strong>${escapeHtml(receipt)}</strong></span>
          <span>Created ${escapeHtml(created)}</span>
          ${sent ? `<span>Sent ${escapeHtml(sent)}</span>` : ''}
          ${attempts ? `<span>Attempts ${attempts}</span>` : ''}
        </div>
        ${
          entry.lastError
            ? `<p class="wa-inbox-error">${escapeHtml(entry.lastError)}</p>`
            : ''
        }
        ${
          (category === 'pending' || category === 'failed') && entry.orderId
            ? `<div class="wa-inbox-actions">
                <button type="button" class="btn-small" data-wa-send-order="${entry.orderId}">
                  ${category === 'failed' ? 'Retry bill image' : 'Send bill image'}
                </button>
                ${
                  category === 'pending'
                    ? `<button type="button" class="btn-small btn-outline" data-wa-mark-sent="${entry.id}">Mark sent</button>`
                    : ''
                }
              </div>`
            : category === 'sent' && entry.orderId
              ? `<div class="wa-inbox-actions">
                  <button type="button" class="btn-small btn-outline" data-preview-bill="${entry.orderId}">Preview bill</button>
                </div>`
              : ''
        }
      </div>
    `;
    panel.appendChild(card);
  });

  panel.querySelectorAll('[data-wa-send-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Sending PNG…';
      await sendBillImageOnWhatsApp(btn.dataset.waSendOrder);
      btn.disabled = false;
      btn.textContent = original;
      loadAdminDashboard();
    });
  });

  panel.querySelectorAll('[data-wa-mark-sent]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await apiFetch(`/admin/messages/${btn.dataset.waMarkSent}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({ channel: 'whatsapp', sendMethod: 'manual' })
      });
      loadAdminDashboard();
    });
  });

  panel.querySelectorAll('[data-preview-bill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await showBillImagePreview(btn.dataset.previewBill);
    });
  });
}

function initWhatsAppBillSearch() {
  const input = document.getElementById('waBillSearch');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const messagesRes = await apiFetch(`/admin/messages${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (messagesRes.success) {
        renderCustomerMessagesPanel(categorizeWhatsAppMessages(messagesRes), setWhatsAppBillTab._active || 'sent');
      }
    }, 280);
  });
}

async function loadSmsSettings() {
  const form = document.getElementById('smsSettingsForm');
  if (!form) return;

  const status = document.getElementById('smsSettingsStatus');
  if (status) {
    status.hidden = false;
    status.className = 'contact-status success';
    status.textContent =
      'WhatsApp bill delivery is ON. Bills go to the customer WhatsApp number from Details.';
  }

  form.onsubmit = (event) => event.preventDefault();

  const testBtn = document.getElementById('smsTestBtn');
  if (testBtn) {
    testBtn.onclick = async () => {
      const phone = document.getElementById('smsTestPhone')?.value.trim();
      if (!phone) {
        alert('Enter a 10-digit WhatsApp number to test');
        return;
      }
      testBtn.disabled = true;
      testBtn.textContent = 'Opening...';
      const result = await apiFetch('/admin/sms-test', {
        method: 'POST',
        body: JSON.stringify({ phone })
      });
      testBtn.disabled = false;
      testBtn.textContent = 'Test WhatsApp bill';
      if (result.success && result.delivery) {
        openSystemWhatsApp({
          whatsappAppUrl: result.delivery.whatsappAppUrl,
          whatsappUrl: result.delivery.whatsappUrl
        });
        showSentPopup(result.delivery.phone || phone, {
          easy: true,
          whatsappUrl: result.delivery.whatsappAppUrl || result.delivery.whatsappUrl,
          messageText: result.delivery.message || '',
          messageId: result.delivery.messageId
        });
        loadAdminDashboard();
      } else {
        alert(result.message || 'Could not open WhatsApp bill');
      }
    };
  }

  const flushBtn = document.getElementById('smsFlushBtn');
  if (flushBtn) {
    flushBtn.onclick = async () => {
      flushBtn.disabled = true;
      flushBtn.textContent = 'Preparing bill image...';
      const messagesRes = await apiFetch('/admin/messages');
      const pending = messagesRes.pending || [];
      const latest = pending.find((m) => m.orderId) || pending[0];

      flushBtn.disabled = false;
      flushBtn.textContent = 'Open next pending bill';

      if (latest?.orderId) {
        await sendBillImageOnWhatsApp(latest.orderId);
        return;
      }

      if (!latest) {
        alert('No pending WhatsApp bills');
        return;
      }

      alert('Pending message has no order bill image. Open Admin details to send.');
      loadAdminDashboard();
    };
  }
}

function renderOrdersTable(ordersBody, orders) {
  if (!ordersBody) return;

  ordersBody.innerHTML = '';

  if (!orders.length) {
    ordersBody.innerHTML =
      '<tr><td colspan="9" class="empty-msg">No matching orders in the last 24 hours.</td></tr>';
    return;
  }

  orders.forEach((order) => {
    const row = document.createElement('tr');
    const details = order.orderDetails || {};
    const customer = customerDisplayName(order);
    const phones = formatPhoneList(details);
    const email = String(details.email || '').trim();
    const account = String(order.username || '').trim();
    const showAccount = account && account.toLowerCase() !== customer.toLowerCase();
    const options = ORDER_STATUSES.map(
      (status) => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${formatOrderStatus(status)}</option>`
    ).join('');

    const detailRows = buildDetailsRows(order)
      .map(
        ([label, value]) => `
          <div class="admin-details-row">
            <span class="admin-details-label">${escapeHtml(label)}</span>
            <span class="admin-details-value">${escapeHtml(value)}</span>
          </div>`
      )
      .join('');

    row.innerHTML = `
      <td class="admin-col-order">
        <div class="admin-cell-main">#${escapeHtml(String(order.id ?? '—'))}</div>
        ${order.userId ? `<div class="admin-cell-sub">User ID ${escapeHtml(String(order.userId))}</div>` : ''}
      </td>
      <td class="admin-col-customer">
        <div class="admin-cell-main">${escapeHtml(customer)}</div>
        ${showAccount ? `<div class="admin-cell-sub">${escapeHtml(account)}</div>` : ''}
        ${phones ? `<div class="admin-cell-sub">${escapeHtml(phones)}</div>` : ''}
        ${email ? `<div class="admin-cell-sub">${escapeHtml(email)}</div>` : ''}
      </td>
      <td class="admin-col-service">${escapeHtml(formatServiceType(order.serviceType))}</td>
      <td class="items-cell">${formatItemsListHtml(order.items)}</td>
      <td class="admin-col-total"><strong>${formatRupee(order.total)}</strong></td>
      <td class="admin-col-pay">${escapeHtml((order.paymentMethod || '-').toUpperCase())}</td>
      <td class="admin-col-status"><span class="status-pill status-${order.status}">${escapeHtml(formatOrderStatus(order.status))}</span></td>
      <td class="admin-col-when">${escapeHtml(formatDateTime(order.placedAt))}</td>
      <td class="admin-actions-cell admin-col-actions">
        <select class="status-select" data-order-id="${order.id}" aria-label="Update status for order ${order.id}">${options}</select>
        <button type="button" class="btn-small" data-toggle-details="${order.id}">Details</button>
        <button type="button" class="btn-small" data-send-wa-order="${order.id}">Send bill</button>
      </td>
    `;
    ordersBody.appendChild(row);

    const detailRow = document.createElement('tr');
    detailRow.className = 'admin-order-expand';
    detailRow.hidden = true;
    detailRow.innerHTML = `
      <td colspan="9">
        <div class="admin-inline-details">
          <h4>Order #${escapeHtml(String(order.id ?? '—'))} — full details</h4>
          <div class="admin-details-grid">${detailRows}</div>
        </div>
      </td>
    `;
    ordersBody.appendChild(detailRow);
  });

  // Instant status update on change — faster kitchen workflow
  ordersBody.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const orderId = select.dataset.orderId;
      const status = select.value;
      select.disabled = true;
      const result = await apiFetch(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      select.disabled = false;
      if (result.success) {
        const pill = select.closest('tr')?.querySelector('.status-pill');
        if (pill) {
          pill.className = `status-pill status-${status}`;
          pill.textContent = formatOrderStatus(status);
        }
        const cached = (window.__adminOrders || []).find((o) => String(o.id) === String(orderId));
        if (cached) cached.status = status;
        loadAdminDashboard(true);
      } else {
        alert(result.message || 'Could not update status');
        loadAdminDashboard(true);
      }
    });
  });

  ordersBody.querySelectorAll('[data-toggle-details]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const detailRow = row?.nextElementSibling;
      if (!detailRow?.classList.contains('admin-order-expand')) return;
      const open = detailRow.hidden;
      detailRow.hidden = !open;
      btn.textContent = open ? 'Hide details' : 'Details';
    });
  });

  ordersBody.querySelectorAll('[data-send-wa-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Opening…';
      await sendBillImageOnWhatsApp(btn.dataset.sendWaOrder);
      btn.disabled = false;
      btn.textContent = original;
    });
  });
}

function getFilteredAdminOrders() {
  const all = window.__adminOrders || [];
  const q = String(document.getElementById('orderSearch')?.value || '')
    .trim()
    .toLowerCase();
  const status = document.getElementById('orderStatusFilter')?.value || 'all';
  const service = document.getElementById('orderServiceFilter')?.value || 'all';

  return all.filter((order) => {
    if (status !== 'all' && String(order.status) !== status) return false;
    if (service !== 'all' && String(order.serviceType || '') !== service) return false;
    if (!q) return true;
    const hay = [
      order.id,
      order.userId,
      order.username,
      order.orderDetails?.fullName,
      order.orderDetails?.phone,
      formatPhoneList(order.orderDetails || {}),
      order.orderDetails?.email,
      order.paymentMethod,
      order.status,
      summarizeItems(order.items)
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function applyOrderFilters() {
  const body = document.getElementById('adminOrdersBody');
  renderOrdersTable(body, getFilteredAdminOrders());
}

function setAdminTab(tab) {
  const next = String(tab || 'orders');
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.adminTab === next);
  });
  document.querySelectorAll('.admin-tab-panel').forEach((panel) => {
    const match = panel.dataset.adminPanel === next;
    panel.classList.toggle('is-active', match);
    panel.hidden = !match;
  });
  setAdminTab._active = next;
  if (next === 'archive') loadOrderArchive();
  return next;
}

function initAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => setAdminTab(btn.dataset.adminTab));
  });
  document.querySelectorAll('[data-admin-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.adminJump;
      setAdminTab(tab);
      document.querySelector(`[data-admin-panel="${tab}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  });
  if (!setAdminTab._active) setAdminTab('orders');
}

function initOrderFilters() {
  ['orderSearch', 'orderStatusFilter', 'orderServiceFilter'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('input', applyOrderFilters);
    el.addEventListener('change', applyOrderFilters);
  });
}

function markAdminRefreshed() {
  const el = document.getElementById('adminLastRefresh');
  if (!el) return;
  el.textContent = `Updated ${new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`;
}

function renderOrderArchivePanel(archive) {
  const panel = document.getElementById('adminArchivePanel');
  if (!panel) return;

  const dates = archive?.dates || [];
  panel.innerHTML = '';

  if (!dates.length) {
    panel.innerHTML =
      '<p class="empty-msg">No archived orders yet. After 24 hours, orders and customer details appear here by date.</p>';
    return;
  }

  const summary = document.createElement('p');
  summary.className = 'admin-archive-summary';
  summary.textContent = `${archive.totalArchived || 0} archived order(s) stored in backend (older than ${archive.hours || 24} hours).`;
  panel.appendChild(summary);

  dates.forEach((day) => {
    const block = document.createElement('details');
    block.className = 'admin-archive-day';
    block.open = false;

    const ordersRows = (day.orders || [])
      .map(
        (order) => `
        <tr>
          <td>#${order.id}</td>
          <td>${escapeHtml(order.orderDetails?.fullName || order.username || '-')}</td>
          <td>${escapeHtml(formatServiceType(order.serviceType))}</td>
          <td class="items-cell">${formatItemsListHtml(order.items)}</td>
          <td>${formatRupee(order.total)}</td>
          <td>${escapeHtml((order.paymentMethod || '-').toUpperCase())}</td>
          <td><span class="status-pill status-${order.status}">${escapeHtml(formatOrderStatus(order.status))}</span></td>
          <td>${escapeHtml(formatDateTime(order.placedAt))}</td>
        </tr>`
      )
      .join('');

    const detailsCards = (day.details || [])
      .map((entry) => {
        const order = {
          id: entry.orderId,
          username: entry.username,
          serviceType: entry.serviceType,
          orderDetails: entry.orderDetails,
          items: entry.items,
          total: entry.total,
          paymentMethod: entry.paymentMethod,
          status: entry.status,
          placedAt: entry.placedAt
        };
        const rowsHtml = buildDetailsRows(order)
          .map(
            ([label, value]) => `
              <div class="admin-details-row">
                <span class="admin-details-label">${label}</span>
                <span class="admin-details-value">${value}</span>
              </div>`
          )
          .join('');
        return `
          <article class="admin-details-card admin-archive-detail-card">
            <div class="admin-details-card-head">
              <h3>Order #${order.id} — ${formatServiceType(order.serviceType)}</h3>
              <span class="status-pill status-${order.status}">${formatOrderStatus(order.status)}</span>
            </div>
            <div class="admin-details-grid">${rowsHtml}</div>
          </article>`;
      })
      .join('');

    block.innerHTML = `
      <summary class="admin-archive-summary-row">
        <span class="admin-archive-date">${escapeHtml(day.dateLabel || day.dateKey)}</span>
        <span class="wa-chip">${day.count} order(s)</span>
        <span class="wa-chip wa-chip-gold">${formatRupee(day.revenue || 0)}</span>
      </summary>
      <div class="admin-archive-day-body">
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>${ordersRows || '<tr><td colspan="8" class="empty-msg">No orders</td></tr>'}</tbody>
          </table>
        </div>
        ${
          detailsCards
            ? `<h4 class="admin-archive-subtitle">Customer details for this date</h4>
               <div class="admin-details-panel">${detailsCards}</div>`
            : ''
        }
      </div>
    `;
    panel.appendChild(block);
  });
}

async function loadOrderArchive() {
  const panel = document.getElementById('adminArchivePanel');
  if (panel) panel.innerHTML = '<p class="empty-msg">Loading archive...</p>';
  const res = await apiFetch('/admin/orders/archive');
  if (res.success) renderOrderArchivePanel(res.archive);
  else if (panel) {
    panel.innerHTML = `<p class="empty-msg">${res.message || 'Could not load archive.'}</p>`;
  }
}

async function loadAdminDashboard(silent = false) {
  const auth = await apiFetch('/auth/check', { skipAuthRedirect: true });
  if (!auth.loggedIn || auth.user?.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  const ordersBody = document.getElementById('adminOrdersBody');
  const detailsPanel = document.getElementById('adminDetailsPanel');
  const messagesPanel = document.getElementById('adminMessagesPanel');

  if (!silent) {
    if (detailsPanel) detailsPanel.innerHTML = '<p class="empty-msg">Loading customer details...</p>';
    if (messagesPanel) messagesPanel.innerHTML = '<p class="empty-msg">Loading messages...</p>';
    if (ordersBody) ordersBody.innerHTML = '<tr><td colspan="9">Loading orders...</td></tr>';
  }

  const [statsRes, ordersRes, usersRes, contactRes, detailsRes, messagesRes] = await Promise.all([
    apiFetch('/admin/stats'),
    apiFetch('/admin/orders'),
    apiFetch('/admin/users'),
    apiFetch('/admin/contact'),
    apiFetch('/admin/customer-details'),
    apiFetch('/admin/messages')
  ]);

  if (!statsRes.success) {
    if (ordersBody) {
      ordersBody.innerHTML = `<tr><td colspan="9">${statsRes.message || 'Could not load admin data.'}</td></tr>`;
    }
    if (detailsPanel) {
      detailsPanel.innerHTML = `<p class="empty-msg">${statsRes.message || 'Could not load admin data.'}</p>`;
    }
    return;
  }

  document.getElementById('statOrders').textContent = statsRes.stats.totalOrders;
  document.getElementById('statRevenue').textContent = formatRupee(statsRes.stats.totalRevenue);
  document.getElementById('statActive').textContent = statsRes.stats.activeOrders;
  document.getElementById('statUsers').textContent = statsRes.stats.totalUsers;
  document.getElementById('statMenuItems').textContent = statsRes.stats.menuItems;

  if (!ordersRes.success) {
    if (ordersBody) {
      ordersBody.innerHTML = `<tr><td colspan="9">${ordersRes.message || 'Could not load orders.'}</td></tr>`;
    }
  } else {
    window.__adminOrders = ordersRes.orders || [];
    applyOrderFilters();
  }

  if (detailsRes.success) {
    renderCustomerDetailsPanel(detailsRes.details || []);
  } else if (detailsPanel) {
    detailsPanel.innerHTML = `<p class="empty-msg">${detailsRes.message || 'Could not load customer details.'}</p>`;
  }

  if (setAdminTab._active === 'archive') {
    loadOrderArchive();
  }

  if (messagesRes.success) {
    const groups = categorizeWhatsAppMessages(messagesRes);
    window.__waBillGroups = groups;
    const pendingCount = groups.counts?.pending ?? (groups.pending || []).length;
    const waPendingEl = document.getElementById('statWaPending');
    if (waPendingEl) waPendingEl.textContent = String(pendingCount);
    renderCustomerMessagesPanel(groups, setWhatsAppBillTab._active || 'sent');
  } else if (messagesPanel) {
    messagesPanel.innerHTML = `<p class="empty-msg">${messagesRes.message || 'Could not load messages.'}</p>`;
  }

  const usersBody = document.getElementById('adminUsersBody');
  if (usersBody) {
    usersBody.innerHTML = '';
    (usersRes.users || []).forEach((user) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td><span class="role-pill role-${user.role}">${user.role}</span></td>
        <td>${formatDateTime(user.created_at)}</td>
      `;
      usersBody.appendChild(row);
    });
  }

  const contactBody = document.getElementById('adminContactBody');
  if (contactBody) {
    contactBody.innerHTML = '';
    (contactRes.messages || []).forEach((entry) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>#${entry.id}</td>
        <td>${entry.name}</td>
        <td>${entry.email}</td>
        <td class="items-cell">${entry.message}</td>
        <td>${formatDateTime(entry.created_at)}</td>
      `;
      contactBody.appendChild(row);
    });
  }

  markAdminRefreshed();
}

function renderPendingSmsBanner() {
  const banner = document.getElementById('pendingSmsBanner');
  if (banner) {
    banner.hidden = true;
    banner.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initMobileNav();
  syncLayoutMetrics();
  initAdminTabs();
  initOrderFilters();
  initWhatsAppBillTabs();
  initWhatsAppBillSearch();
  loadAdminDashboard();
  loadSmsSettings();
  document.getElementById('refreshArchiveBtn')?.addEventListener('click', () => loadOrderArchive());
  document.getElementById('adminRefreshBtn')?.addEventListener('click', () => loadAdminDashboard());
  setInterval(() => loadAdminDashboard(true), 15000);
});