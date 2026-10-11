(() => {
const root = document.documentElement;
const depthKey = "prause-depth";
const themeKey = "prause-theme";
const depths = ["brief", "mid", "all"];
const depth = document.getElementById("depth");
const theme = document.getElementById("theme");
const themeMeta = document.querySelector('meta[name="theme-color"]');
const themes = ["light", "dark"];
let audio = null;

const paintDepth = () => {
  const current = depths.includes(root.dataset.depth) ? root.dataset.depth : "mid";
  if (!(depth instanceof HTMLElement)) return;
  for (const button of depth.querySelectorAll("[data-depth-set]")) {
    button.setAttribute("aria-checked", button.dataset.depthSet === current ? "true" : "false");
  }
};

const setDepth = (value) => {
  if (!depths.includes(value)) return;
  root.dataset.depth = value;
  try {
    sessionStorage.setItem(depthKey, value);
  } catch {
    /* storage can be off */
  }
  paintDepth();
  window.dispatchEvent(new CustomEvent("prause:depth", { detail: value }));
};

if (depth instanceof HTMLElement) {
  if (!depths.includes(root.dataset.depth)) root.dataset.depth = "mid";
  paintDepth();
  depth.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-depth-set]") : null;
    if (button instanceof HTMLElement) setDepth(button.dataset.depthSet || "mid");
  });
  depth.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const current = depths.indexOf(root.dataset.depth);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = depths[(current + step + depths.length) % depths.length];
    event.preventDefault();
    setDepth(next);
    const target = depth.querySelector(`[data-depth-set="${next}"]`);
    if (target instanceof HTMLElement) target.focus();
  });
}

const currentTheme = () => {
  if (root.dataset.theme === "light" || root.dataset.theme === "dark") return root.dataset.theme;
  return "light";
};

const paintTheme = () => {
  const current = currentTheme();
  if (theme instanceof HTMLElement) {
    for (const button of theme.querySelectorAll("[data-theme-set]")) {
      button.setAttribute("aria-checked", button.dataset.themeSet === current ? "true" : "false");
    }
  }
  if (themeMeta instanceof HTMLMetaElement) themeMeta.content = current === "dark" ? "#0f0e0d" : "#f3efe6";
};

const setTheme = (value) => {
  if (!themes.includes(value) || value === currentTheme()) return;
  root.dataset.theme = value;
  try {
    localStorage.setItem(themeKey, value);
  } catch {
    /* storage can be off */
  }
  paintTheme();
  click();
};

const click = () => {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audio = audio || new Context();
    const now = audio.currentTime;
    const noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.02), audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }
    const burst = audio.createBufferSource();
    burst.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.9;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    burst.connect(filter).connect(gain).connect(audio.destination);
    burst.start(now);
    const tone = audio.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(1200, now);
    tone.frequency.exponentialRampToValueAtTime(420, now + 0.04);
    const toneGain = audio.createGain();
    toneGain.gain.setValueAtTime(0.06, now);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    tone.connect(toneGain).connect(audio.destination);
    tone.start(now);
    tone.stop(now + 0.05);
  } catch {
    /* sound is optional */
  }
};

if (theme instanceof HTMLElement) {
  paintTheme();
  theme.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-theme-set]") : null;
    if (button instanceof HTMLElement) setTheme(button.dataset.themeSet || "light");
  });
}

})();
