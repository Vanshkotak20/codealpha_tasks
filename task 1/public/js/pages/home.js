// ============================================
// NovaBuy — Home / Product Listing Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.home = {
  debounceTimer: null,
  currentCategory: '',
  currentSearch: '',

  async render(container) {
    // Render the page shell with hero, search, filters, and skeleton grid
    container.innerHTML = `
      <section class="hero-section">
        <h1 class="hero-title">Discover Premium Products</h1>
        <p class="hero-subtitle">Curated collections of the finest products across electronics, fashion, home essentials, and literature.</p>
      </section>

      <div class="search-bar-wrapper">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-bar" id="search-input" placeholder="Search products..." autocomplete="off">
      </div>

      <div class="category-filters" id="category-filters">
        <button class="category-pill active" data-category="">All</button>
        <button class="category-pill" data-category="Electronics">⚡ Electronics</button>
        <button class="category-pill" data-category="Clothing">👕 Clothing</button>
        <button class="category-pill" data-category="Home & Kitchen">🏠 Home & Kitchen</button>
        <button class="category-pill" data-category="Books">📚 Books</button>
      </div>

      <div id="product-list">
        ${Components.productSkeleton(8)}
      </div>
    `;

    // Wire up search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.currentSearch = e.target.value.trim();
        this.loadProducts();
      }, 300);
    });

    // Wire up category filters
    const filtersContainer = document.getElementById('category-filters');
    filtersContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.category-pill');
      if (!pill) return;

      filtersContainer.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      this.currentCategory = pill.dataset.category;
      this.loadProducts();
    });

    // Load initial products
    this.currentCategory = '';
    this.currentSearch = '';
    await this.loadProducts();
  },

  async loadProducts() {
    const listContainer = document.getElementById('product-list');
    if (!listContainer) return;

    try {
      const params = {};
      if (this.currentCategory) params.category = this.currentCategory;
      if (this.currentSearch) params.search = this.currentSearch;

      const products = await API.getProducts(params);

      if (!products || products.length === 0) {
        listContainer.innerHTML = Components.emptyState(
          '🔍',
          'No Products Found',
          'Try adjusting your search or filter to find what you\'re looking for.',
          'Clear Filters',
          '#/'
        );
        return;
      }

      // Build the product grid with staggered animation
      let html = '<div class="product-grid">';
      products.forEach((product, index) => {
        html += `<div class="fade-in" style="animation-delay: ${index * 50}ms">
          ${Components.productCard(product)}
        </div>`;
      });
      html += '</div>';
      listContainer.innerHTML = html;

      // Wire up Add to Cart buttons
      listContainer.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const productId = btn.dataset.productId;
          btn.disabled = true;
          btn.textContent = 'Adding...';
          try {
            await API.addToCart(Number(productId), 1);
            Components.toast('Added to cart!', 'success');
            App.updateCartBadge();
          } catch (err) {
            Components.toast(err.message || 'Failed to add to cart', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Add to Cart';
          }
        });
      });

    } catch (err) {
      listContainer.innerHTML = Components.emptyState(
        '⚠️',
        'Something went wrong',
        'We couldn\'t load the products. Please try again later.',
        'Retry',
        '#/'
      );
    }
  }
};
