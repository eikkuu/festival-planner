import "./style.css";
import { festivals } from "./festivals.js";

const STORAGE_KEY = "tuska-2026-picks";
const FESTIVAL_KEY = "festival-planner-active";
const app = document.querySelector("#app");

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
  festival: localStorage.getItem(FESTIVAL_KEY) || "tuska",
  day: "",
  stage: "all",
  genre: "all",
  search: "",
  priorities: new Map(Object.entries(savedPriorities)),
  onlyPicks: false,
  screenshotMode: false,
};

if (!festivals[state.festival]) state.festival = "tuska";
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
              <button class="${festival.id === activeFestival.id ? "active" : ""}" data-festival="${festival.id}">
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
  const mustCount = picks.filter(
    (show) => state.priorities.get(show.id) === "must",
  ).length;
  const maybeCount = picks.length - mustCount;
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
          <div class="shot-summary" aria-label="${mustCount} must see and ${maybeCount} maybe">
            <span class="must"><b>${mustCount}</b> MUST SEE</span>
            <span class="maybe"><b>${maybeCount}</b> MAYBE</span>
          </div>
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
                        <button class="shot-remove" data-remove-show="${show.id}" aria-label="Remove ${show.artist} from my plan" title="Remove from my plan">REMOVE</button>
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
                <button class="${day.id === state.day ? "active" : ""}" data-day="${day.id}">
                  ${day.short}
                </button>`,
            )
            .join("")}
        </div>
        <button data-close-shot>BACK TO PLANNER</button>
      </nav>
    </main>
  `;

  bindEvents();
  window.setTimeout(() => {
    setPlanControlsHidden(true);
  }, 2200);
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
  const festivalMusts = schedule.filter(
    (show) => state.priorities.get(show.id) === "must",
  ).length;
  const festivalMaybes = schedule.filter(
    (show) => state.priorities.get(show.id) === "maybe",
  ).length;
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
      <a class="brand" href="#" aria-label="${activeFestival.name} planner home">
        <span class="brand-mark">${activeFestival.name}</span>
        <span class="brand-sub">MY SCHEDULE / 2026</span>
      </a>
      <div class="festival-meta">
        <span>${activeFestival.dateRange}</span>
        <span>${activeFestival.location}</span>
      </div>
    </header>

    <main>
      <section class="intro">
        <p class="eyebrow">Build your weekend</p>
        <h1>MAKE IT<br><span>LOUD.</span></h1>
        <p class="intro-copy">Mark your must-sees and keep a maybe list for gaps in the day.</p>
        <div class="pick-count" aria-live="polite">
          <strong>${festivalPicks}</strong>
          <span>${festivalMusts} must see<br>${festivalMaybes} maybe</span>
        </div>
      </section>

      <section class="planner" aria-label="Festival schedule">
        <div class="day-tabs" role="tablist" style="--day-count:${days.length}">
          ${days
            .map(
              (day) => `
                <button class="day-tab ${day.id === state.day ? "active" : ""}" data-day="${day.id}" role="tab" aria-selected="${day.id === state.day}">
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
            <button class="filter-toggle ${state.onlyPicks ? "active" : ""}" data-only-picks>
              MY BANDS <span>${dayPicks}</span>
            </button>
            <button class="screenshot-toggle" data-open-shot>MY PLAN</button>
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
                  <button class="${state.genre === genre ? "active" : ""}" data-genre="${genre}">
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
                <button class="${state.stage === stage ? "active" : ""}" data-stage="${stage}">
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
                                    <button class="${maybeActive ? "active" : ""}" data-priority="maybe" data-show="${show.id}" aria-pressed="${maybeActive}" aria-label="${maybeActive ? `Remove ${show.artist} from maybe` : `Mark ${show.artist} as maybe`}" title="${maybeActive ? "Remove from maybe" : "Mark as maybe"}">MAYBE${maybeActive ? " ×" : ""}</button>
                                    <button class="${mustActive ? "active" : ""}" data-priority="must" data-show="${show.id}" aria-pressed="${mustActive}" aria-label="${mustActive ? `Remove ${show.artist} from must see` : `Mark ${show.artist} as must see`}" title="${mustActive ? "Remove from must see" : "Mark as must see"}">MUST SEE${mustActive ? " ×" : ""}</button>
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

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-festival]").forEach((button) => {
    button.addEventListener("click", () => {
      state.festival = button.dataset.festival;
      const festival = festivals[state.festival];
      state.day = festival.days[0].id;
      state.stage = "all";
      state.genre = "all";
      state.search = "";
      state.onlyPicks = false;
      localStorage.setItem(FESTIVAL_KEY, state.festival);
      render();
    });
  });

  document.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.day = button.dataset.day;
      render();
    });
  });

  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      state.stage = button.dataset.stage;
      render();
    });
  });

  document.querySelectorAll("[data-genre]").forEach((button) => {
    button.addEventListener("click", () => {
      state.genre = button.dataset.genre;
      render();
    });
  });

  document.querySelector("[data-only-picks]")?.addEventListener("click", () => {
    state.onlyPicks = !state.onlyPicks;
    render();
  });

  document.querySelector("[data-open-shot]")?.addEventListener("click", () => {
    state.screenshotMode = true;
    window.scrollTo(0, 0);
    render();
  });

  document.querySelector("[data-close-shot]")?.addEventListener("click", () => {
    state.screenshotMode = false;
    render();
  });

  document.querySelector("[data-shot-card]")?.addEventListener("click", () => {
    const controls = document.querySelector(".shot-controls");
    setPlanControlsHidden(!controls?.classList.contains("hidden"));
  });

  document.querySelectorAll("[data-remove-show]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.priorities.delete(button.dataset.removeShow);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(state.priorities)),
      );
      render();
    });
  });

  document.querySelector("input[type='search']")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
    const input = document.querySelector("input[type='search']");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  document.querySelectorAll("[data-priority]").forEach((button) => {
    button.addEventListener("click", () => {
      const { show, priority } = button.dataset;
      state.priorities.get(show) === priority
        ? state.priorities.delete(show)
        : state.priorities.set(show, priority);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(state.priorities)),
      );
      render();
    });
  });
}

render();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The planner remains usable when service workers are unavailable.
    });
  });
}
