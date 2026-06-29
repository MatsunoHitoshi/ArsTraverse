import { TopicGraphPathDetail } from "@/app/_components/topic-space/topic-graph-path-detail";
import type { NextPage } from "next";

type PageParams = {
  params: Promise<{ id: string; start_id: string; end_id: string }>;
};

const Page: NextPage<PageParams> = async ({ params }: PageParams) => {
  const { id, start_id, end_id } = await params;
  if (!id || !start_id || !end_id) return null;
  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        <TopicGraphPathDetail id={id} startId={start_id} endId={end_id} />
      </div>
    </main>
  );
};

export default Page;
