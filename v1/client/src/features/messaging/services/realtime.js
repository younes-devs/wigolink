import { createClient } from '@supabase/supabase-js';
import { api } from '../../../api';

let client = null;
let clientKey = '';
let sessionByUser = new Map();

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
  try {
    const config = await realtimeSession(userId);
    if (!config.enabled || !config.url || !config.publishableKey || !config.channel) {
      onStatus('fallback');
      return () => {};
    }
    const key = `${config.url}:${config.publishableKey}`;
    if (!client || clientKey !== key) {
      client?.removeAllChannels();
      client = createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clientKey = key;
    }
    const channel = client
      .channel(config.channel, { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: 'update' }, ({ payload }) => onUpdate(payload || {}));
    channel.subscribe((status) => {
      onStatus(status === 'SUBSCRIBED' ? 'connected' : 'fallback');
    });
    return () => {
      onStatus('closed');
      client?.removeChannel(channel);
    };
  } catch {
    onStatus('fallback');
    return () => {};
  }
}
