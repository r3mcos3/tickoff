const T = (id, title, o = {}) => ({ id, title, notes: "", due_date: null, due_time: null, priority: 0, tags: [], subtasks: [],
  recurrence: null, status: "open", completed_at: null, history: [], state: "no_date", ...o });
const snap = {
  now: "2026-03-10T09:00:00+01:00", entity_id: "todo.tickoff",
  tags: { garden: { color: "#43a047" }, home: { color: "#1e88e5" }, work: { color: "#8e24aa" }, money: { color: "#fdd835" } },
  settings: {}, notify_targets: [],
  tasks: [
    T("1", "Pay the electricity bill", { priority: 3, tags: ["money"], due_date: "2026-03-08", state: "overdue" }),
    T("2", "Call the dentist", { priority: 2, tags: ["home"], due_date: "2026-03-10", due_time: "14:30", state: "today" }),
    T("3", "Water the plants", { tags: ["garden", "home"], due_date: "2026-03-10", state: "today", recurrence: { type: "weekly", interval: 1, weekdays: [0, 3] } }),
    T("4", "Prepare the quarterly report", { priority: 1, tags: ["work"], due_date: "2026-03-12", state: "upcoming",
        subtasks: [{ id: "s1", title: "Collect numbers", done: true }, { id: "s2", title: "Write summary", done: false }, { id: "s3", title: "Send", done: false }] }),
    T("5", "Buy a birthday present", { due_date: "2026-03-11", state: "upcoming" }),
    T("6", "Sort the garage", { state: "no_date" }),
    T("7", "Renew passport", { status: "done", completed_at: "2026-03-09T10:00:00+00:00" }),
  ],
};
const card = document.createElement("tickoff-card");
document.getElementById("wrap").appendChild(card);
const h = (location.hash.match(/view=(\w+)/) || [])[1];
const open = location.hash.includes("open");
const sheet = location.hash.includes("sheet");
card.setConfig({ view: h || "all", ...(location.hash.includes("manual") ? { manual: true } : {}) });
card.hass = { language: "en", locale: { language: "en", time_format: "24" }, callService() {}, connection: { subscribeMessage: async (cb) => { setTimeout(() => cb(snap), 0); return () => {}; } } };
setTimeout(() => {
  if (open) { card._open.add("4"); card._update(); }
  if (sheet) { card._editing = "2"; card._update(); }
  if (location.hash.includes("typing")) { const i = card.shadowRoot.getElementById("addtitle"); i.value = "Call mom tomorrow 14:30 #family !high"; i.dispatchEvent(new Event("input")); }
}, 20);
