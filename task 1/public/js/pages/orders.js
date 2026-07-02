// ============================================
// NovaBuy — Orders & Order Detail Pages
// ============================================

window.Pages = window.Pages || {};

window.Pages.orders = {
  async render(container) {
    if (!App.user) {
      Components.toast('Please sign in to view orders', 'info');
      window.location.hash = '#/login';
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <h1>My Orders</h1>
        <p class="subtitle">Track and manage your orders</p>
      </div>
      <div id="orders-content">
        ${Array(3).fill(0).map(() => `
          <div class="skeleton" style="height:120px;border-radius:var(--radius-md);margin-bottom:16px;"></div>
        `).join('')}
      </div>
    `;

    try {
      const orders = await API.getOrders();
      const contentEl = document.getElementById('orders-content');

      if (!orders || orders.length === 0) {
        contentEl.innerHTML = Components.emptyState(
          '📦',
          'No orders yet',
          'When you place your first order, it will appear here.',
          'Start Shopping',
          '#/'
        );
        return;
      }

      contentEl.innerHTML = `
        <div class="orders-list fade-in">
          ${orders.map(order => Components.orderCard(order)).join('')}
        </div>
      `;

    } catch (err) {
      document.getElementById('orders-content').innerHTML = Components.emptyState(
        '⚠️',
        'Could not load orders',
        err.message || 'Something went wrong. Please try again.',
        'Retry',
        '#/orders'
      );
    }
  }
};

window.Pages.orderDetail = {
  async render(container, params) {
    const id = params.id;

    if (!App.user) {
      Components.toast('Please sign in to view order details', 'info');
      window.location.hash = '#/login';
      return;
    }

    container.innerHTML = `
      <div class="skeleton" style="height:60px;border-radius:var(--radius-md);margin-bottom:24px;"></div>
      <div class="skeleton" style="height:300px;border-radius:var(--radius-md);margin-bottom:24px;"></div>
      <div class="skeleton" style="height:150px;border-radius:var(--radius-md);"></div>
    `;

    try {
      const order = await API.getOrder(id);
      const date = new Date(order.createdAt || order.date);
      const dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const status = (order.status || 'pending').toLowerCase();
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

      const items = order.items || [];
      const subtotal = items.reduce((sum, item) => {
        const price = item.product ? item.product.price : item.price || 0;
        const qty = item.quantity || 1;
        return sum + price * qty;
      }, 0);
      const total = order.total || subtotal;
      const shipping = total - subtotal;

      container.innerHTML = `
        <div class="fade-in">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
            <a href="#/orders" class="back-link" style="display:inline-flex;">← Back to Orders</a>
            <a href="#/invoice/${order.id}" class="btn btn-primary">🧾 View Bill / Invoice</a>
          </div>
          
          <div class="order-detail-header">
            <div>
              <h1 style="font-size:1.75rem;font-weight:800;">Order #${order.id}</h1>
              <p style="color:var(--text-muted);font-size:0.9rem;margin-top:4px;">${dateStr}</p>
            </div>
            <span class="badge badge-${status}">${statusLabel}</span>
          </div>

          <div class="order-detail-items">
            ${items.map(item => {
              const product = item.product || item;
              const qty = item.quantity || 1;
              const price = product.price || 0;
              return `
                <div class="order-detail-item">
                  <div>
                    <div class="order-detail-item-name">${Components.escapeHtml(product.name)}</div>
                    <div class="order-detail-item-qty">Qty: ${qty}</div>
                  </div>
                  <div class="order-detail-item-price">${Components.formatPrice(price * qty)}</div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="order-summary mt-6" style="position:static;max-width:400px;">
            <h3>Order Total</h3>
            <div class="summary-row">
              <span class="label">Subtotal</span>
              <span class="value">${Components.formatPrice(subtotal)}</span>
            </div>
            <div class="summary-row ${shipping <= 0 ? 'free' : ''}">
              <span class="label">Shipping</span>
              <span class="value">${shipping <= 0 ? 'FREE' : Components.formatPrice(shipping)}</span>
            </div>
            <hr class="summary-divider">
            <div class="summary-row summary-total">
              <span class="label">Total</span>
              <span class="value">${Components.formatPrice(total)}</span>
            </div>
          </div>

          ${order.shippingAddress ? `
            <div class="order-detail-address">
              <h3>📍 Shipping Address</h3>
              <p>${Components.escapeHtml(order.shippingAddress).replace(/\n/g, '<br>')}</p>
            </div>
          ` : ''}
        </div>
      `;

    } catch (err) {
      container.innerHTML = Components.emptyState(
        '😞',
        'Order Not Found',
        'We couldn\'t find the order you\'re looking for.',
        'Back to Orders',
        '#/orders'
      );
    }
  }
};
