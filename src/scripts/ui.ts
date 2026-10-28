/*
  Общие интерактивные механики интерфейса (чистка 28.10): раньше у каждого блока была своя копия.

  accordion  — «открыт только один»: клик по заголовку раскрывает свой пункт и закрывает остальные
               в группе (FAQ, «Полный спектр» на мобильном). Состояние — атрибут data-open на
               пункте + aria-expanded на кнопке; сама анимация раскрытия — в CSS блока.
  showMore   — кнопка «Показать ещё»: раскрывает скрытые элементы и убирает/прячет кнопку
               (Портфолио, FAQ).

  Оба помощника работают в пределах корневого элемента блока (root), а не всего документа —
  блоки друг на друга не влияют.
*/

interface AccordionOptions {
  /** Селектор пункта (например '[data-item]') */
  item: string;
  /** Селектор кнопки-заголовка внутри пункта (например '.faq-q') */
  trigger: string;
  /** Селектор группы, внутри которой открыт только один пункт (по умолчанию — весь root) */
  group?: string;
}

export function accordion(root: HTMLElement, o: AccordionOptions) {
  const setOpen = (item: HTMLElement, open: boolean) => {
    item.toggleAttribute('data-open', open);
    item.querySelector(o.trigger)?.setAttribute('aria-expanded', String(open));
  };

  root.addEventListener('click', (e) => {
    const trigger = (e.target as Element).closest<HTMLElement>(o.trigger);
    if (!trigger || !root.contains(trigger)) return;
    const item = trigger.closest<HTMLElement>(o.item)!;
    const scope = (o.group && item.closest<HTMLElement>(o.group)) || root;
    const wasOpen = item.hasAttribute('data-open');
    scope.querySelectorAll<HTMLElement>(o.item).forEach((it) => setOpen(it, false));
    setOpen(item, !wasOpen);
  });

  return { setOpen };
}

interface ShowMoreOptions {
  /** Селектор кнопки */
  button: string;
  /** Селектор скрытых элементов, которые нужно показать */
  extra: string;
  /** Как показать один элемент */
  reveal: (el: HTMLElement) => void;
  /** Что сделать с кнопкой/её обёрткой после показа */
  done: () => void;
}

export function showMore(root: HTMLElement, o: ShowMoreOptions) {
  root.querySelector(o.button)?.addEventListener('click', () => {
    root.querySelectorAll<HTMLElement>(o.extra).forEach(o.reveal);
    o.done();
  });
}
