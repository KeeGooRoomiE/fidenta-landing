/*
  3D-пазл «Большое складывается из вашего участия» — движок сцены.

  Порт из прототипа fidenta-puzzle-studio.html (Three.js r180). Что делает:
    - грузит модель public/models/puzzle.glb (12 деталей пазла) и разбирает её вручную
      (как в прототипе: для каждой детали верхняя грань получает фото-текстуру, боковые
      грани и ободок — металлические материалы);
    - рисует одну фотографию на canvas 1600×1200 и натягивает её на верх всех деталей;
    - setProgress(0..1) раскладывает детали: от «разлетевшихся» (0) к собранному фото (1);
      подписи «N млн ₽» на деталях плавно гаснут, в конце появляется целая картинка;
    - рендер идёт ТОЛЬКО пока сцена в зоне видимости (IntersectionObserver) — на странице
      вне блока GPU не нагружается.

  Прогресс задаётся СНАРУЖИ (скролл страницы, см. AssetAccess.astro) — сцена сама ничего не
  «проигрывает». Сглаживание: displayed плавно догоняет target (lerp), поэтому рывки колеса
  мыши не дёргают анимацию.

  Модуль импортируется лениво (dynamic import), чтобы three.js (~0,6 МБ) не тянулся при
  загрузке страницы.
*/
import * as T from 'three';

export interface PuzzleOptions {
  /** Контейнер: в него добавится <canvas>; внутри создаётся слой подписей */
  container: HTMLElement;
  modelUrl: string;
  photoUrl: string;
  /** Сумма «объекта» для подписей на деталях, млн ₽ (демо) */
  totalMln: number;
  /** Уважать prefers-reduced-motion (отключает «парение» деталей) */
  reducedMotion?: boolean;
}

export interface PuzzleScene {
  /** Перенести сцену в другой контейнер (при смене раскладки моб./ПК) */
  setContainer(c: HTMLElement): void;
  setProgress(p: number): void;
  setActive(active: boolean): void;
  dispose(): void;
}

const smooth = (a: number, b: number, x: number) => T.MathUtils.smoothstep(x, a, b);
const clamp = T.MathUtils.clamp;

// Чтение данных glTF-аксессора (формат только tightly packed — как в прототипе)
function getAccessor(doc: any, buffer: ArrayBuffer, binStart: number, id: number) {
  const a = doc.accessors[id];
  const v = doc.bufferViews[a.bufferView];
  const types: Record<number, any> = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
  const C = types[a.componentType];
  const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
  if (v.byteStride && v.byteStride !== size * C.BYTES_PER_ELEMENT) throw Error('Unsupported geometry layout');
  return new C(buffer, binStart + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * size);
}

