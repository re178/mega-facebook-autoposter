// Login.js
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginForm = document.getElementById('loginForm');
const errorDiv = document.getElementById('login-error');

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toggleButton() {
    if (emailInput.value && passwordInput.value && isValidEmail(emailInput.value)) {
        loginBtn.classList.remove('hidden');
    } else {
        loginBtn.classList.add('hidden');
    }
}

emailInput.addEventListener('input', toggleButton);
passwordInput.addEventListener('input', toggleButton);

// Intercept form submission
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!emailInput.value || !passwordInput.value) {
            if (errorDiv) errorDiv.textContent = 'Please fill all fields.';
            return;
        }
        if (!isValidEmail(emailInput.value)) {
            if (errorDiv) errorDiv.textContent = 'Invalid email format.';
            return;
        }

        // Disable button to prevent double submission
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';

        try {
            // Get CSRF token from meta tag (ensure it exists in HTML)
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const res = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
                },
                credentials: 'include',
                body: JSON.stringify({
                    email: emailInput.value,
                    password: passwordInput.value
                })
            });

            if (res.ok) {
                // Redirect to dashboard
                window.location.href = '/dashboard';
            } else {
                const data = await res.json().catch(() => ({}));
                if (errorDiv) errorDiv.textContent = data.message || 'Login failed. Please check credentials.';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
        } catch (err) {
            if (errorDiv) errorDiv.textContent = 'Network error. Please try again.';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });
}
