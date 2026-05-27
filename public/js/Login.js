// Login.js – Corrected to handle JSON redirect
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorDiv = document.getElementById('login-error');
const loginForm = document.getElementById('loginForm');

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toggleButton() {
    if (emailInput.value && passwordInput.value && isValidEmail(emailInput.value)) {
        loginBtn.disabled = false;
    } else {
        loginBtn.disabled = true;
    }
}

emailInput.addEventListener('input', toggleButton);
passwordInput.addEventListener('input', toggleButton);
toggleButton();

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.textContent = '';
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            errorDiv.textContent = 'Please fill all fields.';
            return;
        }
        if (!isValidEmail(email)) {
            errorDiv.textContent = 'Invalid email format.';
            return;
        }
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';
        
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
            const res = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
                },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                // Redirect to the URL provided by the backend
                window.location.href = data.redirect || '/index.html';
            } else {
                errorDiv.textContent = data.error || 'Login failed. Please try again.';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
        } catch (err) {
            console.error('Login error:', err);
            errorDiv.textContent = 'Network error. Please try again.';
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });
}

// Optional: If already logged in, redirect to dashboard
(async function checkSession() {
    try {
        const res = await fetch('/api/session', { credentials: 'include' });
        const session = await res.json();
        if (session.loggedIn) {
            window.location.href = '/index.html';
        }
    } catch(e) {}
})();
