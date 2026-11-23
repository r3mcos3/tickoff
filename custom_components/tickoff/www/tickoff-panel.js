/*
 * Tickoff panel - the "Tickoff" item in the Home Assistant sidebar.
 * One place for everything: today overview, all tasks, every list, list management,
 * tags and notification settings. Plain JavaScript, no build step; it embeds <tickoff-card>.
 */
(() => {
  "use strict";
  if (customElements.get("tickoff-panel")) return;

  const I18N = {
    en: {
      title: "Tickoff", today: "Today", all: "All tasks", lists: "Lists", tags: "Tags", settings: "Settings",
      new_list: "New list", list_name: "List name", notify_service: "Notify service", none: "None (events only)",
      create: "Create", cancel: "Cancel", rename: "Rename", save: "Save", delete: "Delete", sure: "Sure? Deletes all tasks",
      sure_tag: "Sure?", new_tag: "New tag", used_in: "tasks",
      default_notify: "Default notify service", notify_time: "Notification time",
      notify_help: "Tasks with a date but no time are announced at the notification time; tasks with a time are announced at that time. Each list can override the service.",
      saved: "Saved", no_lists: "No lists yet. Create your first list to get started.",
      list_settings: "List settings", error: "Error", menu: "Menu", rename_list: "Rename list",
    },
    nl: {
      title: "Tickoff", today: "Vandaag", all: "Alle taken", lists: "Lijsten", tags: "Tags", settings: "Instellingen",
      new_list: "Nieuwe lijst", list_name: "Naam van de lijst", notify_service: "Notify-service", none: "Geen (alleen events)",
      create: "Aanmaken", cancel: "Annuleren", rename: "Hernoemen", save: "Opslaan", delete: "Verwijderen", sure: "Zeker? Verwijdert alle taken",
      sure_tag: "Zeker?", new_tag: "Nieuwe tag", used_in: "taken",
      default_notify: "Standaard notify-service", notify_time: "Meldtijd",
      notify_help: "Taken met een datum maar zonder tijd worden op de meldtijd gemeld; taken met een tijd op die tijd. Elke lijst kan de service overschrijven.",
      saved: "Opgeslagen", no_lists: "Nog geen lijsten. Maak je eerste lijst aan om te beginnen.",
      list_settings: "Lijstinstellingen", error: "Fout", menu: "Menu", rename_list: "Lijst hernoemen",
    },
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const CSS = `
    :host { display: block; height: 100%; background: var(--primary-background-color); color: var(--primary-text-color); }
    .bar { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px; box-sizing: border-box;
           background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff); }
    .bar h1 { font-size: 1.25em; font-weight: 400; margin: 0; flex: 1; }
    .bar button { color: inherit; font-size: 1.4em; }
    .layout { display: flex; height: calc(100% - 56px); position: relative; }
    nav { width: 240px; flex: none; overflow-y: auto; padding: 8px 0; border-right: 1px solid var(--divider-color, #ddd); background: var(--card-background-color, #fff); }
    nav .item { display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; user-select: none; }
    nav .item:hover { background: var(--secondary-background-color, #eee); }
    nav .item.active { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    nav .item .n { margin-left: auto; font-size: .85em; opacity: .85; }
    nav .item .n.bad { color: var(--error-color, #d32f2f); font-weight: 600; opacity: 1; }
    nav .item.active .n.bad { color: inherit; }
    nav hr { border: none; border-top: 1px solid var(--divider-color, #ddd); margin: 8px 0; }
    nav .label { padding: 4px 16px; font-size: .75em; text-transform: uppercase; color: var(--secondary-text-color); }
    main { flex: 1; overflow-y: auto; padding: 16px; box-sizing: border-box; }
    .narrow nav { display: none; position: absolute; z-index: 5; top: 0; bottom: 0; box-shadow: 2px 0 8px rgba(0,0,0,.3); }
    .narrow nav.open { display: block; }
    .wrap { max-width: 900px; margin: 0 auto; }
    .box { background: var(--card-background-color, #fff); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
           box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.2)); }
    .box h2 { margin: 0 0 8px; font-size: 1.1em; font-weight: 500; }
    .tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .grow { flex: 1; }
    input, select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #ccc); border-radius: 6px; padding: 6px 8px; box-sizing: border-box; }
    button { font: inherit; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 6px; color: var(--primary-text-color); }
    button:hover { background: var(--secondary-background-color, #eee); }
    button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    button.danger { color: var(--error-color, #d32f2f); }
    .row { display: flex; gap: 8px; align-items: center; padding: 6px 0; border-top: 1px solid var(--divider-color, #eee); }
    .row input[type=color] { width: 32px; height: 32px; padding: 0; border: none; background: none; }
    .muted { color: var(--secondary-text-color); font-size: .9em; }
    .err { background: var(--error-color, #d32f2f); color: #fff; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; }
    .ok { color: var(--success-color, #43a047); }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .empty { text-align: center; padding: 32px 0; color: var(--secondary-text-color); }
  `;

  class TickoffPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._view = "today"; // today | all | list:<entry_id> | tags | settings
      try { this._view = localStorage.getItem("tickoff-panel-view") || "today"; } catch (e) { /* storage unavailable */ }
      this._t = I18N.en;
      this._navOpen = false;
      this._creating = false;
      this._renaming = false;
      this._confirm = null;
      this._renamingTag = null;
      this._error = "";
      this._savedFlash = false;
    }

    set hass(hass) {
      this._hass = hass;
      const lang = ((hass.locale && hass.locale.language) || hass.language || "en").slice(0, 2);
      this._t = I18N[lang] || I18N.en;
      if (this._card) this._card.hass = hass;
      if (!this._unsub && !this._subscribing && this.isConnected) this._subscribe();
      if (!this._rendered) this._render();
    }

    set narrow(v) {
      this._narrow = !!v;
      if (this._rendered) this._render();
    }

    set route(_v) { /* single page, internal routing */ }

    set panel(_v) { /* no panel config */ }

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
          this._render();
        }, { type: "tickoff/subscribe" });
        if (this._disconnected) unsub();
        else this._unsub = unsub;
      } finally {
        this._subscribing = false;
      }
    }

    get _admin() {
      return !!(this._hass && this._hass.user && this._hass.user.is_admin);
    }

    async _ws(payload) {
      this._error = "";
      try {
        return await this._hass.callWS(payload);
      } catch (e) {
        this._error = (e && e.message) || String(e);
        this._render();
        throw e;
      }
    }

    _go(view) {
      this._view = view;
      this._navOpen = false;
      this._creating = this._renaming = false;
      this._confirm = null;
      this._error = "";
      try { localStorage.setItem("tickoff-panel-view", view); } catch (e) { /* ignore */ }
      this._render();
    }

    _list(entryId) {
      return this._snap && this._snap.lists.find((l) => l.entry_id === entryId);
    }

    // ---------- rendering ----------
    _render() {
      this._rendered = true;
      const t = this._t;
      const snap = this._snap;
      const sr = this.shadowRoot;
      let view = this._view;
      if (view.startsWith("list:") && snap && !this._list(view.slice(5))) view = this._view = "today";

      if (!this._shell) {
        sr.innerHTML = `<style>${CSS}</style>
          <div class="bar"><button id="menu" title="${esc(t.menu)}">&#9776;</button><h1>${esc(t.title)}</h1></div>
          <div class="layout"><nav id="nav"></nav><main><div class="wrap" id="content"><div id="tools"></div><div id="body"></div></div></main></div>`;
        this._shell = true;
        sr.getElementById("menu").addEventListener("click", () => {
          if (this._narrow) { this._navOpen = !this._navOpen; this._render(); }
          else this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
        });
        sr.getElementById("nav").addEventListener("click", (e) => this._onNav(e));
        sr.getElementById("content").addEventListener("click", (e) => this._onContent(e));
        sr.getElementById("content").addEventListener("change", (e) => this._onChange(e));
      }
      sr.querySelector(".layout").classList.toggle("narrow", !!this._narrow);
      sr.getElementById("nav").classList.toggle("open", this._navOpen);
      this._renderNav(view);
      this._renderContent(view);
    }

    _renderNav(view) {
      const t = this._t;
      const lists = this._snap ? this._snap.lists : [];
      const sum = (fn) => lists.reduce((n, l) => n + l.tasks.filter(fn).length, 0);
      const todayN = sum((x) => x.state === "today" || x.state === "overdue");
      const item = (v, icon, label, n, bad) =>
        `<div class="item ${view === v ? "active" : ""}" data-view="${esc(v)}"><span>${icon}</span><span>${esc(label)}</span>${n ? `<span class="n ${bad ? "bad" : ""}">${n}</span>` : ""}</div>`;
      let html = item("today", "&#128197;", t.today, todayN, sum((x) => x.state === "overdue") > 0)
        + item("all", "&#9745;", t.all, sum((x) => x.status === "open"));
      html += `<hr><div class="label">${esc(t.lists)}</div>`;
      for (const l of lists) {
        html += item("list:" + l.entry_id, "&#128203;", l.name, l.tasks.filter((x) => x.status === "open").length, l.tasks.some((x) => x.state === "overdue"));
      }
      if (this._admin) html += `<div class="item" data-act="newlist"><span>&#10133;</span><span>${esc(t.new_list)}</span></div>`;
      html += "<hr>" + item("tags", "&#127991;", t.tags) + item("settings", "&#9881;", t.settings);
      this.shadowRoot.getElementById("nav").innerHTML = html;
    }

    _serviceSelect(id, current, snap) {
      const options = (snap.notify_services || []).slice();
      if (current && !options.includes(current)) options.push(current);
      return `<select id="${id}"><option value="">${esc(this._t.none)}</option>${options.map((s) => `<option value="${esc(s)}" ${s === current ? "selected" : ""}>notify.${esc(s)}</option>`).join("")}</select>`;
    }

    _renderContent(view) {
      const t = this._t;
      const snap = this._snap;
      const sr = this.shadowRoot;
      const tools = sr.getElementById("tools");
      const body = sr.getElementById("body");
      const err = this._error ? `<div class="err">${esc(t.error)}: ${esc(this._error)}</div>` : "";
      tools.innerHTML = err;

      if (!snap) { this._dropCard(); body.innerHTML = ""; return; }

      if (this._creating) {
        this._dropCard();
        body.innerHTML = `<div class="box"><h2>${esc(t.new_list)}</h2>
          <div class="field"><label>${esc(t.list_name)}</label><input id="newname" type="text"></div>
          <div class="field"><label>${esc(t.notify_service)}</label>${this._serviceSelect("newnotify", "", snap)}</div>
          <div class="tools"><button class="primary" data-act="create">${esc(t.create)}</button><button data-act="cancel">${esc(t.cancel)}</button></div></div>`;
        return;
      }

      if (view === "today" || view === "all" || view.startsWith("list:")) {
        if (!snap.lists.length) {
          this._dropCard();
          body.innerHTML = `<div class="empty">${esc(t.no_lists)}${this._admin ? `<p><button class="primary" data-act="newlist">${esc(t.new_list)}</button></p>` : ""}</div>`;
          return;
        }
        if (view.startsWith("list:")) {
          const l = this._list(view.slice(5));
          tools.innerHTML += this._renaming
            ? `<div class="tools"><input id="renameinput" type="text" value="${esc(l.name)}" class="grow"><button class="primary" data-act="renamesave">${esc(t.save)}</button><button data-act="renamecancel">${esc(t.cancel)}</button></div>`
            : this._admin
              ? `<div class="tools"><span class="grow muted">${esc(t.list_settings)}</span>
                  <label class="muted">${esc(t.notify_service)}</label>${this._serviceSelect("listnotify", l.notify_service, snap)}
                  <button data-act="rename" title="${esc(t.rename_list)}">&#9998; ${esc(t.rename)}</button>
                  <button class="danger" data-act="deletelist">${this._confirm === "list" ? esc(t.sure) : "&#128465; " + esc(t.delete)}</button></div>`
              : "";
        }
        // the embedded card lives on between snapshots, so its filters and open rows survive
        if (this._cardKey !== view || !this._card || !body.contains(this._card)) {
          this._dropCard();
          body.innerHTML = "";
          const card = document.createElement("tickoff-card");
          card.setConfig(view === "today" ? { view: "today", title: t.today }
            : view === "all" ? { title: t.all }
              : { entities: [this._list(view.slice(5)).entity_id] });
          card.hass = this._hass;
          body.appendChild(card);
          this._card = card;
          this._cardKey = view;
        }
        return;
      }

      this._dropCard();
      if (view === "tags") {
        const counts = {};
        for (const l of snap.lists) for (const x of l.tasks) x.tags.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
        const names = Object.keys(snap.tags).sort((a, b) => a.localeCompare(b));
        body.innerHTML = `<div class="box"><h2>${esc(t.tags)}</h2>
          ${names.map((n) => `<div class="row" data-tag="${esc(n)}">
              <input type="color" data-act="tagcolor" value="${esc(snap.tags[n].color)}">
              ${this._renamingTag === n
                ? `<input type="text" id="tagrename" class="grow" value="${esc(n)}"><button class="primary" data-act="tagrenamesave">${esc(t.save)}</button><button data-act="tagrenamecancel">${esc(t.cancel)}</button>`
                : `<span class="grow">${esc(n)} <span class="muted">(${counts[n] || 0} ${esc(t.used_in)})</span></span>
                   <button data-act="tagrename">&#9998;</button>
                   <button class="danger" data-act="tagdelete">${this._confirm === "tag:" + n ? esc(t.sure_tag) : "&#128465;"}</button>`}
            </div>`).join("")}
          <div class="row"><input type="color" id="newtagcolor" value="#1e88e5"><input type="text" id="newtagname" class="grow" placeholder="${esc(t.new_tag)}"><button class="primary" data-act="tagadd">${esc(t.create)}</button></div>
        </div>`;
        return;
      }

      const s = snap.settings || {};
      body.innerHTML = `<div class="box"><h2>${esc(t.settings)}</h2>
        <div class="field"><label>${esc(t.default_notify)}</label>${this._admin ? this._serviceSelect("setnotify", s.notify_service, snap) : `<span>${esc(s.notify_service || t.none)}</span>`}</div>
        <div class="field"><label>${esc(t.notify_time)}</label>${this._admin ? `<input id="settime" type="time" value="${esc((s.notify_time || "08:00:00").slice(0, 5))}">` : `<span>${esc((s.notify_time || "").slice(0, 5))}</span>`}</div>
        <p class="muted">${esc(t.notify_help)}</p>
        ${this._admin ? `<div class="tools"><button class="primary" data-act="savesettings">${esc(t.save)}</button>${this._savedFlash ? `<span class="ok">${esc(t.saved)}</span>` : ""}</div>` : ""}
      </div>`;
    }

    _dropCard() {
      if (this._card) { this._card.remove(); this._card = null; this._cardKey = null; }
    }

    // ---------- events ----------
    _onNav(e) {
      const el = e.target.closest("[data-view],[data-act]");
      if (!el) return;
      if (el.dataset.act === "newlist") { this._creating = true; this._navOpen = false; this._render(); }
      else this._go(el.dataset.view);
    }

    _onChange(e) {
      const el = e.target;
      if (el.id === "listnotify" && this._admin) {
        const l = this._list(this._view.slice(5));
        this._ws({ type: "tickoff/list_update", entry_id: l.entry_id, notify_service: el.value || null }).catch(() => {});
      } else if (el.dataset && el.dataset.act === "tagcolor") {
        this._hass.callService("tickoff", "set_tag", { name: el.closest("[data-tag]").dataset.tag, color: el.value });
      }
    }

    async _onContent(e) {
      const btn = e.target.closest("[data-act]");
      if (!btn || btn.tagName === "SELECT" || btn.type === "color") return;
      const act = btn.dataset.act;
      const $ = (id) => this.shadowRoot.getElementById(id);
      try {
        if (act === "newlist") { this._creating = true; this._render(); }
        else if (act === "cancel") { this._creating = false; this._render(); }
        else if (act === "create") {
          const name = $("newname").value.trim();
          if (!name) return;
          const res = await this._ws({ type: "tickoff/list_create", name, notify_service: $("newnotify").value || null });
          this._creating = false;
          this._go("list:" + res.entry_id);
        } else if (act === "rename") { this._renaming = true; this._render(); }
        else if (act === "renamecancel") { this._renaming = false; this._render(); }
        else if (act === "renamesave") {
          const l = this._list(this._view.slice(5));
          await this._ws({ type: "tickoff/list_update", entry_id: l.entry_id, name: $("renameinput").value.trim() });
          this._renaming = false;
          this._render();
        } else if (act === "deletelist") {
          if (this._confirm === "list") {
            const l = this._list(this._view.slice(5));
            this._confirm = null;
            await this._ws({ type: "tickoff/list_delete", entry_id: l.entry_id });
            this._go("today");
          } else {
            this._confirm = "list"; // second click within 4 s confirms
            this._render();
            clearTimeout(this._ct);
            this._ct = setTimeout(() => { this._confirm = null; this._render(); }, 4000);
          }
        } else if (act === "tagrename") { this._renamingTag = btn.closest("[data-tag]").dataset.tag; this._render(); }
        else if (act === "tagrenamecancel") { this._renamingTag = null; this._render(); }
        else if (act === "tagrenamesave") {
          const name = this._renamingTag;
          const next = $("tagrename").value.trim();
          this._renamingTag = null;
          if (next && next !== name) await this._hass.callService("tickoff", "rename_tag", { name, new_name: next });
          this._render();
        } else if (act === "tagdelete") {
          const name = btn.closest("[data-tag]").dataset.tag;
          if (this._confirm === "tag:" + name) {
            this._confirm = null;
            await this._hass.callService("tickoff", "delete_tag", { name });
          } else {
            this._confirm = "tag:" + name;
            this._render();
            clearTimeout(this._ct);
            this._ct = setTimeout(() => { this._confirm = null; this._render(); }, 3000);
          }
        } else if (act === "tagadd") {
          const name = $("newtagname").value.trim();
          if (name) await this._hass.callService("tickoff", "set_tag", { name, color: $("newtagcolor").value });
        } else if (act === "savesettings") {
          await this._ws({
            type: "tickoff/settings_set",
            notify_service: $("setnotify").value || null,
            notify_time: ($("settime").value || "08:00") + ":00",
          });
          this._savedFlash = true;
          this._render();
          clearTimeout(this._ft);
          this._ft = setTimeout(() => { this._savedFlash = false; this._render(); }, 2500);
        }
      } catch (err) {
        /* already shown through this._error */
      }
    }
  }

  customElements.define("tickoff-panel", TickoffPanel);
})();
