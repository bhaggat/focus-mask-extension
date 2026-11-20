// FocusMask site: mobile menu, header border on scroll, reveal-on-scroll. No dependencies, no tracking.
(() => {
  const head = document.querySelector('.site-head');
  const btn = document.querySelector('.menu-btn');

  if (head && btn) {
    const setOpen = (open) => {
      head.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    btn.addEventListener('click', () => setOpen(!head.classList.contains('open')));
    head.querySelectorAll('.site-nav a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
    document.addEventListener('click', (e) => !head.contains(e.target) && setOpen(false));
    matchMedia('(min-width: 768px)').addEventListener('change', (e) => e.matches && setOpen(false));
  }

  if (head) {
    const onScroll = () => head.classList.toggle('scrolled', scrollY > 8);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
})();
