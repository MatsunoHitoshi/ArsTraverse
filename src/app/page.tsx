import type { NextPage } from "next";
import { ExtractedGraphViewer } from "@/app/_components/view/graph-view/extracted-graph-viewer";
import { Suspense } from "react";

const Page: NextPage = async () => {
  // const session = await getServerAuthSession();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="container flex flex-col items-center justify-center gap-12 pt-12">
        <Suspense>
          <ExtractedGraphViewer />
        </Suspense>
      </div>
    </main>
  );
};

export default Page;
