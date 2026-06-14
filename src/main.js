import "./style.css";
import { festivals } from "./festivals.js";

const STORAGE_KEY = "tuska-2026-picks";
const FESTIVAL_KEY = "festival-planner-active";
const REMINDERS_KEY = "festival-planner-reminders";
const REMINDER_LEAD_TIME = 30 * 60 * 1000;
const app = document.querySelector("#app");
let hasRenderedPlanner = false;
const reminderTimers = new Map();

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
  settingsOpen: false,
  remindersEnabled: localStorage.getItem(REMINDERS_KEY) === "on",
  reminderStatus: "OFF",
  reminderBusy: false,
};

if (!festivals[state.festival]) state.festival = "nummirock";
state.day = festivals[state.festival].days[0].id;

const minutes = (time) => {
  const [hours, mins] = time.split(":").map(Number);
  const value = hours * 60 + mins;
  return hours < 6 ? value + 24 * 60 : value;
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const supportsPush = () =>
  "serviceWorker" in navigator && "Notification" in window;

const showStartIso = (festival, show) => {
  const day = festival.days.find((entry) => entry.id === show.day);
  const [date, month] = day.date.split(".").map(Number);
  const [hour, minute] = show.start.split(":").map(Number);
  const nextDay = hour < 6 ? 1 : 0;
  const utc = Date.UTC(2026, month - 1, date + nextDay, hour - 3, minute);
  return new Date(utc).toISOString();
};

const selectedReminders = () =>
  Object.values(festivals).flatMap((festival) =>
    festival.schedule
      .filter((show) => state.priorities.has(show.id))
      .map((show) => ({
        showId: show.id,
        festivalId: festival.id,
        artist: show.artist,
        stage: show.stage,
        startsAt: showStartIso(festival, show),
      })),
  );

function clearReminderTimers() {
  reminderTimers.forEach((timer) => window.clearTimeout(timer));
  reminderTimers.clear();
}

async function showBandReminder(reminder) {
  if (!state.remindersEnabled || !state.priorities.has(reminder.showId)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(`${reminder.artist} starts in 30 minutes`, {
      body: reminder.stage,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      tag: `festival-reminder-${reminder.showId}`,
      data: { url: import.meta.env.BASE_URL },
    });
  } catch {
    state.reminderStatus = "REMINDER FAILED";
    render();
  }
}

async function showTestReminder() {
  state.reminderBusy = true;
  render();

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("Festival Planner notifications work", {
      body: "Band reminders will appear like this 30 minutes before a selected set.",
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      tag: "festival-reminder-test",
      data: { url: import.meta.env.BASE_URL },
    });
    state.reminderStatus = "TEST SENT";
  } catch {
    state.reminderStatus = "TEST FAILED";
  } finally {
    state.reminderBusy = false;
    render();
  }
}

function scheduleReminders() {
  clearReminderTimers();
  if (
    !supportsPush() ||
    !state.remindersEnabled ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const now = Date.now();
  selectedReminders().forEach((reminder) => {
    const delay = new Date(reminder.startsAt).getTime() - REMINDER_LEAD_TIME - now;
    if (delay <= 0 || delay > 2_147_483_647) return;
    reminderTimers.set(
      reminder.showId,
      window.setTimeout(() => {
        reminderTimers.delete(reminder.showId);
        void showBandReminder(reminder);
      }, delay),
    );
  });
}

async function enableReminders() {
  if (isIos() && !isStandalone()) {
    state.reminderStatus = "ADD TO HOME SCREEN FIRST";
    render();
    return;
  }

  state.reminderBusy = true;
  render();

  const permission = await Notification.requestPermission();
  state.reminderBusy = false;
  if (permission !== "granted") {
    state.reminderStatus = "BLOCKED IN SETTINGS";
    render();
    return;
  }

  state.remindersEnabled = true;
  state.reminderStatus = "ON WHILE APP IS RUNNING";
  localStorage.setItem(REMINDERS_KEY, "on");
  scheduleReminders();
  render();
}

function disableReminders() {
  clearReminderTimers();
  state.remindersEnabled = false;
  state.reminderStatus = "OFF";
  localStorage.removeItem(REMINDERS_KEY);
  render();
}

function initializeReminderState() {
  if (!supportsPush()) {
    state.remindersEnabled = false;
    state.reminderStatus = "NOT SUPPORTED";
    render();
    return;
  }

  if (isIos() && !isStandalone()) {
    state.reminderStatus = "ADD TO HOME SCREEN FIRST";
    render();
    return;
  }

  if (Notification.permission !== "granted") {
    state.remindersEnabled = false;
    localStorage.removeItem(REMINDERS_KEY);
  }
  state.reminderStatus = state.remindersEnabled ? "ON WHILE APP IS RUNNING" : "OFF";
  scheduleReminders();
  render();
}

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
  document.documentElement.style.setProperty("--accent", activeFestival.accent);
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
      <div class="header-tools">
        <div class="festival-meta">
          <span>${activeFestival.location}</span>
          <span class="festival-pick-summary">${festivalPicks} SELECTED</span>
        </div>
        <button type="button" class="settings-toggle" data-open-settings aria-label="Open settings">SETTINGS</button>
      </div>
    </header>

    ${
      state.settingsOpen
        ? `
          <div class="settings-backdrop" data-close-settings></div>
          <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div class="settings-heading">
              <div>
                <span>APP</span>
                <h2 id="settings-title">SETTINGS</h2>
              </div>
              <button type="button" data-close-settings aria-label="Close settings">CLOSE</button>
            </div>
            <div class="reminder-control">
              <div>
                <strong>30-MINUTE REMINDERS</strong>
                <span>${state.reminderStatus}</span>
              </div>
              <div class="reminder-actions">
                ${
                  state.remindersEnabled
                    ? `<button type="button" class="secondary" data-test-reminder ${state.reminderBusy ? "disabled" : ""}>TEST</button>`
                    : ""
                }
                <button type="button" data-toggle-reminders ${state.reminderBusy || !supportsPush() ? "disabled" : ""}>
                  ${state.reminderBusy ? "SAVING…" : state.remindersEnabled ? "TURN OFF" : "ENABLE"}
                </button>
              </div>
            </div>
            <p class="settings-note">Reminders work while the installed app remains running. On iPhone, add the app to your Home Screen first.</p>
          </section>`
        : ""
    }

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

app.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;

  const removeButton = event.target.closest("[data-remove-show]");
  if (removeButton) {
    state.priorities.delete(removeButton.dataset.removeShow);
    savePriorities();
    scheduleReminders();
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
    scheduleReminders();
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

  if (event.target.closest("[data-open-settings]")) {
    state.settingsOpen = true;
    render();
    return;
  }

  if (event.target.closest("[data-close-settings]")) {
    state.settingsOpen = false;
    render();
    return;
  }

  if (event.target.closest("[data-toggle-reminders]")) {
    state.remindersEnabled ? disableReminders() : await enableReminders();
    return;
  }

  if (event.target.closest("[data-test-reminder]")) {
    await showTestReminder();
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
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => initializeReminderState())
      .catch(() => {
        // The planner remains usable when service workers are unavailable.
      });
  });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleReminders();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.settingsOpen) {
    state.settingsOpen = false;
    render();
  }
});
