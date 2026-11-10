const root = document.documentElement;
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Theme ---------- */

// The bar is navy in both themes, so the browser chrome follows it.
const themeColors = { light: "#0b1020", dark: "#10162e" };
const themeButton = document.querySelector("[data-theme-toggle]");
const themeMeta = document.querySelector('meta[name="theme-color"]');

function showTheme(theme) {
  root.dataset.theme = theme;
  if (themeMeta) themeMeta.content = themeColors[theme];
  if (themeButton) themeButton.setAttribute("aria-pressed", String(theme === "dark"));
}

showTheme(root.dataset.theme === "dark" ? "dark" : "light");

if (themeButton) {
  themeButton.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    showTheme(theme);
    try {
      localStorage.setItem("prause-theme", theme);
    } catch {
      // Private mode: the choice just lasts for this page.
    }
  });
}

/* ---------- Menu on small screens ---------- */

const bar = document.querySelector(".top");
const menuButton = document.querySelector(".menu-btn");

function setMenu(open) {
  bar.classList.toggle("is-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
}

if (bar && menuButton) {
  menuButton.addEventListener("click", () => setMenu(!bar.classList.contains("is-open")));
  bar.addEventListener("click", (event) => {
    if (event.target.closest(".top-nav a")) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !bar.classList.contains("is-open")) return;
    setMenu(false);
    menuButton.focus();
  });
}

/* ---------- The bar marks the section you are reading ---------- */

const stops = [...document.querySelectorAll('.top-nav a[href^="#"]')]
  .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
  .filter((stop) => stop.section);

if (stops.length) {
  let queued = false;

  function markStop() {
    queued = false;
    const line = window.innerHeight * 0.35;
    let here = null;
    for (const stop of stops) {
      if (stop.section.getBoundingClientRect().top <= line) here = stop;
    }
    for (const stop of stops) {
      const on = stop === here;
      stop.link.classList.toggle("is-here", on);
      if (on) stop.link.setAttribute("aria-current", "true");
      else stop.link.removeAttribute("aria-current");
    }
  }

  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(markStop);
    },
    { passive: true },
  );
  markStop();
}

/* ---------- Sections fade in as they scroll into view ---------- */

const reveals = [...document.querySelectorAll("[data-reveal]")];

if (!still && "IntersectionObserver" in window) {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("is-waiting");
        entry.target.classList.add("is-in");
        seen.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );

  for (const element of reveals) {
    // What is already on screen stays put, so nothing flashes on load.
    if (element.getBoundingClientRect().top < window.innerHeight) continue;
    element.classList.add("is-waiting");
    seen.observe(element);
  }
}

/* ---------- Workflow player ---------- */

const SVG = "http://www.w3.org/2000/svg";
// Node 3 hands over to both results.
const links = [[0, 1], [1, 2], [2, 3], [2, 4]];
const time = { node: 850, wire: 650, hold: 3200 };
const flowTime = time.node * 4 + time.wire * 3 + time.hold;

