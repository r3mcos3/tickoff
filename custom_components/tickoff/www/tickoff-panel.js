/*
 * Tickoff panel - the "Tickoff" item in the Home Assistant sidebar.
 * Tasks in smart views (today, upcoming, all, completed, per tag), tag management and
 * notification settings (Telegram, phone, ...). Plain JavaScript; it embeds <tickoff-card>.
 */
(() => {
  "use strict";
  if (customElements.get("tickoff-panel")) return;

  const I18N = {
    en: {
      title: "Tickoff", today: "Today", upcoming: "Upcoming", all: "All tasks", done: "Completed", tags: "Tags",
      manage_tags: "Manage tags", settings: "Settings", menu: "Menu",
      delete: "Delete", sure: "Sure?", save: "Save", cancel: "Cancel", create: "Create", rename: "Rename",
      new_tag: "New tag", used_in: "tasks", error: "Error", saved: "Saved",
      notifications: "Notifications", notify_intro: "Get a message when a task is due. Choose where it should go.",
      no_targets: "No notification targets found. Set up the Telegram bot integration (or the mobile app) in Home Assistant and they will appear here.",
      telegram: "Telegram", notify_time: "Notification time",
      notify_help: "Tasks with a date but no time are announced at this time; tasks with a time are announced at that time.",
      send_test: "Send test message", test_sent: "Test message sent to {n} target(s).", choose_first: "Choose at least one target first.",
      entity_kind: "Notify entity", service_kind: "Notify service", read_only: "Only administrators can change these settings.",
    },
    nl: {
      title: "Tickoff", today: "Vandaag", upcoming: "Binnenkort", all: "Alle taken", done: "Voltooid", tags: "Tags",
      manage_tags: "Tags beheren", settings: "Instellingen", menu: "Menu",
      delete: "Verwijderen", sure: "Zeker?", save: "Opslaan", cancel: "Annuleren", create: "Aanmaken", rename: "Hernoemen",
      new_tag: "Nieuwe tag", used_in: "taken", error: "Fout", saved: "Opgeslagen",
      notifications: "Meldingen", notify_intro: "Krijg een bericht als een taak vervalt. Kies waar het heen moet.",
      no_targets: "Geen meldingsdoelen gevonden. Stel de Telegram-bot-integratie (of de mobiele app) in Home Assistant in, dan verschijnen ze hier.",
      telegram: "Telegram", notify_time: "Meldtijd",
      notify_help: "Taken met een datum maar zonder tijd worden op deze tijd gemeld; taken met een tijd op die tijd.",
      send_test: "Testbericht sturen", test_sent: "Testbericht gestuurd naar {n} doel(en).", choose_first: "Kies eerst minstens één doel.",
      entity_kind: "Notify-entiteit", service_kind: "Notify-service", read_only: "Alleen beheerders kunnen deze instellingen wijzigen.",
    },
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const CSS = `
    :host { display: block; height: 100%; background: var(--primary-background-color); color: var(--primary-text-color);
            --tk-line: var(--divider-color, rgba(127,127,127,.25)); --tk-muted: var(--secondary-text-color, #727272); }
    * { box-sizing: border-box; }
    ha-icon { --mdc-icon-size: 22px; display: inline-flex; }
    .bar { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px;
           background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff); }
    .bar h1 { font-size: 1.25em; font-weight: 500; margin: 0; flex: 1; }
    .bar button { color: inherit; width: 40px; height: 40px; border-radius: 50%; }
    button { font: inherit; background: none; border: none; cursor: pointer; border-radius: 10px; color: inherit; }
    .layout { display: flex; height: calc(100% - 56px); position: relative; }
    nav { width: 252px; flex: none; overflow-y: auto; padding: 10px 8px; background: var(--card-background-color, #fff); border-right: 1px solid var(--tk-line); }
    nav .item { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 10px; cursor: pointer; user-select: none; font-weight: 500; }
    nav .item ha-icon { color: var(--tk-muted); }
    nav .item:hover { background: var(--secondary-background-color, #eee); }
    nav .item.active { background: color-mix(in srgb, var(--primary-color) 16%, transparent); color: var(--primary-color); }
    nav .item.active ha-icon { color: var(--primary-color); }
    nav .item .n { margin-left: auto; font-size: .85em; font-weight: 600; color: var(--tk-muted); }
    nav .item .n.bad { color: var(--error-color, #d32f2f); background: color-mix(in srgb, var(--error-color, #d32f2f) 14%, transparent); padding: 0 8px; border-radius: 999px; }
    nav .dot { width: 12px; height: 12px; border-radius: 50%; margin: 0 5px; flex: none; }
    nav .label { padding: 14px 12px 4px; font-size: .72em; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--tk-muted); }
    nav hr { border: none; border-top: 1px solid var(--tk-line); margin: 8px 4px; }
    main { flex: 1; overflow-y: auto; padding: 16px; }
    .wrap { max-width: 760px; margin: 0 auto; }
    .narrow nav { display: none; position: absolute; z-index: 5; top: 0; bottom: 0; box-shadow: 2px 0 12px rgba(0,0,0,.35); }
    .narrow nav.open { display: block; }
    .box { background: var(--card-background-color, #fff); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; box-shadow: var(--ha-card-box-shadow, 0 1px 4px rgba(0,0,0,.18)); }
    .box h2 { margin: 0 0 4px; font-size: 1.2em; font-weight: 600; }
    .muted { color: var(--tk-muted); font-size: .92em; }
    input, select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color, #fff); border: 1px solid var(--tk-line); border-radius: 10px; padding: 8px 10px; min-width: 0; }
    input:focus, select:focus { outline: 2px solid var(--primary-color); outline-offset: -1px; }
    .btn { padding: 9px 16px; border-radius: 10px; font-weight: 600; } .btn:hover { background: var(--secondary-background-color, #eee); }
    .btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); } .btn.primary:hover { filter: brightness(1.08); }
    .btn.primary:disabled { opacity: .45; cursor: default; }
    .btn.danger { color: var(--error-color, #d32f2f); }
    .iconbtn { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; color: var(--tk-muted); }
    .iconbtn:hover { background: var(--secondary-background-color, #eee); color: var(--primary-text-color); } .iconbtn.danger:hover { color: var(--error-color, #d32f2f); }
    .tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
    .grow { flex: 1; }
    .row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--tk-line); }
    .row:first-of-type { border-top: none; }
    .row input[type=color] { width: 32px; height: 32px; padding: 0; border: none; background: none; }
    .target { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-top: 10px; border: 1px solid var(--tk-line); border-radius: 12px; cursor: pointer; }
    .target:hover { background: var(--secondary-background-color, #f4f4f4); }
    .target.on { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 9%, transparent); }
    .target input { width: 18px; height: 18px; accent-color: var(--primary-color); }
    .target .name { flex: 1; min-width: 0; } .target .kind { font-size: .8em; color: var(--tk-muted); }
    .badge { font-size: .72em; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #229ed9; color: #fff; letter-spacing: .3px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; font-weight: 600; font-size: .85em; } .field input { width: 160px; font-weight: 400; font-size: 1rem; }
    .err { background: var(--error-color, #d32f2f); color: #fff; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; }
    .ok { color: var(--success-color, #43a047); font-weight: 600; }
    .empty { padding: 20px 0; text-align: center; color: var(--tk-muted); }
  `;

  class TickoffPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._view = "today"; // today | upcoming | all | done | tag:<name> | tags | settings
      try { this._view = localStorage.getItem("tickoff-panel-view") || "today"; } catch (e) { /* storage unavailable */ }
      this._t = I18N.en;
      this._navOpen = false;
      this._confirm = null;
      this._renamingTag = null;
      this._error = "";
      this._flash = "";
      this._pick = null; // chosen notification targets while editing (null = not edited yet)
    }

    set hass(hass) {
      this._hass = hass;
      const lang = ((hass.locale && hass.locale.language) || hass.language || "en").slice(0, 2);
      this._t = I18N[lang] || I18N.en;
      if (this._card) this._card.hass = hass;
      if (!this._unsub && !this._subscribing && this.isConnected) this._subscribe();
      if (!this._rendered) this._render();
    }

    set narrow(v) { this._narrow = !!v; if (this._rendered) this._render(); }

    set route(_v) { /* single page, internal routing */ }

    set panel(_v) { /* no panel config */ }

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
        const unsub = await this._hass.connection.subscribeMessage((snap) => { this._snap = snap; this._render(); }, { type: "tickoff/subscribe" });
        if (this._disconnected) unsub();
        else this._unsub = unsub;
      } finally {
        this._subscribing = false;
      }
    }

    get _admin() { return !!(this._hass && this._hass.user && this._hass.user.is_admin); }

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
      this._confirm = null;
      this._error = "";
      this._flash = "";
      this._pick = null;
      try { localStorage.setItem("tickoff-panel-view", view); } catch (e) { /* ignore */ }
      this._render();
    }

    // ---------- rendering ----------
    _render() {
      this._rendered = true;
      const t = this._t;
      const sr = this.shadowRoot;
      if (!this._shell) {
        sr.innerHTML = `<style>${CSS}</style>
          <div class="bar"><button id="menu" title="${esc(t.menu)}"><ha-icon icon="mdi:menu"></ha-icon></button><h1></h1></div>
          <div class="layout"><nav id="nav"></nav><main><div class="wrap"><div id="tools"></div><div id="body"></div></div></main></div>`;
        this._shell = true;
        sr.getElementById("menu").addEventListener("click", () => {
          if (this._narrow) { this._navOpen = !this._navOpen; this._render(); }
          else this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
        });
        sr.getElementById("nav").addEventListener("click", (e) => this._onNav(e));
        const main = sr.querySelector("main");
        main.addEventListener("click", (e) => this._onContent(e));
        main.addEventListener("change", (e) => this._onChange(e));
      }
      sr.querySelector("h1").textContent = t.title;
      sr.querySelector(".layout").classList.toggle("narrow", !!this._narrow);
      sr.getElementById("nav").classList.toggle("open", this._navOpen);
      const view = this._view;
      this._renderNav(view);
      this._renderContent(view);
    }

    _renderNav(view) {
      const t = this._t;
      const snap = this._snap;
      const tasks = snap ? snap.tasks : [];
      const open = tasks.filter((x) => x.status === "open");
      const n = (fn) => open.filter(fn).length;
      const overdue = n((x) => x.state === "overdue");
      const item = (v, icon, label, count, bad) =>
        `<div class="item ${view === v ? "active" : ""}" data-view="${esc(v)}"><ha-icon icon="${icon}"></ha-icon><span>${esc(label)}</span>${count ? `<span class="n ${bad ? "bad" : ""}">${count}</span>` : ""}</div>`;
      let html = item("today", "mdi:calendar-today", t.today, n((x) => x.state === "today" || x.state === "overdue"), overdue > 0)
        + item("upcoming", "mdi:calendar-month-outline", t.upcoming, n((x) => x.state === "upcoming"))
        + item("all", "mdi:format-list-checks", t.all, open.length)
        + item("done", "mdi:check-all", t.done, tasks.length - open.length);
      const tagNames = snap ? Object.keys(snap.tags).sort((a, b) => a.localeCompare(b)) : [];
      if (tagNames.length) {
        html += `<div class="label">${esc(t.tags)}</div>`;
        for (const name of tagNames) {
          const count = open.filter((x) => x.tags.includes(name)).length;
          html += `<div class="item ${view === "tag:" + name ? "active" : ""}" data-view="tag:${esc(name)}"><span class="dot" style="background:${esc(snap.tags[name].color)}"></span><span>${esc(name)}</span>${count ? `<span class="n">${count}</span>` : ""}</div>`;
        }
      }
      html += "<hr>" + item("tags", "mdi:tag-multiple-outline", t.manage_tags) + item("settings", "mdi:cog-outline", t.settings);
      this.shadowRoot.getElementById("nav").innerHTML = html;
    }

    _cardConfig(view) {
      if (view.startsWith("tag:")) return { view: "all", tags: [view.slice(4)], title: view.slice(4) };
      return { view };
    }

    _renderContent(view) {
      const t = this._t;
      const snap = this._snap;
      const sr = this.shadowRoot;
      const tools = sr.getElementById("tools");
      const body = sr.getElementById("body");
      tools.innerHTML = this._error ? `<div class="err">${esc(t.error)}: ${esc(this._error)}</div>` : "";
      if (!snap) { this._dropCard(); body.innerHTML = ""; return; }

      if (["today", "upcoming", "all", "done"].includes(view) || view.startsWith("tag:")) {
        if (view.startsWith("tag:") && !snap.tags[view.slice(4)]) { this._go("today"); return; }
        // the card stays alive between snapshots, so its filters and open rows survive
        if (this._cardKey !== view || !this._card || !body.contains(this._card)) {
          this._dropCard();
          body.innerHTML = "";
          const card = document.createElement("tickoff-card");
          card.setConfig(this._cardConfig(view));
          card.hass = this._hass;
          body.appendChild(card);
          this._card = card;
          this._cardKey = view;
        }
        return;
      }
      this._dropCard();
      if (view === "tags") body.innerHTML = this._tagsView(snap);
      else body.innerHTML = this._settingsView(snap);
    }

    _tagsView(snap) {
      const t = this._t;
      const counts = {};
      for (const x of snap.tasks) x.tags.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
      const names = Object.keys(snap.tags).sort((a, b) => a.localeCompare(b));
      return `<div class="box"><h2>${esc(t.manage_tags)}</h2>
        ${names.map((n) => `<div class="row" data-tag="${esc(n)}">
            <input type="color" data-act="tagcolor" value="${esc(snap.tags[n].color)}">
            ${this._renamingTag === n
              ? `<input type="text" id="tagrename" class="grow" value="${esc(n)}"><button class="btn primary" data-act="tagrenamesave">${esc(t.save)}</button><button class="btn" data-act="tagrenamecancel">${esc(t.cancel)}</button>`
              : `<span class="grow">${esc(n)} <span class="muted">(${counts[n] || 0} ${esc(t.used_in)})</span></span>
                 <button class="iconbtn" data-act="tagrename" title="${esc(t.rename)}"><ha-icon icon="mdi:pencil"></ha-icon></button>
                 <button class="iconbtn danger" data-act="tagdelete" title="${esc(t.delete)}">${this._confirm === "tag:" + n ? `<b style="font-size:.7em">${esc(t.sure)}</b>` : '<ha-icon icon="mdi:delete-outline"></ha-icon>'}</button>`}
          </div>`).join("")}
        <div class="row"><input type="color" id="newtagcolor" value="#1e88e5"><input type="text" id="newtagname" class="grow" placeholder="${esc(t.new_tag)}"><button class="btn primary" data-act="tagadd">${esc(t.create)}</button></div>
      </div>`;
    }

    _settingsView(snap) {
      const t = this._t;
      const s = snap.settings || {};
      const chosen = this._pick || s.notify_targets || [];
      const targets = snap.notify_targets || [];
      const admin = this._admin;
      const rows = targets.map((x) => {
        const on = chosen.includes(x.value);
        return `<label class="target ${on ? "on" : ""}">
          <input type="checkbox" data-act="target" value="${esc(x.value)}" ${on ? "checked" : ""} ${admin ? "" : "disabled"}>
          <ha-icon icon="${x.telegram ? "mdi:send-circle" : x.value.startsWith("entity:") ? "mdi:bell-outline" : "mdi:cellphone-message"}" style="${x.telegram ? "color:#229ed9" : ""}"></ha-icon>
          <span class="name">${esc(x.label.replace(/^Telegram · /, ""))}<div class="kind">${esc(x.value.startsWith("entity:") ? t.entity_kind : t.service_kind)}</div></span>
          ${x.telegram ? `<span class="badge">${esc(t.telegram)}</span>` : ""}</label>`;
      }).join("");
      return `<div class="box"><h2>${esc(t.notifications)}</h2><div class="muted">${esc(t.notify_intro)}</div>
        ${rows || `<div class="empty">${esc(t.no_targets)}</div>`}
        <div class="field">${esc(t.notify_time)}<input id="settime" type="time" value="${esc((s.notify_time || "08:00:00").slice(0, 5))}" ${admin ? "" : "disabled"}></div>
        <p class="muted">${esc(t.notify_help)}</p>
        ${admin ? `<div class="tools"><button class="btn primary" data-act="savesettings">${esc(t.save)}</button>
          <button class="btn" data-act="testnotify" ${chosen.length ? "" : "disabled"}><ha-icon icon="mdi:send"></ha-icon> ${esc(t.send_test)}</button>
          ${this._flash ? `<span class="ok">${esc(this._flash)}</span>` : ""}</div>` : `<p class="muted">${esc(t.read_only)}</p>`}
      </div>`;
    }

    _dropCard() { if (this._card) { this._card.remove(); this._card = null; this._cardKey = null; } }

    // ---------- events ----------
    _onNav(e) {
      const el = e.target.closest("[data-view]");
      if (el) this._go(el.dataset.view);
    }

    _onChange(e) {
      const el = e.target;
      if (!el.dataset) return;
      if (el.dataset.act === "tagcolor") this._hass.callService("tickoff", "set_tag", { name: el.closest("[data-tag]").dataset.tag, color: el.value });
      else if (el.dataset.act === "target") {
        const boxes = [...this.shadowRoot.querySelectorAll('[data-act="target"]')];
        this._pick = boxes.filter((b) => b.checked).map((b) => b.value);
        boxes.forEach((b) => b.closest(".target").classList.toggle("on", b.checked));
        const test = this.shadowRoot.querySelector('[data-act="testnotify"]');
        if (test) test.disabled = !this._pick.length;
      }
    }

    async _save() {
      const sr = this.shadowRoot;
      const chosen = this._pick || (this._snap.settings && this._snap.settings.notify_targets) || [];
      await this._ws({ type: "tickoff/settings_set", notify_targets: chosen, notify_time: (sr.getElementById("settime").value || "08:00") + ":00" });
    }

    async _onContent(e) {
      const btn = e.target.closest("[data-act]");
      if (!btn || btn.tagName === "INPUT" || btn.tagName === "SELECT") return;
      const act = btn.dataset.act;
      const $ = (id) => this.shadowRoot.getElementById(id);
      const t = this._t;
      try {
        if (act === "tagrename") { this._renamingTag = btn.closest("[data-tag]").dataset.tag; this._render(); }
        else if (act === "tagrenamecancel") { this._renamingTag = null; this._render(); }
        else if (act === "tagrenamesave") {
          const name = this._renamingTag;
          const next = $("tagrename").value.trim();
          this._renamingTag = null;
          if (next && next !== name) await this._hass.callService("tickoff", "rename_tag", { name, new_name: next });
          this._render();
        } else if (act === "tagdelete") {
          const name = btn.closest("[data-tag]").dataset.tag;
          if (this._confirm === "tag:" + name) { this._confirm = null; await this._hass.callService("tickoff", "delete_tag", { name }); }
          else {
            this._confirm = "tag:" + name; // second click within 3 s confirms
            this._render();
            clearTimeout(this._ct);
            this._ct = setTimeout(() => { this._confirm = null; this._render(); }, 3000);
          }
        } else if (act === "tagadd") {
          const name = $("newtagname").value.trim();
          if (name) await this._hass.callService("tickoff", "set_tag", { name, color: $("newtagcolor").value });
        } else if (act === "savesettings") {
          await this._save();
          this._pick = null;
          this._flash = t.saved;
          this._render();
          clearTimeout(this._ft);
          this._ft = setTimeout(() => { this._flash = ""; this._render(); }, 2500);
        } else if (act === "testnotify") {
          if (!(this._pick || (this._snap.settings && this._snap.settings.notify_targets) || []).length) { this._flash = t.choose_first; this._render(); return; }
          await this._save(); // the test goes to what is chosen right now
          const res = await this._ws({ type: "tickoff/test_notify" });
          this._pick = null;
          this._flash = t.test_sent.replace("{n}", res.sent);
          this._render();
        }
      } catch (err) { /* shown through this._error */ }
    }
  }

  customElements.define("tickoff-panel", TickoffPanel);
})();
