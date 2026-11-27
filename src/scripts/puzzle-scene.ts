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
  const flightTime = 0.54;
  const labelHold = 0.22;
  const revealTime = 0.20;
  const finishTime = 0.65;
  const finishStarts = leadIn + (pieces.length - 1) * slot + flightTime + labelHold + revealTime;
  const duration = finishStarts + finishTime;
  const replayDuration = 10_000;
  const ease = (p: number) => 1 - (1 - clamp(p)) ** 3;
  const sums = [0];
  for (const piece of pieces) sums.push(sums[sums.length - 1] + piece.amount);

  let frame = 0;
  let layoutFrame = 0;
  let travel = 0;
  let progressAnchor: Element = marker;
  let progressStart = 0;
  let portfolioScale = 0;
  let furthestProgress = 0;
  let released = false;
  let furthestScroll = scrollY;
  let lastCount = -1;
  let lastProgress = -1;
  let replayFrame = 0;

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
      if (!desktop.matches) window.scrollTo({ top: detailTop - headerBottom - 12, behavior: 'instant' });
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
      const isFlying = elapsed >= 0 && arrival < labelHold + revealTime;
      const reveal = clamp((arrival - labelHold) / revealTime);
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
    if (released) {
      const viewportHeight = viewport.getBoundingClientRect().height || innerHeight;
      if (reducedMotion.matches || root.getBoundingClientRect().top < viewportHeight) return;
      released = false;
      furthestProgress = 0;
      measure(false);
      render(0);
      return;
    }
    if (travel === 0 || replayFrame) return;
    furthestScroll = Math.max(furthestScroll, scrollY);
    const movingBack = furthestScroll - scrollY >= 24;
    const offset = progressStart - progressAnchor.getBoundingClientRect().top;
    if (offset >= travel || (movingBack && furthestProgress > 0)) {
      releaseScene();
      return;
    }
    positionPortfolio(offset);
    furthestProgress = Math.max(furthestProgress, clamp(offset / travel));
    render(furthestProgress);
  }

  function releaseScene() {
    const stage = root.hasAttribute('data-puzzle-demo-motion') ? demo : pin;
    const anchor = stage.getBoundingClientRect().bottom <= 0 && portfolio ? portfolio : stage;
    const anchorTop = anchor.getBoundingClientRect().top;
    released = true;
    travel = 0;
    render(1);
    root.removeAttribute('data-puzzle-motion');
    root.removeAttribute('data-puzzle-demo-motion');
    portfolio?.style.removeProperty('--portfolio-puzzle-offset');
    const shift = anchor.getBoundingClientRect().top - anchorTop;
    if (Math.abs(shift) >= 1) window.scrollTo({ top: scrollY + shift, behavior: 'instant' });
  }

  function positionPortfolio(offset: number) {
    if (!portfolio || portfolioScale === 0) return;
    const remaining = Math.max(0, travel - Math.max(0, offset));
    portfolio.style.setProperty('--portfolio-puzzle-offset', `${-remaining / portfolioScale}px`);
  }

  function scheduleUpdate() {
    if (!frame && (travel > 0 || released)) frame = requestAnimationFrame(update);
  }

  function stopReplay() {
    cancelAnimationFrame(replayFrame);
    replayFrame = 0;
    furthestScroll = scrollY;
  }

  replay.addEventListener('click', () => {
    if (reducedMotion.matches) return;
    stopReplay();
    released = false;
    furthestProgress = 0;
    measure(false);
    const pinned = root.hasAttribute('data-puzzle-motion') || root.hasAttribute('data-puzzle-demo-motion');
    const startScroll = scrollY + progressAnchor.getBoundingClientRect().top - progressStart;
    const started = performance.now();
    render(furthestProgress);
    if (pinned) window.scrollTo({ top: startScroll, behavior: 'instant' });
    positionPortfolio(0);

    function replayStep(now: number) {
      const progress = clamp((now - started) / replayDuration);
      furthestProgress = progress;
      if (pinned) window.scrollTo({ top: startScroll + progress * travel, behavior: 'instant' });
      positionPortfolio(progress * travel);
      render(progress);
      if (progress < 1) {
        replayFrame = requestAnimationFrame(replayStep);
      } else {
        replayFrame = 0;
        releaseScene();
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

  function measure(sync = true) {
    lastProgress = -1;
    furthestScroll = scrollY;
    portfolioScale = 0;
    portfolio?.style.removeProperty('--portfolio-puzzle-offset');
    const wide = desktop.matches;
    const demoOnly = !phone.matches && !wide && expand.getAttribute('aria-expanded') === 'true';
    if (reducedMotion.matches) {
      stopReplay();
      travel = 0;
      root.removeAttribute('data-puzzle-motion');
      root.removeAttribute('data-puzzle-demo-motion');
      root.removeAttribute('data-puzzle-compact');
      root.removeAttribute('data-puzzle-short');
      root.removeAttribute('data-puzzle-tight');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      render(1);
      return;
    }
    if (released) return;
    root.removeAttribute('data-puzzle-tight');

    const stage = demoOnly ? demo : pin;
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
    root.toggleAttribute('data-puzzle-short', !wide && !demoOnly && room < 565);
    if (stage.getBoundingClientRect().height > availableHeight) {
      root.toggleAttribute('data-puzzle-tight', phone.matches && !demoOnly);
      if (!phone.matches && stage.getBoundingClientRect().height > availableHeight) {
        // На низких экранах сцена проходит под шапкой вместе со страницей.
        root.removeAttribute('data-puzzle-tight');
        root.removeAttribute('data-puzzle-motion');
        root.removeAttribute('data-puzzle-demo-motion');
        progressAnchor = demoOnly ? demoMarker : photo;
        progressStart = demoOnly ? availableTop : viewportHeight - 24;
        travel = Math.max(1, demoOnly ? availableHeight * 0.65 : progressStart - availableTop);
        if (sync) update();
        return;
      }
    }
    progressAnchor = demoOnly ? demoMarker : marker;
    progressStart = availableTop;
    // A taller free area under the pinned scene needs a shorter handoff to the next section.
    const freeSpace = Math.max(0, availableHeight - stage.getBoundingClientRect().height);
    travel = Math.max(viewportHeight * 0.55, viewportHeight * (wide ? 0.95 : 1.55) - freeSpace);
    root.style.setProperty('--investment-pin', `${availableTop / scale}px`);
    root.style.setProperty('--investment-scroll', `${travel / scale}px`);
    root.toggleAttribute('data-puzzle-motion', !demoOnly);
    root.toggleAttribute('data-puzzle-demo-motion', demoOnly);
    if (!demoOnly && portfolio && portfolio.offsetWidth && freeSpace >= (wide ? 34 : 68)) {
      portfolioScale = portfolio.getBoundingClientRect().width / portfolio.offsetWidth;
    }
    if (sync) update();
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
