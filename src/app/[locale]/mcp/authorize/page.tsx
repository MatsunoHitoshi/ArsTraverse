import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerAuthSession } from "@/server/auth";
import { db } from "@/server/db";
import { validateExternalOAuthRedirectUri } from "@/server/mcp/external-oauth-redirect";
import { McpAuthorizePanel } from "./_components/mcp-authorize-panel";

type SearchParams = Promise<{
  client?: string;
  topic_space_id?: string;
  redirect_uri?: string;
  state?: string;
  response_mode?: string;
}>;

const OAUTH_QUERY_KEYS = [
  "client",
  "topic_space_id",
  "redirect_uri",
  "state",
  "response_mode",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mcpAuthorize" });

  return {
    title: t("pageTitle"),
    description: t("pageDescription"),
  };
}

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const clientName = params.client?.trim() ?? "";
  const topicSpaceId = params.topic_space_id?.trim() ?? "";
  const redirectUri = params.redirect_uri?.trim() ?? "";
  const state = params.state ?? "";
  const responseMode = params.response_mode?.trim()
    ? params.response_mode.trim()
    : "query";

  const query = new URLSearchParams();
  for (const key of OAUTH_QUERY_KEYS) {
    const value = params[key];
    if (value) {
      query.set(key, value);
    }
  }
  const callbackUrl = `/mcp/authorize${query.size > 0 ? `?${query.toString()}` : ""}`;

  const t = await getTranslations("mcpAuthorize");
  let redirectUriError: string | null = null;
  if (redirectUri) {
    if (responseMode !== "query") {
      redirectUriError = t("unsupportedResponseMode");
    } else if (!validateExternalOAuthRedirectUri(redirectUri)) {
      redirectUriError = t("redirectUriNotAllowed");
    }
  }

  const session = await getServerAuthSession();
  const topicSpaces = session?.user?.id
    ? await db.topicSpace.findMany({
        where: {
          isDeleted: false,
          admins: { some: { id: session.user.id } },
        },
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 pb-16 pt-24">
      <McpAuthorizePanel
        isLoggedIn={!!session?.user}
        userName={session?.user?.name ?? null}
        userEmail={session?.user?.email ?? null}
        initialClientName={clientName}
        initialTopicSpaceId={topicSpaceId}
        redirectUri={redirectUri}
        oauthState={state}
        responseMode={responseMode}
        redirectUriError={redirectUriError}
        topicSpaces={topicSpaces}
        callbackUrl={callbackUrl}
      />
    </main>
  );
}
