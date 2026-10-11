/* The headline flips in place. The real letters stay in the line and only get
   covered, so nothing reflows when the last tile locks. */
const name = document.getElementById("name");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lower = upper.toLowerCase();

if (name instanceof HTMLElement && !reduce) {
  const pool = (char) => (char === char.toUpperCase() ? upper : lower);
  const spin = (char) => pool(char)[Math.floor(Math.random() * 26)];

  const begin = () => {
    /** @type {{ char: string, letter: HTMLElement }[]} */
    const tiles = [];
    for (const part of name.querySelectorAll(":scope > span")) {
      const text = part.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) continue;
      const word = text.textContent || "";
      const base = part.getBoundingClientRect();
      for (let index = 0; index < word.length; index += 1) {
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const box = range.getBoundingClientRect();
        const letter = document.createElement("span");
        letter.className = "letter";
        letter.setAttribute("aria-hidden", "true");
        const lastOfWord = index === word.length - 1;
        const padLeft = index === 0 ? 0 : 1;
        const padRight = lastOfWord ? 0 : 1;
        letter.style.left = `${box.left - base.left - padLeft}px`;
        letter.style.width = `${box.width + padLeft + padRight}px`;
        letter.textContent = spin(word[index]);
        part.append(letter);
        tiles.push({ char: word[index], letter });
      }
    }

    if (!tiles.length) return;
    name.classList.add("is-flipping");

    let stopped = false;
    /** @type {Set<ReturnType<typeof setTimeout>>} */
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!stopped) fn();
      }, ms);
      timers.add(id);
    };

    const width = name.clientWidth;
    const onResize = () => {
      if (name.clientWidth !== width) finish();
    };

    const finish = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener("resize", onResize);
      for (const id of timers) clearTimeout(id);
      for (const tile of tiles) tile.letter.remove();
      name.classList.remove("is-flipping");
      name.classList.add("is-set");
    };

    window.addEventListener("resize", onResize);

    let endAt = 0;
    tiles.forEach((tile, index) => {
      const steps = 4 + (index % 3);
      const start = 60 + index * 85;
      for (let step = 0; step < steps; step += 1) {
        const at = start + step * (26 + step * 10);
        endAt = Math.max(endAt, at);
        later(() => {
          const last = step === steps - 1;
          if (last) {
            tile.letter.remove();
            return;
          }
          tile.letter.textContent = spin(tile.char);
          tile.letter.classList.remove("tick");
          void tile.letter.offsetWidth;
          tile.letter.classList.add("tick");
        }, at);
      }
    });

    later(finish, endAt + 40);
  };

  /* After the font has loaded and the line has been fitted. setTimeout, not a
     frame, so the fit from the other script has already landed. */
  const arm = () => setTimeout(begin, 0);
  if (document.fonts) document.fonts.ready.then(arm);
  else arm();
}
