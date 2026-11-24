import { pieces, totalMln } from '../data/investment-puzzle';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function initInvestmentPuzzle(root: HTMLElement) {
  const desktop = matchMedia('(min-width: 1024px)');
  const phone = matchMedia('(width < 640px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pin = root.querySelector<HTMLElement>('[data-puzzle-pin]')!;
  const marker = root.querySelector<HTMLElement>('[data-puzzle-marker]')!;
  const photo = root.querySelector<SVGSVGElement>('.investment-scene svg')!;
  const header = document.querySelector<HTMLElement>('.header-bar');
  const expand = root.querySelector<HTMLButtonElement>('[data-puzzle-expand]')!;
  const expandLabel = expand.querySelector<HTMLElement>('[data-puzzle-expand-label]')!;
  const firstDetail = root.querySelector<HTMLElement>('#investment-details p')!;
  const amount = root.querySelector<HTMLElement>('[data-puzzle-amount]')!;
  const count = root.querySelector<HTMLElement>('[data-puzzle-count]')!;
  const percent = root.querySelector<HTMLElement>('[data-puzzle-percent]')!;
  const progressbar = root.querySelector<HTMLElement>('[data-puzzle-progress]')!;
  const bar = root.querySelector<HTMLElement>('[data-puzzle-bar]')!;
  const phase = root.querySelector<HTMLElement>('[data-puzzle-phase]')!;
  const final = root.querySelector<SVGUseElement>('[data-puzzle-final]')!;
  const reveals = Array.from(root.querySelectorAll<SVGGElement>('[data-puzzle-reveal]'));
  const flights = Array.from(root.querySelectorAll<SVGGElement>('[data-puzzle-flight]'));

  // Сначала сцена закрепляется. Затем восемь долей входят по очереди.
  // Отдельный финальный отрезок убирает стыки масок и показывает оригинал.
  const leadIn = 0.3;
  const slot = 1;
  const flightTime = 0.72;
  const revealTime = 0.24;
  const finishTime = 0.65;
  const finishStarts = leadIn + (pieces.length - 1) * slot + flightTime + revealTime;
  const duration = finishStarts + finishTime;
  const ease = (p: number) => 1 - (1 - clamp(p)) ** 3;
  const sums = [0];
  for (const piece of pieces) sums.push(sums[sums.length - 1] + piece.amount);

  let frame = 0;
  let travel = 0;
  let progressAnchor: Element = marker;
  let progressStart = 0;
  let lastCount = -1;
  let lastProgress = -1;

  function setExpanded(open: boolean) {
    root.toggleAttribute('data-puzzle-expanded', open);
    expand.setAttribute('aria-expanded', String(open));
    expandLabel.textContent = open ? 'свернуть текст' : 'читать далее';
  }

  expand.addEventListener('click', (event) => {
    const opening = expand.getAttribute('aria-expanded') !== 'true';
    setExpanded(opening);
    measure();
    if (!opening) {
      marker.scrollIntoView({ block: 'start', behavior: 'instant' });
    } else {
      if (event.detail === 0) firstDetail.focus({ preventScroll: true });
      const detailTop = firstDetail.getBoundingClientRect().top;
      if (detailTop < (header?.getBoundingClientRect().bottom ?? 0) || detailTop > innerHeight - 40) {
        firstDetail.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }
  });
  root.setAttribute('data-puzzle-ready', '');

  function updateCounter(landed: number) {
    if (landed === lastCount) return;
    lastCount = landed;
    const capital = sums[landed];
    const percentage = Math.round(capital / totalMln * 100);
    amount.textContent = String(capital);
    count.textContent = String(landed);
    percent.textContent = percentage + '%';
    progressbar.setAttribute('aria-valuenow', String(percentage));
    bar.style.setProperty('--investment-progress', String(capital / totalMln));
    phase.textContent = landed === pieces.length ? 'Сбор долей завершён · этап управления'
      : landed > 0 ? `Объединение капитала · этап ${landed} из ${pieces.length}`
      : 'Формирование долей объекта';
  }

  function render(progress: number) {
    if (progress === lastProgress) return;
    lastProgress = progress;
    const time = progress * duration;
    root.toggleAttribute('data-puzzle-start', time < leadIn);
    let landed = 0;
    pieces.forEach(({ center, enter }, index) => {
      const elapsed = time - leadIn - index * slot;
      const arrival = elapsed - flightTime;
      const isFlying = elapsed >= 0 && arrival < 0;
      if (arrival >= 0) landed++;
      reveals[index].setAttribute('opacity', String(clamp(arrival / revealTime)));
      flights[index].setAttribute('display', isFlying ? 'inline' : 'none');
      if (isFlying) {
        const distance = 1 - ease(elapsed / flightTime);
        const [x, y] = center;
        const [dx, dy] = enter;
        const rotation = (index % 2 ? -15 : 15) * distance;
        flights[index].setAttribute('transform', `translate(${dx * distance} ${dy * distance}) rotate(${rotation} ${x} ${y})`);
      }
    });
    final.setAttribute('opacity', String(clamp((time - finishStarts) / finishTime)));
    updateCounter(landed);
  }

  function update() {
    frame = 0;
    if (travel === 0) return;
    const offset = progressStart - progressAnchor.getBoundingClientRect().top;
    render(clamp(offset / travel));
  }

  function scheduleUpdate() {
    if (!frame && travel > 0) frame = requestAnimationFrame(update);
  }

  function measure() {
    root.removeAttribute('data-puzzle-tight');
    const wide = desktop.matches;
    const reading = !wide && expand.getAttribute('aria-expanded') === 'true';
    if (reducedMotion.matches || reading) {
      travel = 0;
      root.removeAttribute('data-puzzle-motion');
      root.removeAttribute('data-puzzle-compact');
      root.removeAttribute('data-puzzle-short');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      render(reducedMotion.matches ? 1 : 0);
      return;
    }

    const bounds = pin.getBoundingClientRect();
    // getBoundingClientRect учитывает масштаб страницы, а CSS top задаётся в локальных пикселях.
    const scale = pin.offsetWidth ? bounds.width / pin.offsetWidth : 1;
    const viewportHeight = visualViewport?.height ?? innerHeight;
    const headerGap = wide ? Math.min(64, Math.max(24, viewportHeight * 0.045)) : 10;
    const availableTop = (header?.getBoundingClientRect().bottom ?? 0) + headerGap;
    const availableHeight = viewportHeight - availableTop - 8;
    const room = availableHeight / scale;
    root.style.setProperty('--investment-room', `${Math.round(room)}px`);
    root.toggleAttribute('data-puzzle-compact', wide && room < 670);
    root.toggleAttribute('data-puzzle-short', !wide && room < 565);
    if (pin.getBoundingClientRect().height > availableHeight) {
      root.toggleAttribute('data-puzzle-tight', phone.matches);
      if (pin.getBoundingClientRect().height > availableHeight) {
        // На низких экранах сцена проходит под шапкой вместе со страницей.
        root.removeAttribute('data-puzzle-tight');
        root.removeAttribute('data-puzzle-motion');
        progressAnchor = photo;
        progressStart = viewportHeight - 24;
        travel = Math.max(1, progressStart - availableTop);
        update();
        return;
      }
    }
    progressAnchor = marker;
    progressStart = availableTop;
    travel = viewportHeight * (wide ? 0.95 : 1.55);
    root.style.setProperty('--investment-pin', `${availableTop / scale}px`);
    root.style.setProperty('--investment-scroll', `${travel / scale}px`);
    root.setAttribute('data-puzzle-motion', '');
    update();
  }

  addEventListener('scroll', scheduleUpdate, { passive: true });
  addEventListener('resize', measure, { passive: true });
  visualViewport?.addEventListener('resize', measure, { passive: true });
  desktop.addEventListener('change', measure);
  reducedMotion.addEventListener('change', measure);
  const layout = new ResizeObserver(measure);
  layout.observe(pin);
  layout.observe(root.querySelector<HTMLElement>('.investment-copy')!);
  measure();
}
