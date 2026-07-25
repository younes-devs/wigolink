export function createCorsOptions({ isProduction, appOrigins }) {
  return {
    origin(origin, callback) {
      if (!origin || !isProduction || appOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origine non autorisee'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  };
}
