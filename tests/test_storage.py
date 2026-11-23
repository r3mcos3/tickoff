"""TaskStore tests."""

from datetime import date, time

from custom_components.tickoff.storage import TaskStore


async def test_add_update_delete(hass):
    store = TaskStore(hass, "e1")
    await store.async_load()
    a = store.add("Milk", due_date=date(2026, 12, 1), due_time=time(8, 30))
    b = store.add("Bread")
    assert [t["title"] for t in store.tasks()] == ["Milk", "Bread"]
    assert a["due_time"] == "08:30"

    store.update(a["id"], done=True)
    assert store.get(a["id"])["status"] == "done"
    assert store.get(a["id"])["completed_at"] is not None
    store.update(a["id"], done=False)
    assert store.get(a["id"])["completed_at"] is None

    store.update(a["id"], due_date=None)  # clearing the date clears the time too
    assert store.get(a["id"])["due_time"] is None

    store.delete([b["id"]])
    assert [t["id"] for t in store.tasks()] == [a["id"]]


async def test_move(hass):
    store = TaskStore(hass, "e1")
    await store.async_load()
    a, _b, c = (store.add(x) for x in "abc")
    store.move(c["id"], None)
    assert [t["title"] for t in store.tasks()] == ["c", "a", "b"]
    store.move(c["id"], a["id"])
    assert [t["title"] for t in store.tasks()] == ["a", "c", "b"]


async def test_persists_across_reload(hass, hass_storage):
    store = TaskStore(hass, "e1")
    await store.async_load()
    store.add("Persist me")
    await store._store.async_save(store._data_to_save())
    store2 = TaskStore(hass, "e1")
    await store2.async_load()
    assert [t["title"] for t in store2.tasks()] == ["Persist me"]
