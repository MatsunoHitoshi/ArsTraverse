import type { NextPage } from "next";
import { OnboardingPage } from "@/app/_components/onboarding/onboarding-page";
import { Suspense } from "react";

const Page: NextPage = async () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="container flex flex-col items-center justify-center gap-12 pt-12">
        <Suspense>
          <OnboardingPage />
        </Suspense>
      </div>
    </main>
  );
};

export default Page;
