import type { NextPage } from "next";
import { Suspense } from "react";
import { About } from "../_components/about/about";

const Page: NextPage = async () => {
  return (
    <main className="flex min-h-screen w-full bg-slate-900">
      <div className="flex w-full flex-col gap-12 pt-12">
        <Suspense>
          <About />
        </Suspense>
      </div>
    </main>
  );
};

export default Page;
