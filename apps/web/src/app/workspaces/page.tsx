import type { NextPage } from "next";
import { Workspaces } from "../_components/workspace/workspaces";

const Page: NextPage = async () => {
  // const session = await getServerAuthSession();
  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center  justify-center pt-12">
        <Workspaces />
      </div>
    </main>
  );
};

export default Page;
