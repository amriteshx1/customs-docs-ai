import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const auth = betterAuth({
  appName: "Customs Docs",
  baseURL: env.authUrl(),
  trustedOrigins: [env.authUrl()],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["DOCUMENTATION_EXECUTIVE", "DOCUMENTATION_MANAGER"],
        required: true,
        defaultValue: "DOCUMENTATION_EXECUTIVE",
        input: false,
      },
    },
  },
});
