// ============================================
// NovaBuy — Login Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.login = {
  async render(container) {
    container.innerHTML = `
      <div class="auth-page">
        <div class="auth-card fade-in">
          <h2 class="auth-title">Welcome Back</h2>
          <p class="auth-subtitle">Sign in to your account</p>
          <form id="login-form">
            <div class="form-group">
              <label for="login-email">Email Address</label>
              <input type="email" class="form-input" id="login-email" placeholder="you@example.com" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" class="form-input" id="login-password" placeholder="Enter your password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" id="login-btn">
              Sign In
            </button>
          </form>
          <p class="auth-footer">
            Don't have an account? <a href="#/register">Create one</a>
          </p>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      if (!email || !password) {
        Components.toast('Please fill in all fields', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Signing in...';

      try {
        const user = await API.login(email, password);
        App.user = user;
        App.updateAuthNav();
        App.updateCartBadge();
        Components.toast(`Welcome back, ${user.name || 'User'}!`, 'success');
        window.location.hash = '#/';
      } catch (err) {
        Components.toast(err.message || 'Invalid email or password', 'error');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }
};
