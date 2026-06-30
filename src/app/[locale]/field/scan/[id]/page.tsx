import type { NextPage } from "next";
import { FieldScanDetail } from "@/features/field/components/field-scan-detail";

type PageParams = { params: Promise<{ id: string }> };

const Page: NextPage<PageParams> = async ({ params }: PageParams) => {
  const { id } = await params;
  if (!id) return null;

  return (
    <main className="min-h-screen bg-slate-900 pt-14">
      <FieldScanDetail sessionId={id} />
    </main>
  );
};

export default Page;
