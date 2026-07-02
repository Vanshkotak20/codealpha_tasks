// ============================================
// NovaBuy — API Client
// ============================================

const API = {
  /**
   * Base request helper. All API calls go through here.
   */
  async request(url, options = {}) {
    try {
      const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      };

      if (options.body) {
        config.body = JSON.stringify(options.body);
      }

      const res = await fetch(url, config);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Request failed');
      }

      return data.data;
    } catch (err) {
      // Re-throw with the original message
      throw err;
    }
  },

  // ---- Products ----

  getProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return this.request(`/api/products${qs ? '?' + qs : ''}`);
  },

  getProduct(id) {
    return this.request(`/api/products/${id}`);
  },

  // ---- Cart ----

  getCart() {
    return this.request('/api/cart');
  },

  addToCart(productId, quantity = 1) {
    return this.request('/api/cart', {
      method: 'POST',
      body: { productId, quantity },
    });
  },

  updateCartItem(id, quantity) {
    return this.request(`/api/cart/${id}`, {
      method: 'PUT',
      body: { quantity },
    });
  },

  removeFromCart(id) {
    return this.request(`/api/cart/${id}`, {
      method: 'DELETE',
    });
  },

  // ---- Auth ----

  register(name, email, password) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
  },

  login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  },

  logout() {
    return this.request('/api/auth/logout', {
      method: 'POST',
    });
  },

  getMe() {
    return this.request('/api/auth/me');
  },

  // ---- Orders ----

  placeOrder(shippingAddress) {
    return this.request('/api/orders', {
      method: 'POST',
      body: { shippingAddress },
    });
  },

  getOrders() {
    return this.request('/api/orders');
  },

  getOrder(id) {
    return this.request(`/api/orders/${id}`);
  },
};
