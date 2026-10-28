/*
  Скрипт блока «Контакты»: карта (Leaflet + OSM) и меню «Построить маршрут».
  Вынесен из ContactsMap.astro, чтобы Leaflet (~150 КБ JS + CSS) НЕ грузился при открытии страницы —
  блок подключает этот модуль лениво, когда подъезжает к экрану (см. ContactsMap.astro).
*/
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapLocation } from '../data/locations';

export function initContactsMap(root: HTMLElement) {
  const points: MapLocation[] = JSON.parse(root.dataset.points ?? '[]');
  const base = root.dataset.base ?? '/';
  const mapEl = root.querySelector<HTMLElement>('[data-map]')!;
  if (!points.length) return;

  // ---- Карта ----
  // scrollWheelZoom выключен: иначе карта «перехватывает» прокрутку страницы
  const map = L.map(mapEl, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  // ---- Метки ----
  const icon = L.divIcon({
    className: 'fidenta-pin',
    html: `<img src="${base}images/icon-bridge.svg" alt="" width="30" height="15" />`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
  });

  let selected = points[0];
  const routeTarget = root.querySelector<HTMLElement>('[data-route-target]')!;

  function select(p: MapLocation) {
    selected = p;
    routeTarget.textContent = `До: ${p.name}`;
    updateRouteLinks();
  }

  points.forEach((p) => {
    const marker = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(map);
    marker.bindPopup(`<strong>${esc(p.name)}</strong><br>${esc(p.address)}`);
    marker.on('click', () => select(p));
  });

  // Одна точка — фиксированный масштаб; несколько — вписываем все в экран
  if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
  else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [50, 50] });

  // ---- Маршрут ----
  const btn = root.querySelector<HTMLButtonElement>('[data-route-btn]')!;
  const menu = root.querySelector<HTMLElement>('[data-route-menu]')!;

  // Без точки «откуда» — сервисы сами берут местоположение пользователя
  function routeUrls(p: MapLocation) {
    const { lat, lng } = p;
    return {
      yandex: `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`, // lat,lng; пустое «откуда»
      '2gis': `https://2gis.ru/routeSearch/rsType/car/to/${lng},${lat}`, // в 2ГИС порядок lng,lat
      google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    } as Record<string, string>;
  }

  function updateRouteLinks() {
    const urls = routeUrls(selected);
    menu.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach((a) => (a.href = urls[a.dataset.route!]));
  }

  function toggleMenu(open: boolean) {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  select(selected);
  btn.addEventListener('click', () => toggleMenu(menu.hidden));
  // закрываем по клику вне меню и по Esc
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !(e.target as Element).closest('[data-route-btn], [data-route-menu]')) toggleMenu(false);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && toggleMenu(false));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) toggleMenu(false);
  });
}

// Экранирование текста для HTML-подсказки (данные из массива, но на всякий случай)
function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
