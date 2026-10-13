const form = document.getElementById('custom-gift-form');
const amountInput = document.getElementById('custom-amount');
const error = document.getElementById('custom-gift-error');
form.addEventListener('submit', event => {
  event.preventDefault();
  const amount = Number(amountInput.value);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    error.textContent = 'Enter a whole-dollar amount between $1 and $100,000.';
    amountInput.focus();
    return;
  }
  window.location.assign(`index.html?donation=custom&amount=${amount}`);
});
