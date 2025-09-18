import type { NextPage } from "next";
import { Documents } from "../_components/document/documents";

const Page: NextPage = async () => {
  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        <Documents />
      </div>
    </main>
  );
};

export default Page;
