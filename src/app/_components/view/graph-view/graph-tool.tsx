import type { TopicGraphFilterOption } from "@/app/const/types";
import {
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  ListBulletIcon,
  ZoomInIcon,
} from "../../icons";
import { type TagOption, TagsInput } from "../../input/tags-input";
import { ExportGraphButton } from "../../d3/export-graph-button";
import { useSearchParams, usePathname } from "next/navigation";
import { DirectedLinksToggleButton } from "./directed-links-toggle-button";

export const GraphTool = ({
  svgRef,
  currentScale,
  hasTagFilter = false,
  tags,
  setTags,
  tagOptions,
  tagFilterOption,
  isLargeGraph,
  isGraphFullScreen = false,
  setIsGraphFullScreen,
  isDirectedLinks = true,
  setIsDirectedLinks,
  magnifierMode = 0,
  setMagnifierMode,
}: {
  setIsGraphFullScreen?: React.Dispatch<React.SetStateAction<boolean>>;
  isGraphFullScreen?: boolean;
  svgRef: React.RefObject<SVGSVGElement>;
  currentScale: number;
  hasTagFilter?: boolean;
  tags?: TagOption | undefined;
  setTags?: React.Dispatch<React.SetStateAction<TagOption | undefined>>;
  tagOptions?: TagOption[];
  tagFilterOption?: TopicGraphFilterOption | undefined;
  isLargeGraph: boolean;
  isDirectedLinks?: boolean;
  setIsDirectedLinks?: React.Dispatch<React.SetStateAction<boolean>>;
  magnifierMode?: number;
  setMagnifierMode?: React.Dispatch<React.SetStateAction<number>>;
}) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // listパラメータのトグル用URLを生成
  const isListOpen = searchParams.get("list") === "true";
  const listParams = new URLSearchParams(searchParams.toString());
  if (isListOpen) {
    listParams.delete("list");
  } else {
    listParams.set("list", "true");
  }
  const listUrl = `${pathname}?${listParams.toString()}`;

  return (
    <>
      <div className="absolute mt-2 flex flex-row items-center gap-2">
        <a
          href={listUrl}
          className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
        >
          <ListBulletIcon width={16} height={16} color="white" />
        </a>

        {!!setIsDirectedLinks ? (
          <DirectedLinksToggleButton
            isDirectedLinks={isDirectedLinks}
            setIsDirectedLinks={setIsDirectedLinks}
          />
        ) : (
          <></>
        )}
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
        {!!setMagnifierMode ? (
          <button
            onClick={() => {
              setMagnifierMode((prev) => (prev + 1) % 3);
            }}
            className={`rounded-lg p-2 backdrop-blur-sm ${
              magnifierMode === 1
                ? "bg-orange-500/40"
                : magnifierMode === 2
                  ? "bg-orange-700/40"
                  : "bg-black/20"
            }`}
          >
            <ZoomInIcon
              height={16}
              width={16}
              color={magnifierMode > 0 ? "orange" : "white"}
            />
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
