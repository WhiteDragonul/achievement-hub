// TEMPORAR până la etapa 3 (autentificare): userul „curent” se alege manual din bara de sus.
// După login, id-ul va veni din tokenul de acces, iar acest selector dispare.
import { createContext, useContext, useState, type ReactNode } from 'react';

const DEMO_USER_ID = 3; // userul "demo" din fixtures, are toate cele 4 platforme legate

const CurrentUserContext = createContext<{ userId: number; setUserId: (id: number) => void } | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(DEMO_USER_ID);
  return <CurrentUserContext.Provider value={{ userId, setUserId }}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error('useCurrentUser trebuie folosit în interiorul CurrentUserProvider');
  return context;
}
