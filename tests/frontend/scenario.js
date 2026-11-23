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
      language: "en",
      locale: { language: "en", time_format: "24" },
      states: { "todo.tickoff_groceries": {}, "todo.tickoff_chores": {} },
      callService: (d, s, data, target) => { calls.push({ d, s, data, target }); return Promise.resolve(); },
      connection: {
        subscribeMessage: async (cb, msg) => { push = cb; R.subscribed_type = msg.type; return () => { unsubCalled++; }; },
      },
    };
    const T = (id, title, o = {}) => ({
      id, title, notes: "", due_date: null, due_time: null, priority: 0, tags: [], subtasks: [],
      recurrence: null, status: "open", completed_at: null, history: [], state: "no_date", ...o,
    });
    const snap = {
      now: "2026-03-10T09:00:00+00:00",
      tags: { garden: { color: "#2e7d32" }, home: { color: "#ffee58" } },
      lists: [
        { entry_id: "e1", entity_id: "todo.tickoff_groceries", name: "Groceries", tasks: [
          T("a", "Mow <img src=x onerror=window.__xss=1>", { priority: 3, tags: ["garden"], due_date: "2026-03-09", state: "overdue",
            subtasks: [{ id: "s1", title: "front", done: true }, { id: "s2", title: "back", done: false }],
            recurrence: { type: "weekly", interval: 1, weekdays: [0, 3] }, notes: "bring gloves",
            history: [{ event: "created", at: "2026-03-01T10:00:00+00:00" }] }),
          T("b", "Buy milk", { tags: ["home"], due_date: "2026-03-10", due_time: "17:30", state: "today" }),
          T("c", "Call plumber", { priority: 1, due_date: "2026-03-20", state: "upcoming" }),
          T("d", "Old task", { status: "done", completed_at: "2026-03-08T10:00:00+00:00" }),
        ] },
        { entry_id: "e2", entity_id: "todo.tickoff_chores", name: "Chores", tasks: [
          T("x", "Vacuum", { tags: ["home"], due_date: "2026-03-10", state: "today", priority: 2 }),
        ] },
      ],
    };

    const card = document.createElement("tickoff-card");
    document.body.appendChild(card);
    card.setConfig({ entities: ["todo.tickoff_groceries"] });
    R.loading_before_data = card.shadowRoot.textContent.includes("Loading");
    card.hass = hass;
    await tick();
    R.subscribed = R.subscribed_type === "tickoff/subscribe";
    push(snap);
    await tick();
    const sr = card.shadowRoot;
    const rows = () => [...sr.querySelectorAll("#list .row[data-task]")].filter((r) => r.querySelector(".title"));
    const titles = () => rows().map((r) => r.querySelector(".title").textContent.trim());

    R.rows = titles();
    R.title_is_list_name = sr.querySelector("h2").textContent === "Groceries";
    R.open_count = sr.querySelector(".count").textContent === "3";
    R.xss_escaped = window.__xss !== 1 && !sr.querySelector("#list img");
    R.done_last_and_struck = rows().at(-1).classList.contains("done");
    R.done_section_label = sr.getElementById("list").textContent.includes("Completed");
    R.chips = [...sr.querySelectorAll("#chips .chip")].map((c) => c.textContent + ":" + c.style.background);
    R.chip_colored = [...sr.querySelectorAll("#chips .chip")].some((c) => c.textContent === "garden" && c.style.background.includes("46, 125, 50"));
    R.overdue_class = !!sr.querySelector(".due.overdue");
    R.today_time_24h = sr.querySelector(".due.today").textContent.includes("17:30");
    R.recurrence_shown = sr.getElementById("list").textContent.includes("Weekly Mon Thu");
    R.subtask_progress = sr.getElementById("list").textContent.includes("1/2");
    R.priority_dot = !!sr.querySelector(".prio");

    // tag filter
    sr.querySelector('#chips .chip[data-tag="garden"]').click();
    R.filter_garden = titles().length === 1 && titles()[0].startsWith("Mow");
    sr.querySelector('#chips .chip[data-tag="garden"]').click();
    R.filter_cleared = titles().length === 4;

    // toggle complete / reopen
    const rowB = () => sr.querySelector('.row[data-task="b"]');
    const cb = rowB().querySelector('[data-act="toggle"]');
    cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));
    R.complete_call = JSON.stringify(calls.at(-1)) === JSON.stringify({ d: "tickoff", s: "complete_task", data: { task_id: "b" }, target: { entity_id: "todo.tickoff_groceries" } });
    const cbd = sr.querySelector('.row[data-task="d"] [data-act="toggle"]');
    cbd.checked = false; cbd.dispatchEvent(new Event("change", { bubbles: true }));
    R.reopen_call = calls.at(-1).s === "reopen_task" && calls.at(-1).data.task_id === "d";

    // snooze
    rowB().querySelector('[data-act="snooze"]').click();
    R.snooze_call = calls.at(-1).s === "snooze_task" && calls.at(-1).data.task_id === "b";

    // delete needs a second click
    const before = calls.length;
    rowB().querySelector('[data-act="delete"]').click();
    R.delete_first_click_no_call = calls.length === before && rowB().querySelector('[data-act="delete"]').textContent.trim() === "Sure?";
    rowB().querySelector('[data-act="delete"]').click();
    R.delete_second_click_calls = calls.at(-1).s === "delete_task" && calls.at(-1).data.task_id === "b";

    // expand: notes + subtasks + history, toggle and add subtask
    sr.querySelector('.row[data-task="a"] .main').click();
    R.detail_notes = sr.getElementById("list").textContent.includes("bring gloves");
    R.detail_history = sr.getElementById("list").textContent.includes("created");
    const sub = sr.querySelector('[data-act="subtoggle"][data-sub="s2"]');
    sub.checked = true; sub.dispatchEvent(new Event("change", { bubbles: true }));
    R.subtask_call = calls.at(-1).s === "update_subtask" && calls.at(-1).data.subtask_id === "s2" && calls.at(-1).data.done === true;
    const subadd = sr.querySelector('[data-act="subadd"]');
    subadd.value = "gloves";
    subadd.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    R.add_subtask_call = calls.at(-1).s === "add_subtask" && calls.at(-1).data.title === "gloves" && subadd.value === "";
    sr.querySelector('.row[data-task="a"] .main').click(); // collapse

    // edit + save
    sr.querySelector('.row[data-task="c"] [data-act="edit"]').click();
    const ed = sr.querySelector(".editor");
    R.editor_open = !!ed;
    const f = (n) => ed.querySelector(`[data-f="${n}"]`);
    f("title").value = "Call the plumber";
    f("due_date").value = "2026-03-25"; f("due_time").value = "09:15";
    f("priority").value = "3"; f("tags").value = "home, new tag";
    f("rtype").value = "weekly"; f("rint").value = "2";
    ed.querySelector('[data-f="wd"][value="4"]').checked = true;
    ed.querySelector('[data-f="wd"][value="1"]').checked = true;
    ed.querySelector('[data-act="save"]').click();
    const u = calls.at(-1);
    R.update_call = u.s === "update_task" && u.data.task_id === "c" && u.data.title === "Call the plumber" && u.data.due_date === "2026-03-25"
      && u.data.due_time === "09:15:00" && u.data.priority === 3 && JSON.stringify(u.data.tags) === '["home","new tag"]'
      && JSON.stringify(u.data.recurrence) === '{"type":"weekly","interval":2,"weekdays":[1,4]}' && u.data.notes === null;
    R.editor_closed = !sr.querySelector(".editor");

    // add form
    const add = (id) => sr.getElementById(id);
    add("addtitle").value = "New task"; add("adddate").value = "2026-04-01"; add("addtime").value = "08:00";
    add("addprio").value = "2"; add("addtags").value = "garden"; add("addrec").value = "monthly"; add("addint").value = "3";
    add("addbtn").click();
    const a = calls.at(-1);
    R.add_call = a.s === "add_task" && a.target.entity_id === "todo.tickoff_groceries" && a.data.title === "New task" && a.data.due_time === "08:00:00"
      && a.data.priority === 2 && a.data.tags[0] === "garden" && a.data.recurrence.type === "monthly" && a.data.recurrence.interval === 3;
    R.add_form_cleared = add("addtitle").value === "";
    add("addtitle").value = "   "; add("addbtn").click();
    R.blank_title_ignored = calls.at(-1) === a;

    // drag & drop reorder: drag "c" onto "a" (up) and "a" onto "c" (down)
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    const rowA = sr.querySelector('.row[data-task="a"]'), rowC = sr.querySelector('.row[data-task="c"]');
    R.draggable = rowA.getAttribute("draggable") === "true" && sr.querySelector('.row[data-task="d"]').getAttribute("draggable") !== "true";
    fire(rowC, "dragstart"); fire(rowA, "dragover"); fire(rowA, "drop");
    R.drag_up = calls.at(-1).s === "move_task" && calls.at(-1).data.task_id === "c" && calls.at(-1).data.previous_task_id === undefined;
    fire(rowA, "dragstart"); fire(rowC, "dragover"); fire(rowC, "drop");
    R.drag_down = calls.at(-1).s === "move_task" && calls.at(-1).data.task_id === "a" && calls.at(-1).data.previous_task_id === "c";
    R.drop_target_math = window.__tickoff.dropTarget([{ id: "1" }, { id: "2" }, { id: "3" }], "3", "2", false) === "1"
      && window.__tickoff.dropTarget([{ id: "1" }, { id: "2" }], "2", "1", false) === null;

    // clear completed
    sr.querySelector('[data-act="clear"]').click();
    R.clear_call = calls.at(-1).s === "delete_completed" && calls.at(-1).target.entity_id === "todo.tickoff_groceries";

    // tag colour edit mode
    sr.querySelector('[data-act="edittags"]').click();
    const picker = sr.querySelector('input[type="color"][data-tag="garden"]');
    picker.value = "#112233"; picker.dispatchEvent(new Event("input", { bubbles: true }));
    R.tag_color_call = calls.at(-1).s === "set_tag" && calls.at(-1).data.name === "garden" && calls.at(-1).data.color === "#112233" && calls.at(-1).target === undefined;

    // live update from the server
    snap.lists[0].tasks.push(T("n", "Pushed from server"));
    push(snap);
    R.live_update = titles().includes("Pushed from server");

    // all lists + picker + today view
    card.setConfig({});
    push(snap);
    R.all_lists_rows = titles().length === 6;
    R.list_picker_visible = sr.getElementById("addlist").style.display !== "none" && sr.getElementById("addlist").options.length === 2;
    card.setConfig({ view: "today", title: "Now" });
    push(snap);
    R.today_titles = titles();
    R.today_title = sr.querySelector("h2").textContent === "Now";
    R.today_no_add_form = sr.getElementById("add").style.display === "none";
    R.today_no_drag = !sr.querySelector('.row[draggable="true"]');
    R.today_shows_list_name = !!sr.querySelector(".listname");

    // read only
    card.setConfig({ read_only: true });
    push(snap);
    R.ro_no_actions = !sr.querySelector(".actions") && sr.getElementById("add").style.display === "none";
    R.ro_checkbox_disabled = [...sr.querySelectorAll('[data-act="toggle"]')].every((c) => c.disabled);
    const n = calls.length;
    sr.querySelector('#list [data-act="toggle"]').dispatchEvent(new Event("change", { bubbles: true }));
    R.ro_no_calls = calls.length === n;

    // hide when empty + show_completed false + compact
    card.setConfig({ entities: ["todo.tickoff_chores"], hide_when_empty: true });
    snap.lists[1].tasks = [];
    push(snap);
    R.hidden_when_empty = card.style.display === "none";
    card.setConfig({ entities: ["todo.tickoff_groceries"], show_completed: false, compact: true });
    push(snap);
    R.show_completed_false = !titles().includes("Old task");
    R.compact_class = !!sr.querySelector("ha-card.compact");

    // dutch + 12h
    hass.language = "nl"; hass.locale = { language: "nl", time_format: "12" };
    card.hass = hass;
    card.setConfig({ entities: ["todo.tickoff_groceries"] });
    push(snap);
    R.dutch = sr.getElementById("addtitle").placeholder === "Taak toevoegen";

    // stub config
    R.stub = JSON.stringify(customElements.get("tickoff-card").getStubConfig(hass)) === '{"view":"list","entities":["todo.tickoff_groceries"]}';

    // visual editor
    const editor = document.createElement("tickoff-card-editor");
    document.body.appendChild(editor);
    editor.setConfig({ entities: ["todo.tickoff_chores"], hide_when_empty: true });
    editor.hass = hass;
    const form = editor.querySelector("ha-form");
    R.editor_form = !!form && form.schema.length === 8 && form.data.hide_empty === true && form.data.view === "list";
    R.editor_selector = JSON.stringify(form.schema[2].selector) === '{"entity":{"multiple":true,"domain":"todo","integration":"tickoff"}}';
    let changed = null;
    editor.addEventListener("config-changed", (e) => { changed = e.detail.config; });
    form.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { ...form.data, hide_empty: false, entities: [], title: "X" } } }));
    R.editor_event = changed && changed.hide_when_empty === false && changed.title === "X" && !("entities" in changed) && !("hide_empty" in changed);

    // card registered for the card picker
    R.registered = window.customCards.some((c) => c.type === "tickoff-card");

    // unsubscribes when removed
    card.remove();
    R.unsubscribed = unsubCalled === 1;
  } catch (e) {
    R.error = String(e && e.stack || e);
  }
  out.textContent = JSON.stringify(R);
  document.title = "done";
})();
