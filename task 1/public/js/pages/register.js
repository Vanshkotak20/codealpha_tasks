// ============================================
// NovaBuy — Register Page
// ============================================

window.Pages = window.Pages || {};

window.Pages.register = {
  async render(container) {
    container.innerHTML = `
      <div class="auth-page">
        <div class="auth-card fade-in">
          <h2 class="auth-title">Create Account</h2>
          <p class="auth-subtitle">Join NovaBuy today</p>
          <form id="register-form">
            <div class="form-group">
              <label for="reg-name">Full Name</label>
              <input type="text" class="form-input" id="reg-name" placeholder="John Doe" required autocomplete="name">
            </div>
            <div class="form-group">
              <label for="reg-email">Email Address</label>
              <input type="email" class="form-input" id="reg-email" placeholder="you@example.com" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="reg-password">Password</label>
              <input type="password" class="form-input" id="reg-password" placeholder="Create a password" required autocomplete="new-password" minlength="6">
            </div>
            <div class="form-group">
              <label for="reg-confirm">Confirm Password</label>
              <input type="password" class="form-input" id="reg-confirm" placeholder="Confirm your password" required autocomplete="new-password">
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" id="register-btn">
              Create Account
            </button>
          </form>
          <p class="auth-footer">
            Already have an account? <a href="#/login">Sign in</a>
          </p>
        </div>
      </div>
    `;

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('register-btn');
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm').value;

      if (!name || !email || !password || !confirm) {
        Components.toast('Please fill in all fields', 'error');
        return;
      }

      if (password !== confirm) {
        Components.toast('Passwords do not match', 'error');
        return;
      }

      if (password.length < 6) {
        Components.toast('Password must be at least 6 characters', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Creating account...';

      try {
        const user = await API.register(name, email, password);
        App.user = user;
        App.updateAuthNav();
        App.updateCartBadge();
        Components.toast(`Welcome to NovaBuy, ${user.name || 'User'}! 🎉`, 'success');
        window.location.hash = '#/';
      } catch (err) {
        Components.toast(err.message || 'Registration failed', 'error');
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }
};
