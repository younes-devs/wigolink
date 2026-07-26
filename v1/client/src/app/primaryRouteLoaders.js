export const loadTripsRoute = () => import('../features/trips/pages/TripFeedSimple.jsx');
export const loadOperationsRoute = () => import('../features/operations/pages/OperationsSimple.jsx');
export const loadSavedTripsRoute = () => import('../features/trips/pages/SavedTrips.jsx');
export const loadMessagesRoute = () => import('../features/messaging/pages/MessagesSimple.jsx');
export const loadProfileRoute = () => import('../features/profile/pages/Profile.jsx');

const PRIMARY_ROUTE_LOADERS = {
  '/trajets': loadTripsRoute,
  '/en-cours': loadOperationsRoute,
  '/enregistres': loadSavedTripsRoute,
  '/messages': loadMessagesRoute,
  '/profil': loadProfileRoute,
};

export function preloadPrimaryRoute(path) {
  return PRIMARY_ROUTE_LOADERS[path]?.().catch(() => undefined);
}

export function preloadPrimaryRoutes() {
  return Promise.all(Object.values(PRIMARY_ROUTE_LOADERS).map((load) => (
    load().catch(() => undefined)
  )));
}
