import { TopicGraphDetail } from "@/app/_components/topic-space/topic-graph-detail";
import type { NextPage } from "next";

type PageParams = { params: Promise<{ id: string; label_name: string }> };

const Page: NextPage<PageParams> = async ({ params }: PageParams) => {
  const { id, label_name } = await params;
  if (!id || !label_name) return null;
  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        <TopicGraphDetail
          id={id}
          filterOption={{ type: "label", value: label_name }}
        />
      </div>
    </main>
  );
};

export default Page;
