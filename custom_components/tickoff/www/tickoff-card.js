/*
 * Tickoff card - tasks for Home Assistant.
 * Plain JavaScript, no build step, no dependencies. Served by the integration itself.
 *
 *   type: custom:tickoff-card
 *   view: all            # all | today | upcoming | done
 *   tags: [garden]       # optional: only tasks with one of these tags
 */
(() => {
  "use strict";

  const VERSION = "0.3.0";
  if (customElements.get("tickoff-card")) return;

  const I18N = {
    en: {
      add_placeholder: "Task title...   try: Call mom tomorrow 14:30 #family !high",
      add: "Add", options: "Options", notes: "Notes", due_date: "Due date", due_time: "Time", priority: "Priority",
      tags: "Tags", new_tag: "New tag", repeat: "Repeat", none: "None", low: "Low", medium: "Medium", high: "High",
      daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly", after_completion: "N days after completing",
      every: "Every", days: "days", save: "Save", cancel: "Cancel", delete: "Delete", sure: "Sure?",
      snooze: "Snooze to tomorrow", edit: "Edit", clear_completed: "Clear completed", subtasks: "Subtasks",
      add_subtask: "Add a subtask", history: "History", edit_task: "Edit task", manual_order: "Manual order",
      overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday", upcoming: "Upcoming",
      no_date: "No date", done: "Completed", all: "All tasks", days_ago: "days ago", in_days: "in {n} days",
      empty_all: "Nothing to do. Enjoy the quiet.", empty_today: "Nothing due today.", empty_upcoming: "Nothing coming up.",
      empty_done: "No completed tasks.", loading: "Loading...", set_up: "Tickoff is not set up yet. Add it under Settings > Devices & services.",
      next_week: "Next week", edit_tags: "Edit tags", wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      parsed: "Detected", editor_title: "Title", editor_view: "View", editor_tags: "Only these tags (empty = all)",
      editor_show_done: "Show completed tasks", editor_show_add: "Show the new task button", editor_read_only: "Read only",
      editor_compact: "Compact", editor_hide_empty: "Hide when empty", editor_manual: "Manual order (drag & drop)",
      view_all: "All tasks", view_today: "Today", view_upcoming: "Upcoming", view_done: "Completed",
      new_task: "New task", add_task: "Add task", sub_placeholder: "Add a subtask and press Enter", sub_none: "No subtasks yet",
      count_open: "open", date_ph: "dd-mm-yyyy", time_ph: "hh:mm", pick_date: "Pick a date",
      invalid_date: "Use dd-mm-yyyy", invalid_time: "Use 24-hour time hh:mm",
    },
    nl: {
      add_placeholder: "Titel van de taak...   probeer: Mama bellen morgen 14:30 #familie !hoog",
      add: "Toevoegen", options: "Opties", notes: "Notities", due_date: "Vervaldatum", due_time: "Tijd", priority: "Prioriteit",
      tags: "Tags", new_tag: "Nieuwe tag", repeat: "Herhalen", none: "Geen", low: "Laag", medium: "Midden", high: "Hoog",
      daily: "Dagelijks", weekly: "Wekelijks", monthly: "Maandelijks", yearly: "Jaarlijks", after_completion: "N dagen na afvinken",
      every: "Elke", days: "dagen", save: "Opslaan", cancel: "Annuleren", delete: "Verwijderen", sure: "Zeker?",
      snooze: "Uitstellen tot morgen", edit: "Bewerken", clear_completed: "Voltooide wissen", subtasks: "Subtaken",
      add_subtask: "Subtaak toevoegen", history: "Geschiedenis", edit_task: "Taak bewerken", manual_order: "Handmatige volgorde",
      overdue: "Achterstallig", today: "Vandaag", tomorrow: "Morgen", yesterday: "Gisteren", upcoming: "Binnenkort",
      no_date: "Geen datum", done: "Voltooid", all: "Alle taken", days_ago: "dagen geleden", in_days: "over {n} dagen",
      empty_all: "Niets te doen. Geniet van de rust.", empty_today: "Niets voor vandaag.", empty_upcoming: "Niets gepland.",
      empty_done: "Geen voltooide taken.", loading: "Laden...", set_up: "Tickoff is nog niet ingesteld. Voeg het toe via Instellingen > Apparaten & diensten.",
      next_week: "Volgende week", edit_tags: "Tags bewerken", wd: ["ma", "di", "wo", "do", "vr", "za", "zo"],
      parsed: "Herkend", editor_title: "Titel", editor_view: "Weergave", editor_tags: "Alleen deze tags (leeg = alle)",
      editor_show_done: "Voltooide taken tonen", editor_show_add: "Nieuwe-taakknop tonen", editor_read_only: "Alleen lezen",
      editor_compact: "Compact", editor_hide_empty: "Verbergen als leeg", editor_manual: "Handmatige volgorde (slepen)",
      view_all: "Alle taken", view_today: "Vandaag", view_upcoming: "Binnenkort", view_done: "Voltooid",
      new_task: "Nieuwe taak", add_task: "Taak toevoegen", sub_placeholder: "Voeg een subtaak toe en druk op Enter", sub_none: "Nog geen subtaken",
      count_open: "open", date_ph: "dd-mm-jjjj", time_ph: "uu:mm", pick_date: "Kies een datum",
      invalid_date: "Gebruik dd-mm-jjjj", invalid_time: "Gebruik 24-uurs tijd uu:mm",
    },
  };

  const PRIO_NAMES = ["none", "low", "medium", "high"];
  const PRIO_COLORS = ["", "#43a047", "#fb8c00", "#e53935"];
  const REC_TYPES = ["", "daily", "weekly", "monthly", "yearly", "after_completion"];

  // ---------- pure helpers (exported for tests) ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function textColor(bg) {
    const m = /^#([0-9a-f]{6})$/i.exec(bg || "");
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? "#000" : "#fff";
  }

  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => new Date(`${s}T00:00:00`);
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
  const dayDiff = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);

  /** Dates are shown and typed as dd-mm-yyyy, times as 24-hour hh:mm, whatever the browser's locale is. */
  const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "");
  const fmtStamp = (iso) => (iso ? `${fmtDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : "");

  /** "12-03-2026", "12/3/26", "12.03.2026" or "2026-03-12" -> "2026-03-12"; "" -> ""; invalid -> null. */
  function parseDateText(text) {
    const v = (text || "").trim();
    if (!v) return "";
    let y, m, d, x;
    if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) [y, m, d] = [+x[1], +x[2], +x[3]];
    else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(v))) [d, m, y] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
    else return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  /** "9:05", "09:05", "0905", "9.05" -> "09:05"; "" -> ""; invalid -> null. */
  function parseTimeText(text) {
    const v = (text || "").trim();
    if (!v) return "";
    const x = /^(\d{1,2})[:.]?(\d{2})$/.exec(v);
    if (!x || +x[1] > 23 || +x[2] > 59) return null;
    return `${pad(+x[1])}:${x[2]}`;
  }

  const maskDate = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length > 4 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  };
  const maskTime = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  };

  const dateField = (attrs, iso, t) =>
    `<span class="dt"><input type="text" ${attrs} data-mask="date" inputmode="numeric" maxlength="10" placeholder="${esc(t.date_ph)}" value="${esc(fmtDate(iso))}">` +
    `<button type="button" class="iconbtn" data-act="pickdate" title="${esc(t.pick_date)}"><ha-icon icon="mdi:calendar"></ha-icon></button>` +
    `<input type="date" class="pickhidden" tabindex="-1" aria-hidden="true"></span>`;
  const timeField = (attrs, hhmm, t) =>
    `<input type="text" ${attrs} data-mask="time" inputmode="numeric" maxlength="5" placeholder="${esc(t.time_ph)}" value="${esc(hhmm || "")}" style="width:90px">`;

  const WEEKDAYS = {
    mon: 0, monday: 0, ma: 0, maandag: 0, tue: 1, tuesday: 1, di: 1, dinsdag: 1, wed: 2, wednesday: 2, wo: 2, woensdag: 2,
    thu: 3, thursday: 3, do: 3, donderdag: 3, fri: 4, friday: 4, vr: 4, vrijdag: 4, sat: 5, saturday: 5, za: 5, zaterdag: 5,
    sun: 6, sunday: 6, zo: 6, zondag: 6,
  };
  const PRIORITY_WORDS = { "1": 1, l: 1, low: 1, laag: 1, "2": 2, m: 2, med: 2, medium: 2, midden: 2, "3": 3, h: 3, high: 3, hoog: 3 };
  const REC_WORDS = { daily: "daily", dagelijks: "daily", weekly: "weekly", wekelijks: "weekly", monthly: "monthly", maandelijks: "monthly", yearly: "yearly", jaarlijks: "yearly" };
  const UNIT_WORDS = { day: "daily", dag: "daily", week: "weekly", month: "monthly", maand: "monthly", year: "yearly", jaar: "yearly" };

  /**
   * Quick-add: "Call mom tomorrow 14:30 #family !high" -> {title, tags, priority, due_date, due_time, recurrence}.
   * today = "YYYY-MM-DD" in the user's timezone. Words that are not understood stay in the title.
   */
  function parseQuickAdd(text, today) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const out = { title: "", tags: [], priority: 0, due_date: null, due_time: null, recurrence: null };
    const kept = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const lw = w.toLowerCase().replace(/[.,;]+$/, "");
      let m;
      if ((m = /^#(\S+)$/.exec(w))) out.tags.push(m[1].replace(/[.,;]+$/, ""));
      else if ((m = /^!(\w+)$/.exec(lw)) && PRIORITY_WORDS[m[1]] !== undefined) out.priority = PRIORITY_WORDS[m[1]];
      else if ((m = /^@?(\d{1,2}):(\d{2})$/.exec(lw)) && +m[1] < 24 && +m[2] < 60) out.due_time = `${pad(+m[1])}:${m[2]}`;
      else if (lw === "today" || lw === "vandaag") out.due_date = today;
      else if (lw === "tomorrow" || lw === "morgen") out.due_date = addDays(today, 1);
      else if (lw === "overmorgen") out.due_date = addDays(today, 2);
      else if (/^\d{4}-\d{2}-\d{2}$/.test(lw) && !isNaN(parseDate(lw))) out.due_date = lw;
      else if (/^\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?$/.test(lw)) {
        const full = /^\d{1,2}[-/.]\d{1,2}$/.test(lw) ? `${lw}-${today.slice(0, 4)}` : lw;
        const iso = parseDateText(full);
        if (iso) out.due_date = iso < today && full !== lw ? parseDateText(`${lw}-${+today.slice(0, 4) + 1}`) : iso;
        else kept.push(w);
      }
      else if (WEEKDAYS[lw] !== undefined && w.length > 2) {
        const delta = (WEEKDAYS[lw] - ((parseDate(today).getDay() + 6) % 7) + 7) % 7 || 7;
        out.due_date = addDays(today, delta);
      } else if ((lw === "in" || lw === "over") && /^\d+$/.test(words[i + 1] || "") && /^(days?|dagen?|weeks?|weken?)$/i.test(words[i + 2] || "")) {
        out.due_date = addDays(today, +words[i + 1] * (/^w/i.test(words[i + 2]) ? 7 : 1));
        i += 2;
      } else if (REC_WORDS[lw]) out.recurrence = { type: REC_WORDS[lw] };
      else if ((lw === "every" || lw === "elke" || lw === "elk") && UNIT_WORDS[(words[i + 1] || "").toLowerCase()]) {
        out.recurrence = { type: UNIT_WORDS[words[i + 1].toLowerCase()] };
        i += 1;
      } else kept.push(w);
    }
    out.title = kept.join(" ").trim();
    if (!out.title) return { title: text.trim(), tags: [], priority: 0, due_date: null, due_time: null, recurrence: null };
    if (out.due_time && !out.due_date) out.due_date = today;
    if (out.recurrence && out.recurrence.type === "weekly" && out.due_date) {
      out.recurrence.weekdays = [(parseDate(out.due_date).getDay() + 6) % 7];
    }
    out.tags = [...new Set(out.tags)];
    return out;
  }

  /** Sections for a view: [{key, tone, tasks}], tasks sorted for that section. */
  function buildSections(snapshot, config, tagFilter) {
    if (!snapshot) return [];
    const wantTags = new Set([...(config.tags || []), ...tagFilter]);
    const tasks = snapshot.tasks.filter((t) => !wantTags.size || t.tags.some((x) => wantTags.has(x)));
    const today = snapshot.now.slice(0, 10);
    const byDue = (a, b) =>
      (a.due_date || "").localeCompare(b.due_date || "") || (a.due_time || "99").localeCompare(b.due_time || "99") ||
      b.priority - a.priority;
    const pick = (state) => tasks.filter((t) => t.state === state);
    const view = config.view === "list" ? "all" : config.view || "all";

    if (config.manual && view === "all") {
      const open = tasks.filter((t) => t.status === "open");
      return [{ key: "manual", tone: "", tasks: open }, ...(config.show_completed === false ? [] : [{ key: "done", tone: "muted", tasks: tasks.filter((t) => t.status === "done"), collapsed: true }])]
        .filter((s) => s.tasks.length);
    }
    if (view === "done") {
      return [{ key: "done_flat", tone: "", tasks: tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")) }].filter((s) => s.tasks.length);
    }
    if (view === "today") {
      return [{ key: "overdue", tone: "bad", tasks: pick("overdue").sort(byDue) }, { key: "today", tone: "warn", tasks: pick("today").sort(byDue) }].filter((s) => s.tasks.length);
    }
    if (view === "upcoming") {
      const up = pick("upcoming").sort(byDue);
      const groups = [];
      for (const t of up) {
        const last = groups[groups.length - 1];
        if (last && last.date === t.due_date) last.tasks.push(t);
        else groups.push({ key: "day", date: t.due_date, tone: "", tasks: [t] });
      }
      return groups;
    }
    const sections = [
      { key: "overdue", tone: "bad", tasks: pick("overdue").sort(byDue) },
      { key: "today", tone: "warn", tasks: pick("today").sort(byDue) },
      { key: "upcoming", tone: "", tasks: pick("upcoming").sort(byDue) },
      { key: "no_date", tone: "", tasks: pick("no_date") },
    ];
    if (config.show_completed !== false) sections.push({ key: "done", tone: "muted", tasks: tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")), collapsed: true });
    return sections.filter((s) => s.tasks.length);
  }

  function usedTags(snapshot) {
    const names = new Set();
    if (snapshot) for (const t of snapshot.tasks) t.tags.forEach((x) => names.add(x));
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  /** Id of the task the dragged one should come after (null = first); undefined if unknown. */
  function dropTarget(tasks, draggedId, overId, after) {
    const order = tasks.map((t) => t.id).filter((id) => id !== draggedId);
    const i = order.indexOf(overId);
    if (i < 0) return undefined;
    return after ? order[i] : i === 0 ? null : order[i - 1];
  }

  function recurrenceFromForm(f) {
    if (!f.type) return null;
    if (f.type === "after_completion") return { type: f.type, days: Math.max(1, +f.days || 1) };
    const rule = { type: f.type, interval: Math.max(1, +f.interval || 1) };
    if (f.type === "weekly" && f.weekdays && f.weekdays.length) rule.weekdays = [...f.weekdays].sort();
    return rule;
  }

  function describeRecurrence(rule, t) {
    if (!rule) return "";
    if (rule.type === "after_completion") return `${rule.days} ${t.days}`;
    const base = t[rule.type] || rule.type;
    if (rule.type === "weekly" && rule.weekdays) return `${base} ${rule.weekdays.map((d) => t.wd[d]).join(" ")}`;
    return rule.interval > 1 ? `${t.every} ${rule.interval}: ${base}` : base;
  }

  /** Short relative label: Today, Tomorrow, Yesterday, 3 days ago, Mon 12 Mar. */
  function relativeDay(date, today, t, lang) {
    const d = dayDiff(date, today);
    if (d === 0) return t.today;
    if (d === 1) return t.tomorrow;
    if (d === -1) return t.yesterday;
    if (d < 0 && d > -15) return `${-d} ${t.days_ago}`;
    void lang;
    return `${t.wd[(parseDate(date).getDay() + 6) % 7]} ${fmtDate(date)}`;
  }

  // ---------- styles ----------
  const CSS = `
    :host { display: block; --tk-radius: 14px; --tk-bad: var(--error-color, #d32f2f); --tk-warn: var(--warning-color, #f9a825);
            --tk-line: var(--divider-color, rgba(127,127,127,.25)); --tk-muted: var(--secondary-text-color, #727272); }
    * { box-sizing: border-box; }
    ha-card { overflow: hidden; padding-bottom: 6px; }
    button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; border-radius: 8px; padding: 0; }
    input, select, textarea { font: inherit; color: var(--primary-text-color); background: var(--card-background-color, #fff);
      border: 1px solid var(--tk-line); border-radius: 10px; padding: 8px 10px; min-width: 0; }
    input:focus, select:focus, textarea:focus { outline: 2px solid var(--primary-color); outline-offset: -1px; }
    ha-icon { --mdc-icon-size: 20px; display: inline-flex; }
    :host { container-type: inline-size; }
    .head { display: flex; align-items: center; gap: 6px 10px; padding: 14px 16px 6px; flex-wrap: wrap; }
    .head h2 { margin: 0; flex: 1 1 auto; font-size: 1.25em; font-weight: 600; letter-spacing: .1px; white-space: nowrap; }
    #headbtns { display: inline-flex; align-items: center; gap: 6px; }
    @container (max-width: 520px) { #pills { order: 3; flex-basis: 100%; } }
    .pill { font-size: .78em; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--secondary-background-color, #eee); color: var(--tk-muted); }
    .pill.bad { background: color-mix(in srgb, var(--tk-bad) 16%, transparent); color: var(--tk-bad); }
    .pill.warn { background: color-mix(in srgb, var(--tk-warn) 22%, transparent); color: color-mix(in srgb, var(--tk-warn) 70%, #000); }
    .iconbtn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; color: var(--tk-muted); }
    .iconbtn:hover, .iconbtn.on { background: var(--secondary-background-color, #eee); color: var(--primary-text-color); }
    .iconbtn.on { color: var(--primary-color); }
    .iconbtn.danger:hover { color: var(--tk-bad); }

    .adder { padding: 6px 16px 4px; }
    .addbar { display: flex; align-items: center; gap: 6px; background: var(--secondary-background-color, #f2f2f2); border-radius: var(--tk-radius); padding: 2px 4px 2px 12px; }
    .addbar:focus-within { outline: 2px solid var(--primary-color); }
    .addbar > ha-icon { color: var(--tk-muted); }
    .addbar input { flex: 1; border: none; background: transparent; padding: 10px 4px; outline: none !important; }
    .addbtn { background: var(--primary-color); color: var(--text-primary-color, #fff); padding: 7px 14px; font-weight: 600; border-radius: 10px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .addbtn:hover { filter: brightness(1.08); }
    .subrow .subtitle { flex: 1; padding: 5px 8px; font-size: .95rem; }
    .addbtn:disabled { opacity: .4; cursor: default; }
    .preview { display: flex; flex-wrap: wrap; gap: 6px; font-size: .82em; color: var(--tk-muted); align-items: center; min-height: 0; }
    .extra { display: none; gap: 8px; flex-wrap: wrap; padding: 10px 2px 2px; }
    .extra.open { display: flex; }
    .extra textarea { flex-basis: 100%; resize: vertical; }

    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 2px; align-items: center; }
    .chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 11px; font-size: .8em; cursor: pointer;
            border: 1px solid transparent; user-select: none; transition: opacity .15s; }
    .chip .dot { width: 8px; height: 8px; border-radius: 50%; }
    .chip.filter { background: var(--secondary-background-color, #eee); color: var(--primary-text-color); }
    .chip.filter.on { outline: 2px solid var(--primary-color); }
    .chip.tag { cursor: default; padding: 1px 9px; font-size: .74em; }
    .tagcolor { width: 26px; height: 26px; padding: 0; border: none; background: none; }

    .section { padding: 10px 16px 2px; display: flex; align-items: center; gap: 8px; font-size: .78em; font-weight: 700;
               text-transform: uppercase; letter-spacing: .6px; color: var(--tk-muted); }
    .section.bad { color: var(--tk-bad); } .section.warn { color: color-mix(in srgb, var(--tk-warn) 70%, #000); }
    .section .n { font-weight: 500; opacity: .8; }
    .section.click { cursor: pointer; } .section .grow { flex: 1; }
    .task { display: flex; gap: 12px; align-items: flex-start; padding: 8px 16px; position: relative; transition: background .12s; }
    .task:hover { background: color-mix(in srgb, var(--primary-text-color) 4%, transparent); }
    .task.dragover { background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
    .handle { cursor: grab; color: var(--tk-muted); margin: 2px -6px 0 -6px; opacity: .6; }
    .check { flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; border: 2px solid var(--tk-ring, var(--tk-muted));
             background: transparent; display: inline-flex; align-items: center; justify-content: center; color: transparent; transition: all .15s; padding: 0; }
    .check:hover { background: color-mix(in srgb, var(--tk-ring, var(--tk-muted)) 20%, transparent); color: var(--tk-ring, var(--tk-muted)); }
    .check ha-icon { --mdc-icon-size: 16px; }
    .task.done .check { background: var(--tk-ring, var(--tk-muted)); color: #fff; opacity: .7; }
    .body { flex: 1; min-width: 0; cursor: pointer; }
    .title { font-size: 1em; line-height: 1.35; word-break: break-word; }
    .task.done .title { text-decoration: line-through; color: var(--tk-muted); }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; margin-top: 3px; font-size: .8em; color: var(--tk-muted); }
    .meta .due { display: inline-flex; align-items: center; gap: 3px; }
    .meta .due.bad { color: var(--tk-bad); font-weight: 600; } .meta .due.warn { color: color-mix(in srgb, var(--tk-warn) 65%, #000); font-weight: 600; }
    .meta ha-icon { --mdc-icon-size: 14px; }
    .meta .sub { display: inline-flex; align-items: center; gap: 5px; }
    .bar { width: 38px; height: 4px; border-radius: 2px; background: var(--tk-line); overflow: hidden; display: inline-block; }
    .bar i { display: block; height: 100%; background: var(--primary-color); }
    .actions { display: flex; flex: none; opacity: 0; transition: opacity .12s; }
    .task:hover .actions, .task:focus-within .actions, .task.open .actions { opacity: 1; }
    @media (hover: none) { .actions { opacity: 1; } }
    .detail { padding: 2px 16px 8px 50px; }
    .notes { white-space: pre-wrap; color: var(--tk-muted); font-size: .92em; margin-bottom: 6px; }
    .subrow { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: .95em; }
    .subrow.done span { text-decoration: line-through; color: var(--tk-muted); }
    .subrow .check { width: 18px; height: 18px; margin: 0; border-width: 2px; }
    .subrow .check ha-icon { --mdc-icon-size: 13px; }
    .subadd { width: 100%; margin-top: 6px; padding: 6px 10px; font-size: .92em; }
    .hist { font-size: .75em; color: var(--tk-muted); margin-top: 8px; }
    .empty { text-align: center; padding: 30px 16px; color: var(--tk-muted); }
    .empty ha-icon { --mdc-icon-size: 44px; opacity: .45; display: block; margin: 0 auto 8px; }
    .foot { display: flex; justify-content: flex-end; padding: 4px 12px 0; }
    .foot button { padding: 6px 10px; color: var(--tk-muted); font-size: .85em; } .foot button:hover { color: var(--primary-text-color); background: var(--secondary-background-color); }
    .compact .task { padding-top: 4px; padding-bottom: 4px; } .compact .meta { margin-top: 0; }

    .overlay { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
    .sheet { background: var(--card-background-color, #fff); color: var(--primary-text-color); width: min(520px, 100%); max-height: 92vh; overflow: auto;
             border-radius: 18px; padding: 16px 18px 14px; box-shadow: 0 12px 40px rgba(0,0,0,.4); display: flex; flex-direction: column; gap: 14px; }
    .sheet h3 { margin: 0; font-size: 1.15em; }
    .sheet label.f { display: flex; flex-direction: column; gap: 5px; font-size: .78em; font-weight: 600; color: var(--tk-muted); text-transform: uppercase; letter-spacing: .4px; }
    .sheet label.f > input, .sheet label.f > textarea, .sheet label.f > select { text-transform: none; font-weight: 400; font-size: 1rem; color: var(--primary-text-color); letter-spacing: 0; }
    .row2 { display: flex; gap: 10px; } .row2 > * { flex: 1; } .row2 > .dt { flex: none; } .row2 > input[data-mask=time] { flex: none; }
    .quick { display: flex; gap: 6px; flex-wrap: wrap; }
    .seg { display: flex; border: 1px solid var(--tk-line); border-radius: 10px; overflow: hidden; }
    .seg button { flex: 1; padding: 8px 4px; border-radius: 0; font-size: .9rem; text-transform: none; font-weight: 500; letter-spacing: 0; color: var(--primary-text-color); }
    .seg button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    .wd { display: flex; gap: 4px; flex-wrap: wrap; } .wd label { display: flex; align-items: center; gap: 3px; font-size: .85rem; text-transform: none; font-weight: 400; letter-spacing: 0; }
    .sheetfoot { display: flex; gap: 8px; align-items: center; margin-top: 2px; } .sheetfoot .grow { flex: 1; }
    .btn { padding: 9px 16px; border-radius: 10px; font-weight: 600; } .btn:hover { background: var(--secondary-background-color, #eee); }
    .btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); } .btn.primary:hover { filter: brightness(1.08); }
    .btn.danger { color: var(--tk-bad); }
    .dt { position: relative; display: flex; align-items: center; gap: 2px; } .dt > input[type=text] { width: 130px; }
    .pickhidden { position: absolute; right: 0; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; }
    input.bad { outline: 2px solid var(--tk-bad); outline-offset: -1px; }
    .newtag { display: inline-flex; gap: 4px; } .newtag input { width: 110px; padding: 3px 9px; border-radius: 999px; font-size: .8em; }
  `;

  // ---------- the card ----------
  class TickoffCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._tagFilter = new Set();
      this._open = new Set();
      this._collapsed = { done: true };
      this._editing = null;
      this._confirm = null;
      this._editTags = false;
      this._t = I18N.en;
    }

    static getConfigElement() { return document.createElement("tickoff-card-editor"); }

    static getStubConfig() { return { view: "all" }; }

    setConfig(config) {
      if (!config) throw new Error("Invalid configuration");
      this._config = { view: "all", show_completed: true, show_add: true, read_only: false, compact: false, ...config };
      this._build();
      this._update();
    }

    getCardSize() { return 5; }

    set hass(hass) {
      this._hass = hass;
      const lang = ((hass.locale && hass.locale.language) || hass.language || "en").slice(0, 2);
      this._lang = (hass.locale && hass.locale.language) || hass.language || "en";
      this._t = I18N[lang] || I18N.en;
      if (!this._unsub && !this._subscribing && this.isConnected) this._subscribe();
    }

    connectedCallback() { if (this._hass && !this._unsub && !this._subscribing) this._subscribe(); }

    disconnectedCallback() {
      if (this._unsub) this._unsub();
      this._unsub = null;
      this._disconnected = true;
    }

    async _subscribe() {
      this._subscribing = true;
      this._disconnected = false;
      try {
        const unsub = await this._hass.connection.subscribeMessage((snap) => { this._snap = snap; this._update(); }, { type: "tickoff/subscribe" });
        if (this._disconnected) unsub();
        else this._unsub = unsub;
      } finally {
        this._subscribing = false;
      }
    }

    _call(service, data) {
      return this._hass.callService("tickoff", service, data, this._snap && this._snap.entity_id ? { entity_id: this._snap.entity_id } : undefined);
    }

    get _today() { return this._snap ? this._snap.now.slice(0, 10) : isoDate(new Date()); }

    // ----- static skeleton (built once per config so typed text survives updates) -----
    _build() {
      const cfg = this._config;
      this.shadowRoot.innerHTML = `<style>${CSS}</style>
        <ha-card class="${cfg.compact ? "compact" : ""}">
          <div class="head"><h2></h2><span id="pills"></span><span id="headbtns"></span></div>
          <div class="chips" id="chips"></div>
          <div id="list"></div>
          <div class="foot" id="foot"></div>
          <div id="overlay"></div>
        </ha-card>`;
      this._root = this.shadowRoot;
      const $ = (id) => this._root.getElementById(id);
      const list = $("list");
      list.addEventListener("click", (e) => this._onClick(e));
      list.addEventListener("keydown", (e) => this._onKey(e));
      list.addEventListener("dragstart", (e) => this._onDragStart(e));
      list.addEventListener("dragover", (e) => this._onDragOver(e));
      list.addEventListener("dragleave", (e) => { const r = e.target.closest && e.target.closest(".task"); if (r) r.classList.remove("dragover"); });
      list.addEventListener("drop", (e) => this._onDrop(e));
      $("chips").addEventListener("click", (e) => this._onChip(e));
      $("chips").addEventListener("input", (e) => this._onTagColor(e));
      $("foot").addEventListener("click", (e) => this._onFoot(e));
      $("headbtns").addEventListener("click", (e) => this._onHead(e));
      $("overlay").addEventListener("click", (e) => this._onSheet(e));
      this._root.addEventListener("input", (e) => this._onMask(e));
      this._root.addEventListener("click", (e) => this._onPick(e));
      this._root.addEventListener("change", (e) => this._onPicked(e));
      $("overlay").addEventListener("keydown", (e) => this._onSheetKey(e));
      $("overlay").addEventListener("change", (e) => this._onSheetChange(e));
      this._root.addEventListener("input", (e) => this._onSheetInput(e));
    }

    // ----- the task modal (create and edit) -----
    _blankTask() {
      return { id: null, title: "", notes: "", due_date: null, due_time: null, priority: 0, tags: [], recurrence: null, subtasks: [] };
    }

    _openNew() {
      if (!this._snap || !this._snap.entity_id) return;
      this._creating = true;
      this._editing = null;
      this._draftSubs = [];
      this._syncSheet();
      const title = this._root.querySelector('.sheet [data-f="title"]');
      if (title) title.focus();
    }

    _closeSheet() {
      this._editing = null;
      this._creating = false;
      this._confirm = null;
      this._draftSubs = [];
      this._subSig = null;
      this._root.getElementById("overlay").innerHTML = "";
    }

    /** Keeps the modal in step with state without ever rebuilding it while someone is typing in it. */
    _syncSheet() {
      const host = this._root.getElementById("overlay");
      const snap = this._snap;
      if (!snap || (!this._creating && !this._editing)) { if (host.firstChild) host.innerHTML = ""; return; }
      if (this._creating) {
        if (!host.firstChild) host.innerHTML = this._sheet("new", this._blankTask());
        return;
      }
      const task = snap.tasks.find((x) => x.id === this._editing);
      if (!task) { this._closeSheet(); return; }
      if (!host.firstChild) { host.innerHTML = this._sheet("edit", task); this._subSig = JSON.stringify(task.subtasks); return; }
      const sig = JSON.stringify(task.subtasks);
      const focused = this._root.activeElement;
      if (sig !== this._subSig && !(focused && focused.dataset && focused.dataset.f === "subtitle")) {
        this._subSig = sig;
        const box = host.querySelector("#sheetsubs");
        if (box) box.innerHTML = this._subsHtml(task.subtasks, "edit");
      }
    }

    _subsHtml(subs, mode) {
      const t = this._t;
      if (!subs.length) return `<div class="muted" style="font-size:.9rem">${esc(t.sub_none)}</div>`;
      return subs.map((s, i) => `<div class="subrow ${s.done ? "done" : ""}" data-sub="${esc(mode === "edit" ? s.id : i)}">
          ${mode === "edit"
            ? `<button type="button" class="check" data-act="sheetsubtoggle" style="${s.done ? "background:var(--tk-muted);color:#fff" : ""}"><ha-icon icon="mdi:check"></ha-icon></button>`
            : '<span style="width:18px;text-align:center;color:var(--tk-muted)">•</span>'}
          <input type="text" class="subtitle" data-f="subtitle" value="${esc(s.title)}">
          <button type="button" class="iconbtn" data-act="sheetsubremove" style="width:28px;height:28px" title="${esc(t.delete)}"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("");
    }

    _previewHtml(text) {
      const t = this._t;
      if (!text.trim()) return "";
      const p = parseQuickAdd(text, this._today);
      const bits = [];
      if (p.due_date) bits.push(`<span class="chip filter"><ha-icon icon="mdi:calendar"></ha-icon>${esc(relativeDay(p.due_date, this._today, t, this._lang))}${p.due_time ? " " + esc(p.due_time) : ""}</span>`);
      if (p.priority) bits.push(`<span class="chip filter"><ha-icon icon="mdi:flag" style="color:${PRIO_COLORS[p.priority]}"></ha-icon>${esc(t[PRIO_NAMES[p.priority]])}</span>`);
      if (p.recurrence) bits.push(`<span class="chip filter"><ha-icon icon="mdi:repeat"></ha-icon>${esc(describeRecurrence(p.recurrence, t))}</span>`);
      for (const tag of p.tags) bits.push(`<span class="chip filter"><ha-icon icon="mdi:tag"></ha-icon>${esc(tag)}</span>`);
      return bits.length ? `<span>${esc(t.parsed)}:</span>${bits.join("")}` : "";
    }

    // ----- rendering -----
    _view() { return this._config.view === "list" ? "all" : this._config.view; }

    _update() {
      if (!this._root) return;
      const t = this._t;
      const snap = this._snap;
      const cfg = this._config;
      const root = this._root;
      const view = this._view();

      root.querySelector("h2").textContent = cfg.title ?? t[{ all: "all", today: "today", upcoming: "upcoming", done: "done" }[view]] ?? "Tickoff";

      // header pills and buttons
      const open = snap ? snap.tasks.filter((x) => x.status === "open") : [];
      const overdue = open.filter((x) => x.state === "overdue").length;
      const today = open.filter((x) => x.state === "today").length;
      root.getElementById("pills").innerHTML = snap
        ? (overdue ? `<span class="pill bad">${overdue} ${esc(t.overdue.toLowerCase())}</span> ` : "") +
          (today ? `<span class="pill warn">${today} ${esc(t.today.toLowerCase())}</span> ` : "") +
          `<span class="pill">${open.length} ${esc(t.count_open)}</span>` : "";
      const canAdd = !cfg.read_only && cfg.show_add !== false && view !== "done";
      root.getElementById("headbtns").innerHTML =
        (!cfg.read_only && view === "all" ? `<button class="iconbtn ${cfg.manual ? "on" : ""}" data-act="manual" title="${esc(t.manual_order)}"><ha-icon icon="mdi:sort"></ha-icon></button>` : "") +
        (canAdd ? `<button class="addbtn" data-act="new"><ha-icon icon="mdi:plus"></ha-icon> ${esc(t.new_task)}</button>` : "");

      // tag filter chips
      const tags = usedTags(snap);
      for (const n of [...this._tagFilter]) if (!tags.includes(n)) this._tagFilter.delete(n);
      root.getElementById("chips").innerHTML = tags.length
        ? tags.map((n) => {
            const color = (snap.tags[n] && snap.tags[n].color) || "#9e9e9e";
            return `<span class="chip filter ${this._tagFilter.has(n) ? "on" : ""}" data-act="chip" data-tag="${esc(n)}"><span class="dot" style="background:${esc(color)}"></span>${esc(n)}</span>` +
              (this._editTags ? `<input class="tagcolor" type="color" data-tag="${esc(n)}" value="${esc(color)}">` : "");
          }).join("") + (cfg.read_only ? "" : `<button class="iconbtn ${this._editTags ? "on" : ""}" data-act="edittags" title="${esc(t.edit_tags)}" style="width:28px;height:28px"><ha-icon icon="mdi:palette"></ha-icon></button>`)
        : "";

      // sections and rows
      const box = root.getElementById("list");
      if (!snap) box.innerHTML = `<div class="empty">${esc(t.loading)}</div>`;
      else if (!snap.entity_id) box.innerHTML = `<div class="empty"><ha-icon icon="mdi:cog-outline"></ha-icon>${esc(t.set_up)}</div>`;
      else {
        const sections = buildSections(snap, cfg, this._tagFilter);
        if (!sections.length) {
          const key = { all: "empty_all", today: "empty_today", upcoming: "empty_upcoming", done: "empty_done" }[view];
          box.innerHTML = `<div class="empty"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${esc(t[key])}</div>`;
        } else {
          box.innerHTML = sections.map((s) => this._section(s)).join("");
        }
      }
      const doneCount = snap ? snap.tasks.filter((x) => x.status === "done").length : 0;
      root.getElementById("foot").innerHTML = doneCount && !cfg.read_only && (view === "done" || view === "all")
        ? `<button data-act="clear">${esc(t.clear_completed)} (${doneCount})</button>` : "";
      this._syncSheet();
      const hide = cfg.hide_when_empty && snap && !buildSections(snap, cfg, this._tagFilter).length;
      this.style.display = hide ? "none" : "";
    }

    _sectionTitle(s) {
      const t = this._t;
      if (s.key === "day") return relativeDay(s.date, this._today, t, this._lang);
      return t[{ overdue: "overdue", today: "today", upcoming: "upcoming", no_date: "no_date", done: "done", done_flat: "done", manual: "all" }[s.key]] || s.key;
    }

    _section(s) {
      const collapsed = s.collapsed && this._collapsed[s.key];
      const head = `<div class="section ${s.tone} ${s.collapsed ? "click" : ""}" ${s.collapsed ? `data-act="fold" data-key="${s.key}"` : ""}>
          ${s.collapsed ? `<ha-icon icon="mdi:chevron-${collapsed ? "right" : "down"}"></ha-icon>` : ""}<span>${esc(this._sectionTitle(s))}</span><span class="n">${s.tasks.length}</span></div>`;
      return head + (collapsed ? "" : s.tasks.map((task) => this._task(task, s)).join(""));
    }

    _dueChip(task) {
      if (!task.due_date) return "";
      const t = this._t;
      const tone = task.state === "overdue" ? "bad" : task.state === "today" ? "warn" : "";
      let label = relativeDay(task.due_date, this._today, t, this._lang);
      if (task.due_time) label += " " + task.due_time; // always 24-hour
      return `<span class="due ${tone}"><ha-icon icon="mdi:calendar-clock"></ha-icon>${esc(label)}</span>`;
    }

    _task(task, section) {
      const t = this._t;
      const ro = this._config.read_only;
      const done = task.status === "done";
      const subs = task.subtasks || [];
      const subDone = subs.filter((s) => s.done).length;
      const ring = PRIO_COLORS[task.priority] || "";
      const tagHtml = task.tags.map((n) => {
        const c = (this._snap.tags[n] && this._snap.tags[n].color) || "#9e9e9e";
        return `<span class="chip tag" style="background:${esc(c)};color:${textColor(c)}">${esc(n)}</span>`;
      }).join("");
      const rec = describeRecurrence(task.recurrence, t);
      const draggable = !ro && section.key === "manual" && !done;
      const open = this._open.has(task.id);
      let html = `<div class="task ${done ? "done" : ""} ${open ? "open" : ""}" data-task="${esc(task.id)}" ${draggable ? 'draggable="true"' : ""} style="${ring ? `--tk-ring:${ring}` : ""}">
        ${draggable ? '<ha-icon class="handle" icon="mdi:drag-vertical"></ha-icon>' : ""}
        <button class="check" data-act="toggle" ${ro ? "disabled" : ""} aria-label="toggle"><ha-icon icon="mdi:check"></ha-icon></button>
        <div class="body" data-act="expand">
          <div class="title">${esc(task.title)}</div>
          <div class="meta">${this._dueChip(task)}
            ${rec ? `<span class="due"><ha-icon icon="mdi:repeat"></ha-icon>${esc(rec)}</span>` : ""}
            ${subs.length ? `<span class="sub"><span class="bar"><i style="width:${Math.round((subDone / subs.length) * 100)}%"></i></span>${subDone}/${subs.length}</span>` : ""}
            ${tagHtml}</div>
        </div>
        ${ro ? "" : `<div class="actions">
          ${done ? "" : `<button class="iconbtn" data-act="snooze" title="${esc(t.snooze)}"><ha-icon icon="mdi:alarm-snooze"></ha-icon></button>
          <button class="iconbtn" data-act="edit" title="${esc(t.edit)}"><ha-icon icon="mdi:pencil"></ha-icon></button>`}
          <button class="iconbtn danger" data-act="delete" title="${esc(t.delete)}">${this._confirm === task.id ? `<b style="font-size:.7em">${esc(t.sure)}</b>` : '<ha-icon icon="mdi:delete-outline"></ha-icon>'}</button>
        </div>`}
      </div>`;
      if (open) {
        const subHtml = subs.map((s) => `<div class="subrow ${s.done ? "done" : ""}" data-sub="${esc(s.id)}">
            <button class="check" data-act="subtoggle" ${ro ? "disabled" : ""} style="${s.done ? "background:var(--tk-muted);color:#fff" : ""}"><ha-icon icon="mdi:check"></ha-icon></button><span>${esc(s.title)}</span>
            ${ro ? "" : `<button class="iconbtn" data-act="subremove" style="width:24px;height:24px" title="${esc(t.delete)}"><ha-icon icon="mdi:close"></ha-icon></button>`}</div>`).join("");
        const hist = (task.history || []).slice(-3).reverse().map((h) => `${esc(h.event)} ${esc(fmtStamp(h.at || ""))}`).join(" · ");
        html += `<div class="detail" data-task="${esc(task.id)}">
          ${task.notes ? `<div class="notes">${esc(task.notes)}</div>` : ""}${subHtml}
          ${ro ? "" : `<input class="subadd" type="text" data-act="subadd" placeholder="${esc(t.add_subtask)}">`}
          ${hist ? `<div class="hist">${esc(t.history)}: ${hist}</div>` : ""}</div>`;
      }
      return html;
    }

    _sheet(mode, task) {
      const t = this._t;
      const snap = this._snap;
      const rule = task.recurrence || {};
      const wd = rule.weekdays || [];
      const allTags = Object.keys(snap.tags).sort((a, b) => a.localeCompare(b));
      const today = this._today;
      const label = (text) => `<span style="font-size:.78em;font-weight:600;color:var(--tk-muted);text-transform:uppercase;letter-spacing:.4px">${esc(text)}</span>`;
      const isNew = mode === "new";
      return `<div class="overlay" data-act="backdrop"><div class="sheet" role="dialog" data-mode="${mode}" data-task="${esc(task.id || "")}">
        <h3>${esc(isNew ? t.new_task : t.edit_task)}</h3>
        <label class="f">${esc(t.editor_title)}<input type="text" data-f="title" autocomplete="off" value="${esc(task.title)}" placeholder="${esc(isNew ? t.add_placeholder : "")}"></label>
        ${isNew ? '<div class="preview" id="sheetpreview"></div>' : ""}
        <label class="f">${esc(t.notes)}<textarea data-f="notes" rows="2">${esc(task.notes)}</textarea></label>
        <div class="f" style="display:flex;flex-direction:column;gap:6px">${label(t.subtasks)}
          <div id="sheetsubs">${this._subsHtml(isNew ? (this._draftSubs || []).map((x) => ({ title: x, done: false })) : task.subtasks, mode)}</div>
          <input type="text" data-f="newsub" autocomplete="off" placeholder="${esc(t.sub_placeholder)}"></div>
        <div class="f" style="display:flex;flex-direction:column;gap:6px">${label(t.due_date)}
          <div class="quick">
            <button type="button" class="chip filter" data-act="qdate" data-d="${today}">${esc(t.today)}</button>
            <button type="button" class="chip filter" data-act="qdate" data-d="${addDays(today, 1)}">${esc(t.tomorrow)}</button>
            <button type="button" class="chip filter" data-act="qdate" data-d="${addDays(today, 7)}">${esc(t.next_week)}</button>
            <button type="button" class="chip filter" data-act="qdate" data-d="">${esc(t.none)}</button></div>
          <div class="row2">${dateField('data-f="due_date"', task.due_date, t)}${timeField('data-f="due_time"', task.due_time, t)}</div></div>
        <div class="f" style="display:flex;flex-direction:column;gap:6px">${label(t.priority)}
          <div class="seg" data-f="priority" data-v="${task.priority}">${PRIO_NAMES.map((n, i) => `<button type="button" data-act="prio" data-v="${i}" class="${task.priority === i ? "on" : ""}">${esc(t[n])}</button>`).join("")}</div></div>
        <div class="f" style="display:flex;flex-direction:column;gap:6px">${label(t.tags)}
          <div class="chips" style="padding:0" data-f="tags">
            ${allTags.map((n) => `<span class="chip filter ${task.tags.includes(n) ? "on" : ""}" data-act="sheettag" data-tag="${esc(n)}"><span class="dot" style="background:${esc(snap.tags[n].color)}"></span>${esc(n)}</span>`).join("")}
            <span class="newtag"><input type="text" data-f="newtag" placeholder="${esc(t.new_tag)}"></span></div></div>
        <div class="f" style="display:flex;flex-direction:column;gap:6px">${label(t.repeat)}
          <div class="row2"><select data-f="rtype">${REC_TYPES.map((v) => `<option value="${v}" ${(rule.type || "") === v ? "selected" : ""}>${esc(v ? t[v] : t.none)}</option>`).join("")}</select>
          <input type="number" min="1" data-f="rint" value="${esc(rule.type === "after_completion" ? rule.days : rule.interval || 1)}"></div>
          <div class="wd">${t.wd.map((n, i) => `<label><input type="checkbox" data-f="wd" value="${i}" ${wd.includes(i) ? "checked" : ""}>${esc(n)}</label>`).join("")}</div></div>
        <div class="sheetfoot">${isNew ? "" : `<button type="button" class="btn danger" data-act="sheetdelete">${this._confirm === "sheet" ? esc(t.sure) : esc(t.delete)}</button>`}<span class="grow"></span>
          <button type="button" class="btn" data-act="cancel">${esc(t.cancel)}</button><button type="button" class="btn primary" data-act="save">${esc(isNew ? t.add_task : t.save)}</button></div>
      </div></div>`;
    }

    // ----- events -----
    _task_(e) {
      const el = e.target.closest("[data-task]");
      return el && this._snap ? this._snap.tasks.find((x) => x.id === el.dataset.task) : null;
    }

    _onClick(e) {
      const btn = e.target.closest("[data-act]");
      if (!btn || btn.tagName === "INPUT") return;
      const act = btn.dataset.act;
      if (act === "fold") { this._collapsed[btn.dataset.key] = !this._collapsed[btn.dataset.key]; this._update(); return; }
      const task = this._task_(e);
      if (!task) return;
      if (act === "expand") { this._open.has(task.id) ? this._open.delete(task.id) : this._open.add(task.id); this._update(); return; }
      if (this._config.read_only) return;
      if (act === "toggle") this._call(task.status === "done" ? "reopen_task" : "complete_task", { task_id: task.id });
      else if (act === "snooze") this._call("snooze_task", { task_id: task.id });
      else if (act === "edit") { this._editing = task.id; this._creating = false; this._syncSheet(); }
      else if (act === "delete") {
        if (this._confirm === task.id) { this._confirm = null; this._call("delete_task", { task_id: task.id }); }
        else {
          this._confirm = task.id; // second click within 3 s confirms
          this._update();
          clearTimeout(this._confirmTimer);
          this._confirmTimer = setTimeout(() => { this._confirm = null; this._update(); }, 3000);
        }
      } else if (act === "subtoggle") {
        const sub = task.subtasks.find((s) => s.id === btn.closest("[data-sub]").dataset.sub);
        this._call("update_subtask", { task_id: task.id, subtask_id: sub.id, done: !sub.done });
      } else if (act === "subremove") this._call("remove_subtask", { task_id: task.id, subtask_id: btn.closest("[data-sub]").dataset.sub });
    }

    _onKey(e) {
      if (e.key !== "Enter" || e.target.dataset.act !== "subadd" || !e.target.value.trim()) return;
      const task = this._task_(e);
      if (!task) return;
      this._call("add_subtask", { task_id: task.id, title: e.target.value.trim() });
      e.target.value = "";
    }

    _sheetCtx() {
      const sheet = this._root.querySelector(".sheet");
      if (!sheet) return null;
      const f = (n) => sheet.querySelector(`[data-f="${n}"]`);
      const mode = sheet.dataset.mode;
      const task = mode === "edit" ? this._snap.tasks.find((x) => x.id === sheet.dataset.task) : null;
      return { sheet, f, mode, task };
    }

    _renderDraftSubs() {
      const box = this._root.querySelector("#sheetsubs");
      if (box) box.innerHTML = this._subsHtml((this._draftSubs || []).map((x) => ({ title: x, done: false })), "new");
    }

    _onSheetInput(e) {
      const el = e.target;
      if (!el.dataset || el.dataset.f !== "title") return;
      const preview = this._root.getElementById("sheetpreview");
      if (preview) preview.innerHTML = this._previewHtml(el.value); // quick-add words are understood while creating
    }

    _addSheetSub(ctx) {
      const input = ctx.f("newsub");
      const title = input.value.trim();
      if (!title) return;
      input.value = "";
      if (ctx.mode === "edit") this._call("add_subtask", { task_id: ctx.task.id, title });
      else { this._draftSubs = [...(this._draftSubs || []), title]; this._renderDraftSubs(); }
      input.focus();
    }

    _onSheetKey(e) {
      const ctx = this._sheetCtx();
      if (e.key === "Escape") { this._closeSheet(); return; }
      if (!ctx || e.key !== "Enter") return;
      if (e.target.dataset.f === "newsub") { e.preventDefault(); this._addSheetSub(ctx); }
      else if (e.target.dataset.f === "title") { e.preventDefault(); this._saveSheet(ctx); }
      else if (e.target.dataset.f === "subtitle") e.target.blur();
    }

    _onSheetChange(e) {
      const el = e.target;
      const ctx = this._sheetCtx();
      if (!ctx || !el.dataset || el.dataset.f !== "subtitle") return;
      const row = el.closest("[data-sub]");
      const title = el.value.trim();
      if (ctx.mode === "edit") {
        if (title) this._call("update_subtask", { task_id: ctx.task.id, subtask_id: row.dataset.sub, title });
        else this._call("remove_subtask", { task_id: ctx.task.id, subtask_id: row.dataset.sub });
      } else {
        const i = +row.dataset.sub;
        if (title) this._draftSubs[i] = title;
        else this._draftSubs.splice(i, 1);
        this._renderDraftSubs();
      }
    }

    _saveSheet(ctx) {
      const { sheet, f, mode, task } = ctx;
      const date = parseDateText(f("due_date").value);
      const time = parseTimeText(f("due_time").value);
      f("due_date").classList.toggle("bad", date === null);
      f("due_time").classList.toggle("bad", time === null);
      if (date === null || time === null) return; // keep the modal open
      const tags = [...sheet.querySelectorAll('[data-act="sheettag"].on')].map((c) => c.dataset.tag);
      const extra = f("newtag").value.split(",").map((x) => x.trim()).filter(Boolean);
      const typedRule = recurrenceFromForm({
        type: f("rtype").value, interval: f("rint").value, days: f("rint").value,
        weekdays: [...sheet.querySelectorAll('[data-f="wd"]:checked')].map((x) => +x.value),
      });
      const pendingSub = f("newsub").value.trim();

      if (mode === "new") {
        const text = f("title").value.trim();
        if (!text) { f("title").classList.add("bad"); f("title").focus(); return; }
        const p = parseQuickAdd(text, this._today); // "Call mom tomorrow 14:30 #family !high"
        const d = date || p.due_date;
        const tm = time || p.due_time;
        const prio = +f("priority").dataset.v || p.priority;
        const allTags = [...new Set([...tags, ...extra, ...p.tags])];
        let rule = typedRule;
        if (!rule && p.recurrence) rule = p.recurrence;
        const data = { title: p.title };
        if (f("notes").value.trim()) data.notes = f("notes").value.trim();
        if (d) data.due_date = d;
        if (d && tm) data.due_time = tm + ":00";
        if (prio) data.priority = prio;
        if (allTags.length) data.tags = allTags;
        if (rule) data.recurrence = rule;
        const subs = [...(this._draftSubs || []), ...(pendingSub ? [pendingSub] : [])];
        if (subs.length) data.subtasks = subs;
        this._call("add_task", data);
        this._closeSheet();
        return;
      }
      const data = {
        task_id: task.id,
        title: f("title").value.trim() || task.title,
        notes: f("notes").value.trim() || null,
        due_date: date || null,
        due_time: date && time ? time + ":00" : null,
        priority: +f("priority").dataset.v,
        tags: [...tags, ...extra],
        recurrence: typedRule,
      };
      this._call("update_task", data);
      if (pendingSub) this._call("add_subtask", { task_id: task.id, title: pendingSub });
      this._closeSheet();
    }

    _onSheet(e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "backdrop" && e.target === btn) { this._closeSheet(); return; }
      const ctx = this._sheetCtx();
      if (!ctx) return;
      const { sheet, f, task } = ctx;
      if (act === "qdate") { f("due_date").value = fmtDate(btn.dataset.d); f("due_date").classList.remove("bad"); if (!btn.dataset.d) f("due_time").value = ""; }
      else if (act === "prio") { sheet.querySelectorAll('[data-act="prio"]').forEach((b) => b.classList.toggle("on", b === btn)); f("priority").dataset.v = btn.dataset.v; }
      else if (act === "sheettag") btn.classList.toggle("on");
      else if (act === "cancel") this._closeSheet();
      else if (act === "sheetsubtoggle") {
        const sub = task.subtasks.find((x) => x.id === btn.closest("[data-sub]").dataset.sub);
        if (sub) this._call("update_subtask", { task_id: task.id, subtask_id: sub.id, done: !sub.done });
      } else if (act === "sheetsubremove") {
        const row = btn.closest("[data-sub]");
        if (ctx.mode === "edit") this._call("remove_subtask", { task_id: task.id, subtask_id: row.dataset.sub });
        else { this._draftSubs.splice(+row.dataset.sub, 1); this._renderDraftSubs(); }
      } else if (act === "sheetdelete") {
        if (this._confirm === "sheet") { this._call("delete_task", { task_id: task.id }); this._closeSheet(); }
        else { this._confirm = "sheet"; btn.textContent = this._t.sure; }
      } else if (act === "save") this._saveSheet(ctx);
    }

    _onMask(e) {
      const el = e.target;
      if (!el.dataset || !el.dataset.mask) return;
      el.value = el.dataset.mask === "date" ? maskDate(el.value) : maskTime(el.value);
      el.classList.remove("bad");
    }

    _onPick(e) {
      const btn = e.target.closest && e.target.closest('[data-act="pickdate"]');
      if (!btn) return;
      const wrap = btn.closest(".dt");
      const hidden = wrap.querySelector(".pickhidden");
      hidden.value = parseDateText(wrap.querySelector('[data-mask="date"]').value) || "";
      try { hidden.showPicker(); } catch (err) { hidden.focus(); }
    }

    _onPicked(e) {
      const el = e.target;
      if (!el.classList || !el.classList.contains("pickhidden")) return;
      const text = el.closest(".dt").querySelector('[data-mask="date"]');
      text.value = fmtDate(el.value);
      text.classList.remove("bad");
    }

    _onHead(e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "manual") { this._config = { ...this._config, manual: !this._config.manual }; this._update(); }
      else if (btn.dataset.act === "new") this._openNew();
    }

    _onChip(e) {
      const chip = e.target.closest("[data-act]");
      if (!chip) return;
      if (chip.dataset.act === "edittags") this._editTags = !this._editTags;
      else if (chip.dataset.act === "chip") {
        const n = chip.dataset.tag;
        this._tagFilter.has(n) ? this._tagFilter.delete(n) : this._tagFilter.add(n);
      }
      this._update();
    }

    _onTagColor(e) {
      const el = e.target;
      if (el.type === "color" && el.dataset.tag && !this._config.read_only) this._call_global("set_tag", { name: el.dataset.tag, color: el.value });
    }

    _call_global(service, data) { return this._hass.callService("tickoff", service, data); }

    _onFoot(e) { if (e.target.closest("[data-act=clear]")) this._call("delete_completed", {}); }

    _onDragStart(e) {
      const row = e.target.closest && e.target.closest(".task[data-task]");
      if (!row || row.getAttribute("draggable") !== "true") return;
      this._drag = { id: row.dataset.task };
      if (e.dataTransfer) e.dataTransfer.setData("text/plain", row.dataset.task);
    }

    _onDragOver(e) {
      const row = e.target.closest && e.target.closest(".task[data-task]");
      if (!row || !this._drag) return;
      e.preventDefault();
      row.classList.add("dragover");
    }

    _onDrop(e) {
      const row = e.target.closest && e.target.closest(".task[data-task]");
      const drag = this._drag;
      this._drag = null;
      this._root.querySelectorAll(".dragover").forEach((x) => x.classList.remove("dragover"));
      if (!row || !drag || row.dataset.task === drag.id) return;
      e.preventDefault();
      const order = this._snap.tasks.map((t) => t.id);
      const after = order.indexOf(drag.id) < order.indexOf(row.dataset.task);
      const previous = dropTarget(this._snap.tasks, drag.id, row.dataset.task, after);
      if (previous === undefined) return;
      this._call("move_task", previous === null ? { task_id: drag.id } : { task_id: drag.id, previous_task_id: previous });
    }
  }

  // ---------- visual editor (ha-form) ----------
  class TickoffCardEditor extends HTMLElement {
    setConfig(config) { this._config = config; this._render(); }

    set hass(hass) { this._hass = hass; this._render(); }

    _render() {
      if (!this._hass || !this._config) return;
      const lang = ((this._hass.locale && this._hass.locale.language) || "en").slice(0, 2);
      const t = I18N[lang] || I18N.en;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.addEventListener("value-changed", (e) => {
          e.stopPropagation();
          const v = { ...e.detail.value };
          v.hide_when_empty = !!v.hide_empty; // the form field is called hide_empty, the config key hide_when_empty
          delete v.hide_empty;
          if (!v.tags || !v.tags.length) delete v.tags;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      const data = { view: "all", show_completed: true, show_add: true, ...this._config };
      data.hide_empty = !!data.hide_when_empty;
      this._form.hass = this._hass;
      this._form.data = data;
      this._form.computeLabel = (s) => t["editor_" + s.name] || s.name;
      this._form.schema = [
        { name: "title", selector: { text: {} } },
        { name: "view", selector: { select: { mode: "dropdown", options: ["all", "today", "upcoming", "done"].map((v) => ({ value: v, label: t["view_" + v] })) } } },
        { name: "tags", selector: { text: { multiple: true } } },
        { name: "show_completed", selector: { boolean: {} } },
        { name: "show_add", selector: { boolean: {} } },
        { name: "manual", selector: { boolean: {} } },
        { name: "read_only", selector: { boolean: {} } },
        { name: "compact", selector: { boolean: {} } },
        { name: "hide_empty", selector: { boolean: {} } },
      ];
    }
  }

  customElements.define("tickoff-card", TickoffCard);
  customElements.define("tickoff-card-editor", TickoffCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "tickoff-card", name: "Tickoff", preview: false,
    description: "Tasks with quick add, tags, priority, subtasks, recurrence and a today view.",
  });
  window.__tickoff = { fmtDate, parseDateText, parseTimeText, maskDate, maskTime, esc, textColor, parseQuickAdd, buildSections, usedTags, dropTarget, recurrenceFromForm, describeRecurrence, relativeDay, VERSION };
})();
