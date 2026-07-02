// ============================================
// NovaBuy — Checkout Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.checkout = {
  async render(container) {
    // Require login
    if (!App.user) {
      Components.toast('Please sign in to checkout', 'info');
      window.location.hash = '#/login';
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <h1>Checkout</h1>
        <p class="subtitle">Complete your order</p>
      </div>
      <div id="checkout-content">
        <div class="checkout-layout">
          <div class="skeleton" style="height:400px;border-radius:var(--radius-lg);"></div>
          <div class="skeleton" style="height:300px;border-radius:var(--radius-lg);"></div>
        </div>
      </div>
    `;

    try {
      const cartItems = await API.getCart();

      if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        document.getElementById('checkout-content').innerHTML = Components.emptyState(
          '🛒',
          'Your cart is empty',
          'Add some items to your cart before checking out.',
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

      const summaryItemsHtml = cartItems.map(item => {
        return `
          <div class="checkout-summary-item">
            <span>${Components.escapeHtml(item.name)} <span class="qty">×${item.quantity}</span></span>
            <span>${Components.formatPrice(item.price * item.quantity)}</span>
          </div>
        `;
      }).join('');

      document.getElementById('checkout-content').innerHTML = `
        <div class="checkout-layout fade-in">
          <div class="checkout-form">
            <h3>Shipping Address</h3>
            <form id="checkout-form">
              <div class="form-group">
                <label for="ship-name">Full Name</label>
                <input type="text" class="form-input" id="ship-name" placeholder="John Doe" required value="${Components.escapeAttr(App.user.name || '')}">
              </div>
              <div class="form-group">
                <label for="ship-address1">Address Line 1</label>
                <input type="text" class="form-input" id="ship-address1" placeholder="123 Main Street" required>
              </div>
              <div class="form-group">
                <label for="ship-address2">Address Line 2 (Optional)</label>
                <input type="text" class="form-input" id="ship-address2" placeholder="Apt, Suite, Floor">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="ship-city">City</label>
                  <input type="text" class="form-input" id="ship-city" placeholder="New York" required>
                </div>
                <div class="form-group">
                  <label for="ship-state">State</label>
                  <input type="text" class="form-input" id="ship-state" placeholder="NY" required>
                </div>
              </div>
              <div class="form-group">
                <label for="ship-zip">ZIP Code</label>
                <input type="text" class="form-input" id="ship-zip" placeholder="10001" required style="max-width:200px;">
              </div>
              <button type="submit" class="btn btn-primary btn-lg btn-block mt-6" id="place-order-btn">
                Place Order
              </button>
            </form>
          </div>

          <div class="order-summary">
            <h3>Order Summary</h3>
            <div class="checkout-summary-items">
              ${summaryItemsHtml}
            </div>
            <hr class="summary-divider">
            <div class="summary-row">
              <span class="label">Subtotal</span>
              <span class="value">${Components.formatPrice(subtotal)}</span>
            </div>
            <div class="summary-row ${shipping === 0 ? 'free' : ''}">
              <span class="label">Shipping</span>
              <span class="value">${shipping === 0 ? 'FREE' : Components.formatPrice(shipping)}</span>
            </div>
            <hr class="summary-divider">
            <div class="summary-row summary-total">
              <span class="label">Total</span>
              <span class="value">${Components.formatPrice(total)}</span>
            </div>
          </div>
        </div>
      `;

      // Wire up form submission
      document.getElementById('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('place-order-btn');
        const name = document.getElementById('ship-name').value.trim();
        const addr1 = document.getElementById('ship-address1').value.trim();
        const addr2 = document.getElementById('ship-address2').value.trim();
        const city = document.getElementById('ship-city').value.trim();
        const state = document.getElementById('ship-state').value.trim();
        const zip = document.getElementById('ship-zip').value.trim();

        if (!name || !addr1 || !city || !state || !zip) {
          Components.toast('Please fill in all required fields', 'error');
          return;
        }

        const addressParts = [name, addr1];
        if (addr2) addressParts.push(addr2);
        addressParts.push(`${city}, ${state} ${zip}`);
        const shippingAddress = addressParts.join('\n');

        btn.disabled = true;
        btn.textContent = 'Processing...';

        try {
          const order = await API.placeOrder(shippingAddress);
          Components.toast('Order placed successfully! 🎉', 'success');
          App.updateCartBadge();
          window.location.hash = order && order.id ? `#/orders/${order.id}` : '#/orders';
        } catch (err) {
          Components.toast(err.message || 'Failed to place order', 'error');
          btn.disabled = false;
          btn.textContent = 'Place Order';
        }
      });

    } catch (err) {
      document.getElementById('checkout-content').innerHTML = Components.emptyState(
        '⚠️',
        'Something went wrong',
        err.message || 'Could not load checkout. Please try again.',
        'Back to Cart',
        '#/cart'
      );
    }
  }
};
