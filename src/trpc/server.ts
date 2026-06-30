"use server";
import "server-only";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";

import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  heads.set("x-locale", await getLocale());

  return createTRPCContext({
    headers: heads,
  });
});

export const api = createCaller(createContext);
