(() => {
  // October 19, 2026 at 10:00 AM in New York (EDT, UTC−4).
  const launchAt = Date.parse('2026-10-19T10:00:00-04:00');
  const countdown = document.querySelector('[data-launch-countdown]');
  const links = [...document.querySelectorAll('[data-launch-cta]')];
  const productStatus = document.getElementById('product-launch-status');
  const productAdd = document.getElementById('product-add');
  const pad = value => String(value).padStart(2, '0');

  function update() {
    const remaining = launchAt - Date.now();
    const live = remaining <= 0;
    window.JR_COLLECTION_LIVE = live;
    if (countdown) {
      if (live) {
        countdown.innerHTML = '<p class="countdown-live"><span aria-hidden="true">✳</span><span data-countdown-status role="status">The JR Collection is now open for pre-order.</span></p>';
      } else {
        const totalSeconds = Math.floor(remaining / 1000);
        const values = {
          days: Math.floor(totalSeconds / 86400),
          hours: Math.floor((totalSeconds % 86400) / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60
        };
        Object.entries(values).forEach(([name, value]) => {
          const node = countdown.querySelector(`[data-${name}]`);
          if (node) node.textContent = pad(value);
        });
      }
    }
    links.forEach(link => {
      if (live) {
        link.removeAttribute('aria-disabled');
        link.textContent = link.closest('.collection-bottom-cta') ? 'Pre-order now · $499.99 ↗' : 'Pre-order now ↗';
      } else {
        link.setAttribute('aria-disabled', 'true');
      }
    });
    if (productStatus) {
      productStatus.hidden = live;
      if (live && productAdd) productAdd.disabled = false;
    }
  }

  links.forEach(link => link.addEventListener('click', event => {
    if (Date.now() < launchAt) {
      event.preventDefault();
      const status = document.querySelector('[data-countdown-status]');
      if (status) status.textContent = 'Pre-orders open at 10:00 AM New York time.';
    }
  }));
  update();
  window.setInterval(update, 1000);
})();
