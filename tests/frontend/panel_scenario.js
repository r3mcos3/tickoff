(async () => {
  const R = {};
  const out = document.getElementById("out");
  const tick = () => new Promise((r) => setTimeout(r, 0));
  try {
    const ws = [], svc = [];
    const pushers = [];
    let unsub = 0;
    let testResult = { sent: 2, targets: 2 };
    const T = (id, title, o = {}) => ({ id, title, notes: "", due_date: null, due_time: null, priority: 0, tags: [], subtasks: [],
      recurrence: null, status: "open", completed_at: null, history: [], state: "no_date", ...o });
    const snap = {
      now: "2026-03-10T09:00:00+01:00", entity_id: "todo.tickoff",
      tags: { garden: { color: "#2e7d32" }, home: { color: "#ffee58" }, unused: { color: "#123456" } },
      settings: { notify_targets: ["entity:notify.telegram_remco"], notify_time: "07:30:00" },
      notify_targets: [
        { value: "entity:notify.telegram_remco", label: "Telegram · Home Assistant Remco", telegram: true },
        { value: "service:mobile_app_phone", label: "notify.mobile_app_phone", telegram: false },
        { value: "service:gone", label: "service:gone (unavailable)", telegram: false },
      ],
      tasks: [
        T("a", "Mow", { tags: ["garden"], due_date: "2026-03-09", state: "overdue" }),
        T("b", "Milk", { tags: ["home"], due_date: "2026-03-10", state: "today" }),
        T("c", "Later", { due_date: "2026-04-01", state: "upcoming" }),
        T("x", "Vacuum", { tags: ["home"], state: "no_date" }),
        T("d", "Done", { status: "done", state: null }),
      ],
    };
    let updState = { state: "on", attributes: { installed_version: "0.3.1", latest_version: "0.4.0", release_url: "https://github.com/r3mcos3/tickoff/releases/tag/v0.4.0", release_summary: "Adds the update entity", in_progress: false, restart_required: false } };
    const mkHass = (admin, lang) => ({
      language: lang, states: { "update.tickoff_update": updState }, locale: { language: lang, time_format: "24" }, user: { is_admin: admin },
      callService: (d, s, data, target) => { svc.push({ d, s, data, target }); return Promise.resolve(); },
      callWS: (msg) => { ws.push(msg); return Promise.resolve(msg.type === "tickoff/test_notify" ? testResult : {}); },
      connection: { subscribeMessage: async (cb) => { pushers.push(cb); setTimeout(() => cb(snap), 0); return () => { unsub++; }; } },
    });
    const pushAll = () => pushers.forEach((p) => p(snap));

    try { localStorage.setItem("tickoff-panel-view", "settings"); } catch (e) { /* ignore */ } // an old remembered view must not matter
    const panel = document.createElement("tickoff-panel");
    document.body.appendChild(panel);
    panel.hass = mkHass(true, "en"); panel.narrow = false; panel.route = {}; panel.panel = {};
    await tick(); await tick(); await tick();
    const sr = panel.shadowRoot;
    const click = (sel, root = sr) => { const el = root.querySelector(sel); if (!el) throw new Error("missing " + sel); el.click(); };
    const nav = () => [...sr.querySelectorAll("nav .item")].map((i) => i.textContent.trim().replace(/\s+/g, " "));
    const cardRows = () => [...sr.querySelector("tickoff-card").shadowRoot.querySelectorAll("#list .task .title")].map((x) => x.textContent.trim());

    R.nav = nav();
    R.nav_everything = ["Today2", "Upcoming1", "All tasks4", "Completed1", "garden1", "home2", "unused", "Manage tags", "Settings"].every((x) => R.nav.some((n) => n.includes(x)));
    R.no_lists_anywhere = !R.nav.some((n) => /list/i.test(n)) && !sr.querySelector('[data-act="newlist"]');
    R.overdue_badge = !!sr.querySelector('nav .item[data-view="today"] .n.bad');
    R.opens_on_all_tasks = sr.querySelector('nav .item[data-view="all"]').classList.contains("active") && !sr.querySelector('nav .item[data-view="today"]').classList.contains("active");
    let card = sr.querySelector("tickoff-card");
    R.all_card_on_open = !!card && card.shadowRoot.querySelector("h2").textContent === "All tasks" && cardRows().length === 4;
    click('nav [data-view="today"]'); await tick(); await tick();
    card = sr.querySelector("tickoff-card");
    R.today_card = !!card && card.shadowRoot.querySelector("h2").textContent === "Today" && cardRows().join(",") === "Mow,Milk";
    R.today_active = sr.querySelector('nav .item[data-view="today"]').classList.contains("active");

    click('nav [data-view="upcoming"]'); await tick(); await tick();
    R.upcoming_card = sr.querySelector("tickoff-card").shadowRoot.querySelector("h2").textContent === "Upcoming" && cardRows().join(",") === "Later";
    click('nav [data-view="all"]'); await tick(); await tick();
    R.all_card = cardRows().length === 4;
    click('nav [data-view="done"]'); await tick(); await tick();
    R.done_card = cardRows().join(",") === "Done";
    click('nav [data-view="tag:home"]'); await tick(); await tick();
    card = sr.querySelector("tickoff-card");
    R.tag_card = card.shadowRoot.querySelector("h2").textContent === "home" && cardRows().sort().join(",") === "Milk,Vacuum";

    // the embedded card survives a snapshot push (filters stay)
    card.shadowRoot.querySelector('#chips .chip[data-tag="home"]').click();
    pushAll(); await tick();
    R.card_instance_kept = sr.querySelector("tickoff-card") === card && card.shadowRoot.querySelector('#chips .chip.on') !== null;

    // manage tags
    click('nav [data-view="tags"]');
    R.tag_rows = sr.querySelectorAll("#body .row[data-tag]").length === 3 && sr.getElementById("body").textContent.includes("(2 tasks)");
    const color = sr.querySelector('.row[data-tag="garden"] input[type=color]');
    color.value = "#112233"; color.dispatchEvent(new Event("change", { bubbles: true }));
    R.tag_color = JSON.stringify(svc.at(-1)) === '{"d":"tickoff","s":"set_tag","data":{"name":"garden","color":"#112233"}}';
    click('.row[data-tag="home"] [data-act="tagrename"]');
    sr.getElementById("tagrename").value = "house";
    click('[data-act="tagrenamesave"]'); await tick();
    R.tag_rename = svc.at(-1).s === "rename_tag" && svc.at(-1).data.name === "home" && svc.at(-1).data.new_name === "house";
    const n0 = svc.length;
    click('.row[data-tag="unused"] [data-act="tagdelete"]');
    R.tag_delete_asks = svc.length === n0;
    click('.row[data-tag="unused"] [data-act="tagdelete"]'); await tick();
    R.tag_delete = svc.at(-1).s === "delete_tag" && svc.at(-1).data.name === "unused";
    sr.getElementById("newtagname").value = "work"; sr.getElementById("newtagcolor").value = "#abcdef";
    click('[data-act="tagadd"]'); await tick();
    R.tag_add = svc.at(-1).s === "set_tag" && svc.at(-1).data.name === "work" && svc.at(-1).data.color === "#abcdef";

    // settings: notification targets with Telegram on top
    click('nav [data-view="settings"]');
    const targets = [...sr.querySelectorAll(".target")];
    R.targets_listed = targets.length === 3;
    R.telegram_first = targets[0].textContent.includes("Home Assistant Remco") && !!targets[0].querySelector(".badge") && targets[0].querySelector(".badge").textContent === "Telegram";
    R.telegram_label_clean = !targets[0].textContent.includes("Telegram ·");
    R.telegram_checked = targets[0].querySelector("input").checked && targets[0].classList.contains("on") && !targets[1].querySelector("input").checked;
    R.kinds = targets[0].textContent.includes("Notify entity") && targets[1].textContent.includes("Notify service");
    R.time_value = sr.getElementById("settime").value === "07:30" && sr.getElementById("settime").type === "text" && sr.getElementById("settime").placeholder === "hh:mm";
    R.test_enabled = sr.querySelector('[data-act="testnotify"]').disabled === false;
    // pick the phone too, drop nothing
    const phone = targets[1].querySelector("input");
    phone.checked = true; phone.dispatchEvent(new Event("change", { bubbles: true }));
    R.target_toggle_on = targets[1].classList.contains("on");
    sr.getElementById("settime").value = "09:05";
    click('[data-act="savesettings"]'); await tick(); await tick();
    R.settings_ws = JSON.stringify(ws.at(-1)) === '{"type":"tickoff/settings_set","notify_targets":["entity:notify.telegram_remco","service:mobile_app_phone"],"notify_time":"09:05:00"}';
    R.values_persist_after_save = sr.getElementById("settime").value === "09:05" && sr.querySelectorAll(".target input:checked").length === 2
      && sr.querySelectorAll(".target.on").length === 2;
    R.saved_flash = !!sr.querySelector(".ok") && sr.querySelector(".ok").textContent === "Saved";
    // typing: mask and 24-hour validation
    sr.getElementById("settime").value = "1830"; sr.getElementById("settime").dispatchEvent(new Event("input", { bubbles: true }));
    R.time_mask = sr.getElementById("settime").value === "18:30";
    sr.getElementById("settime").value = "25:61";
    const wBad = ws.length;
    click('[data-act="savesettings"]'); await tick(); await tick();
    R.invalid_time_not_saved = ws.length === wBad && sr.querySelector(".err") && sr.querySelector(".err").textContent.includes("24-hour");
    sr.getElementById("settime").value = "09:05";
    click('[data-act="savesettings"]'); await tick(); await tick();
    // the server later pushes the same values: nothing flips back
    snap.settings = { notify_targets: ["entity:notify.telegram_remco", "service:mobile_app_phone"], notify_time: "09:05:00" };
    pushAll(); await tick();
    R.server_push_keeps_values = sr.getElementById("settime").value === "09:05" && sr.querySelectorAll(".target input:checked").length === 2;
    // unselect everything: test button disables
    sr.querySelectorAll(".target input").forEach((b) => { b.checked = false; b.dispatchEvent(new Event("change", { bubbles: true })); });
    R.test_disabled_when_none = sr.querySelector('[data-act="testnotify"]').disabled === true;
    // test message: saves first, then tests
    sr.querySelector(".target input").checked = true; sr.querySelector(".target input").dispatchEvent(new Event("change", { bubbles: true }));
    const w0 = ws.length;
    click('[data-act="testnotify"]'); await tick(); await tick(); await tick();
    R.test_flow = ws.length === w0 + 2 && ws.at(-2).type === "tickoff/settings_set" && ws.at(-2).notify_targets.length === 1 && ws.at(-1).type === "tickoff/test_notify";
    R.test_flash = sr.querySelector(".ok") && sr.querySelector(".ok").textContent.includes("2 target");

    // updates box in Settings
    const box = () => sr.getElementById("body").textContent.replace(/\s+/g, " ");
    R.update_available_shown = box().includes("Version 0.4.0 is available") && box().includes("Installed version: 0.3.1") && box().includes("Adds the update entity");
    R.update_release_link = sr.querySelector('a[href*="releases/tag/v0.4.0"]') !== null;
    R.settings_nav_dot = sr.querySelector('nav [data-view="settings"] .n').textContent === "●";
    const s0 = svc.length;
    click('[data-act="installupdate"]'); await tick(); await tick();
    R.install_calls_update_service = svc[s0].d === "update" && svc[s0].s === "install" && svc[s0].data.entity_id === "update.tickoff_update";
    // state changes are picked up without navigating away
    updState = { state: "off", attributes: { ...updState.attributes, installed_version: "0.4.0", latest_version: "0.4.0", restart_required: true } };
    panel.hass = { ...mkHass(true, "en"), states: { "update.tickoff_update": updState } }; await tick();
    R.restart_needed_shown = box().includes("Restart Home Assistant") && !!sr.querySelector('a[href="/config/repairs"]') && !sr.querySelector('[data-act="installupdate"]');
    updState = { state: "off", attributes: { ...updState.attributes, restart_required: false } };
    panel.hass = { ...mkHass(true, "en"), states: { "update.tickoff_update": updState } }; await tick();
    R.up_to_date_shown = box().includes("up to date") && !sr.querySelector('nav [data-view="settings"] .n');
    updState = { state: "on", attributes: { ...updState.attributes, latest_version: "0.5.0" } };
    panel.hass = { ...mkHass(true, "en"), states: { "update.tickoff_update": updState } }; await tick();

    // no targets: helpful hint
    const snapNone = { ...snap, notify_targets: [], settings: { notify_targets: [], notify_time: "08:00:00" } };
    pushers.forEach((p) => p(snapNone)); await tick();
    R.no_targets_hint = sr.getElementById("body").textContent.includes("Telegram bot integration");
    pushAll();

    // a second opening starts on All tasks again, not on where the first one ended
    const p6 = document.createElement("tickoff-panel");
    document.body.appendChild(p6);
    p6.hass = mkHass(true, "en"); await tick(); await tick();
    R.reopens_on_all_tasks = p6.shadowRoot.querySelector('nav .item[data-view="all"]').classList.contains("active");
    p6.remove();

    // non-admin
    const p2 = document.createElement("tickoff-panel");
    document.body.appendChild(p2);
    p2.hass = mkHass(false, "en"); await tick(); await tick();
    p2.shadowRoot.querySelector('nav [data-view="settings"]').click();
    const sr2 = p2.shadowRoot;
    R.user_settings_readonly = !sr2.querySelector('[data-act="savesettings"]') && !sr2.querySelector('[data-act="testnotify"]')
      && [...sr2.querySelectorAll(".target input")].every((i) => i.disabled) && sr2.getElementById("settime").disabled;
    R.user_cannot_install = !sr2.querySelector('[data-act="installupdate"]') && sr2.getElementById("body").textContent.includes("is available");
    p2.remove();

    // narrow: nav hidden until the menu button is used; wide: the button toggles the HA sidebar
    const p3 = document.createElement("tickoff-panel");
    document.body.appendChild(p3);
    p3.narrow = true; p3.hass = mkHass(true, "en"); await tick(); await tick();
    const nav3 = p3.shadowRoot.getElementById("nav");
    R.narrow_hidden = p3.shadowRoot.querySelector(".layout").classList.contains("narrow") && !nav3.classList.contains("open");
    p3.shadowRoot.getElementById("menu").click();
    R.narrow_open = nav3.classList.contains("open");
    nav3.querySelector('[data-view="tags"]').click();
    R.narrow_closes = !nav3.classList.contains("open");
    p3.remove();
    let toggled = false;
    const p4 = document.createElement("tickoff-panel");
    document.body.appendChild(p4);
    p4.addEventListener("hass-toggle-menu", () => { toggled = true; });
    p4.hass = mkHass(true, "en"); await tick();
    p4.shadowRoot.getElementById("menu").click();
    R.menu_toggles_sidebar = toggled;
    p4.remove();

    // dutch
    const p5 = document.createElement("tickoff-panel");
    document.body.appendChild(p5);
    p5.hass = mkHass(true, "nl"); await tick(); await tick();
    R.dutch = p5.shadowRoot.getElementById("nav").textContent.includes("Alle taken") && p5.shadowRoot.getElementById("nav").textContent.includes("Tags beheren");
    p5.remove();

    panel.remove();
    R.unsubscribed = unsub >= 1;
  } catch (e) {
    R.error = String((e && e.stack) || e);
  }
  out.textContent = JSON.stringify(R);
})();
