import { getDocument, GlobalWorkerOptions } from "/vendor/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";

const dialog = document.getElementById("reader");
const title = document.getElementById("reader-title");
const detail = document.getElementById("reader-detail");
const pages = document.getElementById("reader-pages");
const meter = document.getElementById("reader-meter");
const download = document.getElementById("reader-download");
const closeButton = document.getElementById("reader-close");
const zoomOut = document.getElementById("reader-out");
const zoomFit = document.getElementById("reader-fit");
const zoomIn = document.getElementById("reader-in");
const previous = document.getElementById("reader-prev");
const next = document.getElementById("reader-next");
const sheet = document.getElementById("reader-sheet");
const canvas = document.getElementById("reader-canvas");
const fail = document.getElementById("reader-fail");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const allowed = /^\/documents\/[a-z0-9.-]+\.pdf$/i;

if (
  dialog instanceof HTMLDialogElement &&
  title instanceof HTMLElement &&
  detail instanceof HTMLElement &&
  pages instanceof HTMLElement &&
  meter instanceof HTMLElement &&
  download instanceof HTMLAnchorElement &&
  closeButton instanceof HTMLButtonElement &&
  zoomOut instanceof HTMLButtonElement &&
  zoomFit instanceof HTMLButtonElement &&
  zoomIn instanceof HTMLButtonElement &&
  previous instanceof HTMLButtonElement &&
  next instanceof HTMLButtonElement &&
  sheet instanceof HTMLElement &&
  canvas instanceof HTMLCanvasElement &&
  fail instanceof HTMLElement
) {
  const context = canvas.getContext("2d");
  let loadingTask = null;
  let pdf = null;
  let pageNum = 1;
  let token = 0;
  let renderTask = null;
  let rendering = false;
  let pending = null;
  const zoomSteps = [1, 1.4, 1.9, 2.6];
  let zoomIndex = 0;

  const paintZoom = () => {
    zoomOut.disabled = zoomIndex <= 0;
    zoomIn.disabled = zoomIndex >= zoomSteps.length - 1;
  };

  const fitScale = (page) => {
    const unscaled = page.getViewport({ scale: 1 });
    const box = sheet.getBoundingClientRect();
    const style = getComputedStyle(sheet);
    const maxWidth = Math.max(160, box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4);
    const maxHeight = Math.max(160, box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 4);
    return Math.min(maxWidth / unscaled.width, maxHeight / unscaled.height);
  };

  const paintMeter = (current, total) => {
    pages.textContent = `${current} / ${total}`;
    meter.style.transform = `scaleX(${total === 0 ? 0 : current / total})`;
    previous.disabled = current <= 1;
    next.disabled = current >= total;
  };

  const drop = async () => {
    const task = loadingTask;
    const doc = pdf;
    loadingTask = null;
    pdf = null;
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }
    try {
      await task?.destroy();
    } catch {
      /* already closed */
    }
    if (doc && doc !== task) {
      try {
        await doc.destroy();
      } catch {
        /* already closed */
      }
    }
  };

  const renderPage = (current) => {
    if (!pdf || !context || current !== token) return;
    if (rendering) {
      pending = current;
      if (renderTask) renderTask.cancel();
      return;
    }
    rendering = true;
    if (!reduce) sheet.classList.add("is-turning");
    pdf.getPage(pageNum).then((page) => {
      if (current !== token) {
        rendering = false;
        return;
      }
      const viewport = page.getViewport({ scale: fitScale(page) * zoomSteps[zoomIndex] });
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const transform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];
      renderTask = page.render({ canvasContext: context, transform, viewport });
      renderTask.promise.then(() => {
        rendering = false;
        sheet.classList.remove("is-turning");
        if (pending !== null && pending === token) {
          pending = null;
          renderPage(token);
        } else {
          pending = null;
        }
      }).catch((error) => {
        rendering = false;
        sheet.classList.remove("is-turning");
        if (error && error.name === "RenderingCancelledException") {
          if (pending !== null && pending === token) {
            pending = null;
            renderPage(token);
          }
          return;
        }
        if (current !== token) return;
        fail.hidden = false;
        canvas.hidden = true;
      });
      paintMeter(pageNum, pdf.numPages);
      paintZoom();
    }).catch(() => {
      rendering = false;
      if (current !== token) return;
      fail.hidden = false;
      canvas.hidden = true;
    });
  };

  const show = (num) => {
    if (!pdf) return;
    pageNum = Math.min(pdf.numPages, Math.max(1, num));
    sheet.scrollTop = 0;
    renderPage(token);
  };

  const open = (link) => {
    const href = link.getAttribute("href") || "";
    if (!allowed.test(href)) return;
    const current = ++token;
    const name = link.querySelector(".doc-title");
    const note = link.querySelector(".doc-detail");
    title.textContent = name ? name.textContent : "";
    detail.textContent = note ? note.textContent : "";
    download.href = href;
    const file = href.split("/").pop();
    if (file) download.setAttribute("download", file);
    fail.hidden = true;
    canvas.hidden = false;
    zoomIndex = 0;
    paintZoom();
    dialog.classList.add("is-loading");
    paintMeter(1, 1);
    if (!dialog.open) dialog.showModal();
    drop().then(() => {
      if (current !== token) return;
      const task = getDocument({ url: href });
      loadingTask = task;
      return task.promise;
    }).then((doc) => {
      if (!doc || current !== token) return;
      pdf = doc;
      pageNum = 1;
      dialog.classList.remove("is-loading");
      renderPage(current);
    }).catch(() => {
      if (current !== token) return;
      dialog.classList.remove("is-loading");
      fail.hidden = false;
      canvas.hidden = true;
      paintMeter(0, 0);
    });
  };

  for (const link of document.querySelectorAll(".docs a")) {
    link.addEventListener("click", (event) => {
      if (!(event instanceof MouseEvent) || !(link instanceof HTMLAnchorElement)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(link);
    });
  }

  zoomOut.addEventListener("click", () => {
    if (zoomIndex <= 0) return;
    zoomIndex -= 1;
    renderPage(token);
  });
  zoomIn.addEventListener("click", () => {
    if (zoomIndex >= zoomSteps.length - 1) return;
    zoomIndex += 1;
    renderPage(token);
  });
  zoomFit.addEventListener("click", () => {
    zoomIndex = 0;
    sheet.scrollTop = 0;
    sheet.scrollLeft = 0;
    renderPage(token);
  });
  previous.addEventListener("click", () => show(pageNum - 1));
  next.addEventListener("click", () => show(pageNum + 1));
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    token += 1;
    dialog.classList.remove("is-loading");
    drop();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(pageNum - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(pageNum + 1);
    }
  });

  let touchX = 0;
  let touchY = 0;
  let touchTop = 0;
  sheet.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchX = touch.clientX;
    touchY = touch.clientY;
    touchTop = sheet.scrollTop;
  }, { passive: true });
  sheet.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchX;
    const dy = touch.clientY - touchY;
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      show(dx < 0 ? pageNum + 1 : pageNum - 1);
      return;
    }
    if (dy > 110 && touchTop === 0 && sheet.scrollTop === 0 && Math.abs(dx) < 60) dialog.close();
  }, { passive: true });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    if (!dialog.open) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderPage(token), 120);
  });
}
