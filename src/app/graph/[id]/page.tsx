import type { NextPage } from "next";
import { SingleDocumentGraphViewer } from "@/app/_components/view/graph-view/single-document-graph-viewer";

type PageParams = { params: Promise<{ id: string }> };

const Page: NextPage<PageParams> = async ({ params }: PageParams) => {
  const { id } = await params;
  if (!id) return null;
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-900">
      <div className="w-full flex-col items-center justify-center pt-12">
        <SingleDocumentGraphViewer graphId={id} />
      </div>
    </main>
  );
};

export default Page;
