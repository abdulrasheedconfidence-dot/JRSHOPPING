const params = new URLSearchParams(location.search);
const txRef = params.get('tx_ref') || '';
const transactionId = params.get('transaction_id') || '';
const gatewayStatus = (params.get('status') || '').toLowerCase();
const result = document.querySelector('.payment-result');
const resultMark = document.getElementById('result-mark');
const resultKicker = document.getElementById('result-kicker');
const resultTitle = document.getElementById('result-title');
const resultMessage = document.getElementById('result-message');
const orderReference = document.getElementById('order-reference');
const retryButton = document.getElementById('retry-payment');
const returnLink = document.getElementById('return-shop');
const recommendationPanel = document.getElementById('recommendation-panel');
let retryTimer;
let checks = 0;

function showPending(message = 'We’re still waiting for the payment provider to confirm your payment. This can take a little while.') {
  result.classList.remove('is-failed');
  resultMark.textContent = '…';
  resultKicker.textContent = 'PAYMENT STATUS';
  resultTitle.textContent = 'Payment confirmation is taking a little longer';
  resultMessage.textContent = message;
  retryButton.hidden = false;
  returnLink.hidden = false;
}

function showFailure(message) {
  result.classList.add('is-failed');
  resultMark.textContent = '!';
  resultKicker.textContent = 'PAYMENT NOT CONFIRMED';
  resultTitle.textContent = 'Your order is not marked as paid';
  resultMessage.textContent = message;
  retryButton.hidden = false;
  returnLink.hidden = false;
}

function showPaid(reference) {
  result.classList.remove('is-failed');
  result.classList.add('is-paid');
  resultMark.textContent = '✓';
  resultKicker.textContent = 'ORDER CONFIRMED';
  resultTitle.textContent = 'Thank you for your order.';
  resultMessage.textContent = 'Your payment is confirmed. Keep your order reference, and check the email used at checkout for your receipt. You can return to the shop whenever you’re ready.';
  orderReference.textContent = `Order reference: ${reference}`;
  orderReference.hidden = false;
  retryButton.hidden = true;
  returnLink.hidden = false;
  recommendationPanel.hidden = false;
  try { localStorage.removeItem('roumie-shop-cart'); } catch { /* Order confirmation does not depend on local storage. */ }
}

async function checkPayment(manual = false) {
  if (!txRef || !/^roumie-[0-9a-f-]{36}$/i.test(txRef)) {
    showFailure('We couldn’t find an order reference in this payment return. If you completed payment, please contact the shop with your receipt.');
    return;
  }
  retryButton.disabled = true;
  if (manual) resultMessage.textContent = 'Checking with the payment provider…';
  try {
    const response = await fetch('/api/payment-return', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_ref: txRef, transaction_id: transactionId, status: gatewayStatus })
    });
    const body = await response.json().catch(() => ({}));
    if (body.status === 'paid') { showPaid(body.tx_ref || txRef); return; }
    if (body.status === 'not_found') { showFailure('We couldn’t find this order. If you completed payment, contact the shop with your payment receipt.'); return; }
    if (body.status === 'not_paid') { showFailure('The payment provider has not confirmed a successful payment. If your bank shows a completed charge, wait a few minutes and check again.'); return; }
    showPending(response.ok ? undefined : 'We couldn’t confirm the payment just yet. Please check again in a moment.');
  } catch {
    showPending('We couldn’t reach the payment confirmation service just now. Please check again in a moment.');
  } finally {
    retryButton.disabled = false;
  }
  if (!manual && checks < 4) {
    checks += 1;
    retryTimer = setTimeout(() => checkPayment(false), 3000);
  }
}

retryButton.addEventListener('click', () => { clearTimeout(retryTimer); checkPayment(true); });
document.getElementById('recommendation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('recommendation-submit');
  const status = document.getElementById('recommendation-status');
  button.disabled = true;
  status.classList.remove('is-error');
  status.textContent = 'Sending your recommendation…';
  try {
    const response = await fetch('/api/recommendation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_ref: txRef, message: new FormData(form).get('message') })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) { form.hidden = true; status.textContent = 'Thanks — a recommendation for this order has already been received.'; return; }
      throw new Error(body.error || 'We could not save your message. Please try again.');
    }
    form.hidden = true;
    status.textContent = body.notificationSent ? 'Thank you. Your recommendation has been sent to the shop team.' : 'Thank you. Your recommendation has been saved for the shop team.';
  } catch (error) {
    status.classList.add('is-error');
    status.textContent = error.message;
    button.disabled = false;
  }
});

checkPayment();
