import type { Workspace, Story, TopicSpace } from "@prisma/client";

/**
 * WorkspaceとStoryのTopicSpace参照の整合性をチェック
 */
export function checkTopicSpaceConsistency(
  workspace: Workspace & {
    referencedTopicSpaces: TopicSpace[];
  },
  story: Story & {
    referencedTopicSpace: TopicSpace;
  } | null,
): {
  isConsistent: boolean;
  workspaceTopicSpaceIds: string[];
  storyTopicSpaceId: string | null;
  message: string;
} {
  const workspaceTopicSpaceIds = workspace.referencedTopicSpaces.map(
    (ts) => ts.id,
  );
  const storyTopicSpaceId = story?.referencedTopicSpaceId ?? null;

  // Storyが存在しない場合は整合性チェック不要
  if (!story) {
    return {
      isConsistent: true,
      workspaceTopicSpaceIds,
      storyTopicSpaceId: null,
      message: "Story not found - consistency check skipped",
    };
  }

  // Storyの参照TopicSpaceがWorkspaceの参照TopicSpaceに含まれているかチェック
  const isConsistent =
    storyTopicSpaceId !== null &&
    workspaceTopicSpaceIds.includes(storyTopicSpaceId);

  let message: string;
  if (isConsistent) {
    message = "TopicSpace references are consistent";
  } else if (storyTopicSpaceId === null) {
    message = "Story has no referenced TopicSpace";
  } else {
    message = `Story references TopicSpace (${storyTopicSpaceId}) that is not in Workspace's referenced TopicSpaces (${workspaceTopicSpaceIds.join(", ")})`;
  }

  return {
    isConsistent,
    workspaceTopicSpaceIds,
    storyTopicSpaceId,
    message,
  };
}
