import { createContext, useContext } from 'react';

const AuthCtx = createContext(null);

export const useAuth = () => useContext(AuthCtx);

export default AuthCtx;
