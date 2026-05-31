import { api } from "@/trpc/server";
import { NextResponse } from "next/server";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const url = new URL(_request.url);
  const queryParams = new URLSearchParams(url.searchParams);
  const tag = queryParams.get("tag");
  try {
    const res = await api.topicSpaces.getByIdPublic({
      id,
      filterOption: tag ? { type: "tag", value: tag, cutOff: "2" } : undefined,
    });
    return NextResponse.json({
      id: res.id,
      graphData: res.graphData,
    });
  } catch (error) {
    throw error;
  }
};
