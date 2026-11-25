import { pieces, totalMln } from '../data/investment-puzzle';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function initInvestmentPuzzle(root: HTMLElement) {
  const desktop = matchMedia('(min-width: 1024px)');
  const phone = matchMedia('(width < 640px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const viewport = root.querySelector<HTMLElement>('[data-puzzle-viewport]')!;
  const pin = root.querySelector<HTMLElement>('[data-puzzle-pin]')!;
  const marker = root.querySelector<HTMLElement>('[data-puzzle-marker]')!;
  const demo = root.querySelector<HTMLElement>('[data-puzzle-demo]')!;
  const demoMarker = root.querySelector<HTMLElement>('[data-puzzle-demo-marker]')!;
  const photo = root.querySelector<SVGSVGElement>('.investment-scene svg')!;
  const replay = root.querySelector<HTMLButtonElement>('[data-puzzle-replay]')!;
  const header = document.querySelector<HTMLElement>('.header-bar');
  const portfolio = document.getElementById('portfolio');
  const portfolioContent = portfolio?.firstElementChild;
  const expand = root.querySelector<HTMLButtonElement>('[data-puzzle-expand]')!;
  const expandLabel = expand.querySelector<HTMLElement>('[data-puzzle-expand-label]')!;
  const firstDetail = root.querySelector<HTMLElement>('#investment-details p')!;
  const amount = root.querySelector<HTMLElement>('[data-puzzle-amount]')!;
  const count = root.querySelector<HTMLElement>('[data-puzzle-count]')!;
  const percent = root.querySelector<HTMLElement>('[data-puzzle-percent]')!;
  const progressbar = root.querySelector<HTMLElement>('[data-puzzle-progress]')!;
  const bar = root.querySelector<HTMLElement>('[data-puzzle-bar]')!;
  const phase = root.querySelector<HTMLElement>('[data-puzzle-phase]')!;
  const sky = root.querySelector<SVGUseElement>('[data-puzzle-sky]')!;
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
  let layoutFrame = 0;
  let travel = 0;
  let progressAnchor: Element = marker;
  let progressStart = 0;
  let portfolioScale = 0;
  let portfolioOverlap = 0;
  let lastCount = -1;
  let lastProgress = -1;
  let replayFrame = 0;
  let replayPosition: number | undefined;

  function setExpanded(open: boolean) {
    root.toggleAttribute('data-puzzle-expanded', open);
    expand.setAttribute('aria-expanded', String(open));
    expandLabel.textContent = open ? 'свернуть текст' : 'читать далее';
  }

  expand.addEventListener('click', (event) => {
    const opening = expand.getAttribute('aria-expanded') !== 'true';
    stopReplay();
    setExpanded(opening);
    measure();
    if (!opening) {
      marker.scrollIntoView({ block: 'start', behavior: 'instant' });
    } else {
      if (event.detail === 0) firstDetail.focus({ preventScroll: true });
      const detailTop = firstDetail.getBoundingClientRect().top + scrollY;
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      window.scrollTo({ top: detailTop - headerBottom - 12, behavior: 'instant' });
    }
    update();
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
    sky.setAttribute('opacity', String(desktop.matches ? clamp((time - leadIn) / flightTime) : 1));
    let landed = 0;
    pieces.forEach(({ center, enter }, index) => {
      const elapsed = time - leadIn - index * slot;
      const arrival = elapsed - flightTime;
      const isFlying = elapsed >= 0 && arrival < revealTime;
      const reveal = clamp(arrival / revealTime);
      if (arrival >= 0) landed++;
      reveals[index].setAttribute('opacity', String(reveal));
      flights[index].setAttribute('display', isFlying ? 'inline' : 'none');
      if (isFlying) {
        flights[index].setAttribute('opacity', String(1 - reveal ** 2));
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
    if (travel === 0 || replayFrame || replayPosition === scrollY) return;
    replayPosition = undefined;
    const offset = progressStart - progressAnchor.getBoundingClientRect().top;
    positionPortfolio(offset);
    render(clamp(offset / travel));
  }

  function positionPortfolio(offset: number) {
    if (!portfolio || portfolioScale === 0) return;
    const remaining = Math.max(0, travel - Math.max(0, offset));
    const overlap = Math.max(0, portfolioOverlap - Math.max(0, offset - travel) * 0.6);
    portfolio.style.setProperty('--portfolio-puzzle-offset', `${-(remaining + overlap) / portfolioScale}px`);
  }

  function scheduleUpdate() {
    if (!frame && travel > 0) frame = requestAnimationFrame(update);
  }

  function stopReplay() {
    cancelAnimationFrame(replayFrame);
    replayFrame = 0;
    replayPosition = undefined;
  }

  replay.addEventListener('click', () => {
    if (reducedMotion.matches || travel === 0) return;
    stopReplay();
    const pinned = root.hasAttribute('data-puzzle-motion') || root.hasAttribute('data-puzzle-demo-motion');
    const startScroll = scrollY + progressAnchor.getBoundingClientRect().top - progressStart;
    const started = performance.now();
    render(0);
    if (pinned) window.scrollTo({ top: startScroll, behavior: 'instant' });
    positionPortfolio(0);

    function replayStep(now: number) {
      const progress = clamp((now - started) / 3800);
      if (pinned) window.scrollTo({ top: startScroll + progress * travel, behavior: 'instant' });
      positionPortfolio(progress * travel);
      render(progress);
      if (progress < 1) {
        replayFrame = requestAnimationFrame(replayStep);
      } else {
        replayFrame = 0;
        replayPosition = scrollY;
      }
    }

    replayFrame = requestAnimationFrame(replayStep);
  });

  function interruptReplay() {
    if (replayFrame) {
      stopReplay();
      scheduleUpdate();
    }
  }

  function measure() {
    lastProgress = -1;
    portfolioScale = 0;
    portfolio?.style.removeProperty('--portfolio-puzzle-offset');
    root.removeAttribute('data-puzzle-tight');
    const wide = desktop.matches;
    const reading = !wide && expand.getAttribute('aria-expanded') === 'true';
    if (reducedMotion.matches) {
      stopReplay();
      travel = 0;
      root.removeAttribute('data-puzzle-motion');
      root.removeAttribute('data-puzzle-demo-motion');
      root.removeAttribute('data-puzzle-compact');
      root.removeAttribute('data-puzzle-short');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      render(1);
      return;
    }

    const stage = reading ? demo : pin;
    const bounds = stage.getBoundingClientRect();
    // getBoundingClientRect учитывает масштаб страницы, а CSS top задаётся в локальных пикселях.
    const scale = stage.offsetWidth ? bounds.width / stage.offsetWidth : 1;
    // Mobile browser chrome can resize the visual viewport mid-scroll.
    // Keep the sticky geometry tied to the smallest viewport instead.
    const viewportHeight = viewport.getBoundingClientRect().height || innerHeight;
    const headerGap = wide ? Math.min(64, Math.max(24, viewportHeight * 0.045)) : 10;
    const availableTop = (header?.getBoundingClientRect().bottom ?? 0) + headerGap;
    const availableHeight = viewportHeight - availableTop - 8;
    const room = availableHeight / scale;
    root.style.setProperty('--investment-room', `${Math.round(room)}px`);
    root.toggleAttribute('data-puzzle-compact', wide && room < 670);
    root.toggleAttribute('data-puzzle-short', !wide && !reading && room < 565);
    if (stage.getBoundingClientRect().height > availableHeight) {
      root.toggleAttribute('data-puzzle-tight', phone.matches && !reading);
      if (stage.getBoundingClientRect().height > availableHeight) {
        // На низких экранах сцена проходит под шапкой вместе со страницей.
        root.removeAttribute('data-puzzle-tight');
        root.removeAttribute('data-puzzle-motion');
        root.removeAttribute('data-puzzle-demo-motion');
        progressAnchor = reading ? demoMarker : photo;
        progressStart = reading ? availableTop : viewportHeight - 24;
        travel = Math.max(1, reading ? availableHeight * 0.65 : progressStart - availableTop);
        update();
        return;
      }
    }
    progressAnchor = reading ? demoMarker : marker;
    progressStart = availableTop;
    // A taller free area under the pinned scene needs a shorter handoff to the next section.
    const freeSpace = Math.max(0, availableHeight - stage.getBoundingClientRect().height);
    travel = Math.max(viewportHeight * 0.55, viewportHeight * (wide ? 0.95 : 1.55) - freeSpace);
    root.style.setProperty('--investment-pin', `${availableTop / scale}px`);
    root.style.setProperty('--investment-scroll', `${travel / scale}px`);
    root.toggleAttribute('data-puzzle-motion', !reading);
    root.toggleAttribute('data-puzzle-demo-motion', reading);
    if (!reading && portfolio && portfolioContent && portfolio.offsetWidth && freeSpace >= (wide ? 34 : 68)) {
      portfolioScale = portfolio.getBoundingClientRect().width / portfolio.offsetWidth;
      const remaining = travel - (progressStart - progressAnchor.getBoundingClientRect().top);
      const naturalTopAtEnd = portfolioContent.getBoundingClientRect().top - remaining;
      const pinnedBottom = availableTop + stage.getBoundingClientRect().height;
      portfolioOverlap = Math.max(0, naturalTopAtEnd - (pinnedBottom + 18));
    }
    update();
  }

  addEventListener('scroll', scheduleUpdate, { passive: true });
  addEventListener('wheel', interruptReplay, { passive: true });
  addEventListener('touchstart', interruptReplay, { passive: true });
  addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interruptReplay();
  });
  function scheduleMeasure() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      measure();
    });
  }

  reducedMotion.addEventListener('change', scheduleMeasure);
  const layout = new ResizeObserver(scheduleMeasure);
  layout.observe(viewport);
  layout.observe(pin);
  if (header) layout.observe(header);
  measure();
}
