export function initPortfolio(root: HTMLElement) {
  const read = root.querySelector<HTMLButtonElement>('[data-portfolio-read]')!;
  const readLabel = read.querySelector('span')!;
  const details = root.querySelector<HTMLElement>('#portfolio-details')!;
  root.setAttribute('data-portfolio-ready', '');
  read.addEventListener('click', () => {
    const expanded = root.toggleAttribute('data-portfolio-expanded');
    read.setAttribute('aria-expanded', String(expanded));
    readLabel.textContent = expanded ? 'свернуть текст' : 'читать далее';
    if (expanded && details.getBoundingClientRect().top < 98) {
      details.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  });

  for (const card of root.querySelectorAll<HTMLElement>('[data-object-card]')) {
    const front = card.querySelector<HTMLElement>('[data-object-front]')!;
    const back = card.querySelector<HTMLElement>('[data-object-back]')!;
    const open = front.querySelector<HTMLButtonElement>('[data-object-open]')!;
    const close = back.querySelector<HTMLButtonElement>('[data-object-close]')!;
    const heading = back.querySelector('h3')!;
    open.addEventListener('click', () => {
      front.inert = true;
      back.inert = false;
      open.setAttribute('aria-expanded', 'true');
      heading.focus({ preventScroll: true });
    });
    close.addEventListener('click', () => {
      back.inert = true;
      front.inert = false;
      open.setAttribute('aria-expanded', 'false');
      open.focus();
    });
  }

  for (const gallery of root.querySelectorAll<HTMLElement>('[data-gallery]')) {
    const slides = [...gallery.querySelectorAll<HTMLImageElement>('[data-slide]')];
    if (slides.length < 2) continue;

    let current = 0;
    let swipe: { id: number; x: number; y: number } | undefined;
    const count = gallery.querySelector('[data-photo-count]')!;
    function step(direction: number) {
      slides[current].hidden = true;
      current = (current + direction + slides.length) % slides.length;
      slides[current].hidden = false;
      count.textContent = `${current + 1} / ${slides.length}`;
    }

    gallery.querySelectorAll<HTMLButtonElement>('[data-photo-step]').forEach((button) => {
      button.addEventListener('click', () => step(Number(button.dataset.photoStep)));
    });
    gallery.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || !event.isPrimary || (event.target as Element).closest('button')) return;
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    gallery.addEventListener('pointerup', (event) => {
      if (swipe?.id !== event.pointerId) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      swipe = undefined;
      if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    });
    gallery.addEventListener('pointercancel', () => { swipe = undefined; });
  }

  const more = root.querySelector<HTMLButtonElement>('[data-portfolio-more] button')!;
  const panel = root.querySelector<HTMLElement>('#portfolio-more')!;
  const closePortfolio = panel.querySelector<HTMLButtonElement>('[data-portfolio-close]')!;
  const track = panel.querySelector<HTMLElement>('[data-object-track]')!;
  const prev = panel.querySelector<HTMLButtonElement>('[data-track-step="-1"]')!;
  const next = panel.querySelector<HTMLButtonElement>('[data-track-step="1"]')!;
  const position = panel.querySelector<HTMLInputElement>('[data-track-position]')!;
  const card = track.querySelector<HTMLElement>('article:not(.track-mobile)')!;

  function stepWidth() {
    return card.offsetWidth + Number.parseFloat(getComputedStyle(track).columnGap);
  }

  function updateNavigation() {
    if (panel.hidden) return;
    const last = Math.round((track.scrollWidth - track.clientWidth) / stepWidth());
    position.max = String(last);
    position.value = String(Math.round(track.scrollLeft / stepWidth()));
    position.setAttribute('aria-valuetext', `${position.valueAsNumber + 1} из ${last + 1}`);
    prev.disabled = track.scrollLeft < 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }

  function move(direction: number) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({
      left: (position.valueAsNumber + direction) * stepWidth(),
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }

  const cards = Array.from(root.querySelectorAll<HTMLElement>('.object-card'));
  function equalizeCards() {
    root.style.removeProperty('--object-height');
    const height = Math.max(...cards.map(item => item.offsetHeight));
    root.style.setProperty('--object-height', height + 'px');
  }
  let measuredWidth = 0;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width !== measuredWidth) {
      measuredWidth = entry.contentRect.width;
      equalizeCards();
    }
  }).observe(root);
  document.fonts.ready.then(equalizeCards);

  more.addEventListener('click', () => {
    panel.hidden = false;
    equalizeCards();
    more.setAttribute('aria-expanded', 'true');
    more.hidden = true;
    updateNavigation();
    panel.querySelector('h3')?.focus();
  });
  closePortfolio.addEventListener('click', () => {
    more.hidden = false;
    more.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    equalizeCards();
    more.focus({ preventScroll: true });
    more.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  position.addEventListener('input', () => {
    track.scrollTo({ left: position.valueAsNumber * stepWidth(), behavior: 'instant' });
  });
  track.addEventListener('scroll', updateNavigation, { passive: true });
  new ResizeObserver(updateNavigation).observe(track);
}
