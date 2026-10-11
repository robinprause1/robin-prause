import { getDocument, GlobalWorkerOptions } from "/vendor/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";

/*
 * The shelf: every document link carries a canvas. When a sheet scrolls into
 * view, the first page of its PDF is drawn onto it — one at a time, so twelve
 * files do not fight for the worker.
 */

const allowed = /^\/documents\/[a-z0-9.-]+\.pdf$/i;
const links = [...document.querySelectorAll(".docs a[href]")].filter(
  (link) => link instanceof HTMLAnchorElement && allowed.test(link.getAttribute("href") || ""),
);

/** @type {HTMLAnchorElement[]} */
const queue = [];
const queued = new WeakSet();
let busy = false;

const drawNext = async () => {
  if (busy) return;
  const link = queue.shift();
  if (!link) return;
  busy = true;
  try {
    await draw(link);
  } catch {
    /* the sheet keeps its paper placeholder */
  } finally {
    busy = false;
    if (queue.length) drawNext();
  }
};

const draw = async (link) => {
  const canvas = link.querySelector("canvas.doc-thumb");
  const sheet = link.querySelector(".doc-sheet");
  if (!(canvas instanceof HTMLCanvasElement) || !(sheet instanceof HTMLElement)) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const href = link.getAttribute("href") || "";
  const task = getDocument({ url: href });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const targetWidth = Math.max(120, sheet.clientWidth);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const scale = (targetWidth / unscaled.width) * ratio;
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    link.classList.add("is-ready");
  } finally {
    await pdf.destroy().catch(() => {});
  }
};

const enqueue = (link) => {
  if (!(link instanceof HTMLAnchorElement) || queued.has(link)) return;
  queued.add(link);
  queue.push(link);
  drawNext();
};

if (links.length && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        enqueue(entry.target);
      }
    },
    { rootMargin: "240px 0px" },
  );
  for (const link of links) observer.observe(link);
} else {
  for (const link of links) enqueue(link);
}
