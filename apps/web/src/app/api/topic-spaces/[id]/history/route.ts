import { api } from "@/trpc/server";
import { NextResponse } from "next/server";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  try {
    const res = await api.topicSpaceChangeHistory.listByTopicSpaceId({
      id,
      includeDetail: true,
    });
    return NextResponse.json({
      changeHistories: res,
    });
  } catch (error) {
    throw error;
  }
};
