import { createContext, useContext, useState, type ReactNode } from 'react';

// The signed-in token. Kept in memory and in sessionStorage (this tab only, gone when the tab closes), never in the
// bundle or a URL. Switching persona means pasting a different token; signing out forgets it.
const STORAGE_KEY = 'pa-evidence.token';

type Session = { token: string | null; signIn: (token: string) => void; signOut: () => void };

const SessionContext = createContext<Session | null>(null);

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked: the token lives in memory only
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(storedToken);

  function signIn(newToken: string) {
    setToken(newToken);
    try {
      sessionStorage.setItem(STORAGE_KEY, newToken);
    } catch {
      // storage blocked: memory only
    }
  }

  function signOut() {
    setToken(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing stored
    }
  }

  return <SessionContext.Provider value={{ token, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
