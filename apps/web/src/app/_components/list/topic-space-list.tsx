import { Button } from "../button/button";
import { PlusIcon } from "../icons";
import { TopicSpaceCard } from "../topic-space/topic-space-card";
import type { TopicSpaceResponse } from "@/app/const/types";

export const TopicSpaceList = ({
  topicSpaces,
  start = 0,
  end = topicSpaces.length,
  setTopicSpaceCreateModalOpen,
  menu,
}: {
  topicSpaces: TopicSpaceResponse[];
  start?: number;
  end?: number;
  setTopicSpaceCreateModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  menu?: (topicSpace: TopicSpaceResponse) => React.ReactNode;
}) => {
  return (
    <div className="flex flex-col gap-3">
      {topicSpaces.length == 0 ? (
        <div className="flex flex-row items-center justify-between p-3">
          <div>リポジトリがありません</div>
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              setTopicSpaceCreateModalOpen(true);
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">新規リポジトリ</div>
          </Button>
        </div>
      ) : (
        <>
          {topicSpaces.slice(start, end).map((topicSpace) => {
            return (
              <div key={topicSpace.id}>
                <TopicSpaceCard topicSpace={topicSpace} menu={menu} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
