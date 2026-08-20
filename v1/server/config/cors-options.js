export function createCorsOptions({ isProduction, appOrigins }) {
  const allowedOrigins = new Set([
    ...appOrigins,
    // Capacitor's fixed native WebView origins. They are intentionally
    // explicit instead of using a wildcard so authenticated API calls remain
    // restricted to Wigolink web and native clients.
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
  ]);

  return {
    origin(origin, callback) {
      if (!origin || !isProduction || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origine non autorisee'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  };
}
