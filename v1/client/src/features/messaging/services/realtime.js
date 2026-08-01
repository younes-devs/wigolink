import { createClient } from '@supabase/supabase-js';
import { api } from '../../../api';

let client = null;
let clientKey = '';
const sessionByUser = new Map();
const hubsByUser = new Map();

async function realtimeSession(userId) {
  const cached = sessionByUser.get(userId);
  if (cached) return cached;
  const config = await api('/realtime/session', { method: 'POST' });
  sessionByUser.set(userId, config);
  return config;
}

export async function subscribeToMessageUpdates(userId, onUpdate, onStatus = () => {}) {
  if (!userId) {
    onStatus('fallback');
    return () => {};
  }
  let hub = hubsByUser.get(userId);
  if (!hub) {
    hub = {
      listeners: new Set(),
      status: 'connecting',
      channel: null,
      startPromise: null,
      closed: false,
    };
    hubsByUser.set(userId, hub);
  }
  const listener = { onUpdate, onStatus };
  hub.listeners.add(listener);
  onStatus(hub.status);
  if (!hub.startPromise) hub.startPromise = startHub(userId, hub);
  await hub.startPromise;

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    hub.listeners.delete(listener);
    onStatus('closed');
    if (hub.listeners.size > 0) return;
    hub.closed = true;
    if (hub.channel) void client?.removeChannel(hub.channel);
    hubsByUser.delete(userId);
  };
}

async function startHub(userId, hub) {
  try {
    const config = await realtimeSession(userId);
    if (!config.enabled || !config.url || !config.publishableKey || !config.channel) {
      setHubStatus(hub, 'fallback');
      return;
    }
    if (hub.closed) return;
    const key = `${config.url}:${config.publishableKey}`;
    if (!client || clientKey !== key) {
      client?.removeAllChannels();
      client = createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clientKey = key;
    }
    hub.channel = client
      .channel(config.channel, {
        config: { broadcast: { self: false, ack: false } },
      })
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        for (const listener of hub.listeners) listener.onUpdate(payload || {});
      });
    hub.channel.subscribe((status) => {
      setHubStatus(hub, status === 'SUBSCRIBED' ? 'connected' : 'fallback');
    });
  } catch {
    setHubStatus(hub, 'fallback');
  }
}

function setHubStatus(hub, status) {
  hub.status = status;
  for (const listener of hub.listeners) listener.onStatus(status);
}
