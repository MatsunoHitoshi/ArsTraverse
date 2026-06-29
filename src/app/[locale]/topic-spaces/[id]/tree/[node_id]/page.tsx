import type { NextPage } from "next";
import { TreeViewer } from "@/app/_components/view/tree";

type PageParams = {
  params: Promise<{ id: string; node_id: string }>;
};

const Page: NextPage<PageParams> = async ({ params }: PageParams) => {
  const { id, node_id } = await params;

  if (!id || !node_id) return null;
  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        <TreeViewer topicSpaceId={id} nodeId={node_id} />
      </div>
    </main>
  );
};

export default Page;
