import "./style.css";
import { festivals } from "./festivals.js";

const STORAGE_KEY = "tuska-2026-picks";
const FESTIVAL_KEY = "festival-planner-active";
const app = document.querySelector("#app");
let hasRenderedPlanner = false;

const savedPriorities = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(value)) {
      return Object.fromEntries(value.map((id) => [id, "must"]));
    }
    return value && typeof value === "object" ? value : {};
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
})();

const state = {
  festival: localStorage.getItem(FESTIVAL_KEY) || "nummirock",
  day: "",
  stage: "all",
  genre: "all",
  search: "",
  priorities: new Map(Object.entries(savedPriorities)),
  onlyPicks: false,
  screenshotMode: false,
};

if (!festivals[state.festival]) state.festival = "nummirock";
state.day = festivals[state.festival].days[0].id;

const minutes = (time) => {
  const [hours, mins] = time.split(":").map(Number);
  const value = hours * 60 + mins;
  return hours < 6 ? value + 24 * 60 : value;
};

const hasConflict = (show, schedule) =>
  Boolean(show.end) &&
  schedule.some(
    (other) =>
      Boolean(other.end) &&
      other.id !== show.id &&
      other.day === show.day &&
      state.priorities.has(other.id) &&
      minutes(show.start) < minutes(other.end) &&
      minutes(show.end) > minutes(other.start),
  );

function renderFestivalPicker(activeFestival) {
  return `
    <nav class="festival-picker" aria-label="Select festival">
      <span>FESTIVAL</span>
      <div>
        ${Object.values(festivals)
          .map(
            (festival) => `
              <button type="button" class="${festival.id === activeFestival.id ? "active" : ""}" data-festival="${festival.id}">
                ${festival.shortName}<small>${festival.dateRange.replace(" / 2026", "")}</small>
              </button>`,
          )
          .join("")}
      </div>
    </nav>`;
}

function renderScreenshot(activeFestival, activeDay) {
  const { schedule, days } = activeFestival;
  const picks = schedule
    .filter((show) => show.day === state.day && state.priorities.has(show.id))
    .sort((a, b) => minutes(a.start) - minutes(b.start));
  const density = picks.length > 14 ? "shot-ultra" : picks.length > 10 ? "shot-tight" : "";

  app.innerHTML = `
    <main class="shot-page">
      <section class="shot-card ${density}" data-shot-card>
        <header class="shot-header">
          <div>
            <span class="shot-brand">${activeFestival.name}</span>
            <span class="shot-year">MY PLAN / 2026</span>
          </div>
          <span>${activeFestival.location}</span>
        </header>

        <div class="shot-title">
          <p>${activeDay.label} / ${activeDay.date}2026</p>
          <h1>MY PLAN.</h1>
        </div>

        <div class="shot-legend" aria-hidden="true">
          <span class="must">MUST SEE</span>
          <span class="maybe">MAYBE</span>
        </div>

        <div class="shot-list">
          ${
            picks.length
              ? picks
                  .map(
                    (show, index) => `
                      <div class="shot-set priority-${state.priorities.get(show.id)} ${hasConflict(show, schedule) ? "has-conflict" : ""}">
                        <span class="shot-number">${String(index + 1).padStart(2, "0")}</span>
                        <time>${show.start}${show.end ? `<small>—${show.end}</small>` : ""}</time>
                        <div>
                          <strong>${show.artist}</strong>
                          <span>${show.stage.replace(" Stage", "")} · ${state.priorities.get(show.id) === "must" ? "MUST SEE" : "MAYBE"}</span>
                        </div>
                        ${hasConflict(show, schedule) ? '<b class="shot-conflict">OVERLAP</b>' : ""}
                        <button type="button" class="shot-remove" data-remove-show="${show.id}" aria-label="Remove ${show.artist} from my plan" title="Remove from my plan">REMOVE</button>
                      </div>`,
                  )
                  .join("")
              : `
                <div class="shot-empty">
                  <strong>NO BANDS SELECTED</strong>
                  <span>Exit this view and tap the bands you want to see.</span>
                </div>`
          }
        </div>

        <footer class="shot-footer">
          <span>${activeFestival.dateRange}</span>
          <span>PERSONAL FESTIVAL PLAN</span>
        </footer>
      </section>

      <nav class="shot-controls" aria-label="My plan controls">
        <div>
          ${days
            .map(
              (day) => `
                <button type="button" class="${day.id === state.day ? "active" : ""}" data-day="${day.id}">
                  ${day.short}
                </button>`,
            )
            .join("")}
        </div>
        <button type="button" data-close-shot>BACK TO PLANNER</button>
      </nav>
    </main>
  `;

}

