(async () => {
  const R = {};
  const out = document.getElementById("out");
  const tick = () => new Promise((r) => setTimeout(r, 0));
  try {
    const ws = [], svc = [];
    const pushers = [];
    let unsub = 0;
    let wsFail = null;
    const mkHass = (admin, lang) => ({
      language: lang, locale: { language: lang, time_format: "24" },
      user: { is_admin: admin },
      states: { "todo.tickoff_groceries": {} },
      callService: (d, s, data, target) => { svc.push({ d, s, data, target }); return Promise.resolve(); },
      callWS: (msg) => {
        ws.push(msg);
        if (wsFail) { const e = wsFail; wsFail = null; return Promise.reject(e); }
        return Promise.resolve(msg.type === "tickoff/list_create" ? { entry_id: "e9" } : {});
      },
      connection: { subscribeMessage: async (cb) => { pushers.push(cb); setTimeout(() => cb(snap), 0); return () => { unsub++; }; } }, // like the server: push right after subscribing
    });
    const T = (id, title, o = {}) => ({ id, title, notes: "", due_date: null, due_time: null, priority: 0, tags: [], subtasks: [],
      recurrence: null, status: "open", completed_at: null, history: [], state: "no_date", ...o });
    const snap = {
      now: "2026-03-10T09:00:00+00:00",
      tags: { garden: { color: "#2e7d32" }, home: { color: "#ffee58" }, unused: { color: "#123456" } },
      settings: { notify_service: "family", notify_time: "07:30:00" },
      notify_services: ["family", "mine"],
      lists: [
        { entry_id: "e1", entity_id: "todo.tickoff_groceries", name: "Groceries", notify_service: "mine", tasks: [
          T("a", "Mow", { tags: ["garden"], due_date: "2026-03-09", state: "overdue" }),
          T("b", "Milk", { tags: ["home"], due_date: "2026-03-10", state: "today" }),
          T("c", "Later", { due_date: "2026-04-01", state: "upcoming" }),
          T("d", "Done", { status: "done" }),
        ] },
        { entry_id: "e2", entity_id: "todo.tickoff_chores", name: "Chores", notify_service: "", tasks: [
          T("x", "Vacuum", { tags: ["home"], due_date: "2026-03-10", state: "today" }),
        ] },
      ],
    };
    const pushAll = () => pushers.forEach((p) => p(snap));

    const hass = mkHass(true, "en");
    const panel = document.createElement("tickoff-panel");
    document.body.appendChild(panel);
    panel.hass = hass; panel.narrow = false; panel.route = {}; panel.panel = {};
    await tick();
    pushAll(); await tick();
    const sr = panel.shadowRoot;
    const click = (sel) => { const el = sr.querySelector(sel); if (!el) throw new Error("missing " + sel); el.click(); };
    await tick(); await tick();
    const text = (sel) => sr.querySelector(sel).textContent.trim();
    const nav = () => [...sr.querySelectorAll("nav .item")].map((i) => i.textContent.trim().replace(/\s+/g, " "));

    R.nav = nav();
    R.nav_has_everything = ["Today", "All tasks", "Groceries", "Chores", "New list", "Tags", "Settings"].every((x) => R.nav.some((n) => n.includes(x)));
    R.today_count = R.nav.some((n) => n.startsWith("\u{1F4C5} Today 3") || /Today\s*3/.test(n));
    R.overdue_badge_red = !!sr.querySelector('nav .item[data-view="today"] .n.bad');
    R.today_active = sr.querySelector('nav .item[data-view="today"]').classList.contains("active");
    let card = sr.querySelector("tickoff-card");
    R.card_in_today = !!card && card.shadowRoot.querySelector("h2").textContent === "Today";
    R.card_shows_today_rows = card.shadowRoot.querySelectorAll("#list .row[data-task]").length === 3;

    // switch to a list
    click('nav .item[data-view="list:e1"]');
    await tick();
    card = sr.querySelector("tickoff-card");
    R.list_card = !!card && card.shadowRoot.querySelector("h2").textContent === "Groceries" && card.shadowRoot.querySelectorAll("#list .row[data-task]").length === 4;
    R.list_notify_select = sr.getElementById("listnotify").value === "mine";
    R.list_tools = !!sr.querySelector('[data-act="rename"]') && !!sr.querySelector('[data-act="deletelist"]');

    // card state survives a snapshot push
    card.shadowRoot.querySelector('#chips .chip[data-tag="garden"]').click();
    pushAll(); await tick();
    R.card_instance_kept = sr.querySelector("tickoff-card") === card && card.shadowRoot.querySelectorAll("#list .row[data-task]").length === 1;

    // change notify service
    const sel = sr.getElementById("listnotify");
    sel.value = "family"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    R.notify_ws = JSON.stringify(ws.at(-1)) === '{"type":"tickoff/list_update","entry_id":"e1","notify_service":"family"}';
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    R.notify_clear_ws = ws.at(-1).notify_service === null;

    // rename
    click('[data-act="rename"]');
    R.rename_input = sr.getElementById("renameinput").value === "Groceries";
    sr.getElementById("renameinput").value = "Shop";
    click('[data-act="renamesave"]'); await tick();
    R.rename_ws = JSON.stringify(ws.at(-1)) === '{"type":"tickoff/list_update","entry_id":"e1","name":"Shop"}';
    R.rename_closed = !sr.getElementById("renameinput");

    // delete: first click only asks, second deletes and goes to today
    const wsBefore = ws.length;
    click('[data-act="deletelist"]');
    R.delete_asks = ws.length === wsBefore && sr.querySelector('[data-act="deletelist"]').textContent.includes("Sure");
    click('[data-act="deletelist"]'); await tick();
    R.delete_ws = ws.at(-1).type === "tickoff/list_delete" && ws.at(-1).entry_id === "e1";
    R.back_to_today = sr.querySelector('nav .item[data-view="today"]').classList.contains("active");

    // new list
    click('nav [data-act="newlist"]');
    R.create_form = !!sr.getElementById("newname") && sr.getElementById("newnotify").options.length === 3;
    sr.getElementById("newname").value = "Garden";
    sr.getElementById("newnotify").value = "family";
    click('[data-act="create"]'); await tick(); await tick();
    R.create_ws = JSON.stringify(ws.at(-1)) === '{"type":"tickoff/list_create","name":"Garden","notify_service":"family"}';
    click('nav [data-act="newlist"]');
    click('[data-act="create"]'); // empty name: nothing sent
    R.blank_name_ignored = ws.at(-1).type === "tickoff/list_create" && ws.filter((w) => w.type === "tickoff/list_create").length === 1;
    click('[data-act="cancel"]');

    // server error shown
    click('nav [data-act="newlist"]');
    sr.getElementById("newname").value = "Chores";
    wsFail = new Error("A list with this name already exists");
    click('[data-act="create"]'); await tick(); await tick();
    R.error_shown = sr.querySelector(".err") && sr.querySelector(".err").textContent.includes("already exists");
    click('[data-act="cancel"]');

    // tags view
    click('nav .item[data-view="tags"]');
    R.tag_rows = sr.querySelectorAll("#body .row[data-tag]").length === 3;
    R.tag_counts = sr.getElementById("body").textContent.includes("home") && sr.getElementById("body").textContent.includes("(2 tasks)");
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

    // settings view
    click('nav .item[data-view="settings"]');
    R.settings_values = sr.getElementById("setnotify").value === "family" && sr.getElementById("settime").value === "07:30";
    sr.getElementById("setnotify").value = "mine"; sr.getElementById("settime").value = "09:05";
    click('[data-act="savesettings"]'); await tick();
    R.settings_ws = JSON.stringify(ws.at(-1)) === '{"type":"tickoff/settings_set","notify_service":"mine","notify_time":"09:05:00"}';
    R.saved_flash = !!sr.querySelector(".ok");

    // all tasks view
    click('nav .item[data-view="all"]');
    await tick(); await tick();
    card = sr.querySelector("tickoff-card");
    R.all_view = card.shadowRoot.querySelector("h2").textContent === "All tasks" && card.shadowRoot.querySelectorAll("#list .row[data-task]").length === 5;

    // non-admin: no management
    const p2 = document.createElement("tickoff-panel");
    document.body.appendChild(p2);
    p2.hass = mkHass(false, "en"); await tick(); pushAll(); await tick();
    const sr2 = p2.shadowRoot;
    R.user_no_newlist = !sr2.querySelector('[data-act="newlist"]');
    sr2.querySelector('nav .item[data-view="list:e2"]').click(); await tick();
    R.user_no_list_tools = !sr2.querySelector('[data-act="rename"]') && !sr2.getElementById("listnotify");
    sr2.querySelector('nav .item[data-view="settings"]').click();
    R.user_settings_readonly = !sr2.getElementById("setnotify") && !sr2.querySelector('[data-act="savesettings"]');
    p2.remove();

    // narrow layout: nav hidden until the menu button is used
    const p3 = document.createElement("tickoff-panel");
    document.body.appendChild(p3);
    p3.narrow = true; p3.hass = mkHass(true, "en"); await tick(); pushAll(); await tick();
    const nav3 = p3.shadowRoot.getElementById("nav");
    R.narrow_hidden = p3.shadowRoot.querySelector(".layout").classList.contains("narrow") && !nav3.classList.contains("open");
    p3.shadowRoot.getElementById("menu").click();
    R.narrow_open = nav3.classList.contains("open");
    nav3.querySelector('[data-view="tags"]').click();
    R.narrow_closes_after_pick = !nav3.classList.contains("open");
    // wide: menu button toggles the HA sidebar
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
    p5.hass = mkHass(true, "nl"); await tick(); pushAll(); await tick();
    R.dutch = p5.shadowRoot.getElementById("nav").textContent.includes("Alle taken") && p5.shadowRoot.getElementById("nav").textContent.includes("Nieuwe lijst");
    p5.remove(); p3.remove();

    panel.remove();
    R.unsubscribed = unsub >= 1;
  } catch (e) {
    R.error = String((e && e.stack) || e);
  }
  out.textContent = JSON.stringify(R);
})();
