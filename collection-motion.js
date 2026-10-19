(() => {
  const feature = document.querySelector('[data-collection-motion]');
  const art = feature?.querySelector('.j-collection-art');
  if (!feature || !art || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let frame = 0;
  feature.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = art.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      art.style.setProperty('--parallax-x', `${(x * 12).toFixed(1)}px`);
      art.style.setProperty('--parallax-y', `${(y * 10).toFixed(1)}px`);
    });
  });

  feature.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    art.style.setProperty('--parallax-x', '0px');
    art.style.setProperty('--parallax-y', '0px');
  });
})();
