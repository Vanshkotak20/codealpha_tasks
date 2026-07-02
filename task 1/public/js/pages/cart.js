// ============================================
// NovaBuy — Shopping Cart Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.cart = {
  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h1>Shopping Cart</h1>
      </div>
      <div id="cart-content">
        <div class="cart-layout">
          <div class="cart-items">
            ${Array(3).fill(0).map(() => `
              <div class="cart-item" style="opacity:0.5">
                <div class="skeleton" style="width:90px;height:90px;border-radius:var(--radius-sm);flex-shrink:0;"></div>
                <div style="flex:1"><div class="skeleton skeleton-text long" style="margin:0 0 8px;"></div><div class="skeleton skeleton-text short" style="margin:0;"></div></div>
              </div>
            `).join('')}
          </div>
          <div class="skeleton" style="height:250px;border-radius:var(--radius-lg);"></div>
        </div>
      </div>
    `;

    await this.loadCart();
  },

  async loadCart() {
    const contentEl = document.getElementById('cart-content');
    if (!contentEl) return;

    try {
      const cartItems = await API.getCart();

      // cartItems is a flat array of items
      if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        contentEl.innerHTML = Components.emptyState(
          '🛒',
          'Your cart is empty',
          'Looks like you haven\'t added any items to your cart yet.',
          'Start Shopping',
          '#/'
        );
        return;
      }

      const subtotal = cartItems.reduce((sum, item) => {
        return sum + (item.price || 0) * (item.quantity || 1);
      }, 0);
      const shipping = subtotal >= 2000 ? 0 : 199;
      const total = subtotal + shipping;

      let itemsHtml = cartItems.map(item => Components.cartItem(item)).join('');

      contentEl.innerHTML = `
        <div class="cart-layout fade-in">
          <div class="cart-items">
            ${itemsHtml}
          </div>
          <div class="order-summary">
            <h3>Order Summary</h3>
            <div class="summary-row">
              <span class="label">Subtotal (${cartItems.reduce((s, i) => s + (i.quantity || 1), 0)} items)</span>
              <span class="value">${Components.formatPrice(subtotal)}</span>
            </div>
            <div class="summary-row ${shipping === 0 ? 'free' : ''}">
              <span class="label">Shipping</span>
              <span class="value">${shipping === 0 ? 'FREE' : Components.formatPrice(shipping)}</span>
            </div>
            ${shipping > 0 ? `<p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Free shipping on orders over ₹2,000</p>` : ''}
            <hr class="summary-divider">
            <div class="summary-row summary-total">
              <span class="label">Total</span>
              <span class="value">${Components.formatPrice(total)}</span>
            </div>
            <button class="btn btn-primary btn-block btn-lg mt-6" id="checkout-btn">
              Proceed to Checkout
            </button>
          </div>
        </div>
      `;

      this.wireUpHandlers();

    } catch (err) {
      contentEl.innerHTML = Components.emptyState(
        '⚠️',
        'Could not load cart',
        err.message || 'Something went wrong. Please try again.',
        'Retry',
        '#/cart'
      );
    }
  },

  wireUpHandlers() {
    // Quantity decrease
    document.querySelectorAll('.qty-decrease').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cartId = btn.dataset.cartId;
        const current = parseInt(btn.dataset.current);
        if (current <= 1) return;
        try {
          await API.updateCartItem(cartId, current - 1);
          App.updateCartBadge();
          this.loadCart();
        } catch (err) {
          Components.toast(err.message, 'error');
        }
      });
    });

    // Quantity increase
    document.querySelectorAll('.qty-increase').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cartId = btn.dataset.cartId;
        const current = parseInt(btn.dataset.current);
        try {
          await API.updateCartItem(cartId, current + 1);
          App.updateCartBadge();
          this.loadCart();
        } catch (err) {
          Components.toast(err.message, 'error');
        }
      });
    });

    // Remove item
    document.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cartId = btn.dataset.cartId;
        try {
          await API.removeFromCart(cartId);
          Components.toast('Item removed from cart', 'info');
          App.updateCartBadge();
          this.loadCart();
        } catch (err) {
          Components.toast(err.message, 'error');
        }
      });
    });

    // Checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        if (!App.user) {
          Components.toast('Please sign in to checkout', 'info');
          window.location.hash = '#/login';
          return;
        }
        window.location.hash = '#/checkout';
      });
    }
  }
};
