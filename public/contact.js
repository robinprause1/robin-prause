(() => {
  const form = document.querySelector("form.contact");
  if (!(form instanceof HTMLFormElement)) return;

  const place = () => {
    if (!new URLSearchParams(location.search).has("sent") && location.hash !== "#kontakt") return;
    form.scrollIntoView({ block: "start" });
  };
  place();
  window.addEventListener("load", place);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = form.querySelector(".form-note");
    const button = form.querySelector("button[type=submit]");
    if (button instanceof HTMLButtonElement) button.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(new FormData(form)),
      });
      const data = await response.json();
      if (note instanceof HTMLElement) note.textContent = typeof data.note === "string" ? data.note : "";
      if (data.sent === "ok") form.reset();
    } catch {
      if (note instanceof HTMLElement) note.textContent = note.dataset.fail || "";
    } finally {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    }
  });
})();
