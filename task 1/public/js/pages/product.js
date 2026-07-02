// ============================================
// NovaBuy — Product Detail Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.product = {
  async render(container, params) {
    const id = params.id;

    // Show loading skeleton
    container.innerHTML = `
      <div class="product-detail">
        <div class="skeleton skeleton-image" style="aspect-ratio:1/1; border-radius: var(--radius-lg);"></div>
        <div>
          <div class="skeleton skeleton-text short" style="margin:0 0 16px; height:16px;"></div>
          <div class="skeleton skeleton-text long" style="margin:0 0 16px; height:28px;"></div>
          <div class="skeleton skeleton-text medium" style="margin:0 0 16px; height:20px;"></div>
          <div class="skeleton skeleton-text short" style="margin:0 0 16px; height:32px;"></div>
          <div class="skeleton skeleton-text long" style="margin:0 0 24px; height:80px;"></div>
          <div class="skeleton skeleton-btn" style="margin:0; width:200px;"></div>
        </div>
      </div>
    `;

    try {
      const product = await API.getProduct(id);
      const inStock = product.stock > 0;
      const escapedCategory = Components.escapeAttr(product.category || '');

      container.innerHTML = `
        <div class="fade-in">
          <div class="product-detail">
            <div class="product-detail-image-wrapper">
              <img class="product-detail-image" 
                   src="/images/${Components.escapeAttr(product.image)}" 
                   alt="${Components.escapeAttr(product.name)}"
                   onerror="Components.handleImageError(this, '${escapedCategory}')">
            </div>
            <div class="product-detail-info">
              <span class="product-detail-category">${Components.escapeHtml(product.category)}</span>
              <h1 class="product-detail-name">${Components.escapeHtml(product.name)}</h1>
              ${Components.stars(product.rating || 0, product.reviewsCount || product.reviewCount || 0)}
              <div class="product-detail-price">${Components.formatPrice(product.price)}</div>
              <p class="product-detail-description">${Components.escapeHtml(product.description)}</p>
              
              <div class="stock-status">
                <span class="stock-dot ${inStock ? 'in-stock' : 'out-of-stock'}"></span>
                ${inStock ? `<span style="color:var(--success)">${product.stock} in stock</span>` : '<span style="color:var(--error)">Out of stock</span>'}
              </div>

              ${inStock ? `
                <div class="product-detail-actions">
                  <div class="product-detail-qty">
                    <label>Quantity:</label>
                    <div class="quantity-controls">
                      <button class="quantity-btn" id="pd-qty-decrease">−</button>
                      <span class="quantity-value" id="pd-qty-value">1</span>
                      <button class="quantity-btn" id="pd-qty-increase">+</button>
                    </div>
                  </div>
                  <button class="btn btn-primary btn-lg" id="pd-add-to-cart">
                    Add to Cart
                  </button>
                </div>
              ` : `
                <button class="btn btn-primary btn-lg" disabled>Out of Stock</button>
              `}

              <a href="#/" class="back-link">← Continue Shopping</a>
            </div>
          </div>
        </div>
      `;

      if (inStock) {
        let qty = 1;
        const maxStock = product.stock;
        const qtyValue = document.getElementById('pd-qty-value');
        const decreaseBtn = document.getElementById('pd-qty-decrease');
        const increaseBtn = document.getElementById('pd-qty-increase');
        const addBtn = document.getElementById('pd-add-to-cart');

        decreaseBtn.addEventListener('click', () => {
          if (qty > 1) {
            qty--;
            qtyValue.textContent = qty;
          }
        });

        increaseBtn.addEventListener('click', () => {
          if (qty < maxStock) {
            qty++;
            qtyValue.textContent = qty;
          }
        });

        addBtn.addEventListener('click', async () => {
          addBtn.disabled = true;
          addBtn.textContent = 'Adding...';
          try {
            await API.addToCart(product.id, qty);
            Components.toast(`Added ${qty} item${qty > 1 ? 's' : ''} to cart!`, 'success');
            App.updateCartBadge();
          } catch (err) {
            Components.toast(err.message || 'Failed to add to cart', 'error');
          } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'Add to Cart';
          }
        });
      }

    } catch (err) {
      container.innerHTML = Components.emptyState(
        '😞',
        'Product Not Found',
        'The product you\'re looking for doesn\'t exist or has been removed.',
        'Back to Shop',
        '#/'
      );
    }
  }
};
