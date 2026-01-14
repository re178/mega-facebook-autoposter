const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');

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
