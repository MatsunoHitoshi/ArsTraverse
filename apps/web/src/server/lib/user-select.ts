import type { Prisma } from "@prisma/client";

/**
 * 公開用のユーザー情報を取得する際のselectオプション
 * email情報は含まれません
 */
export const PUBLIC_USER_SELECT: Prisma.UserSelect = {
  id: true,
  name: true,
  image: true,
} as const;

/**
 * 認証済みユーザー自身の情報を取得する際のselectオプション
 * email情報を含みます
 */
export const PRIVATE_USER_SELECT: Prisma.UserSelect = {
  id: true,
  name: true,
  email: true,
  preferredLocale: true,
  image: true,
} as const;
