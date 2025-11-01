import React, { useState } from "react";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";
import { CopyIcon, Link2Icon, CheckIcon } from "../icons";
import Link from "next/link";

interface ShareTopicSpaceModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topicSpaceId: string;
  topicSpaceName: string;
}

export const ShareTopicSpaceModal: React.FC<ShareTopicSpaceModalProps> = ({
  isOpen,
  setIsOpen,
  topicSpaceId,
  topicSpaceName,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // 共有URLを生成
  const shareUrl = `${window.location.origin}/topic-spaces/${topicSpaceId}/graph`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(topicSpaceId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error("Failed to copy ID:", err);
    }
  };

  return (
    <Modal title="参照しているリポジトリ" isOpen={isOpen} setIsOpen={setIsOpen}>
      <div className="w-full max-w-md">
        {/* コンテンツ */}
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-row items-center gap-2">
              <h3 className="text-sm font-medium text-gray-600">共有URL</h3>
              <Link
                href={shareUrl}
                target="_blank"
                className="text-sm text-blue-500"
              >
                リポジトリに移動
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600"
              />
              <Button
                size="small"
                onClick={handleCopyUrl}
                className="flex items-center gap-1"
              >
                {copiedUrl ? (
                  <CheckIcon height={18} width={18} color="white" />
                ) : (
                  <Link2Icon height={18} width={18} color="white" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-600">id</div>
            <div className="flex items-center gap-2">
              <div>{topicSpaceId}</div>
              <Button
                size="small"
                onClick={handleCopyId}
                className="flex items-center gap-1"
              >
                {copiedId ? (
                  <CheckIcon height={18} width={18} color="white" />
                ) : (
                  <CopyIcon height={18} width={18} color="white" />
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-lg p-3">
            <p className="text-xs text-orange-500">
              <strong>共有について:</strong>
              <br />
              このURLを共有すると、他のユーザーがこのリポジトリを閲覧できます。
              編集権限は管理者のみに制限されています。
            </p>
          </div>
        </div>

        {/* フッター */}
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setIsOpen(false)}>閉じる</Button>
        </div>
      </div>
    </Modal>
  );
};