function setPlanControlsHidden(hidden) {
  document.querySelector(".shot-controls")?.classList.toggle("hidden", hidden);
  document.querySelector(".shot-card")?.classList.toggle("capture-ready", hidden);
}

function render() {
  const activeFestival = festivals[state.festival];
  const { days, genres, schedule, stages } = activeFestival;
  const activeDay = days.find((day) => day.id === state.day);
  document.documentElement.style.setProperty("--acid", activeFestival.accent);
  document.body.dataset.festival = activeFestival.id;
  document.title = `${activeFestival.name} 2026 — My Schedule`;

  if (state.screenshotMode) {
    renderScreenshot(activeFestival, activeDay);
    return;
  }

  app.classList.toggle("skip-set-animations", hasRenderedPlanner);

  const visibleShows = schedule
    .filter((show) => show.day === state.day)
    .filter((show) => state.stage === "all" || show.stage === state.stage)
    .filter((show) => state.genre === "all" || show.genres.includes(state.genre))
    .filter((show) => {
      const query = state.search.toLowerCase();
      return (
        show.artist.toLowerCase().includes(query) ||
        show.genres.some((genre) => genre.toLowerCase().includes(query))
      );
    })
    .filter((show) => !state.onlyPicks || state.priorities.has(show.id));

  const grouped = stages
    .map((stage) => ({
      stage,
      shows: visibleShows
        .filter((show) => show.stage === stage)
        .sort((a, b) => minutes(a.start) - minutes(b.start)),
    }))
    .filter((group) => group.shows.length);

  const dayPicks = schedule.filter(
    (show) => show.day === state.day && state.priorities.has(show.id),
  ).length;
  const festivalPicks = schedule.filter((show) => state.priorities.has(show.id)).length;
  const genreCounts = Object.fromEntries(
    genres.map((genre) => [
      genre,
      schedule.filter((show) => show.day === state.day && show.genres.includes(genre))
        .length,
    ]),
  );
  const availableGenres = genres
    .filter((genre) => genreCounts[genre] > 0)
    .sort((a, b) => genreCounts[b] - genreCounts[a] || a.localeCompare(b));

  app.innerHTML = `
    ${renderFestivalPicker(activeFestival)}
    <header class="masthead">
      <div class="brand">
        <span class="brand-mark">${activeFestival.name}</span>
        <span class="brand-sub">PLANNER<br>2026</span>
      </div>
      <div class="festival-meta">
        <span>${activeFestival.location}</span>
        <span class="festival-pick-summary">${festivalPicks} SELECTED</span>
      </div>
    </header>

    <main>
      <section class="planner" aria-label="Festival schedule">
        <div class="day-tabs" role="tablist" style="--day-count:${days.length}">
          ${days
            .map(
              (day) => `
                <button type="button" class="day-tab ${day.id === state.day ? "active" : ""}" data-day="${day.id}" role="tab" aria-selected="${day.id === state.day}">
                  <span>${day.short}</span><strong>${day.date}</strong>
                </button>`,
            )
            .join("")}
        </div>

        <div class="toolbar">
          <label class="search">
            <span class="sr-only">Search bands</span>
            <input type="search" value="${state.search}" placeholder="SEARCH BANDS OR GENRES" autocomplete="off">
          </label>
          <div class="toolbar-actions">
            <button type="button" class="filter-toggle ${state.onlyPicks ? "active" : ""}" data-only-picks>
              MY BANDS <span>${dayPicks}</span>
            </button>
            <button type="button" class="screenshot-toggle" data-open-shot>MY PLAN</button>
          </div>
        </div>

        <div class="genre-browser">
          <div class="filter-label">
            <span>GENRE</span>
            <strong>${state.genre === "all" ? "ALL" : state.genre}</strong>
          </div>
          <div class="genre-filters" aria-label="Filter by genre">
            ${["all", ...availableGenres]
              .map((genre) => {
                const count =
                  genre === "all"
                    ? schedule.filter((show) => show.day === state.day).length
                    : genreCounts[genre];
                return `
                  <button type="button" class="${state.genre === genre ? "active" : ""}" data-genre="${genre}">
                    ${genre === "all" ? "ALL GENRES" : genre}<span>${count}</span>
                  </button>`;
              })
              .join("")}
          </div>
        </div>

        <div class="stage-filters" aria-label="Filter by stage">
          ${["all", ...stages]
            .map(
              (stage) => `
                <button type="button" class="${state.stage === stage ? "active" : ""}" data-stage="${stage}">
                  ${stage === "all" ? "ALL STAGES" : stage.replace(" Stage", "")}
                </button>`,
            )
            .join("")}
        </div>

        <div class="schedule-heading">
          <div>
            <p>${activeDay.label} / ${activeDay.date}2026</p>
            <h2>${state.onlyPicks ? "MY BANDS" : "RUNNING ORDER"}</h2>
          </div>
          <span>Set priority · tap again to remove</span>
        </div>

        <div class="stage-list">
          ${
            grouped.length
              ? grouped
                  .map(
                    ({ stage, shows }) => `
                      <section class="stage">
                        <h3><span>${stage}</span><small>${shows.length} SET${shows.length === 1 ? "" : "S"}</small></h3>
                        <div class="sets">
                          ${shows
                            .map((show, index) => {
                              const priority = state.priorities.get(show.id);
                              const selected = Boolean(priority);
                              const conflict = selected && hasConflict(show, schedule);
                              const maybeActive = priority === "maybe";
                              const mustActive = priority === "must";
                              return `
                                <div class="set ${priority ? `priority-${priority}` : ""}" style="--delay:${index * 35}ms">
                                  <span class="set-time">${show.start}${show.end ? `<i>—</i>${show.end}` : ""}</span>
                                  <strong>${show.artist}</strong>
                                  <div class="priority-actions" aria-label="Set priority for ${show.artist}">
                                    <button type="button" class="${maybeActive ? "active" : ""}" data-priority="maybe" data-show="${show.id}" aria-pressed="${maybeActive}" aria-label="${maybeActive ? `Remove ${show.artist} from maybe` : `Mark ${show.artist} as maybe`}" title="${maybeActive ? "Remove from maybe" : "Mark as maybe"}">MAYBE${maybeActive ? " ×" : ""}</button>
                                    <button type="button" class="${mustActive ? "active" : ""}" data-priority="must" data-show="${show.id}" aria-pressed="${mustActive}" aria-label="${mustActive ? `Remove ${show.artist} from must see` : `Mark ${show.artist} as must see`}" title="${mustActive ? "Remove from must see" : "Mark as must see"}">MUST SEE${mustActive ? " ×" : ""}</button>
                                  </div>
                                  ${conflict ? '<span class="conflict">TIME OVERLAP</span>' : ""}
                                </div>`;
                            })
                            .join("")}
                        </div>
                      </section>`,
                  )
                  .join("")
              : `<div class="empty"><strong>NO BANDS HERE.</strong><p>Change the filters or add bands to your schedule.</p></div>`
          }
        </div>
      </section>
    </main>

    <footer>
      <span>UNOFFICIAL PERSONAL SCHEDULE TOOL</span>
      <a href="${activeFestival.source}" target="_blank" rel="noreferrer">OFFICIAL ${activeFestival.name} SCHEDULE ↗</a>
    </footer>
  `;

  hasRenderedPlanner = true;
}

