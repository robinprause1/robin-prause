(() => {
  const guide = document.getElementById("guide");
  const text = document.getElementById("guide-text");
  const hide = document.getElementById("guide-hide");
  if (!(guide instanceof HTMLElement) || !(text instanceof HTMLElement) || !(hide instanceof HTMLElement)) return;

  const key = "prause-guide";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mail = "mail@robin-prause.de";
  let current = "intro";
  let late = false;
  let end = false;
  let done = false;
  let shownText = "";
  let swap = 0;

  try {
    if (sessionStorage.getItem(key) === "off") {
      guide.hidden = true;
      return;
    }
  } catch {
    /* storage can be off */
  }

  /* One line per section, a second one once the reader is past the middle of it. */
  const message = () => {
    const depth = document.documentElement.dataset.depth;
    if (done && (current === "questions" || end)) return { text: guide.dataset.done || "", link: true };
    if (current === "intro" && depth === "brief") return { text: guide.dataset.brief || "", link: false };
    const lateText = late ? guide.dataset[`${current}Late`] : "";
    return { text: lateText || guide.dataset[current] || "", link: false };
  };

  const paint = () => {
    const next = message();
    const stamp = `${next.text}|${next.link}`;
    if (stamp === shownText) return;
    shownText = stamp;
    const apply = () => {
      text.textContent = next.text;
      if (next.link) {
        text.append(" ");
        const anchor = document.createElement("a");
        anchor.href = `mailto:${mail}`;
        anchor.textContent = mail;
        text.append(anchor);
      }
      guide.classList.remove("is-swapping");
    };
    window.clearTimeout(swap);
    if (reduce) {
      apply();
      return;
    }
    guide.classList.add("is-swapping");
    swap = window.setTimeout(apply, 180);
  };

  hide.addEventListener("click", () => {
    guide.hidden = true;
    try {
      sessionStorage.setItem(key, "off");
    } catch {
      /* storage can be off */
    }
  });

  window.addEventListener("prause:route", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    done = Boolean(detail && detail.done);
    paint();
  });
  window.addEventListener("prause:section", (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail) return;
    current = String(detail.id || "intro");
    late = Boolean(detail.late);
    end = Boolean(detail.end);
    paint();
  });
  window.addEventListener("prause:depth", paint);
  paint();
  window.dispatchEvent(new Event("prause:resync"));
})();