export async function createPuzzleScene(opts: PuzzleOptions): Promise<PuzzleScene> {
  const { modelUrl, photoUrl, totalMln, reducedMotion = false } = opts;
  let container = opts.container;

  // ---- Фото → canvas-текстура (4:3, cover) ----
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = photoUrl;
  await img.decode();
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = 1600;
  imageCanvas.height = 1200;
  {
    const c = imageCanvas.getContext('2d')!;
    const scale = Math.max(1600 / img.width, 1200 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    c.drawImage(img, (1600 - w) / 2, (1200 - h) / 2, w, h);
  }
  const texture = new T.CanvasTexture(imageCanvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;

  // ---- Сцена, камера, рендерер ----
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 10.5);

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.prepend(renderer.domElement);

  // Свет и «студийное» окружение (мягкие отражения без внешних файлов)
  scene.add(new T.HemisphereLight(0xe4f5ec, 0x13251b, 3));
  const light = new T.DirectionalLight(0xffe4b0, 5);
  light.position.set(-3, 5, 7);
  scene.add(light);
  const fill = new T.DirectionalLight(0xc3dfed, 3);
  fill.position.set(5, -1, 4);
  scene.add(fill);

  const envScene = new T.Scene();
  envScene.background = new T.Color(0x61776c);
  for (const [x, y, z, sx, sy] of [
    [0, 4, 0, 8, 3],
    [-5, 0, 1, 3, 7],
    [4, 2, 3, 2, 6],
  ]) {
    const panel = new T.Mesh(
      new T.PlaneGeometry(sx, sy),
      new T.MeshBasicMaterial({ color: 0xfff3d9, side: T.DoubleSide }),
    );
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    envScene.add(panel);
  }
  const pm = new T.PMREMGenerator(renderer);
  const env = pm.fromScene(envScene, 0.1);
  scene.environment = env.texture;
  pm.dispose();

  const root = new T.Group();
  scene.add(root);

  // Материалы: верх детали — фото; бока — тёмно-зелёный металл; ободок — золото
  const photoMaterial = new T.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.08 });
  const sideMat = new T.MeshStandardMaterial({ color: 0x15372c, roughness: 0.32, metalness: 0.75 });
  const rimMat = new T.MeshStandardMaterial({ color: 0xd2ad69, roughness: 0.27, metalness: 0.85 });

  // ---- Модель ----
  const buffer = await (await fetch(modelUrl)).arrayBuffer();
  const view = new DataView(buffer);
  const length = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  const binStart = 20 + length + 8;

  const labelsLayer = document.createElement('div');
  labelsLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  container.append(labelsLayer);

  interface Piece {
    group: T.Group;
    center: T.Vector3;
    start: T.Vector3;
    rotation: T.Vector3;
    label: HTMLSpanElement;
    order: number;
    group_?: boolean; // деталь входит в «склеенную» группу (см. GROUPS ниже)
  }
  const pieces: Piece[] = [];
  const labelText = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(totalMln / 12) + ' млн ₽';

  for (let i = 0; i < doc.meshes.length; i++) {
    const model = doc.meshes[i];
    const group = new T.Group();
    const bounds = new T.Box3();
    let topCount = 0;
    for (const p of model.primitives) {
      const pos = getAccessor(doc, buffer, binStart, p.attributes.POSITION);
      for (let j = 0; j < pos.length; j += 3) bounds.expandByPoint(new T.Vector3(pos[j], pos[j + 1], pos[j + 2]));
    }
    const center = bounds.getCenter(new T.Vector3());
    for (const p of model.primitives) {
      const pos = getAccessor(doc, buffer, binStart, p.attributes.POSITION);
      const norm = getAccessor(doc, buffer, binStart, p.attributes.NORMAL);
      const indices = getAccessor(doc, buffer, binStart, p.indices);
      const arrays: number[][] = [[], [], []];
      const normals: number[][] = [[], [], []];
      const uvs: number[][] = [[], [], []];
      for (let j = 0; j < indices.length; j += 3) {
        const ids = [indices[j], indices[j + 1], indices[j + 2]];
        const isTop = ids.every((k) => norm[k * 3 + 2] > 0.85 && pos[k * 3 + 2] > 0.1);
        const type = isTop ? 0 : p.material === 1 ? 2 : 1;
        if (isTop) topCount++;
        for (const k of ids) {
          const x = pos[k * 3];
          const y = pos[k * 3 + 1];
          const z = pos[k * 3 + 2];
          arrays[type].push(x - center.x, y - center.y, z - center.z);
          normals[type].push(norm[k * 3], norm[k * 3 + 1], norm[k * 3 + 2]);
          uvs[type].push((x + 2.012) / 4.024, (y + 1.512) / 3.024);
        }
      }
      for (let type = 0; type < 3; type++) {
        if (!arrays[type].length) continue;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(arrays[type], 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(normals[type], 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uvs[type], 2));
        group.add(new T.Mesh(g, [photoMaterial, sideMat, rimMat][type]));
      }
    }
    if (!topCount) throw Error('No photo surface');
    root.add(group);

    const angle = i * 2.39996;
    const start = new T.Vector3(
      center.x * 1.6 + Math.cos(angle) * 0.6,
      center.y * 1.65 + Math.sin(angle) * 0.45,
      Math.sin(i * 1.8) * 1.1,
    );
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText =
      'position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;' +
      "font:400 14px/1 'Forum',serif;letter-spacing:.04em;color:#fff1d9;text-shadow:0 2px 8px rgba(0,0,0,.7);opacity:0;";
    labelsLayer.append(label);
    pieces.push({
      group,
      center,
      start,
      rotation: new T.Vector3(Math.sin(i * 2) * 0.45, Math.cos(i * 1.3) * 0.55, Math.sin(i * 3) * 0.28),
      label,
      order: [0, 5, 8, 3, 10, 1, 7, 11, 4, 9, 2, 6][i],
    });
  }

  // ---- «Склеенные» группы ----
  // По идее блока каждый инвестор приходит со своим куском бюджета, поэтому часть деталей в разобранном
  // состоянии уже лежит вместе (как в собранном пазле) и летит к картинке ОДНИМ телом: полоска из 3,
  // двойка и «уголок» из 3. Остальные 4 детали — одиночные. Сетка деталей 4×3, индексы по рядам снизу вверх:
  //   8  9  10 11   (верх)
  //   4  5  6  7
  //   0  1  2  3    (низ)
  const GROUPS = [
    [9, 10, 11], // полоска сверху справа
    [5, 6], // двойка в центре
    [7, 3, 2], // «уголок» справа снизу
  ];
  interface Group {
    members: Piece[];
    center: T.Vector3; // центр группы в собранном виде
    start: T.Vector3; // где группа лежит в разобранном виде
    rotation: T.Vector3;
    order: number;
    label: HTMLSpanElement; // одна подпись на группу: сумма всех её деталей
  }
  const groups: Group[] = GROUPS.map((ids, gi) => {
    const members = ids.map((id) => pieces[id]);
    const center = members.reduce((acc, m) => acc.add(m.center), new T.Vector3()).divideScalar(members.length);
    const angle = (gi + 3) * 2.1;
    const label = document.createElement('span');
    label.textContent =
      new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format((totalMln / 12) * members.length) + ' млн ₽';
    label.style.cssText = pieces[0].label.style.cssText;
    labelsLayer.append(label);
    members.forEach((m) => {
      m.group_ = true;
      m.label.remove(); // у деталей группы своей подписи нет
    });
    return {
      members,
      center,
      // группы разлетаются дальше одиночных деталей, чтобы не наезжать друг на друга
      start: new T.Vector3(center.x * 1.9 + Math.cos(angle) * 0.5, center.y * 1.9 + Math.sin(angle) * 0.4, 0.6 + gi * 0.4),
      rotation: new T.Vector3(0.22 * Math.sin(gi * 2.3 + 1), 0.3 * Math.cos(gi * 1.7), 0.16 * Math.sin(gi * 3.1)),
      order: Math.min(...members.map((m) => m.order)),
      label,
    };
  });

  // Целая картинка поверх собранного пазла (последние 6% прогресса)
  const finalMat = new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false });
  const whole = new T.Mesh(new T.PlaneGeometry(4.024, 3.024), finalMat);
  whole.position.z = 0.19;
  whole.renderOrder = 2;
  root.add(whole);

  // ---- Размер и раскладка ----
  // Контейнер с data-mode="bleed" (ПК): сцена на весь блок, пазл крупно СПРАВА (слева текст).
  // Контейнер с data-mode="box" (мобильный/планшет): отдельная область между текстом и счётчиком —
  // пазл по центру, камера подбирается так, чтобы разлетевшиеся детали влезали по ширине.
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    const tanHalf = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    if (container.dataset.mode === 'bleed') {
      // Пазл — в правой половине блока при ЛЮБОМ соотношении сторон: на узких окнах (1280×800) камера
      // отъезжает, чтобы разлёт деталей (~6 ед.) помещался в правые 48% ширины, а центр пазла
      // смещается на 23% видимой ширины вправо.
      const zFit = 6.0 / (2 * tanHalf * aspect * 0.48);
      camera.position.z = Math.max(9.6, zFit);
      const visW = 2 * tanHalf * camera.position.z * aspect;
      root.position.set(Math.max(1.95, 0.23 * visW), 0, 0);
    } else {
      // видимая ширина на расстоянии z = 2·tan(fov/2)·z·aspect; для разлёта деталей нужна ≈ 5.6 ед.
      const zWidth = 5.6 / (2 * tanHalf * aspect);
      const zHeight = 4.4 / (2 * tanHalf);
      zScatter = Math.max(zWidth, zHeight, 7);
      // Собранная картинка (4.02×3.02 ед.) должна занимать почти ВСЮ область — поля по бокам минимальные
      // (по правке дизайнера: раньше собиралась в маленькую картинку). Камера по мере сборки подъезжает.
      zAssembled = Math.max(4.1 / (2 * tanHalf * aspect), 3.1 / (2 * tanHalf));
      camera.position.z = zScatter; // дальше положение камеры по прогрессу выставляет draw()
      root.position.set(0, 0, 0);
    }
    camera.updateProjectionMatrix();
    draw(performance.now());
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ---- Состояние и отрисовка ----
  let target = 0;
  let displayed = 0;
  let zScatter = 0; // положение камеры мобильного режима: разлёт / собранная картинка
  let zAssembled = 0;
  let active = true;
  let raf = 0;
  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  if (!coarse) addEventListener('pointermove', onPointer, { passive: true });

  const v3 = new T.Vector3();
  function draw(time: number) {
    const p = displayed;
    const finish = smooth(0.88, 1, p);
    if (container.dataset.mode !== 'bleed' && zScatter) {
      camera.position.z = T.MathUtils.lerp(zScatter, zAssembled, smooth(0.35, 0.95, p));
    }
    // лёгкий параллакс от курсора, гаснет к финалу
    root.rotation.x = T.MathUtils.lerp(root.rotation.x, (-0.1 + pointer.y * 0.045) * (1 - finish), 0.06);
    root.rotation.y = T.MathUtils.lerp(root.rotation.y, (-0.12 + pointer.x * 0.065) * (1 - finish), 0.06);
    root.rotation.z = 0.025 * (1 - finish);
    finalMat.opacity = smooth(0.94, 1, p);
    whole.visible = p > 0.94;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const labelOpacity = String((1 - smooth(0.05, 0.32, p)) * 0.85);
    const placeLabel = (label: HTMLSpanElement, pos: T.Vector3) => {
      v3.copy(pos).project(camera);
      label.style.opacity = labelOpacity;
      label.style.left = (v3.x * 0.5 + 0.5) * w + 'px';
      label.style.top = (-v3.y * 0.5 + 0.5) * h + 'px';
    };
    // одиночные детали
    for (const piece of pieces) {
      if (piece.group_) continue;
      const k = smooth(piece.order * 0.045, 0.4 + piece.order * 0.045, p);
      piece.group.position.lerpVectors(piece.start, piece.center, k);
      if (!reducedMotion) piece.group.position.y += Math.sin(time * 0.0005 + piece.order) * 0.035 * (1 - k);
      piece.group.rotation.set(
        piece.rotation.x * (1 - k),
        piece.rotation.y * (1 - k),
        piece.rotation.z * (1 - k),
      );
      piece.group.visible = p < 0.999;
      piece.group.getWorldPosition(v3);
      placeLabel(piece.label, v3.clone());
    }
    // склеенные группы: каждая деталь = центр группы + повёрнутое смещение (группа жёсткая, швы не расходятся)
    for (const g of groups) {
      const k = smooth(g.order * 0.045, 0.4 + g.order * 0.045, p);
      const pivot = new T.Vector3().lerpVectors(g.start, g.center, k);
      if (!reducedMotion) pivot.y += Math.sin(time * 0.0005 + g.order) * 0.035 * (1 - k);
      const e = new T.Euler(g.rotation.x * (1 - k), g.rotation.y * (1 - k), g.rotation.z * (1 - k));
      for (const m of g.members) {
        m.group.position.copy(m.center).sub(g.center).applyEuler(e).add(pivot);
        m.group.rotation.copy(e);
        m.group.visible = p < 0.999;
      }
      placeLabel(g.label, pivot);
    }
    renderer.render(scene, camera);
  }

  function tick(time: number) {
    // плавно догоняем целевой прогресс (скролл)
    displayed += (target - displayed) * 0.12;
    if (Math.abs(target - displayed) < 0.0005) displayed = target;
    draw(time);
    raf = active ? requestAnimationFrame(tick) : 0;
  }

  resize();
  raf = requestAnimationFrame(tick);

  return {
    setProgress(p: number) {
      target = clamp(p, 0, 1);
    },
    setContainer(c: HTMLElement) {
      if (c === container) return;
      ro.unobserve(container);
      container = c;
      container.prepend(renderer.domElement);
      container.append(labelsLayer);
      ro.observe(container);
      resize();
    },
    setActive(a: boolean) {
      if (a === active) return;
      active = a;
      if (a && !raf) raf = requestAnimationFrame(tick);
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onPointer);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      labelsLayer.remove();
    },
  };
}
