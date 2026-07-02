// ============================================
// NovaBuy — Invoice / Bill Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.invoice = {
  async render(container, params) {
    const id = params.id;

    if (!App.user) {
      Components.toast('Please sign in to view invoice', 'info');
      window.location.hash = '#/login';
      return;
    }

    container.innerHTML = `
      <div class="skeleton" style="height:600px;border-radius:var(--radius-lg);"></div>
    `;

    try {
      const order = await API.getOrder(id);
      const items = order.items || [];

      const dateRaw = order.createdAt || order.created_at || order.date;
      const date = dateRaw ? new Date(dateRaw) : new Date();
      const dateStr = isNaN(date.getTime())
        ? 'N/A'
        : date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = isNaN(date.getTime())
        ? ''
        : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const subtotal = items.reduce((sum, item) => {
        return sum + (item.price || 0) * (item.quantity || 1);
      }, 0);
      const total = order.total || subtotal;
      const shipping = Math.max(0, total - subtotal);

      // Generate invoice number from order id
      const invoiceNo = 'NB-' + String(order.id).padStart(6, '0');

      container.innerHTML = `
        <div class="invoice-actions no-print fade-in">
          <a href="#/orders/${order.id}" class="back-link">← Back to Order</a>
          <button class="btn btn-primary" id="print-invoice-btn">
            🖨️ Print Invoice
          </button>
        </div>

        <div class="invoice-container fade-in" id="invoice-printable">
          <!-- Invoice Header -->
          <div class="invoice-header">
            <div class="invoice-brand">
              <h1 class="invoice-logo">NovaBuy</h1>
              <p class="invoice-tagline">Premium E-Commerce Store</p>
            </div>
            <div class="invoice-meta">
              <h2 class="invoice-title">TAX INVOICE</h2>
              <div class="invoice-meta-row">
                <span class="invoice-meta-label">Invoice No:</span>
                <span class="invoice-meta-value">${invoiceNo}</span>
              </div>
              <div class="invoice-meta-row">
                <span class="invoice-meta-label">Date:</span>
                <span class="invoice-meta-value">${dateStr}</span>
              </div>
              <div class="invoice-meta-row">
                <span class="invoice-meta-label">Time:</span>
                <span class="invoice-meta-value">${timeStr}</span>
              </div>
              <div class="invoice-meta-row">
                <span class="invoice-meta-label">Order ID:</span>
                <span class="invoice-meta-value">#${order.id}</span>
              </div>
            </div>
          </div>

          <div class="invoice-divider"></div>

          <!-- Addresses -->
          <div class="invoice-addresses">
            <div class="invoice-address-block">
              <h4>Sold By</h4>
              <p><strong>NovaBuy Pvt. Ltd.</strong></p>
              <p>123 Commerce Street</p>
              <p>Mumbai, Maharashtra 400001</p>
              <p>GSTIN: 27AABCN1234F1Z5</p>
              <p>Phone: +91 22 1234 5678</p>
            </div>
            <div class="invoice-address-block">
              <h4>Ship To / Bill To</h4>
              <p><strong>${Components.escapeHtml(App.user.name || 'Customer')}</strong></p>
              <p>${Components.escapeHtml(App.user.email || '')}</p>
              ${order.shippingAddress
                ? `<p>${Components.escapeHtml(order.shippingAddress).replace(/\n/g, '<br>')}</p>`
                : '<p>—</p>'
              }
            </div>
          </div>

          <div class="invoice-divider"></div>

          <!-- Items Table -->
          <table class="invoice-table">
            <thead>
              <tr>
                <th class="th-sno">#</th>
                <th class="th-item">Item</th>
                <th class="th-qty">Qty</th>
                <th class="th-price">Unit Price</th>
                <th class="th-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => {
                const price = item.price || 0;
                const qty = item.quantity || 1;
                const amount = price * qty;
                return `
                  <tr>
                    <td class="td-sno">${index + 1}</td>
                    <td class="td-item">${Components.escapeHtml(item.name || 'Product')}</td>
                    <td class="td-qty">${qty}</td>
                    <td class="td-price">${Components.formatPrice(price)}</td>
                    <td class="td-amount">${Components.formatPrice(amount)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="invoice-divider"></div>

          <!-- Totals -->
          <div class="invoice-totals">
            <div class="invoice-totals-spacer"></div>
            <div class="invoice-totals-box">
              <div class="invoice-total-row">
                <span>Subtotal</span>
                <span>${Components.formatPrice(subtotal)}</span>
              </div>
              <div class="invoice-total-row">
                <span>Shipping</span>
                <span>${shipping <= 0 ? 'FREE' : Components.formatPrice(shipping)}</span>
              </div>
              <div class="invoice-total-row">
                <span>CGST (9%)</span>
                <span>Included</span>
              </div>
              <div class="invoice-total-row">
                <span>SGST (9%)</span>
                <span>Included</span>
              </div>
              <div class="invoice-total-row invoice-grand-total">
                <span>Grand Total</span>
                <span>${Components.formatPrice(total)}</span>
              </div>
            </div>
          </div>

          <!-- Amount in Words -->
          <div class="invoice-words">
            <strong>Amount in words:</strong> ${this.numberToWords(Math.round(total))} Rupees Only
          </div>

          <div class="invoice-divider"></div>

          <!-- Footer -->
          <div class="invoice-footer">
            <div class="invoice-footer-left">
              <p><strong>Payment Status:</strong> <span class="invoice-paid-badge">PAID</span></p>
              <p style="margin-top:8px;color:var(--text-muted);font-size:0.8rem;">
                Thank you for shopping with NovaBuy!
              </p>
            </div>
            <div class="invoice-footer-right">
              <p style="color:var(--text-muted);font-size:0.85rem;">Authorized Signatory</p>
              <p style="font-weight:700;margin-top:4px;">NovaBuy Pvt. Ltd.</p>
            </div>
          </div>

          <!-- Terms -->
          <div class="invoice-terms">
            <p><strong>Terms & Conditions:</strong></p>
            <ol>
              <li>Goods once sold will be exchanged within 7 days of purchase.</li>
              <li>All disputes are subject to Mumbai jurisdiction.</li>
              <li>This is a computer-generated invoice and does not require a physical signature.</li>
            </ol>
          </div>
        </div>
      `;

      // Print button handler
      document.getElementById('print-invoice-btn').addEventListener('click', () => {
        window.print();
      });

    } catch (err) {
      container.innerHTML = Components.emptyState(
        '😞',
        'Invoice Not Found',
        'We couldn\'t load the invoice for this order.',
        'Back to Orders',
        '#/orders'
      );
    }
  },

  /**
   * Convert a number to words (Indian numbering system)
   */
  numberToWords(num) {
    if (num === 0) return 'Zero';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convertChunk(n) {
      if (n === 0) return '';
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convertChunk(n % 100) : '');
    }

    // Indian numbering: Crore, Lakh, Thousand, Hundred
    let result = '';
    if (num >= 10000000) {
      result += convertChunk(Math.floor(num / 10000000)) + ' Crore ';
      num %= 10000000;
    }
    if (num >= 100000) {
      result += convertChunk(Math.floor(num / 100000)) + ' Lakh ';
      num %= 100000;
    }
    if (num >= 1000) {
      result += convertChunk(Math.floor(num / 1000)) + ' Thousand ';
      num %= 1000;
    }
    if (num > 0) {
      result += convertChunk(num);
    }

    return result.trim();
  }
};
