import { Modal } from "../modal/modal";
import { useTranslations } from "next-intl";

export const DocumentUploadTipsModal = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const t = useTranslations("tips");

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("largeFileTitle")}>
      <div className="flex flex-col gap-4">
        <div className="text-sm">{t("intro")}</div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-2 text-orange-500">
              <div>Step1</div>
              <div className="font-bold">{t("step1Title")}</div>
            </div>
            <div className="text-sm">{t("step1Body")}</div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-start gap-2 text-orange-500">
              <div>Step2</div>
              <div className="font-bold">{t("step2Title")}</div>
            </div>
            <div className="text-sm">{t("step2Body")}</div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-start gap-2 text-orange-500">
              <div>Step3</div>
              <div className="font-bold">{t("step3Title")}</div>
            </div>
            <div className="text-sm">{t("step3Body")}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
