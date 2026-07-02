// ============================================
// NovaBuy — Reusable UI Components
// ============================================

const Components = {

  /**
   * Show a toast notification
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   */
  toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${this.escapeHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
  },

  /**
   * Render star rating HTML
   */
  stars(rating, count) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    const starsStr = '★'.repeat(full) + (half ? '★' : '') + '☆'.repeat(empty);
    const formattedCount = count ? Number(count).toLocaleString() : '0';
    return `<div class="rating">
      <span class="stars">${starsStr}</span>
      <span class="review-count">(${formattedCount})</span>
    </div>`;
  },

  /**
   * Product card HTML for grid display
   */
  productCard(product) {
    const escapedCategory = this.escapeAttr(product.category || '');
    const escapedName = this.escapeHtml(product.name);
    // Support both reviewsCount and reviewCount field names
    const reviewCount = product.reviewsCount || product.reviewCount || product.reviews_count || 0;
    return `
      <div class="product-card" onclick="window.location.hash='#/product/${product.id}'">
        <div class="product-image-wrapper">
          <img class="product-image" 
               src="/images/${this.escapeAttr(product.image)}" 
               alt="${this.escapeAttr(product.name)}"
               loading="lazy"
               onerror="Components.handleImageError(this, '${escapedCategory}')">
        </div>
        <div class="product-info">
          <span class="product-category">${this.escapeHtml(product.category)}</span>
          <h3 class="product-name">${escapedName}</h3>
          ${this.stars(product.rating || 0, reviewCount)}
          <span class="product-price">${this.formatPrice(product.price)}</span>
        </div>
        <div class="product-card-footer">
          <button class="btn btn-primary btn-block add-to-cart-btn" 
                  data-product-id="${product.id}"
                  onclick="event.stopPropagation();">
            Add to Cart
          </button>
        </div>
      </div>`;
  },

  /**
   * Loading skeleton grid
   */
  productSkeleton(count = 8) {
    let html = '<div class="product-grid">';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="skeleton-card">
          <div class="skeleton skeleton-image"></div>
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton skeleton-text long"></div>
          <div class="skeleton skeleton-text medium"></div>
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton skeleton-btn"></div>
        </div>`;
    }
    html += '</div>';
    return html;
  },

  /**
   * Cart item row — expects flat item: { id, name, price, image, category, quantity, ... }
   */
  cartItem(item) {
    const qty = item.quantity || 1;
    const unitPrice = item.price || 0;
    const subtotal = unitPrice * qty;
    const escapedCategory = this.escapeAttr(item.category || '');

    return `
      <div class="cart-item" data-cart-id="${item.id}">
        <div class="cart-item-image-wrapper">
          <img class="cart-item-image" 
               src="/images/${this.escapeAttr(item.image || '')}" 
               alt="${this.escapeAttr(item.name || '')}"
               onerror="Components.handleImageError(this, '${escapedCategory}')">
        </div>
        <div class="cart-item-details">
          <div class="cart-item-name">
            <a href="#/product/${item.productId || item.product_id || ''}">${this.escapeHtml(item.name || '')}</a>
          </div>
          <div class="cart-item-price">${this.formatPrice(unitPrice)} each</div>
        </div>
        <div class="quantity-controls">
          <button class="quantity-btn qty-decrease" data-cart-id="${item.id}" data-current="${qty}">−</button>
          <span class="quantity-value">${qty}</span>
          <button class="quantity-btn qty-increase" data-cart-id="${item.id}" data-current="${qty}">+</button>
        </div>
        <div class="cart-item-subtotal">${this.formatPrice(subtotal)}</div>
        <button class="cart-item-remove" data-cart-id="${item.id}" title="Remove item">✕</button>
      </div>`;
  },

  /**
   * Order card for the orders list
   */
  orderCard(order) {
    const dateRaw = order.createdAt || order.created_at || order.date;
    const date = dateRaw ? new Date(dateRaw) : new Date();
    const dateStr = isNaN(date.getTime()) 
      ? 'Unknown date' 
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const status = (order.status || 'pending').toLowerCase();
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const itemCount = order.itemCount || order.item_count || (order.items ? order.items.length : 0);

    return `
      <div class="order-card" onclick="window.location.hash='#/orders/${order.id}'">
        <div class="order-card-header">
          <div>
            <span class="order-id">Order #${order.id}</span>
            <span class="order-date">${dateStr}</span>
          </div>
          <span class="badge badge-${status}">${statusLabel}</span>
        </div>
        <div class="order-card-footer">
          <span class="order-item-count">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
          <span class="order-total">${this.formatPrice(order.total || 0)}</span>
        </div>
      </div>`;
  },

  /**
   * Empty state component
   */
  emptyState(icon, title, message, actionText, actionHref) {
    return `
      <div class="empty-state fade-in">
        <span class="empty-state-icon">${icon}</span>
        <h2 class="empty-state-title">${this.escapeHtml(title)}</h2>
        <p class="empty-state-message">${this.escapeHtml(message)}</p>
        ${actionText ? `<a href="${actionHref}" class="btn btn-primary">${this.escapeHtml(actionText)}</a>` : ''}
      </div>`;
  },

  /**
   * Format price as currency
   */
  formatPrice(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /**
   * Handle broken product images — replace with gradient placeholder
   */
  handleImageError(img, category) {
    const emojis = {
      'Electronics': '🔌',
      'Clothing': '👕',
      'Home & Kitchen': '🏠',
      'Home &amp; Kitchen': '🏠',
      'Books': '📚'
    };
    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';
    placeholder.innerHTML = `<span>${emojis[category] || '🛍️'}</span>`;
    if (img.parentNode) {
      img.parentNode.replaceChild(placeholder, img);
    }
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  /**
   * Escape attribute values
   */
  escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