function setUpFlows(host) {
  const tabs = [...host.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
  const stage = host.querySelector(".flow-stage");
  const wires = host.querySelector(".flow-wires");
  const paths = links.map(() => wires.appendChild(document.createElementNS(SVG, "path")));
  const dots = links.map(() => {
    const dot = wires.appendChild(document.createElementNS(SVG, "circle"));
    dot.setAttribute("r", "5");
    dot.setAttribute("visibility", "hidden");
    return dot;
  });

  let current = 0;
  let run = 0;
  let visible = false;

  host.style.setProperty("--flow-time", `${flowTime}ms`);

  const nodesOf = (index) => [...panels[index].querySelectorAll(".node")];

  function draw() {
    const frame = stage.getBoundingClientRect();
    if (!frame.width) return;
    wires.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
    const boxes = nodesOf(current).map((node) => {
      const box = node.getBoundingClientRect();
      // Offsets ignore the lift of a running node, so wires stay attached to its resting place.
      const lift = node.classList.contains("is-run") ? 3 : 0;
      return {
        left: box.left - frame.left,
        right: box.right - frame.left,
        top: box.top - frame.top + lift,
        bottom: box.bottom - frame.top + lift,
      };
    });

    links.forEach(([from, to], index) => {
      const a = boxes[from];
      const b = boxes[to];
      if (!a || !b) return;
      let d;
      if (b.left >= a.right - 1) {
        const y1 = (a.top + a.bottom) / 2;
        const y2 = (b.top + b.bottom) / 2;
        const bend = (b.left - a.right) / 2;
        d = `M${a.right},${y1} C${a.right + bend},${y1} ${b.left - bend},${y2} ${b.left},${y2}`;
      } else {
        const x = (b.left + b.right) / 2;
        d = `M${x},${a.bottom} L${x},${b.top}`;
      }
      paths[index].setAttribute("d", d);
    });
  }

  function clear() {
    for (const panel of panels) {
      for (const node of panel.querySelectorAll(".node")) node.classList.remove("is-run", "is-done");
    }
    for (const path of paths) path.classList.remove("is-run", "is-done");
    for (const dot of dots) dot.setAttribute("visibility", "hidden");
    for (const tab of tabs) tab.classList.remove("is-playing");
  }

  function finish() {
    for (const node of nodesOf(current)) node.classList.add("is-done");
    for (const path of paths) path.classList.add("is-done");
  }

  function select(index) {
    current = index;
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    // On phones the tab row scrolls sideways; keep the playing tab in view.
    const strip = tabs[index].parentElement;
    strip.scrollLeft = tabs[index].offsetLeft - (strip.clientWidth - tabs[index].offsetWidth) / 2;
    clear();
    draw();
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Sends a dot along the wires; resolves when it has arrived.
  function travel(indexes, token) {
    for (const index of indexes) paths[index].classList.add("is-run");
    return new Promise((resolve) => {
      const start = performance.now();
      function frame(now) {
        if (token !== run) return resolve();
        const t = Math.min((now - start) / time.wire, 1);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        for (const index of indexes) {
          const path = paths[index];
          const point = path.getPointAtLength(path.getTotalLength() * eased);
          dots[index].setAttribute("cx", point.x);
          dots[index].setAttribute("cy", point.y);
          dots[index].setAttribute("visibility", "visible");
        }
        if (t < 1) return requestAnimationFrame(frame);
        for (const index of indexes) {
          dots[index].setAttribute("visibility", "hidden");
          paths[index].classList.replace("is-run", "is-done");
        }
        resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function work(nodes, token) {
    for (const node of nodes) node.classList.add("is-run");
    await wait(time.node);
    if (token !== run) return;
    for (const node of nodes) node.classList.replace("is-run", "is-done");
  }

  async function play(index) {
    const token = ++run;
    select(index);
    host.classList.add("is-live");
    // Restart the tab's progress bar even when the same tab plays again.
    void tabs[index].offsetWidth;
    tabs[index].classList.add("is-playing");

    const nodes = nodesOf(index);
    const script = [
      () => work([nodes[0]], token),
      () => travel([0], token),
      () => work([nodes[1]], token),
      () => travel([1], token),
      () => work([nodes[2]], token),
      () => travel([2, 3], token),
      () => work([nodes[3], nodes[4]], token),
      () => wait(time.hold),
    ];
    for (const step of script) {
      await step();
      if (token !== run) return;
    }
    play((index + 1) % tabs.length);
  }

  function show(index) {
    if (still || !visible) {
      run += 1;
      select(index);
      host.classList.remove("is-live");
      finish();
      return;
    }
    play(index);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => show(index));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (index + step + tabs.length) % tabs.length;
      tabs[next].focus();
      show(next);
    });
  });

  new ResizeObserver(draw).observe(stage);
  if (document.fonts) document.fonts.ready.then(draw);

  select(0);
  finish();
  if (still) return;

  // Only play while someone can see it.
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      if (visible) play(current);
      else run += 1;
    },
    { threshold: 0.25 },
  ).observe(stage);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      visible = false;
      run += 1;
      return;
    }
    const box = stage.getBoundingClientRect();
    visible = box.bottom > 0 && box.top < window.innerHeight;
    if (visible) play(current);
  });
}

for (const host of document.querySelectorAll("[data-flows]")) setUpFlows(host);
