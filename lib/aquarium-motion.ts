export type AquariumMotionFish = { id: string; type: string; element: HTMLElement };
type Swimmer = AquariumMotionFish & { visual: HTMLElement; x: number; y: number; vx: number; vy: number; facing: number; tilt: number; phase: number; speed: number; biteUntil: number; call: { x: number; y: number; until: number } | null };
type Pellet = { element: HTMLElement; delay: number; x: number; y: number; eaten: boolean; phase: number };
type Meal = { studentId: string; elapsed: number; x: number; side: number; pellets: Pellet[]; finishAt: number | null };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Owns only transforms and temporary food nodes. React keeps ownership of fish cards. */
export function createAquariumMotion(school: HTMLElement, foodLayer: HTMLElement) {
  let swimmers: Swimmer[] = [];
  let meals: Meal[] = [];
  let width = 0, height = 0, time = 0, lastFrame = 0, frame = 0;
  let destroyed = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const position = (fish: Swimmer) => {
    fish.element.style.transform = `translate3d(${fish.x.toFixed(2)}px,${fish.y.toFixed(2)}px,0)`;
    const bob = reduced.matches ? 0 : Math.sin(time * 2.1 + fish.phase) * 1.4;
    fish.visual.style.transform = `translateY(${bob.toFixed(2)}px) rotate(${fish.tilt.toFixed(2)}deg) scaleX(${fish.facing.toFixed(3)})`;
  };
  const measure = () => {
    width = Math.max(0, school.clientWidth - 96);
    height = Math.max(0, school.clientHeight - 88);
    swimmers.forEach((fish) => { fish.x = clamp(fish.x, 0, width); fish.y = clamp(fish.y, 0, height); position(fish); });
    meals.forEach((meal) => { meal.x = clamp(meal.x, 24, width + 72); });
  };
  const finish = (meal: Meal) => {
    swimmers.find((fish) => fish.id === meal.studentId)?.element.classList.remove('aq-feeding');
    meal.pellets.forEach((pellet) => pellet.element.remove());
    meals = meals.filter((item) => item !== meal);
  };
  const animate = (stamp: number) => {
    if (destroyed) return;
    const delta = lastFrame ? Math.min((stamp - lastFrame) / 1000, .05) : 0;
    lastFrame = stamp;
    time += delta;
    for (const meal of meals) {
      meal.elapsed += delta;
      for (const pellet of meal.pellets) {
        const age = meal.elapsed - pellet.delay;
        pellet.y = clamp(age * (reduced.matches ? 38 : 22) - 5, -5, height + 32);
        pellet.x = clamp(meal.x + Math.sin(age * 1.55 + pellet.phase) * 5 + Math.sin(age * .8) * 3, 18, width + 78);
        pellet.element.style.opacity = age >= 0 && !pellet.eaten ? '1' : '0';
        pellet.element.style.transform = `translate3d(${pellet.x.toFixed(2)}px,${pellet.y.toFixed(2)}px,0) rotate(${(age * 26).toFixed(1)}deg)`;
      }
    }
    for (const fish of swimmers) {
      const meal = meals.find((item) => item.studentId === fish.id);
      const food = meal?.pellets.find((pellet) => !pellet.eaten && meal.elapsed >= pellet.delay);
      if (fish.call && fish.call.until < time) fish.call = null;
      let desiredX = 0, desiredY = 0;
      if (meal && food || fish.call) {
        const tx = meal && food ? clamp(food.x - (meal.side > 0 ? 76 : 18), 0, width) : fish.call!.x;
        const ty = meal && food ? clamp(food.y - 30, 0, height) : fish.call!.y;
        const dx = tx - fish.x, dy = ty - fish.y, distance = Math.hypot(dx, dy);
        const speed = Math.min(meal ? 76 : 58, distance * 2.8);
        desiredX = distance > .1 ? dx / distance * speed : 0;
        desiredY = distance > .1 ? dy / distance * speed : 0;
        if (meal && food) desiredY += 16;
      } else {
        const rhythm = fish.type === 'round' ? .14 : fish.type === 'striped' ? .19 : .17;
        const angle = fish.phase + time * rhythm + Math.sin(time * .12 + fish.phase) * .8;
        const pace = fish.speed * (fish.type === 'round' ? .78 : 1) * (1 + Math.sin(time * .7 + fish.phase) * .12);
        desiredX = Math.cos(angle) * pace;
        desiredY = Math.sin(angle * .8 + fish.phase) * pace * .48;
        const marginX = Math.min(65, width * .35);
        desiredX += Math.max(0, marginX - fish.x) * .65 - Math.max(0, fish.x - (width - marginX)) * .65;
        desiredY += Math.max(0, 42 - fish.y) * .7 - Math.max(0, fish.y - (height - 42)) * .7;
      }
      if (!reduced.matches) for (const other of swimmers) {
        if (fish === other) continue;
        const dx = fish.x - other.x, dy = fish.y - other.y, spacing = Math.hypot(dx / 88, dy / 104);
        if (spacing < 1.18 && spacing > .001) {
          const force = (1.18 - spacing) * (meal || fish.call ? 12 : 115);
          desiredX += dx / (spacing * 88) * force;
          desiredY += dy / (spacing * 104) * force;
        }
      }
      if (!reduced.matches || meal && food || fish.call) {
        const ease = 1 - Math.exp(-delta * (meal || fish.call ? 3.5 : 1.6));
        fish.vx += (desiredX - fish.vx) * ease; fish.vy += (desiredY - fish.vy) * ease;
        if (reduced.matches) {
          fish.x = meal && food ? clamp(food.x - (meal.side > 0 ? 76 : 18), 0, width) : fish.call!.x;
          fish.y = meal && food ? clamp(food.y - 30, 0, height) : fish.call!.y;
          fish.facing = meal ? meal.side : fish.facing; fish.tilt = 0;
        } else {
          fish.x = clamp(fish.x + fish.vx * delta, 0, width); fish.y = clamp(fish.y + fish.vy * delta, 0, height);
          const direction = meal && food ? meal.side : Math.abs(fish.vx) > 3 ? Math.sign(fish.vx) : Math.sign(fish.facing) || 1;
          fish.facing += (direction - fish.facing) * (1 - Math.exp(-delta * 5));
          const tilt = clamp(fish.vy * .32, -12, 12) * (fish.facing >= 0 ? 1 : -1);
          fish.tilt += (tilt - fish.tilt) * (1 - Math.exp(-delta * 2.4));
        }
        position(fish);
      }
      fish.element.classList.toggle('aq-eating', time < fish.biteUntil);
      if (meal && food && meal.elapsed - food.delay > (reduced.matches ? .3 : 1.65) && time >= fish.biteUntil) {
        if (Math.hypot(fish.x + (meal.side > 0 ? 76 : 18) - food.x, fish.y + 30 - food.y) < 16 && Math.abs(fish.facing - meal.side) < .18) {
          food.eaten = true; food.element.style.opacity = '0'; fish.biteUntil = time + .34; fish.element.classList.add('aq-eating');
          if (meal.pellets.every((pellet) => pellet.eaten)) meal.finishAt = meal.elapsed + .48;
        }
      }
    }
    [...meals].forEach((meal) => { if (meal.finishAt !== null && meal.elapsed >= meal.finishAt) finish(meal); });
    frame = requestAnimationFrame(animate);
  };
  const visibility = () => { cancelAnimationFrame(frame); lastFrame = 0; if (!document.hidden && !destroyed) frame = requestAnimationFrame(animate); };
  const observer = new ResizeObserver(measure);
  observer.observe(school); document.addEventListener('visibilitychange', visibility); visibility();
  return {
    sync(entries: AquariumMotionFish[]) {
      measure();
      const columns = Math.max(1, Math.min(5, Math.floor(school.clientWidth / 96)));
      const rows = Math.max(1, Math.ceil(entries.length / columns));
      const old = new Map(swimmers.map((fish) => [fish.id, fish]));
      swimmers = entries.map((entry, index) => {
        const existing = old.get(entry.id);
        if (existing && existing.element === entry.element) { existing.type = entry.type; return existing; }
        const facing = index % 2 ? -1 : 1;
        const fish: Swimmer = { ...entry, visual: entry.element.querySelector<HTMLElement>('.aq-fish-visual')!, x: index % columns / Math.max(1, columns - 1) * width,
          y: (Math.floor(index / columns) + .4) / rows * height, vx: facing * 10, vy: 0, facing, tilt: 0, phase: index * 2.399, speed: 20 + index % 4 * 3, biteUntil: 0, call: null };
        fish.visual.style.setProperty('--tail-delay', `${-index * .23}s`); position(fish); return fish;
      });
      [...meals].forEach((meal) => { if (!swimmers.some((fish) => fish.id === meal.studentId)) finish(meal); });
    },
    reward(studentId: string, points: number) {
      const fish = swimmers.find((item) => item.id === studentId); if (!fish || !Number.isFinite(points) || points < 1) return;
      let meal = meals.find((item) => item.studentId === studentId);
      if (!meal) {
        const x = clamp(fish.x + 48 + fish.facing * 65, 24, width + 72);
        let side = x >= fish.x + 48 ? 1 : -1;
        if (x < 76) side = -1; if (x > width + 18) side = 1;
        meal = { studentId, elapsed: 0, x, side, pellets: [], finishAt: null }; meals.push(meal);
      }
      meal.finishAt = null;
      const count = Math.min(10, Math.floor(points), Math.max(1, 18 - meal.pellets.filter((pellet) => !pellet.eaten).length));
      for (let index = 0; index < count; index++) {
        const element = document.createElement('span'); element.className = 'aq-food'; element.style.opacity = '0'; foodLayer.append(element);
        meal.pellets.push({ element, delay: meal.elapsed + index * .55, x: meal.x, y: -5, eaten: false, phase: meal.pellets.length * 1.7 });
      }
      fish.element.classList.add('aq-feeding');
    },
    call(studentId: string, x: number, y: number) {
      const fish = swimmers.find((item) => item.id === studentId); if (!fish) return;
      fish.call = { x: clamp(x - 48, 0, width), y: clamp(y - 35, 0, height), until: time + 30 };
      if (reduced.matches) { fish.x = fish.call.x; fish.y = fish.call.y; position(fish); }
    },
    destroy() { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); meals.forEach((meal) => meal.pellets.forEach((pellet) => pellet.element.remove())); meals = []; swimmers = []; },
  };
}
