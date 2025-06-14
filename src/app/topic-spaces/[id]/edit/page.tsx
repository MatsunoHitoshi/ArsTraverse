import type { NextPage } from "next";
import { TopicGraphEditor } from "@/app/_components/topic-space/topic-graph-editor";

type PageParams = { params: Promise<{ id: string }> };

const Page: NextPage<PageParams> = async ({ params }: PageParams) => {
  const { id } = await params;
  if (!id) return null;
  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-16">
        <TopicGraphEditor id={id} />
      </div>
    </main>
  );
};

export default Page;
