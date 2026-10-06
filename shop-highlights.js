(() => {
  const notice = document.getElementById('shop-highlight');
  const message = document.getElementById('shop-highlight-message');
  const title = document.getElementById('shop-highlight-title');
  const link = document.getElementById('shop-highlight-link');
  if (!notice || !message || !title || !link) return;

  const highlights = [
    { title: 'Rosary collection', message: 'Ghirelli editions from $51 to $181.', filter: 'rosary' },
    { title: 'The Roumie Club Tee', message: 'Soft cotton. Big heart. $50.', filter: 'wear' },
    { title: 'Free delivery', message: 'Delivery is free on every order.', filter: 'all' },
    { title: 'A Little Care Box', message: 'A thoughtful gift, priced at $149.', filter: 'care' },
    { title: 'Custom photo frame', message: 'Make it personal for $499.', filter: 'personalized' }
  ];

  let nextHighlight = 0;
  let hideTimer;
  let dismissed = false;

  function hideHighlight() {
    notice.classList.remove('is-visible');
    window.setTimeout(() => { notice.hidden = true; }, 240);
  }

  function showHighlight() {
    if (dismissed || document.visibilityState !== 'visible') return;
    const item = highlights[nextHighlight % highlights.length];
    nextHighlight += 1;
    title.textContent = item.title;
    message.textContent = item.message;
    link.dataset.filter = item.filter;
    notice.hidden = false;
    requestAnimationFrame(() => notice.classList.add('is-visible'));
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideHighlight, 9000);
  }

  document.getElementById('shop-highlight-close')?.addEventListener('click', () => {
    dismissed = true;
    clearTimeout(hideTimer);
    hideHighlight();
  });

  link.addEventListener('click', () => {
    const filter = link.dataset.filter;
    const category = document.querySelector(`.category[data-filter="${filter}"]`);
    category?.click();
  });

  const scheduleNext = () => window.setTimeout(() => {
    showHighlight();
    scheduleNext();
  }, 55000 + Math.random() * 35000);

  window.setTimeout(() => {
    showHighlight();
    scheduleNext();
  }, 10000);
})();
