(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- The name fills the line. ---------- */

  const name = document.getElementById("name");
  /* Width of the text alone at 100px: shrink the box to its content, measure, let go. */
  const inkWidth = (node) => {
    node.style.fontSize = "100px";
    node.style.width = "max-content";
    const width = node.offsetWidth || 1;
    node.style.width = "";
    return width;
  };
  const fitName = () => {
    if (!(name instanceof HTMLElement)) return;
    const parts = [...name.querySelectorAll(":scope > span")].filter((part) => part instanceof HTMLElement);
    const stacked = parts.length > 1 && getComputedStyle(parts[1]).display === "block";
    name.style.fontSize = "";
    for (const part of parts) part.style.fontSize = "";
    const available = name.clientWidth;
    if (available <= 0) return;
    if (stacked) {
      for (const part of parts) {
        const width = inkWidth(part);
        part.style.fontSize = `${Math.floor(100 * (available / width) * 0.985)}px`;
      }
      return;
    }
    const width = inkWidth(name);
    name.style.fontSize = `${Math.floor(100 * (available / width) * 0.985)}px`;
  };

  /* ---------- Chapters rise once. ---------- */

  const chapters = document.querySelectorAll("section.chapter");
  if ("IntersectionObserver" in window) {
    if (!reduce) for (const node of chapters) node.classList.add("rise");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    for (const node of chapters) observer.observe(node);
  } else {
    for (const node of chapters) node.classList.add("in");
  }

  /* ---------- Reading route ---------- */

  const route = document.getElementById("route");
  const routeFill = document.getElementById("route-fill");
  const railNow = document.getElementById("rail-now");
  const railLabel = document.getElementById("rail-now-label");
  const railPct = document.getElementById("rail-now-pct");
  const railMeta = document.getElementById("rail-now-meta");
  const routeSeen = document.getElementById("route-seen");
  const routeTotal = document.getElementById("route-total");
  const routeCount = document.getElementById("route-count");
  const stopIds = ["work", "projects", "education", "documents"];
  const routeKey = "prause-route";

  if (!(route instanceof HTMLElement) || !(routeFill instanceof HTMLElement)) {
    fitName();
    window.addEventListener("resize", fitName);
    return;
  }

  const collected = new Set();
  const opened = new Set();

  const shown = () => stopIds.filter((id) => {
    const section = document.getElementById(id);
    return section instanceof HTMLElement && section.offsetParent !== null;
  });

  const tally = () => {
    const visible = shown();
    const seen = visible.filter((id) => collected.has(id)).length;
    if (routeSeen instanceof HTMLElement) routeSeen.textContent = String(seen);
    if (routeTotal instanceof HTMLElement) routeTotal.textContent = String(visible.length);
    const done = visible.length > 0 && seen === visible.length;
    if (routeCount instanceof HTMLElement) routeCount.classList.toggle("is-done", done);
    window.dispatchEvent(new CustomEvent("prause:route", { detail: { seen, total: visible.length, done } }));
  };

  const readRoute = () => {
    try {
      const raw = sessionStorage.getItem(routeKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      if (Array.isArray(saved.stops)) {
        for (const id of saved.stops) if (stopIds.includes(id)) collected.add(id);
      }
      if (Array.isArray(saved.docs)) {
        for (const href of saved.docs) if (typeof href === "string") opened.add(href);
      }
    } catch {
      sessionStorage.removeItem(routeKey);
    }
  };

  const writeRoute = () => {
    try {
      sessionStorage.setItem(routeKey, JSON.stringify({ stops: [...collected], docs: [...opened] }));
    } catch {
      /* private mode can refuse storage */
    }
  };

  const markStop = (id, fresh) => {
    if (!stopIds.includes(id) || collected.has(id)) return;
    collected.add(id);
    for (const node of document.querySelectorAll(`[data-stop="${id}"]`)) {
      node.classList.add("got");
      if (fresh) node.classList.add("fresh");
    }
    tally();
    writeRoute();
  };

  const markDoc = (link, fresh) => {
    if (!(link instanceof HTMLAnchorElement)) return;
    opened.add(link.getAttribute("href") || "");
    link.classList.add("stamped");
    if (fresh) link.classList.add("fresh");
    writeRoute();
  };

  readRoute();
  for (const id of collected) {
    for (const node of document.querySelectorAll(`[data-stop="${id}"]`)) node.classList.add("got");
  }
  tally();
  for (const link of document.querySelectorAll(".docs a")) {
    if (link instanceof HTMLAnchorElement && opened.has(link.getAttribute("href") || "")) link.classList.add("stamped");
  }

  /* Words per minute for the "time left" line; counts only what the current depth shows. */
  const WPM = 220;
  const wordCache = new WeakMap();
  const wordsOf = (node) => {
    let count = wordCache.get(node);
    if (count === undefined) {
      count = (node.textContent || "").trim().split(/\s+/).filter(Boolean).length;
      wordCache.set(node, count);
    }
    return count;
  };
  const wordsLeft = (readLine) => {
    let words = 0;
    for (const node of document.querySelectorAll("main p, main li")) {
      if (!(node instanceof HTMLElement) || node.offsetParent === null) continue;
      if (node.getBoundingClientRect().bottom <= readLine) continue;
      words += wordsOf(node);
    }
    return words;
  };

  let currentId = "";
  let lateFlag = false;
  let endFlag = false;

  /* Which section the reading line is in. The guide and the label follow this. */
  const locate = () => {
    const ids = shown();
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const y = window.scrollY;
    const atEnd = max <= 0 || y / max >= 0.98;
    const read = window.innerHeight * 0.38;
    const hero = document.querySelector("section.hero");
    const list = [hero, ...ids.map((id) => document.getElementById(id))].filter((node) => node instanceof HTMLElement);
    let best = list[0] || null;
    for (const node of list) {
      if (node.getBoundingClientRect().top <= read) best = node;
    }
    if (atEnd && list.length) best = list[list.length - 1];
    if (!best) return { id: "intro", within: 0, atEnd };
    const box = best.getBoundingClientRect();
    const within = atEnd || box.height <= 0 ? (atEnd ? 1 : 0) : Math.min(1, Math.max(0, (read - box.top) / box.height));
    return { id: best.classList.contains("hero") ? "intro" : best.id, within, atEnd };
  };

  /* 10 s and 10 min are the budgets of the depth dial. "All" falls back to a word count. */
  const budgetSeconds = () => {
    const depth = document.documentElement.dataset.depth;
    if (depth === "brief") return 10;
    if (depth === "mid") return 600;
    return null;
  };

  const timeLeft = (ratio, readLine) => {
    if (!(railNow instanceof HTMLElement)) return "";
    if (ratio >= 0.98) return "";
    const budget = budgetSeconds();
    if (budget === null) {
      const minutes = Math.ceil(wordsLeft(readLine) / WPM);
      return minutes < 1 ? railNow.dataset.under || "" : (railNow.dataset.left || "").replace("{n}", String(minutes));
    }
    const seconds = Math.ceil(budget * (1 - ratio));
    if (seconds < 1) return budget < 60 ? railNow.dataset.underSec || "" : railNow.dataset.under || "";
    if (seconds < 60) return (railNow.dataset.leftSec || "").replace("{n}", String(seconds));
    return (railNow.dataset.left || "").replace("{n}", String(Math.ceil(seconds / 60)));
  };

  const paintRail = (ratio, place, readLine) => {
    if (!(railNow instanceof HTMLElement) || !(railLabel instanceof HTMLElement) || !(railMeta instanceof HTMLElement)) return;
    const link = place.id === "intro" ? null : document.querySelector(`.stops a[data-stop="${place.id}"] .stop-label`);
    const label = link instanceof HTMLElement ? link.textContent || "" : "";
    railLabel.textContent = ratio >= 0.98
      ? railNow.dataset.done || ""
      : label
        ? `${railNow.dataset.reading || ""} ${label}`.trim()
        : railNow.dataset.start || "";
    if (railPct instanceof HTMLElement) railPct.textContent = `${Math.round(ratio * 100)}%`;
    railMeta.textContent = timeLeft(ratio, readLine);
    railNow.classList.toggle("is-done", ratio >= 0.98);
  };

  /* Each stop's bar: passed is full, the active one tracks the reading line, ahead is empty. */
  const paintStops = (place) => {
    const order = ["intro", ...shown()];
    const at = order.indexOf(place.id);
    for (const link of document.querySelectorAll(".stops a[data-stop]")) {
      if (!(link instanceof HTMLElement)) continue;
      const id = link.dataset.stop || "";
      const active = id === place.id;
      link.classList.toggle("is-now", active);
      const index = order.indexOf(id);
      const fill = active ? place.within : index >= 0 && index < at ? 1 : 0;
      link.style.setProperty("--w", String(fill));
    }
  };

  /* The entry under the reading line steps forward. Passed entries settle back. */
  const paintContent = (readLine) => {
    const blocks = document.querySelectorAll("main .role, main .docs li");
    for (const block of blocks) {
      if (!(block instanceof HTMLElement) || block.offsetParent === null) continue;
      const box = block.getBoundingClientRect();
      let focus = 0;
      let dim = 0;
      if (box.height > 0 && box.top < readLine && box.bottom > readLine) {
        const through = (readLine - box.top) / box.height;
        focus = Math.sin(Math.min(1, Math.max(0, through)) * Math.PI);
      } else if (box.bottom <= readLine) {
        dim = 0.3;
      } else {
        dim = 0.08;
      }
      block.style.setProperty("--focus", focus.toFixed(3));
      block.style.setProperty("--dim", String(dim));
      block.classList.toggle("is-hot", focus > 0.08);
    }
  };

  const paintRoute = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / max));
    routeFill.style.setProperty("--p", String(ratio));
    route.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    const line = window.innerHeight * 0.62;
    for (const id of shown()) {
      const section = document.getElementById(id);
      if (ratio >= 0.98 || (section instanceof HTMLElement && section.getBoundingClientRect().top < line)) markStop(id, true);
    }
    const readLine = window.innerHeight * 0.38;
    const place = locate();
    paintRail(ratio, place, readLine);
    paintStops(place);
    paintContent(readLine);
    const late = place.within >= 0.55;
    if (place.id !== currentId || late !== lateFlag || place.atEnd !== endFlag) {
      currentId = place.id;
      lateFlag = late;
      endFlag = place.atEnd;
      window.dispatchEvent(new CustomEvent("prause:section", { detail: { id: place.id, within: place.within, late, end: place.atEnd } }));
    }
  };

  for (const link of document.querySelectorAll(".docs a")) {
    link.addEventListener("click", () => markDoc(link, true));
  }

  let frame = 0;
  const paintSoon = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paintRoute();
    });
  };

  /* The stop row scrolls on narrow screens; tell the CSS whether more is to the right. */
  const stops = document.getElementById("stops");
  const nav = stops instanceof HTMLElement ? stops.closest("nav") : null;
  const markStops = () => {
    if (!(stops instanceof HTMLElement) || !(nav instanceof HTMLElement)) return;
    const more = stops.scrollWidth - stops.clientWidth - stops.scrollLeft > 4;
    nav.style.setProperty("--stops-more", more ? "1" : "0");
  };
  if (stops instanceof HTMLElement) stops.addEventListener("scroll", markStops, { passive: true });

  const relayout = () => {
    fitName();
    paintRoute();
    markStops();
    requestAnimationFrame(markStops);
  };

  relayout();
  window.addEventListener("scroll", paintSoon, { passive: true });
  window.addEventListener("resize", relayout);
  window.addEventListener("prause:depth", () => {
    tally();
    relayout();
  });
  if (document.fonts) document.fonts.ready.then(relayout).catch(() => {});
  /* Late listeners (the guide loads after this file) ask for the current section once. */
  window.addEventListener("prause:resync", () => {
    currentId = "";
    tally();
    paintRoute();
  });
})();