function savePriorities() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Object.fromEntries(state.priorities)),
  );
}

app.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const removeButton = event.target.closest("[data-remove-show]");
  if (removeButton) {
    state.priorities.delete(removeButton.dataset.removeShow);
    savePriorities();
    render();
    return;
  }

  const priorityButton = event.target.closest("[data-priority]");
  if (priorityButton) {
    const { show, priority } = priorityButton.dataset;
    state.priorities.get(show) === priority
      ? state.priorities.delete(show)
      : state.priorities.set(show, priority);
    savePriorities();
    render();
    return;
  }

  const festivalButton = event.target.closest("button[data-festival]");
  if (festivalButton) {
    state.festival = festivalButton.dataset.festival;
    const festival = festivals[state.festival];
    state.day = festival.days[0].id;
    state.stage = "all";
    state.genre = "all";
    state.search = "";
    state.onlyPicks = false;
    localStorage.setItem(FESTIVAL_KEY, state.festival);
    render();
    return;
  }

  const dayButton = event.target.closest("[data-day]");
  if (dayButton) {
    state.day = dayButton.dataset.day;
    render();
    return;
  }

  const stageButton = event.target.closest("[data-stage]");
  if (stageButton) {
    state.stage = stageButton.dataset.stage;
    render();
    return;
  }

  const genreButton = event.target.closest("[data-genre]");
  if (genreButton) {
    state.genre = genreButton.dataset.genre;
    render();
    return;
  }

  if (event.target.closest("[data-only-picks]")) {
    state.onlyPicks = !state.onlyPicks;
    render();
    return;
  }

  if (event.target.closest("[data-open-shot]")) {
    state.screenshotMode = true;
    window.scrollTo(0, 0);
    render();
    return;
  }

  if (event.target.closest("[data-close-shot]")) {
    state.screenshotMode = false;
    render();
    return;
  }

  if (event.target.closest("[data-shot-card]")) {
    const controls = document.querySelector(".shot-controls");
    setPlanControlsHidden(!controls?.classList.contains("hidden"));
  }
});

app.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "search") {
    return;
  }

  state.search = event.target.value;
  render();
  const input = document.querySelector("input[type='search']");
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
});

render();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The planner remains usable when service workers are unavailable.
    });
  });
}
