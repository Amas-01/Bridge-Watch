/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo } from "react";

export type Role = "Viewer" | "Operator" | "SuperAdmin" | "Admin" | "Lead Auditor";

export interface UserProfile {
  id: string;
  name: string;
  roles: Role[];
}

export interface AuthContextValue {
  user: UserProfile | null;
  hasRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Minimal local mock provider for development and tests. In production this should be
// wired to the real auth provider (OIDC/JWT) and session state.
export const MockAuthProvider: React.FC<{ children: React.ReactNode; user?: UserProfile }> = ({
  children,
  user,
}) => {
  const defaultUser: UserProfile = user ?? {
    id: "u-ops-1",
    name: "Ops Console User",
    roles: ["Operator"],
  };

  const value = useMemo<AuthContextValue>(() => {
    return {
      user: defaultUser,
      hasRole: (role: Role) => defaultUser.roles.includes(role),
    };
  }, [defaultUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
