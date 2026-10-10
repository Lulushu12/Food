import { newId, todayKey } from "./store.js";

export const EVENTS_KEY = "la_events_v1";
export const EVENTS_CAP = 2000;
const CHANNEL = "la-events";

let channel = null;
function getChannel() {
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  return channel;
}

const localListeners = new Set();

function parseEvents(raw) {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readAll() {
  try {
    return parseEvents(localStorage.getItem(EVENTS_KEY));
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(list));
    return true;
  } catch {
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(-Math.floor(EVENTS_CAP / 2))));
      return true;
    } catch {
      return false;
    }
  }
}

export function emitEvent({ app, type, dayKey, value = null }) {
  const event = { id: newId(), app, type, at: Date.now(), dayKey: dayKey || todayKey(), value };
  const list = readAll();
  list.push(event);
  writeAll(list.length > EVENTS_CAP ? list.slice(-EVENTS_CAP) : list);
  try {
    getChannel()?.postMessage(event);
  } catch {
    /* channel closed or unclonable value */
  }
  for (const cb of localListeners) {
    try {
      cb(event);
    } catch {
      /* one bad listener must not block the rest */
    }
  }
  return event;
}

export function readEvents({ since, app, type } = {}) {
  return readAll().filter(
    (e) =>
      e &&
      (since == null || e.at >= since) &&
      (app == null || e.app === app) &&
      (type == null || e.type === type)
  );
}

export function subscribeEvents(cb) {
  const seen = new Set();
  const deliver = (event) => {
    if (!event || !event.id || seen.has(event.id)) return;
    seen.add(event.id);
    if (seen.size > EVENTS_CAP) seen.delete(seen.values().next().value);
    cb(event);
  };

  const onStorage = (e) => {
    if (e.key !== EVENTS_KEY) return;
    const before = new Set(parseEvents(e.oldValue).map((ev) => ev?.id));
    for (const ev of parseEvents(e.newValue)) if (!before.has(ev?.id)) deliver(ev);
  };
  const onMessage = (e) => deliver(e.data);

  localListeners.add(deliver);
  const bc = getChannel();
  try {
    bc?.addEventListener("message", onMessage);
  } catch {
    /* no channel; storage events still cover other tabs */
  }
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return () => {
    localListeners.delete(deliver);
    try {
      bc?.removeEventListener("message", onMessage);
    } catch {
      /* already closed */
    }
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
