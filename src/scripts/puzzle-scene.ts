import { pieces, totalMln } from '../data/investment-puzzle';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function initInvestmentPuzzle(root: HTMLElement) {
  const desktop = matchMedia('(min-width: 1024px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktopPin = root.querySelector<HTMLElement>('[data-puzzle-pin="desktop"]')!;
  const mobilePin = root.querySelector<HTMLElement>('[data-puzzle-pin="mobile"]')!;
  const desktopMarker = root.querySelector<HTMLElement>('[data-puzzle-marker="desktop"]')!;
  const mobileMarker = root.querySelector<HTMLElement>('[data-puzzle-marker="mobile"]')!;
  const header = document.querySelector<HTMLElement>('.header-bar');
  const expand = root.querySelector<HTMLButtonElement>('[data-puzzle-expand]')!;
  const expandLabel = expand.querySelector<HTMLElement>('[data-puzzle-expand-label]')!;
  const collapse = root.querySelector<HTMLButtonElement>('[data-puzzle-collapse]')!;
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
  let pinTop = 0;
  let lastCount = -1;
  let lastProgress = -1;
  let marker = mobileMarker;

  function setExpanded(open: boolean) {
    root.toggleAttribute('data-puzzle-expanded', open);
    expand.setAttribute('aria-expanded', String(open));
    expandLabel.textContent = open ? 'Свернуть текст' : 'Читать далее';
  }

  expand.addEventListener('click', () => setExpanded(expand.getAttribute('aria-expanded') !== 'true'));
  collapse.addEventListener('click', () => {
    setExpanded(false);
    expand.focus({ preventScroll: true });
    expand.scrollIntoView({ block: 'nearest', behavior: 'instant' });
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
    phase.textContent = landed === pieces.length ? 'Объект собран' : 'Формирование долей объекта';
  }

  function render(progress: number) {
    if (progress === lastProgress) return;
    lastProgress = progress;
    const time = progress * duration;
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
    const offset = pinTop - marker.getBoundingClientRect().top;
    render(clamp(offset / travel));
  }

  function scheduleUpdate() {
    if (!frame && travel > 0) frame = requestAnimationFrame(update);
  }

  function measure() {
    if (reducedMotion.matches) {
      travel = 0;
      root.removeAttribute('data-puzzle-motion');
      root.removeAttribute('data-puzzle-compact');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      render(1);
      return;
    }

    const wide = desktop.matches;
    const pin = wide ? desktopPin : mobilePin;
    marker = wide ? desktopMarker : mobileMarker;
    const bounds = pin.getBoundingClientRect();
    // getBoundingClientRect учитывает масштаб страницы, а CSS top задаётся в локальных пикселях.
    const scale = pin.offsetWidth ? bounds.width / pin.offsetWidth : 1;
    const availableTop = (header?.getBoundingClientRect().bottom ?? 0) + 10;
    const room = (innerHeight - availableTop - 8) / scale;
    root.style.setProperty('--investment-room', `${Math.round(room)}px`);
    root.toggleAttribute('data-puzzle-compact', wide && room < 670);
    pinTop = wide ? availableTop : Math.min(availableTop, innerHeight - bounds.height - 8);
    travel = innerHeight * (wide ? 1.9 : 1.55);
    root.style.setProperty('--investment-pin', `${pinTop / scale}px`);
    root.style.setProperty('--investment-scroll', `${travel / scale}px`);
    root.setAttribute('data-puzzle-motion', '');
    update();
  }

  addEventListener('scroll', scheduleUpdate, { passive: true });
  addEventListener('resize', measure, { passive: true });
  desktop.addEventListener('change', measure);
  reducedMotion.addEventListener('change', measure);
  const layout = new ResizeObserver(measure);
  layout.observe(desktopPin);
  layout.observe(mobilePin);
  layout.observe(root.querySelector<HTMLElement>('.investment-copy')!);
  measure();
}
