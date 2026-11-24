export function initPortfolio(root: HTMLElement) {
  for (const card of root.querySelectorAll<HTMLElement>('[data-object-card]')) {
    const front = card.querySelector<HTMLElement>('[data-object-front]')!;
    const back = card.querySelector<HTMLElement>('[data-object-back]')!;
    const open = front.querySelector<HTMLButtonElement>('[data-object-open]')!;
    const close = back.querySelector<HTMLButtonElement>('[data-object-close]')!;
    const heading = back.querySelector('h3')!;
    open.addEventListener('click', () => {
      back.style.minHeight = `${front.offsetHeight}px`;
      front.hidden = true;
      back.hidden = false;
      open.setAttribute('aria-expanded', 'true');
      heading.focus({ preventScroll: true });
    });
    close.addEventListener('click', () => {
      back.hidden = true;
      front.hidden = false;
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
  const track = panel.querySelector<HTMLElement>('[data-object-track]')!;
  const prev = panel.querySelector<HTMLButtonElement>('[data-track-step="-1"]')!;
  const next = panel.querySelector<HTMLButtonElement>('[data-track-step="1"]')!;

  function updateArrows() {
    prev.disabled = track.scrollLeft < 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }

  function move(direction: number) {
    const card = track.querySelector<HTMLElement>('article:not(.track-mobile)')!;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: reducedMotion ? 'instant' : 'smooth' });
  }

  more.addEventListener('click', () => {
    panel.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    more.hidden = true;
    updateArrows();
    panel.querySelector('h3')?.focus();
  });
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', updateArrows, { passive: true });
  new ResizeObserver(updateArrows).observe(track);
}
