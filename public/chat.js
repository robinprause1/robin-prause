const form = document.getElementById("chat");
const log = document.getElementById("chat-log");
const field = document.getElementById("chat-question");

if (form instanceof HTMLFormElement && log && field instanceof HTMLInputElement) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = field.value.trim();
    if (!question) return;
    field.value = "";
    const item = document.createElement("article");
    item.className = "turn";
    const pending = form.dataset.pending || "Looking through the documents.";
    const empty = form.dataset.empty || "There is no answer for that right now.";
    const down = form.dataset.down || "The desk is not reachable right now.";
    const lang = document.documentElement.lang === "de" ? "de" : "en";
    item.append(line("q", question), answerLine(pending));
    log.append(item);
    item.scrollIntoView({ block: "nearest" });
    const button = form.querySelector("button");
    if (button instanceof HTMLButtonElement) button.disabled = true;
    fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, lang }),
    })
      .then((response) => response.json())
      .then((payload) => {
        const answer = typeof payload.answer === "string" ? payload.answer : empty;
        const text = item.querySelector(".a-text");
        if (text) text.textContent = answer;
        const sources = Array.isArray(payload.sources) ? payload.sources : [];
        if (sources.length) {
          const list = document.createElement("p");
          list.className = "sources";
          for (const source of sources) {
            if (!source || typeof source.url !== "string" || typeof source.title !== "string") continue;
            if (!source.url.startsWith("/")) continue;
            const link = document.createElement("a");
            link.href = source.url;
            link.textContent = source.title;
            list.append(link);
          }
          if (list.childElementCount) item.append(list);
        }
      })
      .catch(() => {
        const text = item.querySelector(".a-text");
        if (text) text.textContent = down;
      })
      .finally(() => {
        if (button instanceof HTMLButtonElement) button.disabled = false;
      });
  });
}

function line(kind, text) {
  const paragraph = document.createElement("p");
  paragraph.className = kind;
  paragraph.textContent = text;
  return paragraph;
}

function answerLine(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "a";
  const mark = document.createElement("span");
  mark.className = "ai-mark";
  mark.textContent = form instanceof HTMLFormElement ? form.dataset.mark || "KI" : "KI";
  const body = document.createElement("span");
  body.className = "a-text";
  body.textContent = text;
  paragraph.append(mark, body);
  return paragraph;
}
