import type { NextPage } from "next";
import { FieldSessionList } from "@/features/field/components/field-session-list";

const Page: NextPage = () => {
  return (
    <main className="min-h-screen bg-slate-900 pt-14">
      <FieldSessionList />
    </main>
  );
};

export default Page;
