/*
 * Tickoff card - the dashboard card of the Tickoff integration.
 * Plain JavaScript, no build step and no dependencies. Served by the integration itself.
 *
 *   type: custom:tickoff-card
 *   entities: [todo.tickoff_groceries]   # omit to show every Tickoff list
 *   view: list                           # list | today
 */
(() => {
  "use strict";

  const VERSION = "0.1.0";
  if (customElements.get("tickoff-card")) return;

  const I18N = {
    en: {
      add_placeholder: "Add a task", add: "Add", more: "More options", notes: "Notes", due_date: "Due date",
      due_time: "Time", priority: "Priority", tags: "Tags (comma separated)", repeat: "Repeat",
      none: "None", low: "Low", medium: "Medium", high: "High",
      daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly",
      after_completion: "N days after completing", every: "Every", days: "days", save: "Save", cancel: "Cancel",
      snooze: "Snooze to tomorrow", edit: "Edit", delete: "Delete", sure: "Sure?", clear_completed: "Clear completed",
      today_title: "Today", overdue: "Overdue", nothing: "Nothing to do",
      add_subtask: "Add a subtask", edit_tags: "Edit tags",
      done_tasks: "Completed", loading: "Loading...",
      no_lists: "No Tickoff lists found. Add one under Settings > Devices & services.",
      wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], history: "History",
      editor_title: "Title", editor_view: "View", editor_entities: "Lists (empty = all)",
      editor_show_completed: "Show completed tasks", editor_show_add: "Show add form",
      editor_read_only: "Read only", editor_compact: "Compact", editor_hide_empty: "Hide when empty",
      view_list: "List", view_today: "Today overview",
    },
    nl: {
      add_placeholder: "Taak toevoegen", add: "Toevoegen", more: "Meer opties", notes: "Notities", due_date: "Vervaldatum",
      due_time: "Tijd", priority: "Prioriteit", tags: "Tags (kommagescheiden)", repeat: "Herhalen",
      none: "Geen", low: "Laag", medium: "Midden", high: "Hoog",
      daily: "Dagelijks", weekly: "Wekelijks", monthly: "Maandelijks", yearly: "Jaarlijks",
      after_completion: "N dagen na afvinken", every: "Elke", days: "dagen", save: "Opslaan", cancel: "Annuleren",
      snooze: "Uitstellen tot morgen", edit: "Bewerken", delete: "Verwijderen", sure: "Zeker?", clear_completed: "Voltooide wissen",
      today_title: "Vandaag", overdue: "Achterstallig", nothing: "Niets te doen",
      add_subtask: "Subtaak toevoegen", edit_tags: "Tags bewerken",
      done_tasks: "Voltooid", loading: "Laden...",
      no_lists: "Geen Tickoff-lijsten gevonden. Voeg er een toe via Instellingen > Apparaten & diensten.",
      wd: ["ma", "di", "wo", "do", "vr", "za", "zo"], history: "Geschiedenis",
      editor_title: "Titel", editor_view: "Weergave", editor_entities: "Lijsten (leeg = alle)",
      editor_show_completed: "Voltooide taken tonen", editor_show_add: "Toevoegformulier tonen",
      editor_read_only: "Alleen lezen", editor_compact: "Compact", editor_hide_empty: "Verbergen als leeg",
      view_list: "Lijst", view_today: "Vandaag-overzicht",
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
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#000" : "#fff";
  }

  function normalizeEntities(config) {
    if (Array.isArray(config.entities)) return config.entities.map((e) => (typeof e === "string" ? e : e.entity));
    if (config.entity) return [config.entity];
    return [];
  }

  function selectedLists(snapshot, config) {
    if (!snapshot) return [];
    const wanted = normalizeEntities(config);
    return snapshot.lists.filter((l) => !wanted.length || wanted.includes(l.entity_id));
  }

  /** Tasks to show as [{list, task}]: honours view, list selection, tag filter and the completed toggle. */
  function visibleItems(snapshot, config, tagFilter) {
    const out = [];
    for (const list of selectedLists(snapshot, config)) {
      for (const task of list.tasks) {
        if (config.view === "today") {
          if (task.state !== "overdue" && task.state !== "today") continue;
        } else if (task.status === "done" && config.show_completed === false) continue;
        if (tagFilter.size && !task.tags.some((t) => tagFilter.has(t))) continue;
        out.push({ list, task });
      }
    }
    if (config.view === "today") {
      const rank = { overdue: 0, today: 1 };
      out.sort(
        (a, b) =>
          rank[a.task.state] - rank[b.task.state] ||
          (a.task.due_date || "").localeCompare(b.task.due_date || "") ||
          (a.task.due_time || "99").localeCompare(b.task.due_time || "99") ||
          b.task.priority - a.task.priority,
      );
    } else {
      // stable sort: open tasks first in manual order, completed ones at the bottom
      out.sort((a, b) => (a.task.status === "done") - (b.task.status === "done"));
    }
    return out;
  }

  function usedTags(snapshot, config) {
    const names = new Set();
    for (const l of selectedLists(snapshot, config)) for (const t of l.tasks) t.tags.forEach((x) => names.add(x));
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

  // ---------- the card ----------
  const CSS = `
    :host { display: block; }
    ha-card { padding: 0 0 8px; overflow: hidden; }
    .head { display: flex; align-items: center; gap: 8px; padding: 12px 16px 4px; }
    .head h2 { margin: 0; font-size: 1.2em; font-weight: 500; flex: 1; }
    .count { color: var(--secondary-text-color); font-size: .9em; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 16px; align-items: center; }
    .chip { border: 1px solid transparent; border-radius: 12px; padding: 2px 10px; font-size: .8em; cursor: pointer;
            opacity: .55; user-select: none; }
    .chip.on { opacity: 1; outline: 2px solid var(--primary-color); }
    .chip.static { cursor: default; opacity: 1; padding: 0 8px; font-size: .75em; }
    .tagedit input[type=color] { width: 24px; height: 24px; padding: 0; border: none; background: none; }
    .add { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px; }
    .add input[type=text] { flex: 1; min-width: 140px; }
    input, select, textarea, button { font: inherit; color: var(--primary-text-color); }
    input, select, textarea { background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #ccc);
      border-radius: 6px; padding: 6px 8px; box-sizing: border-box; }
    button { background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
    button:hover { background: var(--secondary-background-color, #eee); }
    button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); padding: 6px 12px; }
    .more { display: none; flex-basis: 100%; gap: 6px; flex-wrap: wrap; }
    .more.open { display: flex; }
    .more textarea { flex-basis: 100%; }
    .row { display: flex; align-items: flex-start; gap: 6px; padding: 6px 16px; border-top: 1px solid var(--divider-color, #eee); }
    .row.dragover { background: var(--secondary-background-color, #eee); }
    .row.done .title { text-decoration: line-through; color: var(--secondary-text-color); }
    .handle { cursor: grab; color: var(--secondary-text-color); padding-top: 2px; user-select: none; }
    .main { flex: 1; min-width: 0; cursor: pointer; }
    .title { word-break: break-word; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: .8em; color: var(--secondary-text-color); margin-top: 2px; }
    .due.overdue { color: var(--error-color, #d32f2f); font-weight: 500; }
    .due.today { color: var(--warning-color, #fb8c00); font-weight: 500; }
    .prio { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .actions { display: flex; opacity: .8; }
    .detail { padding: 4px 0 4px 8px; font-size: .9em; flex: 1; }
    .notes { white-space: pre-wrap; color: var(--secondary-text-color); margin-bottom: 4px; }
    .sub { display: flex; align-items: center; gap: 6px; }
    .sub.done span { text-decoration: line-through; color: var(--secondary-text-color); }
    .subadd { margin-top: 4px; width: 100%; }
    .hist { font-size: .75em; color: var(--secondary-text-color); margin-top: 4px; }
    .editor { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; flex: 1; }
    .editor input[type=text], .editor textarea { flex-basis: 100%; }
    .wd { display: flex; gap: 2px; flex-wrap: wrap; font-size: .8em; }
    .foot { display: flex; justify-content: flex-end; padding: 4px 16px 0; }
    .empty { padding: 16px; color: var(--secondary-text-color); text-align: center; }
    .compact .row { padding: 2px 16px; } .compact .meta { margin-top: 0; }
    .listname { font-size: .75em; color: var(--secondary-text-color); }
  `;

  class TickoffCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._tagFilter = new Set();
      this._open = new Set();
      this._editing = null;
      this._editTags = false;
      this._confirm = null;
      this._t = I18N.en;
    }

    static getConfigElement() {
      return document.createElement("tickoff-card-editor");
    }

    static getStubConfig(hass) {
      const first = Object.keys((hass && hass.states) || {}).find((e) => e.startsWith("todo.tickoff_"));
      return { view: "list", entities: first ? [first] : [] };
    }

    setConfig(config) {
      if (!config) throw new Error("Invalid configuration");
      this._config = { view: "list", show_completed: true, show_add: true, read_only: false, compact: false, ...config };
      this._build();
      this._update();
    }

    getCardSize() {
      return 4;
    }

    set hass(hass) {
      this._hass = hass;
      const lang = ((hass.locale && hass.locale.language) || hass.language || "en").slice(0, 2);
      this._t = I18N[lang] || I18N.en;
      if (!this._unsub && !this._subscribing && this.isConnected) this._subscribe();
    }

    connectedCallback() {
      if (this._hass && !this._unsub && !this._subscribing) this._subscribe();
    }

    disconnectedCallback() {
      if (this._unsub) this._unsub();
      this._unsub = null;
      this._disconnected = true;
    }

    async _subscribe() {
      this._subscribing = true;
      this._disconnected = false;
      try {
        const unsub = await this._hass.connection.subscribeMessage((snap) => {
          this._snap = snap;
          this._update();
        }, { type: "tickoff/subscribe" });
        if (this._disconnected) unsub();
        else this._unsub = unsub;
      } finally {
        this._subscribing = false;
      }
    }

    _call(service, data, entityId) {
      return this._hass.callService("tickoff", service, data, entityId ? { entity_id: entityId } : undefined);
    }

    // ----- static skeleton (built once per config, so typed text in the add form survives updates) -----
    _build() {
      this.shadowRoot.innerHTML = `<style>${CSS}</style>
        <ha-card class="${this._config.compact ? "compact" : ""}">
          <div class="head"><h2></h2><span class="count"></span></div>
          <div class="chips" id="chips"></div>
          <div class="add" id="add"></div>
          <div id="list"></div>
          <div class="foot" id="foot"></div>
        </ha-card>`;
      this._root = this.shadowRoot;
      this._buildAdd();
      const list = this._root.getElementById("list");
      list.addEventListener("click", (e) => this._onClick(e));
      list.addEventListener("keydown", (e) => this._onKey(e));
      list.addEventListener("change", (e) => this._onChange(e));
      list.addEventListener("dragstart", (e) => this._onDragStart(e));
      list.addEventListener("dragover", (e) => this._onDragOver(e));
      list.addEventListener("dragleave", (e) => e.target.closest && e.target.closest(".row") && e.target.closest(".row").classList.remove("dragover"));
      list.addEventListener("drop", (e) => this._onDrop(e));
      this._root.getElementById("chips").addEventListener("click", (e) => this._onChipClick(e));
      this._root.getElementById("chips").addEventListener("input", (e) => this._onTagColor(e));
      this._root.getElementById("foot").addEventListener("click", (e) => this._onFoot(e));
    }

    _buildAdd() {
      const t = this._t;
      const box = this._root.getElementById("add");
      const hidden = !this._config.show_add || this._config.read_only || this._config.view === "today";
      box.style.display = hidden ? "none" : "";
      box.innerHTML = `
        <select id="addlist" style="display:none"></select>
        <input type="text" id="addtitle" placeholder="${esc(t.add_placeholder)}">
        <button class="primary" id="addbtn">${esc(t.add)}</button>
        <button id="addmore" title="${esc(t.more)}">&#9881;</button>
        <div class="more" id="addextra">
          <textarea id="addnotes" rows="2" placeholder="${esc(t.notes)}"></textarea>
          <input type="date" id="adddate"><input type="time" id="addtime">
          <select id="addprio">${PRIO_NAMES.map((n, i) => `<option value="${i}">${esc(t.priority)}: ${esc(t[n])}</option>`).join("")}</select>
          <input type="text" id="addtags" placeholder="${esc(t.tags)}">
          <select id="addrec">${REC_TYPES.map((v) => `<option value="${v}">${esc(v ? t[v] : t.repeat + ": " + t.none)}</option>`).join("")}</select>
          <input type="number" id="addint" min="1" value="1" style="width:70px" title="${esc(t.every)}">
        </div>`;
      const $ = (id) => box.querySelector("#" + id);
      $("addbtn").addEventListener("click", () => this._submitAdd());
      $("addtitle").addEventListener("keydown", (e) => e.key === "Enter" && this._submitAdd());
      $("addmore").addEventListener("click", () => $("addextra").classList.toggle("open"));
    }

    _targetList() {
      const sel = this._root.getElementById("addlist");
      if (sel && sel.value) return sel.value;
      const wanted = normalizeEntities(this._config);
      return wanted[0] || (this._snap && this._snap.lists[0] && this._snap.lists[0].entity_id);
    }

    _submitAdd() {
      const $ = (id) => this._root.getElementById(id);
      const title = $("addtitle").value.trim();
      const entity = this._targetList();
      if (!title || !entity) return;
      const data = { title };
      if ($("addnotes").value.trim()) data.notes = $("addnotes").value.trim();
      if ($("adddate").value) data.due_date = $("adddate").value;
      if ($("adddate").value && $("addtime").value) data.due_time = $("addtime").value + ":00";
      if (+$("addprio").value) data.priority = +$("addprio").value;
      const tags = $("addtags").value.split(",").map((x) => x.trim()).filter(Boolean);
      if (tags.length) data.tags = tags;
      const rec = $("addrec").value;
      if (rec) {
        const weekday = $("adddate").value ? (new Date($("adddate").value + "T00:00:00").getDay() + 6) % 7 : null;
        data.recurrence = recurrenceFromForm({
          type: rec, interval: $("addint").value, days: $("addint").value, weekdays: weekday === null ? [] : [weekday],
        });
      }
      this._call("add_task", data, entity);
      for (const id of ["addtitle", "addnotes", "adddate", "addtime", "addtags"]) $(id).value = "";
      $("addprio").value = "0";
      $("addrec").value = "";
    }

    // ----- rendering -----
    _update() {
      if (!this._root) return;
      const t = this._t;
      const snap = this._snap;
      const cfg = this._config;
      const root = this._root;
      const lists = selectedLists(snap, cfg);

      const title = cfg.title ?? (cfg.view === "today" ? t.today_title : lists.length === 1 ? lists[0].name : "Tickoff");
      root.querySelector("h2").textContent = title;

      const sel = root.getElementById("addlist");
      if (sel) {
        const prev = sel.value;
        sel.innerHTML = lists.map((l) => `<option value="${esc(l.entity_id)}">${esc(l.name)}</option>`).join("");
        sel.style.display = lists.length > 1 ? "" : "none";
        if (lists.some((l) => l.entity_id === prev)) sel.value = prev;
      }

      const tags = usedTags(snap, cfg);
      for (const n of [...this._tagFilter]) if (!tags.includes(n)) this._tagFilter.delete(n);
      const chips = tags.map((n) => {
        const color = (snap.tags[n] && snap.tags[n].color) || "#9e9e9e";
        const edit = this._editTags
          ? `<span class="tagedit"><input type="color" data-tag="${esc(n)}" value="${esc(color)}"></span>` : "";
        return `<span class="chip ${this._tagFilter.has(n) ? "on" : ""}" data-act="chip" data-tag="${esc(n)}"
          style="background:${esc(color)};color:${textColor(color)}">${esc(n)}</span>${edit}`;
      }).join("");
      root.getElementById("chips").innerHTML = tags.length
        ? chips + (cfg.read_only ? "" : `<button data-act="edittags" title="${esc(t.edit_tags)}">&#127912;</button>`) : "";

      const items = visibleItems(snap, cfg, this._tagFilter);
      root.querySelector(".count").textContent = snap ? String(items.filter((i) => i.task.status !== "done").length) : "";
      const box = root.getElementById("list");
      if (!snap) box.innerHTML = `<div class="empty">${esc(t.loading)}</div>`;
      else if (!lists.length) box.innerHTML = `<div class="empty">${esc(t.no_lists)}</div>`;
      else if (!items.length) box.innerHTML = `<div class="empty">${esc(t.nothing)}</div>`;
      else {
        let html = "";
        let sectionDone = false;
        for (const { list, task } of items) {
          if (cfg.view !== "today" && task.status === "done" && !sectionDone) {
            sectionDone = true;
            html += `<div class="chips"><span class="count">${esc(t.done_tasks)}</span></div>`;
          }
          html += this._row(list, task, lists.length > 1 || cfg.view === "today");
        }
        box.innerHTML = html;
      }
      const doneCount = lists.reduce((n, l) => n + l.tasks.filter((x) => x.status === "done").length, 0);
      root.getElementById("foot").innerHTML = doneCount && !cfg.read_only && cfg.view !== "today"
        ? `<button data-act="clear">${esc(t.clear_completed)} (${doneCount})</button>` : "";
      this.style.display = cfg.hide_when_empty && snap && !items.length ? "none" : "";
    }

    _due(task) {
      if (!task.due_date) return "";
      const t = this._t;
      const h = this._hass || {};
      const lang = (h.locale && h.locale.language) || h.language || "en";
      let label = new Date(task.due_date + "T00:00:00").toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" });
      if (task.due_time) {
        const fmt = h.locale && h.locale.time_format; // respects the user's 12/24 hour setting
        const opts = { hour: "2-digit", minute: "2-digit" };
        if (fmt === "12") opts.hour12 = true;
        else if (fmt === "24") opts.hour12 = false;
        label += " " + new Date(`${task.due_date}T${task.due_time}`).toLocaleTimeString(lang, opts);
      }
      return label + (task.state === "overdue" ? ` (${t.overdue.toLowerCase()})` : "");
    }

    _deleteBtn(task) {
      return `<button data-act="delete" title="${esc(this._t.delete)}">${this._confirm === task.id ? esc(this._t.sure) : "&#128465;"}</button>`;
    }

    _row(list, task, showList) {
      const t = this._t;
      const ro = this._config.read_only;
      const done = task.status === "done";
      const subs = task.subtasks || [];
      const subDone = subs.filter((s) => s.done).length;
      const tagHtml = task.tags.map((n) => {
        const c = (this._snap.tags[n] && this._snap.tags[n].color) || "#9e9e9e";
        return `<span class="chip static" style="background:${esc(c)};color:${textColor(c)}">${esc(n)}</span>`;
      }).join("");
      const rec = describeRecurrence(task.recurrence, t);
      const draggable = !ro && this._config.view !== "today" && !done;
      const attrs = `data-task="${esc(task.id)}" data-list="${esc(list.entity_id)}"`;
      let html = `<div class="row ${done ? "done" : ""}" ${attrs} ${draggable ? 'draggable="true"' : ""}>
        ${draggable ? '<span class="handle">&#8942;&#8942;</span>' : ""}
        <input type="checkbox" data-act="toggle" ${done ? "checked" : ""} ${ro ? "disabled" : ""}>
        <div class="main" data-act="expand">
          <div class="title">${task.priority ? `<span class="prio" style="background:${PRIO_COLORS[task.priority]}" title="${esc(t[PRIO_NAMES[task.priority]])}"></span>` : ""}${esc(task.title)}</div>
          <div class="meta">
            ${task.due_date ? `<span class="due ${esc(task.state)}">${esc(this._due(task))}</span>` : ""}
            ${rec ? `<span title="${esc(t.repeat)}">&#8635; ${esc(rec)}</span>` : ""}
            ${subs.length ? `<span>&#9745; ${subDone}/${subs.length}</span>` : ""}
            ${showList ? `<span class="listname">${esc(list.name)}</span>` : ""}
            ${tagHtml}
          </div>
        </div>
        ${ro ? "" : done ? `<div class="actions">${this._deleteBtn(task)}</div>` : `<div class="actions">
          <button data-act="snooze" title="${esc(t.snooze)}">&#9200;</button>
          <button data-act="edit" title="${esc(t.edit)}">&#9998;</button>
          ${this._deleteBtn(task)}
        </div>`}
      </div>`;
      if (this._editing === task.id) html += this._editor(list, task);
      else if (this._open.has(task.id)) html += this._detail(list, task);
      return html;
    }

    _detail(list, task) {
      const t = this._t;
      const ro = this._config.read_only;
      const subs = (task.subtasks || []).map((s) => `<label class="sub ${s.done ? "done" : ""}">
          <input type="checkbox" data-act="subtoggle" data-sub="${esc(s.id)}" ${s.done ? "checked" : ""} ${ro ? "disabled" : ""}>
          <span>${esc(s.title)}</span>
          ${ro ? "" : `<button data-act="subremove" data-sub="${esc(s.id)}" title="${esc(t.delete)}">&times;</button>`}</label>`).join("");
      const hist = (task.history || []).slice(-3).reverse()
        .map((h) => `${esc(h.event)} ${esc((h.at || "").slice(0, 16).replace("T", " "))}`).join(" &middot; ");
      return `<div class="row" data-task="${esc(task.id)}" data-list="${esc(list.entity_id)}" style="border-top:none"><div class="detail">
        ${task.notes ? `<div class="notes">${esc(task.notes)}</div>` : ""}
        ${subs}
        ${ro ? "" : `<input class="subadd" type="text" data-act="subadd" placeholder="${esc(t.add_subtask)}">`}
        ${hist ? `<div class="hist">${esc(t.history)}: ${hist}</div>` : ""}
      </div></div>`;
    }

    _editor(list, task) {
      const t = this._t;
      const rule = task.recurrence || {};
      const wd = rule.weekdays || [];
      return `<div class="row" data-task="${esc(task.id)}" data-list="${esc(list.entity_id)}" style="border-top:none"><div class="editor">
        <input type="text" data-f="title" value="${esc(task.title)}">
        <textarea data-f="notes" rows="2" placeholder="${esc(t.notes)}">${esc(task.notes)}</textarea>
        <input type="date" data-f="due_date" value="${esc(task.due_date || "")}">
        <input type="time" data-f="due_time" value="${esc(task.due_time || "")}">
        <select data-f="priority">${[0, 1, 2, 3].map((p) => `<option value="${p}" ${task.priority === p ? "selected" : ""}>${esc(t[PRIO_NAMES[p]])}</option>`).join("")}</select>
        <input type="text" data-f="tags" value="${esc(task.tags.join(", "))}" placeholder="${esc(t.tags)}">
        <select data-f="rtype">${REC_TYPES.map((v) => `<option value="${v}" ${(rule.type || "") === v ? "selected" : ""}>${esc(v ? t[v] : t.repeat + ": " + t.none)}</option>`).join("")}</select>
        <input type="number" min="1" data-f="rint" style="width:70px" value="${esc(rule.type === "after_completion" ? rule.days : rule.interval || 1)}">
        <span class="wd">${t.wd.map((n, i) => `<label><input type="checkbox" data-f="wd" value="${i}" ${wd.includes(i) ? "checked" : ""}>${esc(n)}</label>`).join("")}</span>
        <button class="primary" data-act="save">${esc(t.save)}</button><button data-act="cancel">${esc(t.cancel)}</button>
      </div></div>`;
    }

    // ----- events -----
    _ctx(e) {
      const row = e.target.closest("[data-task]");
      if (!row || !this._snap) return {};
      const list = this._snap.lists.find((l) => l.entity_id === row.dataset.list);
      const task = list && list.tasks.find((x) => x.id === row.dataset.task);
      return { row, list, task, entity: row.dataset.list };
    }

    _onClick(e) {
      const btn = e.target.closest("[data-act]");
      if (!btn || btn.tagName === "INPUT") return; // checkboxes/inputs are handled by change/keydown
      const { task, entity, row } = this._ctx(e);
      if (!task) return;
      const act = btn.dataset.act;
      if (act === "expand") {
        this._open.has(task.id) ? this._open.delete(task.id) : this._open.add(task.id);
        this._update();
        return;
      }
      if (this._config.read_only) return;
      if (act === "snooze") this._call("snooze_task", { task_id: task.id }, entity);
      else if (act === "delete") {
        if (this._confirm === task.id) {
          this._confirm = null;
          this._call("delete_task", { task_id: task.id }, entity);
        } else {
          this._confirm = task.id; // second click within 3 s confirms
          this._update();
          clearTimeout(this._confirmTimer);
          this._confirmTimer = setTimeout(() => { this._confirm = null; this._update(); }, 3000);
        }
      } else if (act === "edit") {
        this._editing = task.id;
        this._update();
      } else if (act === "cancel") {
        this._editing = null;
        this._update();
      } else if (act === "save") this._saveEdit(this._root.querySelector(".editor"), task, entity);
      else if (act === "subremove") this._call("remove_subtask", { task_id: task.id, subtask_id: btn.dataset.sub }, entity);
      void row;
    }

    _onChange(e) {
      const el = e.target;
      if (el.dataset.act !== "subtoggle" && el.dataset.act !== "toggle") return;
      const { task, entity } = this._ctx(e);
      if (!task || this._config.read_only) return;
      if (el.dataset.act === "subtoggle") this._call("update_subtask", { task_id: task.id, subtask_id: el.dataset.sub, done: el.checked }, entity);
      else this._call(el.checked ? "complete_task" : "reopen_task", { task_id: task.id }, entity);
    }

    _onKey(e) {
      if (e.key !== "Enter" || e.target.dataset.act !== "subadd" || !e.target.value.trim()) return;
      const { task, entity } = this._ctx(e);
      if (!task) return;
      this._call("add_subtask", { task_id: task.id, title: e.target.value.trim() }, entity);
      e.target.value = "";
    }

    _saveEdit(ed, task, entity) {
      const f = (n) => ed.querySelector(`[data-f="${n}"]`);
      const date = f("due_date").value;
      const data = {
        task_id: task.id,
        title: f("title").value.trim() || task.title,
        notes: f("notes").value.trim() || null,
        due_date: date || null,
        due_time: date && f("due_time").value ? f("due_time").value + ":00" : null,
        priority: +f("priority").value,
        tags: f("tags").value.split(",").map((x) => x.trim()).filter(Boolean),
        recurrence: recurrenceFromForm({
          type: f("rtype").value, interval: f("rint").value, days: f("rint").value,
          weekdays: [...ed.querySelectorAll('[data-f="wd"]:checked')].map((x) => +x.value),
        }),
      };
      this._editing = null;
      this._call("update_task", data, entity);
      this._update();
    }

    _onChipClick(e) {
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
      if (el.type === "color" && el.dataset.tag && !this._config.read_only) this._call("set_tag", { name: el.dataset.tag, color: el.value });
    }

    _onFoot(e) {
      if (!e.target.closest("[data-act=clear]")) return;
      const wanted = normalizeEntities(this._config);
      for (const l of this._snap.lists) {
        if ((!wanted.length || wanted.includes(l.entity_id)) && l.tasks.some((t) => t.status === "done")) {
          this._call("delete_completed", {}, l.entity_id);
        }
      }
    }

    _onDragStart(e) {
      const row = e.target.closest && e.target.closest(".row[data-task]");
      if (!row || row.getAttribute("draggable") !== "true") return;
      this._drag = { id: row.dataset.task, list: row.dataset.list };
      if (e.dataTransfer) e.dataTransfer.setData("text/plain", row.dataset.task);
    }

    _onDragOver(e) {
      const row = e.target.closest && e.target.closest(".row[data-task]");
      if (!row || !this._drag || row.dataset.list !== this._drag.list) return;
      e.preventDefault();
      row.classList.add("dragover");
    }

    _onDrop(e) {
      const row = e.target.closest && e.target.closest(".row[data-task]");
      const drag = this._drag;
      this._drag = null;
      this._root.querySelectorAll(".dragover").forEach((x) => x.classList.remove("dragover"));
      if (!row || !drag || row.dataset.list !== drag.list || row.dataset.task === drag.id) return;
      e.preventDefault();
      const list = this._snap.lists.find((l) => l.entity_id === drag.list);
      const order = list.tasks.map((t) => t.id);
      const after = order.indexOf(drag.id) < order.indexOf(row.dataset.task);
      const previous = dropTarget(list.tasks, drag.id, row.dataset.task, after);
      if (previous === undefined) return;
      this._call("move_task", previous === null ? { task_id: drag.id } : { task_id: drag.id, previous_task_id: previous }, drag.list);
    }
  }

  // ---------- visual editor (ha-form) ----------
  class TickoffCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = config;
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

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
          if (!v.entities || !v.entities.length) delete v.entities;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      const data = { view: "list", show_completed: true, show_add: true, ...this._config };
      data.hide_empty = !!data.hide_when_empty;
      this._form.hass = this._hass;
      this._form.data = data;
      this._form.computeLabel = (s) => t["editor_" + s.name] || s.name;
      this._form.schema = [
        { name: "title", selector: { text: {} } },
        { name: "view", selector: { select: { mode: "dropdown", options: [{ value: "list", label: t.view_list }, { value: "today", label: t.view_today }] } } },
        { name: "entities", selector: { entity: { multiple: true, domain: "todo", integration: "tickoff" } } },
        { name: "show_completed", selector: { boolean: {} } },
        { name: "show_add", selector: { boolean: {} } },
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
    type: "tickoff-card",
    name: "Tickoff",
    description: "Tasks with tags, priority, subtasks, recurrence and a today overview.",
    preview: false,
  });
  window.__tickoff = { esc, textColor, visibleItems, usedTags, dropTarget, recurrenceFromForm, describeRecurrence, VERSION };
})();
