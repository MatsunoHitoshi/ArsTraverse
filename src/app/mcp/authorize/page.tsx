import type { Metadata } from "next";
import { getServerAuthSession } from "@/server/auth";
import { db } from "@/server/db";
import { McpAuthorizePanel } from "./_components/mcp-authorize-panel";

export const metadata: Metadata = {
  title: "MCP 連携 | ArsTraverse",
  description: "外部クライアント向け MCP アクセストークンの発行",
};

type SearchParams = Promise<{
  client?: string;
  topic_space_id?: string;
}>;

export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const clientName = params.client?.trim() ?? "";
  const topicSpaceId = params.topic_space_id?.trim() ?? "";

  const query = new URLSearchParams();
  if (params.client) {
    query.set("client", params.client);
  }
  if (params.topic_space_id) {
    query.set("topic_space_id", params.topic_space_id);
  }
  const callbackUrl = `/mcp/authorize${query.size > 0 ? `?${query.toString()}` : ""}`;

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
        topicSpaces={topicSpaces}
        callbackUrl={callbackUrl}
      />
    </main>
  );
}
