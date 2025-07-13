import type { TopicGraphFilterOption } from "@/app/const/types";
import {
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  ListBulletIcon,
  ShareIcon,
} from "../../icons";
import { type TagOption, TagsInput } from "../../input/tags-input";
import { exportSvg } from "@/app/_utils/sys/svg";
import { ExportGraphButton } from "../../d3/export-graph-button";

export const GraphTool = ({
  svgRef,
  currentScale,
  isListOpen,
  setIsListOpen,
  hasTagFilter = false,
  tags,
  setTags,
  tagOptions,
  tagFilterOption,
  isLargeGraph,
  isGraphFullScreen = false,
  setIsGraphFullScreen,
}: {
  setIsGraphFullScreen?: React.Dispatch<React.SetStateAction<boolean>>;
  isGraphFullScreen?: boolean;
  svgRef: React.RefObject<SVGSVGElement>;
  currentScale: number;
  hasTagFilter?: boolean;
  setIsListOpen: (isListOpen: boolean) => void;
  isListOpen: boolean;
  tags?: TagOption | undefined;
  setTags?: React.Dispatch<React.SetStateAction<TagOption | undefined>>;
  tagOptions?: TagOption[];
  tagFilterOption?: TopicGraphFilterOption | undefined;
  isLargeGraph: boolean;
}) => {
  return (
    <>
      <div className="absolute mt-2 flex flex-row items-center gap-2">
        <button
          className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
          onClick={() => {
            setIsListOpen(!isListOpen);
          }}
        >
          <ListBulletIcon width={16} height={16} color="white" />
        </button>
        {!!setIsGraphFullScreen ? (
          <button
            onClick={() => {
              setIsGraphFullScreen(!isGraphFullScreen);
            }}
            className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
          >
            {isGraphFullScreen ? (
              <ExitFullScreenIcon height={16} width={16} color="white" />
            ) : (
              <EnterFullScreenIcon height={16} width={16} color="white" />
            )}
          </button>
        ) : (
          <></>
        )}
        <ExportGraphButton svgRef={svgRef} currentScale={currentScale} />
        {hasTagFilter &&
        !!setTags &&
        !!tagOptions &&
        !!tagFilterOption &&
        !!tags ? (
          <div className="rounded-lg bg-black/20 p-2 text-sm backdrop-blur-sm">
            <TagsInput
              selected={tags}
              setSelected={setTags}
              options={tagOptions}
              placeholder="タグで絞り込む"
              defaultOption={
                tagFilterOption?.value && tagFilterOption?.type
                  ? {
                      id: "0",
                      label: tagFilterOption.value,
                      type: tagFilterOption.type,
                    }
                  : undefined
              }
            />
          </div>
        ) : (
          <></>
        )}
      </div>

      {!!isLargeGraph && !isGraphFullScreen && (
        <div className="absolute bottom-4 flex flex-row items-center gap-1 text-xs">
          <div className="text-orange-500">
            ノード数が多いため一部のみが表示されています
          </div>
          {!!setIsGraphFullScreen ? (
            <button
              onClick={() => {
                setIsGraphFullScreen(true);
              }}
              className="underline hover:no-underline"
            >
              全て表示
            </button>
          ) : (
            <></>
          )}
        </div>
      )}
    </>
  );
};
