(() => {
  const ticketForm = document.getElementById('ticket-order-form');
  const ticketTotal = document.getElementById('ticket-order-total');
  const ticketStatus = document.getElementById('ticket-form-status');
  const ticketSubmit = document.getElementById('ticket-submit');
  const quantityFields = ticketForm ? [...ticketForm.querySelectorAll('[name="generalAdmission"], [name="vipExperience"]')] : [];
  const ticketMoney = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

  function updateTicketTotal() {
    if (!ticketForm || !ticketTotal) return;
    const general = Number(ticketForm.elements.generalAdmission.value || 0);
    const vip = Number(ticketForm.elements.vipExperience.value || 0);
    ticketTotal.textContent = ticketMoney(general * 250 + vip * 1000);
  }

  quantityFields.forEach(field => field.addEventListener('input', updateTicketTotal));
  updateTicketTotal();

  if (ticketForm) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'return') {
      ticketStatus.textContent = 'Flutterwave returned you to this page. Your order will be confirmed by email after the payment is verified.';
      ticketStatus.classList.add('ticket-status-visible');
      document.getElementById('ticket-types')?.scrollIntoView({ behavior: 'smooth' });
    }

    ticketForm.addEventListener('submit', async event => {
      event.preventDefault();
      const generalAdmission = Number(ticketForm.elements.generalAdmission.value || 0);
      const vipExperience = Number(ticketForm.elements.vipExperience.value || 0);
      if (generalAdmission + vipExperience < 1) {
        ticketStatus.textContent = 'Choose at least one ticket to continue.';
        ticketStatus.classList.add('ticket-status-visible');
        ticketStatus.classList.add('is-error');
        return;
      }

      ticketSubmit.disabled = true;
      ticketStatus.textContent = 'Preparing your secure ticket payment...';
      ticketStatus.classList.add('ticket-status-visible');
      ticketStatus.classList.remove('is-error');
      const formData = new FormData(ticketForm);
      const customer = Object.fromEntries(['name', 'email', 'phone'].map(key => [key, formData.get(key)]));
      try {
        const response = await fetch('/api/ticket-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer, ticketItems: { general_admission: generalAdmission, vip_experience: vipExperience } })
        });
        const result = await response.json();
        if (!response.ok || !result.paymentLink) throw new Error(result.error || 'Ticket checkout could not be prepared. Please try again.');
        window.location.assign(result.paymentLink);
      } catch (error) {
        ticketStatus.textContent = error.message.includes('Failed to fetch')
          ? 'Ticket checkout is not available until the website is deployed and configured.'
          : error.message;
        ticketStatus.classList.add('is-error');
        ticketSubmit.disabled = false;
      }
    });
  }

  const countdowns = document.querySelectorAll('[data-event-countdown]');
  if (!countdowns.length) return;

  // Peoria, Illinois is on Central Daylight Time (UTC-5) on September 25, 2026.
  const eveningStart = new Date('2026-09-25T17:00:00-05:00').getTime();
  const eveningEnd = new Date('2026-09-26T00:00:00-05:00').getTime();

  function updateCountdown() {
    const now = Date.now();
    countdowns.forEach(element => {
      if (now >= eveningEnd) {
        element.innerHTML = '<span class="event-ended">This event has ended.</span>';
        return;
      }
      if (now >= eveningStart) {
        element.innerHTML = '<span class="event-started">The Sheen Awards evening is underway.</span>';
        return;
      }

      let remaining = eveningStart - now;
      const days = Math.floor(remaining / 86400000);
      remaining %= 86400000;
      const hours = Math.floor(remaining / 3600000);
      remaining %= 3600000;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      const values = { days, hours, minutes, seconds };
      Object.entries(values).forEach(([unit, value]) => {
        const target = element.querySelector(`[data-${unit}]`);
        if (target) target.textContent = String(value).padStart(2, '0');
      });
    });
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
})();
