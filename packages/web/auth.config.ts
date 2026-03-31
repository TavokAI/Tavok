/**
 * Shared Auth.js v5 configuration that stays edge-safe for middleware usage.
 * Providers live in auth.ts so middleware does not pull Prisma into its bundle.
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],

  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user, trigger, session: updateData }) {
      if (user) {
        token.sub = user.id;
        token.username = user.username;
        token.displayName = user.displayName;
        token.email = user.email;
        token.avatarUrl = user.avatarUrl;
        token.status = user.status;
        token.theme = user.theme;
      }

      if (trigger === "update" && updateData) {
        if (updateData.displayName) token.displayName = updateData.displayName;
        if (updateData.email) token.email = updateData.email;
        if (updateData.avatarUrl !== undefined) {
          token.avatarUrl = updateData.avatarUrl;
        }
        if (updateData.status) token.status = updateData.status;
        if (updateData.theme) token.theme = updateData.theme;
      }

      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.sub,
        username: token.username,
        displayName: token.displayName,
        email: token.email,
        avatarUrl: token.avatarUrl,
        status: token.status,
        theme: token.theme,
      };
      return session;
    },
  },

  pages: {
    signIn: "/login",
    newUser: "/register",
  },

  useSecureCookies:
    (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL)?.startsWith("https://") ??
    false,

  logger: {
    error(error) {
      if (typeof error === "string") {
        if (error === "JWT_SESSION_ERROR") {
          return;
        }

        console.error("[auth]", error);
        return;
      }

      const errorWithType = error as Error & { type?: string };
      const errorType = errorWithType.type;
      if (
        error.name === "JWTSessionError" ||
        error.name === "JWT_SESSION_ERROR" ||
        errorType === "JWTSessionError" ||
        errorType === "JWT_SESSION_ERROR"
      ) {
        return;
      }

      console.error("[auth]", error);
    },
  },

  secret: process.env.JWT_SECRET,
} satisfies NextAuthConfig;
