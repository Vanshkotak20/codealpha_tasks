// ============================================
// NovaBuy — Main App Router & Initialization
// ============================================

const App = {
  user: null,
  cartCount: 0,

  /**
   * Initialize the application
   */
  async init() {
    // Add scroll listener for navbar effect
    window.addEventListener('scroll', () => {
      const navbar = document.getElementById('navbar');
      if (navbar) {
        navbar.classList.toggle('scrolled', window.scrollY > 10);
      }
    });

    // Try to get the current logged-in user
    try {
      this.user = await API.getMe();
    } catch (e) {
      this.user = null;
    }

    // Update navigation UI
    this.updateAuthNav();
    this.updateCartBadge();

    // Set up the hash-based router
    window.addEventListener('hashchange', () => this.router());

    // Ensure there's a hash
    if (!window.location.hash) {
      window.location.hash = '#/';
    } else {
      this.router();
    }
  },

  /**
   * Update the auth section of the navbar
   */
  updateAuthNav() {
    const authNav = document.getElementById('auth-nav');
    if (!authNav) return;

    if (this.user) {
      authNav.innerHTML = `
        <a href="#/orders" class="nav-link" data-page="orders">📦 Orders</a>
        <span class="nav-user">Hi, ${Components.escapeHtml(this.user.name)}</span>
        <a href="#" class="nav-link" id="logout-btn">Logout</a>
      `;
      document.getElementById('logout-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await API.logout();
        } catch (err) {
          // Ignore logout errors
        }
        this.user = null;
        this.updateAuthNav();
        Components.toast('Logged out successfully', 'success');
        window.location.hash = '#/';
      });
    } else {
      authNav.innerHTML = `
        <a href="#/login" class="nav-link" data-page="login">Sign In</a>
        <a href="#/register" class="nav-link btn btn-primary btn-sm">Sign Up</a>
      `;
    }
  },

  /**
   * Update cart badge count
   */
  async updateCartBadge() {
    try {
      const cart = await API.getCart();
      this.cartCount = Array.isArray(cart)
        ? cart.reduce((sum, item) => sum + (item.quantity || 1), 0)
        : 0;
    } catch (e) {
      this.cartCount = 0;
    }

    const badge = document.getElementById('cart-badge');
    if (badge) {
      if (this.cartCount > 0) {
        badge.textContent = this.cartCount > 99 ? '99+' : this.cartCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  },

  /**
   * Hash-based SPA router
   */
  router() {
    const hash = window.location.hash || '#/';
    const app = document.getElementById('app');

    // Route definitions
    const routes = [
      { pattern: /^#\/$/, page: 'home' },
      { pattern: /^#\/product\/(\w+)$/, page: 'product', paramNames: ['id'] },
      { pattern: /^#\/cart$/, page: 'cart' },
      { pattern: /^#\/checkout$/, page: 'checkout' },
      { pattern: /^#\/orders$/, page: 'orders' },
      { pattern: /^#\/orders\/(\w+)$/, page: 'orderDetail', paramNames: ['id'] },
      { pattern: /^#\/invoice\/(\w+)$/, page: 'invoice', paramNames: ['id'] },
      { pattern: /^#\/login$/, page: 'login' },
      { pattern: /^#\/register$/, page: 'register' },
    ];

    let matched = false;

    for (const route of routes) {
      const match = hash.match(route.pattern);
      if (match) {
        const params = {};
        if (route.paramNames) {
          route.paramNames.forEach((name, i) => {
            params[name] = match[i + 1];
          });
        }

        const page = window.Pages[route.page];
        if (page && typeof page.render === 'function') {
          // Scroll to top on navigation
          window.scrollTo({ top: 0, behavior: 'smooth' });
          app.innerHTML = '';
          page.render(app, params);
        }

        matched = true;
        break;
      }
    }

    if (!matched) {
      window.location.hash = '#/';
      return;
    }

    // Update active nav link highlighting
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
      const page = link.dataset.page;
      let isActive = false;

      if (page === 'home') {
        isActive = hash === '#/' || hash === '#';
      } else if (page === 'cart') {
        isActive = hash === '#/cart';
      } else if (page === 'orders') {
        isActive = hash.startsWith('#/orders');
      } else if (page === 'login') {
        isActive = hash === '#/login';
      }

      link.classList.toggle('active', isActive);
    });
  }
};

// ---- Boot ----
window.addEventListener('DOMContentLoaded', () => App.init());
