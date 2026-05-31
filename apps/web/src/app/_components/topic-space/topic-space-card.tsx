import Image from "next/image";
import {
  DotHorizontalIcon,
  FileTextIcon,
  PersonIcon,
  StackIcon,
  StarIcon,
} from "../icons";
import type { TopicSpaceResponse } from "@/app/const/types";
import { useRouter } from "next/navigation";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";

type TopicSpaceCardProps = {
  topicSpace: TopicSpaceResponse;
  menu?: (topicSpace: TopicSpaceResponse) => React.ReactNode;
};

export const TopicSpaceCard = ({ topicSpace, menu }: TopicSpaceCardProps) => {
  const router = useRouter();

  const PopoverMenu = ({ topicSpace }: { topicSpace: TopicSpaceResponse }) => {
    return (
      <Popover className="hidden group-hover:block data-[open]:block">
        <PopoverButton className="z-10 !h-8 !w-8 rounded-md bg-slate-600/90 !p-2">
          <DotHorizontalIcon height={16} width={16} color="white" />
        </PopoverButton>
        <PopoverPanel
          anchor="bottom"
          className="flex flex-col rounded-md bg-black/20 py-2 text-slate-50 backdrop-blur-2xl"
        >
          {menu?.(topicSpace)}
        </PopoverPanel>
      </Popover>
    );
  };

  return (
    <div className="group relative flex w-full flex-col gap-4 rounded-md border border-slate-400 p-4">
      <button
        className="absolute inset-0 hover:bg-slate-50/10"
        onClick={() => {
          router.push(`/topic-spaces/${topicSpace.id}`);
        }}
      ></button>
      {menu && (
        <div className="absolute right-4">
          <PopoverMenu topicSpace={topicSpace} />
        </div>
      )}
      <div className="flex flex-row items-start justify-between">
        <div className="flex flex-row items-center gap-3">
          {topicSpace.image ? (
            <Image
              height={48}
              width={48}
              src={topicSpace.image}
              alt="topic"
              className="rounded-full border border-slate-400"
            />
          ) : (
            <div className="flex !h-12 !w-12 !min-w-12 flex-row items-center justify-center rounded-full border border-slate-400">
              <StackIcon height={24} width={24} color="white" />
            </div>
          )}

          <div className="flex flex-col items-start gap-1">
            <div className="text-lg font-semibold">{topicSpace.name}</div>
            <div className="flex flex-row items-center gap-1">
              {topicSpace.tags?.map((tag) => {
                return (
                  <div
                    key={tag.id}
                    className="rounded-sm bg-slate-50/10 p-1 text-sm"
                  >
                    {tag.name}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row items-center justify-start gap-4">
        <div className="flex flex-col items-center">
          <div className="flex flex-row items-center gap-2">
            <PersonIcon height={20} width={20} color="white" />
            <div className="">{topicSpace.admins?.length ?? "-"}</div>
          </div>
          <div className="text-xs">メンバー</div>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex flex-row items-center gap-2">
            <StarIcon height={20} width={20} color="white" />
            <div className="">{topicSpace.star}</div>
          </div>
          <div className="text-xs">お気に入り</div>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex flex-row items-center gap-2">
            <FileTextIcon height={20} width={20} color="white" />
            <div className="">{topicSpace.sourceDocuments?.length ?? 0}</div>
          </div>
          <div className="text-xs">ドキュメント</div>
        </div>
      </div>
    </div>
  );
};
