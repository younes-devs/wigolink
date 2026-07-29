export function createRealtimeService({
  url,
  publishableKey,
  secretKey,
  newToken,
  findUser,
  fetchImpl = globalThis.fetch,
  logger = console,
}) {
  const clients = new Map();
  const lastSeenByUser = new Map();
  const config = url && publishableKey && secretKey
    ? { url, publishableKey, secretKey }
    : null;

  function publicConfig() {
    if (!config) return null;
    return {
      url: config.url,
      publishableKey: config.publishableKey,
    };
  }

  function ensureChannel(user) {
    if (!user.realtimeChannel) user.realtimeChannel = `wigofly:${newToken()}`;
    return user.realtimeChannel;
  }

  async function publish(userId, payload) {
    const user = await findUser(userId);
    if (!config || !user?.realtimeChannel) return false;

    try {
      await fetchImpl(
        `${config.url}/realtime/v1/api/broadcast/${encodeURIComponent(user.realtimeChannel)}/events/update`,
        {
          method: 'POST',
          headers: {
            apikey: config.secretKey,
            Authorization: `Bearer ${config.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      return true;
    } catch (error) {
      // Realtime improves responsiveness but must never block persistence.
      logger.error('Echec de diffusion temps reel', error);
      return false;
    }
  }

  function sendLocal(userId, payload) {
    for (const client of clients.get(userId) || []) {
      client.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  }

  function broadcast(userId, payload) {
    sendLocal(userId, payload);
    void publish(userId, payload);
  }

  return {
    broadcast,
    clients,
    ensureChannel,
    isOnline: (userId) => clients.has(userId),
    lastSeenAt: (userId) => lastSeenByUser.get(userId) || null,
    lastSeenByUser,
    publicConfig,
    publish,
    sendLocal,
  };
}
