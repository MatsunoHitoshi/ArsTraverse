"use client";

import { useRouter } from "i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/button/button";
import { api } from "@/trpc/react";
import { signIn, useSession } from "next-auth/react";
import { FileTextIcon, Pencil2Icon } from "@/app/_components/icons/icons";
import { FadeIn } from "../animation/fade-in";

export const OnboardingPage = () => {
  const t = useTranslations("onboarding");
  const { data: session } = useSession();
  const router = useRouter();

  const { mutate: createEmptyWorkspace } =
    api.workspace.createEmpty.useMutation();

  const ActionButton = ({
    onClick,
    children,
  }: {
    onClick: () => void;
    children: React.ReactNode;
  }) => {
    return (
      <Button
        onClick={onClick}
        className="w-full bg-orange-400 text-white hover:bg-orange-500"
      >
        {children}
      </Button>
    );
  };

  const handleCreateWorkspace = () => {
    if (!session) {
      return;
    }

    createEmptyWorkspace(
      {},
      {
        onSuccess: (workspace) => {
          router.push(`/workspaces/${workspace.id}`);
        },
        onError: (error) => {
          console.error("Workspace creation error:", error);
        },
      },
    );
  };

  const handleUploadDocument = () => {
    router.push("/documents/new");
  };

  return (
    <FadeIn>
      <div className="w-full max-w-4xl text-center">
        <div className="mb-12">
          <div className="mb-10 flex flex-col items-center justify-center gap-3">
            <h1 className="text-4xl font-bold text-slate-50">
              {t("welcome")}
            </h1>
            <p className="text-base text-slate-300">{t("subtitle")}</p>
          </div>
        </div>

        <p className="mb-6 text-2xl font-bold text-white">{t("chooseStart")}</p>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="hover:bg-slate-750 rounded-xl border border-slate-600 bg-slate-800 p-8 transition-all hover:border-orange-400">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-orange-500 p-4">
                <Pencil2Icon width={32} height={32} />
              </div>
            </div>
            <h2 className="mb-3 text-xl font-semibold text-slate-50">
              {t("writeFromScratch")}
            </h2>
            <p className="mb-6 text-left text-sm text-slate-300">
              {t("writeFromScratchDescription")}
            </p>
            {session ? (
              <ActionButton onClick={handleCreateWorkspace}>
                {t("createWorkspace")}
              </ActionButton>
            ) : (
              <ActionButton
                onClick={() => signIn("google", { callbackUrl: "/" })}
              >
                {t("signInToStart")}
              </ActionButton>
            )}
          </div>

          <div className="hover:bg-slate-750 rounded-xl border border-slate-600 bg-slate-800 p-8 transition-all hover:border-orange-400">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-orange-500 p-4">
                <FileTextIcon width={32} height={32} />
              </div>
            </div>
            <h2 className="mb-3 text-xl font-semibold text-slate-50">
              {t("startFromText")}
            </h2>
            <p className="mb-6 text-left text-sm text-slate-300">
              {t("startFromTextDescription")}
            </p>
            <ActionButton onClick={handleUploadDocument}>
              {t("uploadText")}
            </ActionButton>
          </div>
        </div>
      </div>
    </FadeIn>
  );
};
