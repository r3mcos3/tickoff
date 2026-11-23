/* Drives the card in a real (headless) browser against a mocked hass object. */
(async () => {
  const R = {};
  const out = document.getElementById("out");
  const tick = () => new Promise((r) => setTimeout(r, 0));
  try {
    const calls = [];
    let push = null;
    let unsubCalled = 0;
    const hass = {
      language: "en", locale: { language: "en", time_format: "24" },
      callService: (d, s, data, target) => { calls.push({ d, s, data, target }); return Promise.resolve(); },
      connection: { subscribeMessage: async (cb, msg) => { push = cb; R.subscribed_type = msg.type; return () => { unsubCalled++; }; } },
    };
    const T = (id, title, o = {}) => ({
      id, title, notes: "", due_date: null, due_time: null, priority: 0, tags: [], subtasks: [],
      recurrence: null, status: "open", completed_at: null, history: [], state: "no_date", ...o,
    });
    const snap = {
      now: "2026-03-10T09:00:00+01:00", entity_id: "todo.tickoff",
      tags: { garden: { color: "#2e7d32" }, home: { color: "#ffee58" }, work: { color: "#8e24aa" } },
      settings: {}, notify_targets: [],
      tasks: [
        T("a", "Mow <img src=x onerror=window.__xss=1>", { priority: 3, tags: ["garden"], due_date: "2026-03-08", state: "overdue",
          subtasks: [{ id: "s1", title: "front", done: true }, { id: "s2", title: "back", done: false }],
          recurrence: { type: "weekly", interval: 1, weekdays: [0, 3] }, notes: "bring gloves",
          history: [{ event: "created", at: "2026-03-01T10:00:00+00:00" }] }),
        T("b", "Buy milk", { tags: ["home"], due_date: "2026-03-10", due_time: "17:30", state: "today", priority: 2 }),
        T("c", "Call plumber", { priority: 1, due_date: "2026-03-20", state: "upcoming" }),
        T("e", "Book hotel", { due_date: "2026-03-20", due_time: "09:00", state: "upcoming", tags: ["work"] }),
        T("f", "Dentist", { due_date: "2026-03-11", state: "upcoming" }),
        T("g", "Sort garage", { state: "no_date" }),
        T("d", "Old task", { status: "done", state: null, completed_at: "2026-03-08T10:00:00+00:00" }),
      ],
    };

    const card = document.createElement("tickoff-card");
    document.body.appendChild(card);
    card.setConfig({});
    R.loading_before_data = card.shadowRoot.textContent.includes("Loading");
    card.hass = hass;
    await tick();
    R.subscribed = R.subscribed_type === "tickoff/subscribe";
    push(snap);
    await tick();
    const sr = card.shadowRoot;
    const rows = () => [...sr.querySelectorAll("#list .task")];
    const titles = () => rows().map((r) => r.querySelector(".title").textContent.trim());
    const sections = () => [...sr.querySelectorAll(".section")].map((s) => s.textContent.trim().replace(/\s+/g, " "));
    const click = (sel, root = sr) => { const el = root.querySelector(sel); if (!el) throw new Error("missing " + sel); el.click(); };

    // ---- sections, header, rows ----
    R.sections = sections();
    R.section_names = ["Overdue", "Today", "Upcoming", "No date", "Completed"].every((n, i) => R.sections[i].toLowerCase().includes(n.toLowerCase()));
    R.title_all = sr.querySelector("h2").textContent === "All tasks";
    R.pills = sr.getElementById("pills").textContent.replace(/\s+/g, " ").trim() === "1 overdue 1 today 6 open";
    R.rows = titles();
    R.sorted_upcoming = R.rows.indexOf("Dentist") < R.rows.indexOf("Book hotel") && R.rows.indexOf("Book hotel") < R.rows.indexOf("Call plumber");
    R.done_collapsed = !R.rows.includes("Old task");
    R.xss_escaped = window.__xss !== 1 && !sr.querySelector("#list img");
    R.overdue_chip = !!sr.querySelector(".due.bad") && sr.querySelector(".due.bad").textContent.includes("2 days ago");
    R.today_chip_24h = !!sr.querySelector(".due.warn") && sr.querySelector(".due.warn").textContent.includes("17:30");
    R.tomorrow_label = sr.getElementById("list").textContent.includes("Tomorrow");
    R.recurrence_shown = sr.getElementById("list").textContent.includes("Weekly Mon Thu");
    R.subtask_bar = sr.querySelector(".sub .bar i").style.width === "50%" && sr.querySelector(".sub").textContent.includes("1/2");
    R.tag_chip_colored = [...sr.querySelectorAll(".chip.tag")].some((c) => c.textContent === "garden" && c.style.background.includes("46, 125, 50"));
    R.priority_ring = sr.querySelector('.task[data-task="a"]').getAttribute("style").includes("#e53935");
    R.filter_chips = [...sr.querySelectorAll("#chips .chip.filter")].map((c) => c.textContent.trim()).join(",") === "garden,home,work";

    // ---- open the done section ----
    click('.section[data-act="fold"]');
    R.done_expands = titles().includes("Old task") && !!sr.querySelector(".task.done .title");
    click('.section[data-act="fold"]');
    R.done_collapses = !titles().includes("Old task");

    // ---- tag filter ----
    click('#chips .chip[data-tag="garden"]');
    R.filter_garden = titles().length === 1 && titles()[0].startsWith("Mow");
    click('#chips .chip[data-tag="garden"]');
    R.filter_cleared = titles().length === 6;

    // ---- toggle / snooze / delete ----
    const rowB = () => sr.querySelector('.task[data-task="b"]');
    click('.task[data-task="b"] [data-act="toggle"]');
    R.complete_call = JSON.stringify(calls.at(-1)) === JSON.stringify({ d: "tickoff", s: "complete_task", data: { task_id: "b" }, target: { entity_id: "todo.tickoff" } });
    click('.task[data-task="b"] [data-act="snooze"]');
    R.snooze_call = calls.at(-1).s === "snooze_task" && calls.at(-1).data.task_id === "b";
    const n0 = calls.length;
    click('.task[data-task="b"] [data-act="delete"]');
    R.delete_asks = calls.length === n0 && rowB().querySelector('[data-act="delete"]').textContent.includes("Sure");
    click('.task[data-task="b"] [data-act="delete"]');
    R.delete_confirmed = calls.at(-1).s === "delete_task" && calls.at(-1).data.task_id === "b";

    // ---- expand: notes, subtasks ----
    click('.task[data-task="a"] .body');
    R.detail_notes = sr.getElementById("list").textContent.includes("bring gloves");
    R.detail_history = sr.getElementById("list").textContent.includes("created");
    click('.subrow[data-sub="s2"] [data-act="subtoggle"]');
    R.subtask_call = calls.at(-1).s === "update_subtask" && calls.at(-1).data.subtask_id === "s2" && calls.at(-1).data.done === true;
    click('.subrow[data-sub="s1"] [data-act="subtoggle"]');
    R.subtask_untick = calls.at(-1).data.done === false;
    const subadd = sr.querySelector('[data-act="subadd"]');
    subadd.value = "gloves";
    subadd.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    R.add_subtask_call = calls.at(-1).s === "add_subtask" && calls.at(-1).data.title === "gloves" && subadd.value === "";
    click('.subrow[data-sub="s1"] [data-act="subremove"]');
    R.remove_subtask_call = calls.at(-1).s === "remove_subtask" && calls.at(-1).data.subtask_id === "s1";
    click('.task[data-task="a"] .body');

    // ---- edit sheet ----
    click('.task[data-task="c"] [data-act="edit"]');
    const sheet = () => sr.querySelector(".sheet");
    R.sheet_open = !!sheet() && sr.querySelector(".overlay") !== null;
    const f = (n) => sheet().querySelector(`[data-f="${n}"]`);
    R.sheet_prefilled = f("title").value === "Call plumber" && f("due_date").value === "20-03-2026" && f("due_time").value === "" && f("priority").dataset.v === "1";
    f("title").value = "Call the plumber";
    click('[data-act="qdate"][data-d="2026-03-11"]');
    R.quick_date = f("due_date").value === "11-03-2026";
    f("due_time").value = "09:15";
    click('[data-act="prio"][data-v="3"]');
    R.prio_seg = f("priority").dataset.v === "3" && sheet().querySelector('[data-act="prio"][data-v="3"]').classList.contains("on");
    click('[data-act="sheettag"][data-tag="home"]');
    f("newtag").value = "new tag, other";
    f("rtype").value = "weekly"; f("rint").value = "2";
    sheet().querySelector('[data-f="wd"][value="4"]').checked = true;
    sheet().querySelector('[data-f="wd"][value="1"]').checked = true;
    f("notes").value = "  take the invoice ";
    click('[data-act="save"]');
    const u = calls.at(-1);
    R.update_call = u.s === "update_task" && u.data.task_id === "c" && u.data.title === "Call the plumber" && u.data.due_date === "2026-03-11"
      && u.data.due_time === "09:15:00" && u.data.priority === 3 && JSON.stringify(u.data.tags) === '["home","new tag","other"]'
      && JSON.stringify(u.data.recurrence) === '{"type":"weekly","interval":2,"weekdays":[1,4]}' && u.data.notes === "take the invoice";
    R.sheet_closed = !sheet();
    // clearing the date clears the time; cancel / escape / backdrop close
    click('.task[data-task="c"] [data-act="edit"]');
    click('[data-act="qdate"][data-d=""]');
    click('[data-act="save"]');
    R.clear_date = calls.at(-1).data.due_date === null && calls.at(-1).data.due_time === null;
    click('.task[data-task="c"] [data-act="edit"]');
    click('[data-act="cancel"]');
    R.cancel_closes = !sheet();
    click('.task[data-task="c"] [data-act="edit"]');
    sr.querySelector(".overlay").click();
    R.backdrop_closes = !sheet();
    click('.task[data-task="c"] [data-act="edit"]');
    sr.getElementById("overlay").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    R.escape_closes = !sheet();
    click('.task[data-task="c"] [data-act="edit"]');
    const nBefore = calls.length;
    click('[data-act="sheetdelete"]');
    R.sheet_delete_asks = calls.length === nBefore;
    click('[data-act="sheetdelete"]');
    R.sheet_delete = calls.at(-1).s === "delete_task" && calls.at(-1).data.task_id === "c" && !sheet();

    // ---- 24-hour time and dd-mm-yyyy, independent of the browser locale ----
    click('.task[data-task="c"] [data-act="edit"]');
    R.no_native_pickers_visible = ![...sr.querySelectorAll('input[type="time"]')].length && [...sr.querySelectorAll('input[type="date"]')].every((i) => i.classList.contains("pickhidden"));
    R.date_placeholder = f("due_date").placeholder === "dd-mm-yyyy" && f("due_time").placeholder === "hh:mm";
    f("due_date").value = "1"; f("due_date").dispatchEvent(new Event("input", { bubbles: true }));
    f("due_date").value = "12032026"; f("due_date").dispatchEvent(new Event("input", { bubbles: true }));
    R.date_mask = f("due_date").value === "12-03-2026";
    f("due_time").value = "1730"; f("due_time").dispatchEvent(new Event("input", { bubbles: true }));
    R.time_mask = f("due_time").value === "17:30";
    f("due_time").value = "25:99";
    const before = calls.length;
    click('[data-act="save"]');
    R.invalid_time_blocks_save = calls.length === before && !!sheet() && f("due_time").classList.contains("bad");
    f("due_time").value = "08:05"; f("due_date").value = "31-02-2026";
    click('[data-act="save"]');
    R.invalid_date_blocks_save = calls.length === before && f("due_date").classList.contains("bad");
    f("due_date").value = "12/3/26"; f("due_time").value = "9.05";
    click('[data-act="save"]');
    R.lenient_input_saved = calls.at(-1).data.due_date === "2026-03-12" && calls.at(-1).data.due_time === "09:05:00";
    click('.task[data-task="c"] [data-act="edit"]');
    // calendar button: the hidden native picker writes dd-mm-yyyy into the text field
    const hidden = sheet().querySelector(".pickhidden");
    hidden.value = "2026-07-04"; hidden.dispatchEvent(new Event("change", { bubbles: true }));
    R.picker_fills_text = f("due_date").value === "04-07-2026";
    click('[data-act="cancel"]');
    R.fmt_helpers = window.__tickoff.fmtDate("2026-03-05") === "05-03-2026" && window.__tickoff.parseDateText("05-03-2026") === "2026-03-05" && window.__tickoff.parseDateText("2026-03-05") === "2026-03-05"
      && window.__tickoff.parseDateText("") === "" && window.__tickoff.parseDateText("13-13-2026") === null && window.__tickoff.parseDateText("29-02-2027") === null && window.__tickoff.parseDateText("29-02-2028") === "2028-02-29"
      && window.__tickoff.parseTimeText("7:05") === "07:05" && window.__tickoff.parseTimeText("0705") === "07:05" && window.__tickoff.parseTimeText("24:00") === null && window.__tickoff.parseTimeText("") === "";
    R.far_date_format = sr.getElementById("list").textContent.includes("Fri 20-03-2026") || sr.getElementById("list").textContent.includes("20-03-2026");
    R.no_am_pm = !/\b(AM|PM)\b/i.test(sr.getElementById("list").textContent);
    // a browser/profile set to 12-hour must not change anything
    hass.locale = { language: "en", time_format: "12" }; card.hass = hass; push(snap);
    R.time_24h_even_with_12h_profile = sr.querySelector(".due.warn").textContent.includes("17:30") && !/\b(AM|PM)\b/i.test(sr.querySelector(".due.warn").textContent);
    hass.locale = { language: "en", time_format: "24" }; card.hass = hass;

    // ---- quick add ----
    const add = (id) => sr.getElementById(id);
    R.add_disabled_when_empty = add("addbtn").disabled === true;
    add("addtitle").value = "Call mom tomorrow 14:30 #family !high";
    add("addtitle").dispatchEvent(new Event("input"));
    const preview = sr.getElementById("preview").textContent;
    R.preview = preview.includes("Tomorrow 14:30") && preview.includes("High") && preview.includes("family") && add("addbtn").disabled === false;
    add("addbtn").click();
    const a = calls.at(-1);
    R.add_call = a.s === "add_task" && a.target.entity_id === "todo.tickoff" && a.data.title === "Call mom" && a.data.due_date === "2026-03-11"
      && a.data.due_time === "14:30:00" && a.data.priority === 3 && JSON.stringify(a.data.tags) === '["family"]';
    R.add_cleared = add("addtitle").value === "" && sr.getElementById("preview").textContent === "";
    add("addtitle").value = "Pay rent monthly"; add("addtitle").dispatchEvent(new Event("input")); add("adddate").value = "2026-04-01";
    add("addtitle").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    R.add_enter_recurrence = calls.at(-1).data.recurrence.type === "monthly" && calls.at(-1).data.due_date === "2026-04-01";
    add("addtitle").value = "Bad date"; add("addtitle").dispatchEvent(new Event("input")); add("adddate").value = "99-99-2026";
    const nBad = calls.length; add("addbtn").click();
    R.add_invalid_date_blocked = calls.length === nBad && add("adddate").classList.contains("bad") && add("addtitle").value === "Bad date";
    add("adddate").value = ""; add("adddate").classList.remove("bad");
    add("addtitle").value = "   "; add("addtitle").dispatchEvent(new Event("input")); add("addbtn").click();
    R.blank_ignored = calls.at(-1).data.title === "Pay rent";
    add("addmore").click();
    R.options_toggle = sr.getElementById("addextra").classList.contains("open");
    add("addtitle").value = "With options"; add("addprio").value = "2"; add("addrec").value = "weekly"; add("adddate").value = "12-03-2026"; add("addtime").value = "7:30";
    add("addbtn").disabled = false; add("addbtn").click();
    R.add_options = calls.at(-1).data.due_time === "07:30:00" && calls.at(-1).data.due_date === "2026-03-12" && calls.at(-1).data.priority === 2 && JSON.stringify(calls.at(-1).data.recurrence) === '{"type":"weekly","interval":1,"weekdays":[3]}';

    // ---- parser ----
    const P = (s) => window.__tickoff.parseQuickAdd(s, "2026-03-10");
    R.parse_basic = JSON.stringify(P("Buy milk")) === JSON.stringify({ title: "Buy milk", tags: [], priority: 0, due_date: null, due_time: null, recurrence: null });
    R.parse_dutch = (() => { const p = P("Tandarts morgen om 9:00 #gezondheid !hoog"); return p.title === "Tandarts om" && p.due_date === "2026-03-11" && p.due_time === "09:00" && p.priority === 3; })();
    R.parse_weekday = P("Gym friday").due_date === "2026-03-13" && P("Gym monday").due_date === "2026-03-16" && P("Gym tuesday").due_date === "2026-03-17" && P("Gym vrijdag").due_date === "2026-03-13";
    R.parse_relative = P("Pay in 3 days").due_date === "2026-03-13" && P("Review over 2 weken").due_date === "2026-03-24" && P("x overmorgen").due_date === "2026-03-12";
    R.parse_iso_time = P("Flight 2026-05-01 @06:45").due_date === "2026-05-01" && P("Flight 2026-05-01 @06:45").due_time === "06:45";
    R.parse_time_only_means_today = P("Call 15:00").due_date === "2026-03-10";
    R.parse_recurrence = P("Water plants every week").recurrence.type === "weekly" && P("Water plants every week").title === "Water plants" && P("Gym friday weekly").recurrence.weekdays[0] === 4;
    R.parse_dutch_recurrence = P("Prullenbak elke dag").recurrence.type === "daily" && P("Huur maandelijks").recurrence.type === "monthly";
    R.parse_priority_forms = P("a !1").priority === 1 && P("a !med").priority === 2 && P("a !3").priority === 3 && P("a !laag").priority === 1;
    R.parse_tags_dedupe = JSON.stringify(P("a #x #y #x").tags) === '["x","y"]';
    R.parse_only_keywords_keeps_text = P("tomorrow").title === "tomorrow" && P("tomorrow").due_date === null;
    R.parse_dd_mm = P("Pay 15-03").due_date === "2026-03-15" && P("Pay 15-03").title === "Pay" && P("Pay 1/4/2027").due_date === "2027-04-01" && P("Pay 05-03").due_date === "2027-03-05" && P("Pay 31-02").title === "Pay 31-02";
    R.parse_bad_time = P("Meet 25:99").title === "Meet 25:99";
    R.parse_exclamation_in_text = P("Hello! world").title === "Hello! world";

    // ---- manual order + drag & drop ----
    click('[data-act="manual"]');
    R.manual_flat = titles().length === 6 && titles()[0].startsWith("Mow") && sections().length === 2;
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    const ids = () => rows().map((r) => r.dataset.task);
    const first = sr.querySelector(".task"), last = rows().at(-1);
    R.draggable_in_manual = first.getAttribute("draggable") === "true";
    fire(last, "dragstart"); fire(first, "dragover"); fire(first, "drop");
    R.drag_up = calls.at(-1).s === "move_task" && calls.at(-1).data.task_id === last.dataset.task && calls.at(-1).data.previous_task_id === undefined;
    fire(first, "dragstart"); fire(last, "dragover"); fire(last, "drop");
    R.drag_down = calls.at(-1).s === "move_task" && calls.at(-1).data.task_id === first.dataset.task && calls.at(-1).data.previous_task_id === last.dataset.task;
    R.drop_target_math = window.__tickoff.dropTarget([{ id: "1" }, { id: "2" }, { id: "3" }], "3", "2", false) === "1" && window.__tickoff.dropTarget([{ id: "1" }, { id: "2" }], "2", "1", false) === null;
    click('[data-act="manual"]');
    R.manual_off = !sr.querySelector('.task[draggable="true"]');
    void ids;

    // ---- clear completed, tag colours ----
    click('#foot [data-act="clear"]');
    R.clear_call = calls.at(-1).s === "delete_completed" && calls.at(-1).target.entity_id === "todo.tickoff";
    click('[data-act="edittags"]');
    const picker = sr.querySelector('input.tagcolor[data-tag="garden"]');
    picker.value = "#112233"; picker.dispatchEvent(new Event("input", { bubbles: true }));
    R.tag_color_call = calls.at(-1).s === "set_tag" && calls.at(-1).data.color === "#112233" && calls.at(-1).target === undefined;
    click('[data-act="edittags"]');

    // ---- live update ----
    snap.tasks.push(T("n", "Pushed from server"));
    push(snap);
    R.live_update = titles().includes("Pushed from server");

    // ---- views ----
    card.setConfig({ view: "today" }); push(snap);
    R.today_sections = JSON.stringify(sections().map((x) => x.replace(/\s*\d+$/, ""))) === '["Overdue","Today"]'.toUpperCase() || JSON.stringify(sections().map((x) => x.replace(/\s*\d+$/, "").toLowerCase())) === '["overdue","today"]';
    R.today_rows = titles().length === 2 && titles()[0].startsWith("Mow") && titles()[1] === "Buy milk";
    R.today_title = sr.querySelector("h2").textContent === "Today";
    card.setConfig({ view: "upcoming" }); push(snap);
    R.upcoming_by_day = sections().length === 2 && sections()[0].toLowerCase().includes("tomorrow") && titles().join(",") === "Dentist,Book hotel,Call plumber";
    card.setConfig({ view: "done" }); push(snap);
    R.done_view = titles().join(",") === "Old task" && sr.getElementById("adder").style.display === "none";
    card.setConfig({ view: "today", title: "Now" }); push(snap);
    R.custom_title = sr.querySelector("h2").textContent === "Now";
    snap.tasks = snap.tasks.filter((t) => t.state !== "today" && t.state !== "overdue");
    push(snap);
    R.empty_state = sr.getElementById("list").textContent.includes("Nothing due today");
    card.setConfig({ view: "all", hide_when_empty: true }); push(snap);
    R.not_hidden_with_tasks = card.style.display !== "none";
    card.setConfig({ view: "today", hide_when_empty: true }); push(snap);
    R.hidden_when_empty = card.style.display === "none";
    card.setConfig({ view: "all", tags: ["work"] }); push(snap);
    R.config_tags = titles().join(",") === "Book hotel";
    card.setConfig({ view: "all", show_completed: false }); push(snap);
    R.show_completed_false = !sr.getElementById("list").textContent.includes("Completed");
    card.setConfig({ compact: true }); push(snap);
    R.compact_class = !!sr.querySelector("ha-card.compact");

    // ---- read only ----
    card.setConfig({ read_only: true }); push(snap);
    R.ro_no_actions = !sr.querySelector(".actions") && sr.getElementById("adder").style.display === "none" && !sr.querySelector('[data-act="manual"]');
    R.ro_check_disabled = [...sr.querySelectorAll('.task [data-act="toggle"]')].every((c) => c.disabled);
    const n1 = calls.length;
    sr.querySelector('.task [data-act="toggle"]').click();
    R.ro_no_calls = calls.length === n1;

    // ---- dutch + 12h ----
    hass.language = "nl"; hass.locale = { language: "nl", time_format: "12" };
    card.hass = hass;
    card.setConfig({}); push(snap);
    R.dutch = sr.getElementById("addtitle").placeholder.startsWith("Taak toevoegen") && sr.querySelector("h2").textContent === "Alle taken";

    // ---- not set up ----
    card.setConfig({}); push({ ...snap, entity_id: null, tasks: [] });
    R.not_set_up = sr.getElementById("list").textContent.includes("not set up") || sr.getElementById("list").textContent.includes("nog niet ingesteld");

    // ---- visual editor ----
    const editor = document.createElement("tickoff-card-editor");
    document.body.appendChild(editor);
    editor.setConfig({ view: "today", hide_when_empty: true });
    editor.hass = hass;
    const form = editor.querySelector("ha-form");
    R.editor_form = !!form && form.schema.length === 9 && form.data.hide_empty === true && form.data.view === "today";
    R.editor_views = JSON.stringify(form.schema[1].selector.select.options.map((o) => o.value)) === '["all","today","upcoming","done"]';
    let changed = null;
    editor.addEventListener("config-changed", (e) => { changed = e.detail.config; });
    form.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { ...form.data, hide_empty: false, tags: [], title: "X" } } }));
    R.editor_event = changed && changed.hide_when_empty === false && changed.title === "X" && !("tags" in changed) && !("hide_empty" in changed);
    R.registered = window.customCards.some((c) => c.type === "tickoff-card");
    R.stub = JSON.stringify(customElements.get("tickoff-card").getStubConfig()) === '{"view":"all"}';

    card.remove();
    R.unsubscribed = unsubCalled === 1;
  } catch (e) {
    R.error = String((e && e.stack) || e);
  }
  out.textContent = JSON.stringify(R);
  document.title = "done";
})();
