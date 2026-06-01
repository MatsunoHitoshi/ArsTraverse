import type { NextPage } from "next";
import { FieldScanFlow } from "@/features/field/components/field-scan-flow";

const Page: NextPage = () => {
  return (
    <main className="min-h-screen bg-slate-900 pt-14">
      <FieldScanFlow />
    </main>
  );
};

export default Page;
