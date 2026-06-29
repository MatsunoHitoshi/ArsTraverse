"use client";

import type { GraphDocumentForFrontend } from "@/app/const/types";
import { useTranslations } from "next-intl";
import { Modal } from "./modal";
import { NodeLinkEditPanel } from "./node-link-edit-panel";

export const NodeLinkEditModal = ({
  isOpen,
  setIsOpen,
  graphDocument,
  setGraphDocument,
  additionalGraph,
  setAdditionalGraph,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  graphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
  additionalGraph: GraphDocumentForFrontend | undefined;
  setAdditionalGraph: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | undefined>
  >;
}) => {
  const t = useTranslations("modal.nodeLink");
  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("addNodeLink")}>
      <NodeLinkEditPanel
        graphDocument={graphDocument}
        setGraphDocument={setGraphDocument}
        additionalGraph={additionalGraph}
        setAdditionalGraph={setAdditionalGraph}
        onCancel={() => setIsOpen(false)}
        onCloseAfterAdd={() => setIsOpen(false)}
        showFooter={true}
      />
    </Modal>
  );
};
