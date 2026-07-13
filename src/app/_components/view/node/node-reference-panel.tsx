"use client";

import React from "react";
import { api } from "@/trpc/react";
import type { CustomNodeType } from "@/app/const/types";
import type { RouterOutputs } from "@/trpc/react";
import { Link } from "i18n/navigation";
import { useTranslations } from "next-intl";

interface NodeReferencePanelProps {
  node: CustomNodeType;
  topicSpaceId: string;
}

type ReferenceSections = RouterOutputs["topicSpaces"]["getNodeReference"];

export const NodeReferencePanel: React.FC<NodeReferencePanelProps> = ({
  node,
  topicSpaceId,
}) => {
  const t = useTranslations("view");

  // 出自(provenance)ドキュメントの引用を先に取得・表示し、
  // それ以外のドキュメントの引用は後から取得・追加表示する。
  const provenanceQuery = api.topicSpaces.getNodeReference.useQuery({
    id: topicSpaceId,
    nodeId: node.id,
    scope: "provenance",
  });
  const othersQuery = api.topicSpaces.getNodeReference.useQuery({
    id: topicSpaceId,
    nodeId: node.id,
    scope: "others",
  });

  // ハイライト対象語: 表示名 + ローカライズ名(name_ja/name_en)
  // 正規表現のオルタネーションで短い語が先にマッチして長い語のハイライトが
  // 欠けるのを防ぐため、文字数の降順（長い順）に並べる。
  const highlightTerms = Array.from(
    new Set(
      [
        node.name,
        node.properties?.name_ja,
        node.properties?.name_en,
      ].filter(
        (value): value is string =>
          typeof value === "string" && value.trim() !== "",
      ),
    ),
  ).sort((a, b) => b.length - a.length);

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const highlightText = (text: string) => {
    if (highlightTerms.length === 0) return text;
    const lowerTerms = highlightTerms.map((term) => term.toLowerCase());
    const regex = new RegExp(
      `(${highlightTerms.map(escapeRegExp).join("|")})`,
      "gi",
    );
    return text.split(regex).map((part, index) =>
      lowerTerms.includes(part.toLowerCase()) ? (
        <mark
          key={index}
          className="rounded bg-yellow-200 px-1 text-yellow-900"
        >
          {part}
        </mark>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      ),
    );
  };

  const filterNonEmpty = (references: ReferenceSections | undefined) =>
    (references ?? []).filter(
      (ref) => ref.relevantSections && ref.relevantSections.length > 0,
    );

  const provenanceRefs = filterNonEmpty(provenanceQuery.data);
  const otherRefs = filterNonEmpty(othersQuery.data);

  const renderReferenceList = (references: ReferenceSections) => (
    <div className="space-y-4">
      {references.map((reference) => (
        <div
          key={reference.sourceDocument.id}
          className="rounded-lg border border-slate-600 bg-slate-800/50 p-4"
        >
          <Link
            href={reference.sourceDocument.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <h4 className="mb-3 flex items-center font-semibold text-gray-200">
              <span className="mr-2 h-2 w-2 rounded-full bg-blue-400"></span>
              {reference.sourceDocument.name}
            </h4>
          </Link>

          <div className="space-y-3">
            {reference.relevantSections.map((section, index) => (
              <div
                key={index}
                className="rounded bg-slate-700/50 p-3 text-sm leading-relaxed text-gray-300"
              >
                <div className="whitespace-pre-wrap">
                  {highlightText(section)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const bothDone = !provenanceQuery.isLoading && !othersQuery.isLoading;
  const bothErrored = !!provenanceQuery.error && !!othersQuery.error;

  if (bothErrored) {
    return (
      <div className="py-8 text-center text-red-400">
        <p>{t("referenceFetchError")}</p>
      </div>
    );
  }

  if (
    bothDone &&
    provenanceRefs.length === 0 &&
    otherRefs.length === 0
  ) {
    return (
      <div className="py-8 text-center text-gray-400">
        <p>{t("noReferencesFound", { name: node.name })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 出自ドキュメント（先に表示） */}
      {(provenanceQuery.isLoading || provenanceRefs.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">
            {t("provenanceReferencesHeading")}
          </h3>
          {provenanceQuery.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="text-gray-400">{t("searchingReferences")}</div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                {t("mentionedInDocuments", { count: provenanceRefs.length })}
              </p>
              {renderReferenceList(provenanceRefs)}
            </>
          )}
        </div>
      )}

      {/* その他のドキュメント（後から表示） */}
      {(othersQuery.isLoading || otherRefs.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">
            {t("otherReferencesHeading")}
          </h3>
          {othersQuery.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="text-gray-400">
                {t("searchingOtherReferences")}
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                {t("mentionedInDocuments", { count: otherRefs.length })}
              </p>
              {renderReferenceList(otherRefs)}
            </>
          )}
        </div>
      )}
    </div>
  );
};
